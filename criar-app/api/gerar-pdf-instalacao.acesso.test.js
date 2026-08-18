// Testes da barreira de acesso de /api/gerar-pdf-instalacao — sem rede.
// Correr: node --test criar-app/api/gerar-pdf-instalacao.acesso.test.js
//
// O guia de instalação é conteúdo pago. Antes, o endpoint gerava e enviava o
// PDF a qualquer POST bem formado; estes testes fixam a regra nova: sem um
// token Pro válido no header Authorization, responde 401 e não gera nada.

'use strict';

process.env.JWT_SECRET = 'segredo-de-teste-32-caracteres!!';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const handler = require('./gerar-pdf-instalacao.js');

// Emite um JWT HS256/base64url com o mesmo esquema de lib/pro-comum.
function emitir(payload, secret) {
  const seg = secret || process.env.JWT_SECRET;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = crypto.createHmac('sha256', seg).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${assinatura}`;
}

function tokenPro(extra) {
  const agora = Math.floor(Date.now() / 1000);
  return emitir(Object.assign({ sub: 'pro-1', tier: 'pro', iat: agora, exp: agora + 3600 }, extra));
}

// Resposta falsa que regista o que o handler devolveu.
function resFalsa() {
  const r = {
    codigo: null,
    corpo: null,
    cabecalhos: {},
    status(c) { r.codigo = c; return r; },
    json(c) { r.corpo = c; return r; },
    send(c) { r.corpo = c; return r; },
    setHeader(k, v) { r.cabecalhos[k] = v; },
    end() { return r; },
  };
  return r;
}

const CORPO_VALIDO = {
  plataforma: 'claude',
  nome_assistente: 'Assistente de Marcações',
  missao: 'Organizar pedidos de consulta.',
  prompt_completo: '# SYSTEM PROMPT\nConteúdo do profissional.',
  email: 'profissional@exemplo.pt',
};

function pedido(headers, corpo) {
  return { method: 'POST', headers: headers || {}, body: corpo === undefined ? CORPO_VALIDO : corpo };
}

test('sem header Authorization devolve 401 e não gera o PDF', async () => {
  const res = resFalsa();
  await handler(pedido({}), res);
  assert.strictEqual(res.codigo, 401);
  assert.strictEqual(res.corpo.ok, false);
  assert.strictEqual(res.corpo.erro, 'sessao_expirada');
});

test('token assinado com outro segredo devolve 401', async () => {
  const alheio = emitir({ tier: 'pro', exp: Math.floor(Date.now() / 1000) + 3600 }, 'outro-segredo-qualquer-32-chars!!');
  const res = resFalsa();
  await handler(pedido({ authorization: 'Bearer ' + alheio }), res);
  assert.strictEqual(res.codigo, 401);
});

test('token expirado devolve 401', async () => {
  const agora = Math.floor(Date.now() / 1000);
  const expirado = emitir({ sub: 'pro-1', tier: 'pro', iat: agora - 7200, exp: agora - 60 });
  const res = resFalsa();
  await handler(pedido({ authorization: 'Bearer ' + expirado }), res);
  assert.strictEqual(res.codigo, 401);
});

test('token válido mas sem tier pro devolve 401', async () => {
  const agora = Math.floor(Date.now() / 1000);
  const gratis = emitir({ sub: 'x', tier: 'gratis', iat: agora, exp: agora + 3600 });
  const res = resFalsa();
  await handler(pedido({ authorization: 'Bearer ' + gratis }), res);
  assert.strictEqual(res.codigo, 401);
});

test('token no corpo do pedido não substitui o header', async () => {
  const res = resFalsa();
  await handler(pedido({}, Object.assign({ token: tokenPro(), tier: 'pro' }, CORPO_VALIDO)), res);
  assert.strictEqual(res.codigo, 401);
});

test('esquema mal formado (sem "Bearer") devolve 401', async () => {
  const res = resFalsa();
  await handler(pedido({ authorization: tokenPro() }), res);
  assert.strictEqual(res.codigo, 401);
});

test('método diferente de POST continua a devolver 405, antes da barreira', async () => {
  const res = resFalsa();
  await handler({ method: 'GET', headers: {} }, res);
  assert.strictEqual(res.codigo, 405);
});

test('com token Pro válido passa a barreira e chega à validação do corpo', async () => {
  // Corpo incompleto: se a barreira deixasse passar, a resposta é 400 (e não
  // 401). É isto que distingue "não autorizado" de "autorizado mas inválido".
  const res = resFalsa();
  await handler(pedido({ authorization: 'Bearer ' + tokenPro() }, { email: 'a@b.pt' }), res);
  assert.strictEqual(res.codigo, 400);
});
