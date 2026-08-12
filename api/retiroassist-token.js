// Função serverless (Vercel) — GET /api/retiroassist-token?s=<sessão Stripe>
//
// Devolve a ligação de descarga de uma compra já confirmada, para a página de
// obrigado poder oferecer o PDF sem esperar pelo email. NÃO confirma nada: se
// o webhook ainda não tiver corrido, responde 202 e a página tenta de novo.
//
// O identificador da sessão Stripe só é conhecido por quem acabou de pagar —
// chega no success_url. Mesmo modelo do obter-token.js do wizard.
//
// Variáveis de ambiente: JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

'use strict';

const ra = require('../lib/retiroassist');

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

  const cfg = ra.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_* em falta (retiroassist-token).');
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  let compra;
  try {
    compra = await ra.obterCompraPorReferencia(cfg, sessao);
  } catch (err) {
    console.error('Falha a ler a compra:', err && err.message);
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  // Ainda não confirmada: a Stripe pode demorar uns segundos a chamar o
  // webhook. 202 diz à página para voltar a perguntar.
  if (!compra || !compra.token_jti) {
    return res.status(202).json({ ok: false, pendente: true });
  }

  const { token } = ra.emitirToken(compra.token_jti);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({
    ok: true,
    url: '/api/retiroassist-descarregar?t=' + encodeURIComponent(token),
  });
};
