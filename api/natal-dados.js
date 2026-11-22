// Função serverless (Vercel) — /api/natal-dados
//
//   GET  ?t=<token>                          — estado: dados guardados, prazo, licença
//   GET  ?t=<token>&textos=1                 — os três textos já preenchidos
//   GET  ?t=<token>&textos=1&f=<ficheiro>&baixar=1
//                                            — descarrega um dos três ficheiros
//   POST { t, dados }                        — valida e guarda as respostas
//
// Ficheiros: completa | gem | conhecimento.
//
// O token vem da ligação enviada por email (assinado, com `sub` do Natal e o fim
// do prazo). Um token do RetiroAssist não abre nada aqui. Passado o prazo, a
// ligação responde 410 com codigo 'prazo'.
//
// Ao guardar, o servidor monta os três textos e confere os limites de
// caracteres. Se algum passar o limite da ferramenta, recusa (422, codigo
// 'limite') e NÃO gasta uma gravação.
//
// Variáveis de ambiente: JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

'use strict';

const natal = require('./_lib/natal');
const kit = require('./_lib/natal-kit');

const FICHEIROS = {
  completa: 'natal-ia-2026-instrucoes-completas.md',
  gem: 'natal-ia-2026-gemini-instrucoes.md',
  conhecimento: 'natal-ia-2026-calendario-e-listas.md',
};

const NOMES_FICHEIROS = {
  completa: 'instruções completas (ChatGPT, Claude e Copilot)',
  gem: 'instruções do Gemini',
  conhecimento: 'ficheiro de conhecimento do Gemini',
};

function lerCorpo(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (_) { return null; }
  }
  return null;
}

// Resolve o token e a compra. Devolve { resposta } se já respondeu, ou
// { cfg, compra, payload } se pode continuar.
async function abrirCompra(token, res) {
  const e = natal.estadoToken(token);
  if (e.estado === 'invalido') {
    res.status(401).json({ ok: false, error: 'Ligação inválida. Use a ligação do email.' });
    return null;
  }
  if (e.estado === 'expirado') {
    res.status(410).json({
      ok: false,
      codigo: 'prazo',
      error: 'O prazo para alterar os dados terminou.',
    });
    return null;
  }

  const cfg = natal.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_* em falta (natal-dados).');
    res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    return null;
  }

  let compra;
  try {
    compra = await natal.obterCompraPorJti(cfg, e.payload.jti);
  } catch (err) {
    console.error('Falha a ler a compra (natal-dados):', err && err.message);
    res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
    return null;
  }
  if (!compra) {
    res.status(401).json({ ok: false, error: 'Ligação inválida. Use a ligação do email.' });
    return null;
  }
  return { cfg, compra, payload: e.payload };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  // ───────────────────────────── GET ─────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const token = (url.searchParams.get('t') || '').trim();
    const aberta = await abrirCompra(token, res);
    if (!aberta) return undefined;
    const { compra, payload } = aberta;
    const licenca = natal.licencaDe(payload.jti);

    if (url.searchParams.get('textos') !== '1') {
      return res.status(200).json({
        ok: true,
        licenca,
        dados: compra.dados || null,
        gravacoes: compra.dados_gravacoes || 0,
        maxGravacoes: natal.MAX_GRAVACOES,
        prazo: new Date(payload.exp * 1000).toISOString(),
        prazoPorExtenso: natal.dataPorExtenso(new Date(payload.exp * 1000)),
        concelhos: kit.CONCELHOS,
        limites: {
          nome: kit.MAX_NOME,
          pessoas: kit.MAX_PESSOAS,
          idade: kit.IDADE_MAX,
          orcamento: kit.ORCAMENTO_MAX,
        },
      });
    }

    if (!compra.dados) {
      return res.status(409).json({
        ok: false,
        codigo: 'sem_dados',
        error: 'Responda primeiro às quatro perguntas.',
      });
    }
    const composto = kit.comporTextos(compra.dados, licenca);
    if (!composto.ok) {
      console.error('Natal IA 2026: textos gravados já não cabem:', composto.codigo, composto.ficheiro);
      return res.status(500).json({ ok: false, error: 'Não foi possível montar os textos.' });
    }

    const f = url.searchParams.get('f');
    if (f) {
      if (!Object.prototype.hasOwnProperty.call(FICHEIROS, f)) {
        return res.status(400).json({ ok: false, error: 'Ficheiro desconhecido.' });
      }
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      if (url.searchParams.get('baixar') === '1') {
        res.setHeader('Content-Disposition', 'attachment; filename="' + FICHEIROS[f] + '"');
      }
      return res.status(200).send(composto.textos[f].texto);
    }

    return res.status(200).json({
      ok: true,
      licenca,
      textos: composto.textos,
      ficheiros: FICHEIROS,
    });
  }

  // ───────────────────────────── POST ─────────────────────────────
  const corpo = lerCorpo(req);
  if (!corpo) {
    return res.status(400).json({ ok: false, error: 'Pedido inválido.' });
  }
  const token = typeof corpo.t === 'string' ? corpo.t.trim() : '';
  const aberta = await abrirCompra(token, res);
  if (!aberta) return undefined;
  const { cfg, compra, payload } = aberta;

  // A validação vem antes de qualquer escrita.
  const validado = kit.validarDados(corpo.dados);
  if (!validado.ok) {
    return res.status(400).json({ ok: false, error: validado.erro, campo: validado.campo || null });
  }

  const gravacoes = compra.dados_gravacoes || 0;
  if (gravacoes >= natal.MAX_GRAVACOES) {
    return res.status(409).json({
      ok: false,
      codigo: 'gravacoes',
      error: 'Já usou as ' + natal.MAX_GRAVACOES + ' gravações possíveis.',
    });
  }

  // Confere os limites das ferramentas com estas respostas, sem gastar uma
  // gravação se não couberem.
  const licenca = natal.licencaDe(payload.jti);
  const composto = kit.comporTextos(validado.dados, licenca);
  if (!composto.ok) {
    if (composto.codigo === 'limite') {
      return res.status(422).json({
        ok: false,
        codigo: 'limite',
        ficheiro: composto.ficheiro,
        excesso: composto.excesso,
        error: 'As respostas fazem o ' + NOMES_FICHEIROS[composto.ficheiro] +
          ' passar o limite em ' + composto.excesso + ' caracteres. Reduza o número de pessoas ou os nomes.',
      });
    }
    console.error('Natal IA 2026: marcador por preencher em', composto.ficheiro);
    return res.status(500).json({ ok: false, error: 'Não foi possível montar os textos.' });
  }

  let gravou;
  try {
    gravou = await natal.guardarDados(cfg, payload.jti, validado.dados, gravacoes);
  } catch (err) {
    console.error('Falha a guardar os dados (natal):', err && err.message);
    return res.status(503).json({ ok: false, error: 'Não foi possível guardar. Tente de novo.' });
  }
  if (!gravou) {
    // Duas gravações em simultâneo: a outra ganhou.
    return res.status(409).json({
      ok: false,
      codigo: 'corrida',
      error: 'Os dados mudaram entretanto. Recarregue a página e tente de novo.',
    });
  }

  return res.status(200).json({
    ok: true,
    licenca,
    gravacoes: gravacoes + 1,
    maxGravacoes: natal.MAX_GRAVACOES,
    textos: composto.textos,
    ficheiros: FICHEIROS,
  });
};
