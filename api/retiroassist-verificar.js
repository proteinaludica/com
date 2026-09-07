// Função serverless (Vercel) — GET /api/retiroassist-verificar
//
// Prova que a geração do PDF funciona NA VERCEL, sem ser preciso uma compra.
// O pdf-lib é dependência nova na raiz, e até aqui o único caminho que o
// exercitava ficava atrás de um pagamento confirmado — ou seja, só se
// descobria que estava partido depois de alguém pagar.
//
// ⚠️ NÃO DEVOLVE O PDF, de propósito.
// O kit custa 19€. Um endpoint público que devolvesse o ficheiro dava o
// produto a quem soubesse o URL. Isto devolve apenas a prova de que o
// ficheiro foi gerado: número de páginas, tamanho, e o SHA-256 do conteúdo.
// Nada disto permite reconstruir o kit.
//
// Resposta:
//   200 { ok: true, paginas, bytes, sha256, ms, versao_kit, kit_aprovado }
//   500 { ok: false, error }   — a geração rebentou; a mensagem fica no log
//
// Sem variáveis de ambiente: não lê segredos nem toca na base de dados.

'use strict';

const crypto = require('crypto');
const ra = require('../lib/retiroassist');
const kit = require('../lib/retiroassist-kit');

// Gerar um PDF custa CPU. Isto é um diagnóstico, não um caminho de produto,
// por isso leva o mesmo travão em memória do api/contact.js: best-effort,
// não distribuído, chega para travar quem martele o endpoint.
const RL_JANELA_MS = 60 * 1000;
const RL_MAX = 5;
const rlPorIp = new Map();

function obterIp(req) {
  const h = req.headers || {};
  const real = h['x-real-ip'] || h['x-vercel-forwarded-for'];
  if (real) return String(Array.isArray(real) ? real[0] : real).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

function excedeuLimite(ip) {
  if (!ip) return false;
  const agora = Date.now();
  const recentes = (rlPorIp.get(ip) || []).filter((t) => agora - t < RL_JANELA_MS);
  if (recentes.length >= RL_MAX) {
    rlPorIp.set(ip, recentes);
    return true;
  }
  recentes.push(agora);
  rlPorIp.set(ip, recentes);
  if (rlPorIp.size > 1000) {
    for (const [k, v] of rlPorIp) {
      if (!v.some((t) => agora - t < RL_JANELA_MS)) rlPorIp.delete(k);
    }
  }
  return false;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (excedeuLimite(obterIp(req))) {
    return res.status(429).json({ ok: false, error: 'Demasiados pedidos. Esperar um minuto.' });
  }

  const inicio = Date.now();
  let pdf;
  try {
    pdf = await ra.construirPDF();
  } catch (err) {
    // A mensagem real vai para o log, não para a resposta.
    console.error('RetiroAssist: geração do PDF falhou:', err && err.stack);
    return res.status(500).json({ ok: false, error: 'A geração do PDF falhou.' });
  }
  const ms = Date.now() - inicio;

  let paginas = null;
  try {
    const { PDFDocument } = require('pdf-lib');
    paginas = (await PDFDocument.load(pdf)).getPageCount();
  } catch (_) {
    /* o PDF saiu; só não se conseguiu recontar as páginas */
  }

  return res.status(200).json({
    ok: true,
    paginas,
    bytes: pdf.length,
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    ms,
    versao_kit: kit.VERSAO,
    kit_aprovado: kit.estaAprovado(),
  });
};
