// Função serverless (Vercel) — GET /api/natal-token?s=<sessão Stripe>
//
// Devolve a ligação para as quatro perguntas de uma compra já confirmada, para
// a página de obrigado não ter de esperar pelo email. NÃO confirma nada: se o
// webhook ainda não tiver corrido, responde 202 e a página tenta de novo.
//
// O identificador da sessão Stripe só é conhecido por quem acabou de pagar —
// chega no success_url.
//
// Variáveis de ambiente: JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

'use strict';

const natal = require('./_lib/natal');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const sessao = (url.searchParams.get('s') || '').trim().slice(0, 200);
  if (!sessao) {
    return res.status(400).json({ ok: false, error: 'Falta a sessão.' });
  }

  const cfg = natal.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_* em falta (natal-token).');
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  let compra;
  try {
    compra = await natal.obterCompraPorReferencia(cfg, sessao);
  } catch (err) {
    console.error('Falha a ler a compra (natal):', err && err.message);
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  // Ainda não confirmada: a Stripe pode demorar uns segundos a chamar o
  // webhook. 202 diz à página para voltar a perguntar.
  if (!compra || !compra.token_jti) {
    return res.status(202).json({ ok: false, pendente: true });
  }

  const exp = Math.floor(Date.parse(compra.expira_em) / 1000);
  const { token } = natal.emitirToken(compra.token_jti, exp);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    ok: true,
    url: '/natal-personalizar?t=' + encodeURIComponent(token),
  });
};
