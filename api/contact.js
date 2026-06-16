// Função serverless (Vercel) — recebe o formulário de contacto e envia por email via Resend.
//
// Variáveis de ambiente a definir no painel da Vercel (Project → Settings → Environment Variables):
//   RESEND_API_KEY  — chave da API Resend (secreta · obrigatória)
//   CONTACT_FROM    — remetente verificado no Resend, ex: "Proteína Lúdica <ola@proteinaludica.com>"
//                     (enquanto o domínio não estiver verificado, usar "onboarding@resend.dev")
//   CONTACT_TO      — (opcional) destino; por defeito info@proteinaludica.com
//
// Sem dependências externas: usa o fetch nativo do Node 18+ na Vercel.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Limites máximos por campo (defesa contra payloads enormes).
    const LIMITES = { nome: 120, email: 200, tipo: 200, mensagem: 5000 };
    const cortar = (v, max) => (v || '').toString().trim().slice(0, max);

    const nome = cortar(body.nome, LIMITES.nome);
    const email = cortar(body.email, LIMITES.email);
    const tipo = cortar(body.tipo, LIMITES.tipo);
    const mensagem = cortar(body.mensagem, LIMITES.mensagem);
    const consentimento = body.consentimento === true || body.consentimento === 'true';
    const honeypot = (body.website || '').toString().trim();

    // Anti-spam: se o campo escondido vier preenchido, é um robô — finge sucesso e ignora.
    if (honeypot) return res.status(200).json({ ok: true });

    if (!nome || !email) {
      return res.status(400).json({ ok: false, error: 'Indique o nome e o email.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'O email não parece válido.' });
    }
    if (!consentimento) {
      return res.status(400).json({ ok: false, error: 'É preciso autorizar o contacto.' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY em falta.');
      return res.status(500).json({ ok: false, error: 'Serviço de email não configurado.' });
    }

    const to = process.env.CONTACT_TO || 'info@proteinaludica.com';
    const from = process.env.CONTACT_FROM || 'Proteína Lúdica <onboarding@resend.dev>';

    // Para o subject: remover quebras de linha (evita injecção de cabeçalhos) e limitar tamanho.
    const nomeSubject = nome.replace(/[\r\n]+/g, ' ').slice(0, 120);

    const texto = [
      'Novo contacto pelo site:',
      '',
      'Nome: ' + nome,
      'Email: ' + email,
      tipo ? 'Interesse: ' + tipo : null,
      '',
      mensagem ? mensagem : '(sem mensagem)',
    ].filter(function (l) { return l !== null; }).join('\n');

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [to],
        reply_to: email,
        subject: 'Novo contacto · ' + nomeSubject,
        text: texto,
      }),
    });

    if (!resp.ok) {
      const detalhe = await resp.text();
      console.error('Erro Resend:', resp.status, detalhe);
      return res.status(502).json({ ok: false, error: 'Não foi possível enviar agora.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro no handler de contacto:', err);
    return res.status(500).json({ ok: false, error: 'Ocorreu um erro inesperado.' });
  }
};
