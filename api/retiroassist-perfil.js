// Função serverless (Vercel) — GET/POST /api/retiroassist-perfil
//
// O perfil do comprador: as 8 respostas que personalizam o prompt do
// RetiroAssist. Preso ao mesmo token da descarga — só quem tem a ligação do
// email (ou da página de compra concluída) lê ou grava o perfil.
//
// Contrato:
//   GET  ?t=<token>
//     → { ok: true, licenca, perfil|null, gravacoes_restantes }
//   POST { t, respostas: { nome, partida, … } }
//     → { ok: true, licenca, url }        — url da descarga do PDF
//     → { ok: false, error, campo? }      — 400 resposta inválida
//                                           403 ligação inválida/expirada
//                                           409 limite de gravações atingido
//
// Variáveis de ambiente: as de _lib/retiroassist.js (JWT_SECRET, SUPABASE_*).

'use strict';

const ra = require('./_lib/retiroassist');

function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch (_) { return null; }
  }
  return {};
}

// Encontra a compra viva a que o token dá acesso, ou responde e devolve null.
async function compraDoToken(token, res) {
  const payload = ra.verificarToken(token);
  if (!payload) {
    res.status(403).json({ ok: false, error: 'Ligação inválida ou expirada.' });
    return null;
  }

  const cfg = ra.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_* em falta (retiroassist-perfil).');
    res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    return null;
  }

  let compra;
  try {
    compra = await ra.obterCompraPorJti(cfg, payload.jti);
  } catch (err) {
    console.error('Falha a ler a compra:', err && err.message);
    res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    return null;
  }
  if (!compra || (compra.expira_em && new Date(compra.expira_em).getTime() <= Date.now())) {
    res.status(403).json({ ok: false, error: 'Ligação inválida ou expirada.' });
    return null;
  }
  return { cfg, compra, jti: payload.jti };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const achada = await compraDoToken(url.searchParams.get('t'), res);
    if (!achada) return;
    const gravacoes = achada.compra.perfil_gravacoes || 0;
    return res.status(200).json({
      ok: true,
      licenca: ra.licencaDe(achada.jti),
      perfil: achada.compra.perfil || null,
      gravacoes_restantes: Math.max(0, ra.MAX_GRAVACOES_PERFIL - gravacoes),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const corpo = lerCorpo(req);
  if (!corpo) {
    return res.status(400).json({ ok: false, error: 'Pedido inválido.' });
  }

  // A validação vem antes do Supabase: uma resposta mal preenchida não gasta
  // uma gravação nem chega à base de dados.
  const validado = ra.validarPerfil(corpo.respostas);
  if (!validado.ok) {
    return res.status(400).json({ ok: false, error: validado.erro, campo: validado.campo });
  }

  const achada = await compraDoToken(corpo.t, res);
  if (!achada) return;

  const gravacoes = achada.compra.perfil_gravacoes || 0;
  if (gravacoes >= ra.MAX_GRAVACOES_PERFIL) {
    return res.status(409).json({
      ok: false,
      error: 'O perfil já foi gravado o número máximo de vezes. O kit continua disponível para descarregar.',
    });
  }

  try {
    await ra.guardarPerfil(achada.cfg, achada.jti, validado.perfil, gravacoes);
  } catch (err) {
    console.error('Falha a gravar o perfil do RetiroAssist:', err && err.message);
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  return res.status(200).json({
    ok: true,
    licenca: ra.licencaDe(achada.jti),
    url: '/api/retiroassist-descarregar?t=' + encodeURIComponent(corpo.t),
  });
};
