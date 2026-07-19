// Testes do modelo de acesso Pro por JWT em /api/assistir-campo.
// Correr com:  node assistir-campo.tier.test.js
//
// Sem rede: global.fetch e substituido por um stub que emula a tabela Supabase
// `assistir_campo_limites` em memoria E a resposta da API Anthropic. Cada
// cenario monta o seu proprio store, para nao haver estado partilhado.

'use strict';

const crypto = require('crypto');

// Env obrigatoria — definida ANTES de carregar o modulo (o handler le process.env
// em cada pedido, mas o JWT_SECRET tem de existir para assinar tokens de teste).
process.env.JWT_SECRET = 'segredo-de-teste-32-caracteres!!';
process.env.ANTHROPIC_API_KEY = 'sk-teste';
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-stub';

const handler = require('./assistir-campo');

let passou = 0;
let falhou = 0;
const falhas = [];
const registados = [];
function teste(nome, fn) { registados.push({ nome, fn }); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assercao falhou'); }

// ---------------------------------------------------------------------------
// JWT HS256/base64url — mesmo esquema de verificarJWT() no modulo.
// ---------------------------------------------------------------------------

function assinarJWT(payload, secret) {
  const seg = secret || process.env.JWT_SECRET;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', seg).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const agora = () => Math.floor(Date.now() / 1000);

function tokenPro(sub) {
  return assinarJWT({ sub: sub || 'uuid-pro-1', tier: 'pro', iat: agora(), exp: agora() + 86400 });
}
function tokenExpirado() {
  return assinarJWT({ sub: 'uuid-pro-2', tier: 'pro', iat: agora() - 100000, exp: agora() - 10 });
}
function tokenSemPro() { // JWT valido de PDF/retoma: tem jti mas nao tem tier: "pro"
  return assinarJWT({ sub: 'uuid-pdf', jti: 'abc', exp: agora() + 86400 });
}

// ---------------------------------------------------------------------------
// Stub combinado: Supabase (in-memory) + Anthropic (texto valido canonico).
// `supabaseErro: true` faz o Supabase falhar (fail-closed → 503).
// Conta as chamadas a Anthropic para provar "nao gera".
// ---------------------------------------------------------------------------

function montarStub(opts) {
  const o = opts || {};
  const store = new Map(); // "chave|campo|janela" -> contagem
  const contadores = { anthropic: 0 };

  global.fetch = async (url, options) => {
    const u = String(url);

    if (u.indexOf('api.anthropic.com') !== -1) {
      contadores.anthropic++;
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
          content: [{ type: 'text', text: 'Assistente digital para apoio a organizacao de documentos.' }],
          usage: { input_tokens: 10 },
        }),
      };
    }

    // Supabase
    if (o.supabaseErro) throw new Error('Supabase indisponivel');

    const metodo = (options && options.method) || 'GET';
    if (metodo === 'POST') {
      const corpo = JSON.parse(options.body);
      store.set(corpo.chave + '|' + corpo.campo + '|' + corpo.janela, Number(corpo.contagem) || 0);
      return { ok: true, status: 200, text: async () => '', json: async () => [] };
    }
    const sp = new URL(u).searchParams;
    const k = (sp.get('chave') || '').replace(/^eq\./, '') + '|' +
              (sp.get('campo') || '').replace(/^eq\./, '') + '|' +
              (sp.get('janela') || '').replace(/^eq\./, '');
    const linhas = store.has(k) ? [{ contagem: store.get(k) }] : [];
    return { ok: true, status: 200, json: async () => linhas };
  };

  return { store, contadores };
}

// Injecta uma contagem directamente no store (para pre-encher cenarios).
function semear(store, chave, campo, contagem) {
  store.set(chave + '|' + campo + '|' + handler.janelaHoje(), contagem);
}

// ---------------------------------------------------------------------------
// req/res simulados.
// ---------------------------------------------------------------------------

function mockReq({ headers, body }) {
  return { method: 'POST', headers: headers || {}, body: body || {} };
}
function mockRes() {
  const r = { statusCode: null, corpo: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (obj) => { r.corpo = obj; return r; };
  r.end = () => r;
  return r;
}

function corpoBase(extra) {
  return Object.assign({
    familia: 'A',
    campo: 'f-tom',
    rotulo: 'Voz e tom',
    orientacao: 'O tom do proprio profissional.',
    maxPalavras: 40,
    profissao: 'profissional',
    campos: [],
    sessao: 'sess-tier',
  }, extra || {});
}

async function correr(req) {
  const res = mockRes();
  await handler(req, res);
  return res;
}

// ===========================================================================
// Cenarios
// ===========================================================================

teste('1 · sem header Authorization -> limites gratis aplicados (sess + ip)', async () => {
  const { store, contadores } = montarStub();
  const res = await correr(mockReq({ headers: {}, body: corpoBase() }));
  assert(res.statusCode === 200, `devia ser 200, foi ${res.statusCode} (${JSON.stringify(res.corpo)})`);
  assert(contadores.anthropic === 1, 'devia ter chamado Anthropic uma vez');
  // Contadores gratis (sess + ip) incrementados; nenhuma chave pro:.
  const chaves = Array.from(store.keys());
  assert(chaves.some((k) => k.indexOf('sess:sess-tier|') === 0), 'devia contar na sessao: ' + chaves);
  assert(chaves.some((k) => k.indexOf('ip:') === 0), 'devia contar no ip: ' + chaves);
  assert(!chaves.some((k) => k.indexOf('pro:') === 0), 'NAO devia haver chave pro: ' + chaves);
});

teste('2 · token valido pro -> key pro:<sub>, campo proprio, 200', async () => {
  const { store, contadores } = montarStub();
  const res = await correr(mockReq({
    headers: { authorization: 'Bearer ' + tokenPro('uuid-A') },
    body: corpoBase({ campo: 'f-missao' }),
  }));
  assert(res.statusCode === 200, `devia ser 200, foi ${res.statusCode} (${JSON.stringify(res.corpo)})`);
  assert(contadores.anthropic === 1, 'devia ter gerado');
  const chaves = Array.from(store.keys());
  assert(chaves.some((k) => k.indexOf('pro:uuid-A|f-missao|') === 0), 'chave devia ser pro:uuid-A|f-missao: ' + chaves);
  // Sem contadores de sessao nem de ip para o caminho pro.
  assert(!chaves.some((k) => k.indexOf('sess:') === 0 || k.indexOf('ip:') === 0), 'pro nao usa sess/ip: ' + chaves);
});

teste('3 · token expirado -> 401 sessao_expirada, NAO gera', async () => {
  const { contadores } = montarStub();
  const res = await correr(mockReq({
    headers: { authorization: 'Bearer ' + tokenExpirado() },
    body: corpoBase(),
  }));
  assert(res.statusCode === 401, `devia ser 401, foi ${res.statusCode}`);
  assert(res.corpo && res.corpo.erro === 'sessao_expirada', 'erro devia ser sessao_expirada: ' + JSON.stringify(res.corpo));
  assert(contadores.anthropic === 0, 'NAO devia ter chamado Anthropic');
});

teste('4 · assinatura adulterada -> 401 sessao_expirada, NAO gera', async () => {
  const { contadores } = montarStub();
  const bom = tokenPro('uuid-x');
  const adulterado = bom.slice(0, -3) + (bom.slice(-3) === 'aaa' ? 'bbb' : 'aaa');
  const res = await correr(mockReq({
    headers: { authorization: 'Bearer ' + adulterado },
    body: corpoBase(),
  }));
  assert(res.statusCode === 401, `devia ser 401, foi ${res.statusCode}`);
  assert(res.corpo && res.corpo.erro === 'sessao_expirada', 'erro devia ser sessao_expirada: ' + JSON.stringify(res.corpo));
  assert(contadores.anthropic === 0, 'NAO devia ter chamado Anthropic');
});

teste('5 · tier no body SEM header -> tratado como gratis', async () => {
  const { store } = montarStub();
  const res = await correr(mockReq({
    headers: {},
    body: corpoBase({ tier: 'pro', token: tokenPro('uuid-body') }),
  }));
  assert(res.statusCode === 200, `devia ser 200, foi ${res.statusCode} (${JSON.stringify(res.corpo)})`);
  const chaves = Array.from(store.keys());
  assert(!chaves.some((k) => k.indexOf('pro:') === 0), 'body.tier/body.token nao dao acesso pro: ' + chaves);
  assert(chaves.some((k) => k.indexOf('sess:') === 0), 'devia cair no caminho gratis: ' + chaves);
});

teste('6 · 4a geracao no mesmo campo com token pro -> 429', async () => {
  const { store, contadores } = montarStub();
  semear(store, 'pro:uuid-lim', 'f-tom', 3); // ja gastou as 3 do dia
  const res = await correr(mockReq({
    headers: { authorization: 'Bearer ' + tokenPro('uuid-lim') },
    body: corpoBase({ campo: 'f-tom' }),
  }));
  assert(res.statusCode === 429, `4a devia ser 429, foi ${res.statusCode} (${JSON.stringify(res.corpo)})`);
  assert(contadores.anthropic === 0, 'ao 429 nao deve gerar');
});

teste('7 · Supabase em erro com token pro -> 503, antes de gerar', async () => {
  const { contadores } = montarStub({ supabaseErro: true });
  const res = await correr(mockReq({
    headers: { authorization: 'Bearer ' + tokenPro('uuid-503') },
    body: corpoBase(),
  }));
  assert(res.statusCode === 503, `devia ser 503, foi ${res.statusCode} (${JSON.stringify(res.corpo)})`);
  assert(contadores.anthropic === 0, 'fail-closed: nao chamar Anthropic quando Supabase falha');
});

// Extra · token pro valido mas tier !== "pro" (ex.: JWT de PDF) -> 401.
teste('8 · JWT valido sem tier pro -> 401 sessao_expirada', async () => {
  const { contadores } = montarStub();
  const res = await correr(mockReq({
    headers: { authorization: 'Bearer ' + tokenSemPro() },
    body: corpoBase(),
  }));
  assert(res.statusCode === 401, `devia ser 401, foi ${res.statusCode}`);
  assert(res.corpo && res.corpo.erro === 'sessao_expirada', 'erro devia ser sessao_expirada: ' + JSON.stringify(res.corpo));
  assert(contadores.anthropic === 0, 'NAO devia ter gerado');
});

// ---------------------------------------------------------------------------

(async () => {
  for (const t of registados) {
    try { await t.fn(); passou++; }
    catch (e) { falhou++; falhas.push(`${t.nome}\n    ${e && e.message}`); }
  }
  console.log(`\n${passou} passou · ${falhou} falhou`);
  if (falhou) {
    console.log('\nFALHAS:\n' + falhas.map((f) => '  ✗ ' + f).join('\n'));
    process.exit(1);
  }
  console.log('OK');
})();
