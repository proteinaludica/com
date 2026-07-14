// Função serverless (Vercel) — recebe pedido de assistente digital IA à medida (290€),
// insere em Supabase (contact_requests) e notifica via Resend.
//
// Variáveis de ambiente a definir no painel da Vercel (Project → Settings → Environment Variables):
//   SUPABASE_URL                  — URL da API Supabase, ex: https://xxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY     — chave service_role (secreta · obrigatória)
//   RESEND_API_KEY                — chave da API Resend (secreta · obrigatória)
//   CONTACT_TO                    — (opcional) email destino admin; por defeito info@proteinaludica.com
//   PDF_FROM                      — remetente verificado no Resend (opcional; fallback: onboarding@resend.dev)
//
// Sem dependências externas: usa o fetch nativo do Node 18+ na Vercel.

function cortar(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

function formatarDataPT() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const ano = agora.getFullYear();
  const hora = String(agora.getHours()).padStart(2, '0');
  const minuto = String(agora.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const LIMITES = { nome: 120, email: 200, plataforma: 60, telemovel: 30 };
    const nome = cortar(body.nome, LIMITES.nome);
    const email = cortar(body.email, LIMITES.email);
    const plataforma = cortar(body.plataforma, LIMITES.plataforma);
    const telemovel = cortar(body.telemovel, LIMITES.telemovel);

    // Validação
    if (!nome || !email) {
      return res.status(400).json({ ok: false, error: 'Indique pelo menos o nome e o email.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'O email não parece válido.' });
    }

    // ─── INSERT EM SUPABASE ───
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta.');
      // Não bloquear o utilizador; tentar enviar email mesmo assim
    } else {
      try {
        const insertResp = await fetch(`${supabaseUrl}/rest/v1/contact_requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            nome: nome,
            email: email,
            plataforma: plataforma || null,
            telemovel: telemovel || null,
          }),
        });

        if (!insertResp.ok) {
          const detalhe = await insertResp.text();
          console.error('Erro Supabase:', insertResp.status, detalhe);
          // Não bloquear; continuar com email
        }
      } catch (err) {
        console.error('Erro ao inserir em Supabase:', err);
        // Não bloquear; continuar com email
      }
    }

    // ─── EMAIL VIA RESEND ───
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY em falta.');
      return res.status(500).json({ ok: false, error: 'Serviço de email não configurado.' });
    }

    const to = process.env.CONTACT_TO || 'info@proteinaludica.com';
    const from = process.env.PDF_FROM || 'Proteína Lúdica <onboarding@resend.dev>';
    const dataPT = formatarDataPT();

    const texto = [
      'Chegou um novo pedido de assistente digital IA à medida.',
      '',
      'Nome: ' + nome,
      'Email: ' + email,
      'Telemóvel: ' + (telemovel || '(não fornecido)'),
      'Plataforma escolhida: ' + (plataforma || '(não indicada)'),
      'Recebido em: ' + dataPT,
      '',
      'Responder directamente a este email para contactar o interessado.',
    ].join('\n');

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [to],
        reply_to: email,
        subject: 'Novo pedido — assistente à medida (290€)',
        text: texto,
      }),
    });

    if (!emailResp.ok) {
      const detalhe = await emailResp.text();
      console.error('Erro Resend:', emailResp.status, detalhe);
      return res.status(502).json({ ok: false, error: 'Não foi possível enviar a notificação agora.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro no handler de pedido à medida:', err);
    return res.status(500).json({ ok: false, error: 'Ocorreu um erro inesperado.' });
  }
};
