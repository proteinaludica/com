// Função serverless (Vercel) — recebe o formulário de contacto e envia por email via Resend.
//
// Variáveis de ambiente a definir no painel da Vercel (Project → Settings → Environment Variables):
//   RESEND_API_KEY  — chave da API Resend (secreta · obrigatória)
//   CONTACT_FROM    — remetente verificado no Resend, ex: "Proteína Lúdica <ola@proteinaludica.com>"
//                     (enquanto o domínio não estiver verificado, usar "onboarding@resend.dev")
//   CONTACT_TO      — (opcional) destino; por defeito info@proteinaludica.com
//
// Sem dependências externas: usa o fetch nativo do Node 18+ na Vercel.

// Rate-limit por IP, best-effort e em memória do processo. Numa plataforma
// serverless o estado não é partilhado entre instâncias, por isso NÃO é uma
// defesa distribuída — trava rajadas repetidas servidas pela mesma instância
// quente (o caso comum de um script a martelar o endpoint) e submissões
// duplicadas acidentais, sem infra nem dependências novas. Combina com o
// honeypot já existente.
const RL_JANELA_MS = 60 * 1000; // 1 minuto
const RL_MAX = 3;               // no máx. 3 submissões por IP por janela
const rlPorIp = new Map();      // ip -> number[] (timestamps recentes)

// IP fidedigno: só headers que a Vercel define e o cliente não falsifica.
function obterIp(req) {
  const h = req.headers || {};
  const real = h['x-real-ip'] || h['x-vercel-forwarded-for'];
  if (real) return String(Array.isArray(real) ? real[0] : real).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

function excedeuLimite(ip) {
  if (!ip) return false; // sem IP identificável, não bloquear (evita falso positivo global)
  const agora = Date.now();
  const recentes = (rlPorIp.get(ip) || []).filter((t) => agora - t < RL_JANELA_MS);
  if (recentes.length >= RL_MAX) {
    rlPorIp.set(ip, recentes);
    return true;
  }
  recentes.push(agora);
  rlPorIp.set(ip, recentes);
  // Limpeza oportunista para o Map não crescer sem limite na instância.
  if (rlPorIp.size > 5000) {
    for (const [k, v] of rlPorIp) {
      if (!v.some((t) => agora - t < RL_JANELA_MS)) rlPorIp.delete(k);
    }
  }
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  if (excedeuLimite(obterIp(req))) {
    return res.status(429).json({ ok: false, error: 'Demasiados envios. Aguarde um momento e tente de novo.' });
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
