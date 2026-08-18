// Testes da assinatura única de JWT — sem rede.
// Correr: node --test criar-app/lib/pro-comum.jwt.test.js
//
// Antes, gerar-pdf-instalacao.js tinha o seu próprio emissor, com um segredo
// de fallback público no repositório ('fallback-secret-dev-only-32chars!!').
// Com JWT_SECRET por definir, esse emissor assinava com o segredo público
// enquanto download-pdf/retoma-dados (que verificam por este módulo) recusavam
// tudo: cada ligação nascia morta, em silêncio. Estes testes fixam a política
// nova — uma só assinatura, a falhar fechado dos dois lados.

'use strict';

process.env.JWT_SECRET = 'segredo-de-teste-32-caracteres!!';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const pro = require('./pro-comum');

function payloadDe(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

test('assinarJWT acrescenta iat/exp e respeita a validade pedida', () => {
  const { token, exp } = pro.assinarJWT({ sub: 'x' }, 120);
  const p = payloadDe(token);
  assert.strictEqual(p.sub, 'x');
  assert.strictEqual(exp - p.iat, 120);
  assert.strictEqual(p.exp, exp);
  assert.ok(pro.verificarJWT(token), 'o próprio módulo verifica o que assina');
});

test('emitirJWTpro mantém o payload que assistir-campo verifica', () => {
  const { token, exp } = pro.emitirJWTpro('pro-sessao-1');
  const p = payloadDe(token);
  assert.strictEqual(p.sub, 'pro-sessao-1');
  assert.strictEqual(p.tier, 'pro');
  assert.strictEqual(exp - p.iat, pro.VALIDADE_SEGUNDOS);
});

test('emitirJWTdocumento dura 30 dias e traz jti próprio', () => {
  const { token, exp, jti } = pro.emitirJWTdocumento({ email: 'a@b.pt', plataforma: 'claude' });
  const p = payloadDe(token);
  assert.strictEqual(exp - p.iat, pro.VALIDADE_DOCUMENTO_SEGUNDOS);
  assert.strictEqual(pro.VALIDADE_DOCUMENTO_SEGUNDOS, 30 * 24 * 60 * 60);
  assert.strictEqual(p.jti, jti);
  assert.match(jti, /^[0-9a-f]{32}$/);
  assert.strictEqual(p.email, 'a@b.pt');
  assert.strictEqual(p.plataforma, 'claude');
});

test('dois documentos seguidos têm jti diferentes', () => {
  const a = pro.emitirJWTdocumento({ email: 'a@b.pt' });
  const b = pro.emitirJWTdocumento({ email: 'a@b.pt' });
  assert.notStrictEqual(a.jti, b.jti);
});

test('o token do documento é aceite por verificarJWT (o que download-pdf usa)', () => {
  const { token, jti } = pro.emitirJWTdocumento({ email: 'a@b.pt' });
  const p = pro.verificarJWT(token);
  assert.ok(p);
  assert.strictEqual(p.jti, jti);
});

test('o segredo de fallback antigo já não assina nada que seja aceite', () => {
  const ANTIGO = 'fallback-secret-dev-only-32chars!!';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    jti: 'a'.repeat(32),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', ANTIGO).update(`${header}.${body}`).digest('base64url');
  assert.strictEqual(pro.verificarJWT(`${header}.${body}.${sig}`), null);
});

test('fail-closed: sem JWT_SECRET, emitir documento lança em vez de usar fallback', () => {
  const antes = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    assert.throws(() => pro.emitirJWTdocumento({ email: 'a@b.pt' }), /JWT_SECRET/);
    assert.throws(() => pro.assinarJWT({ sub: 'x' }, 60), /JWT_SECRET/);
  } finally {
    process.env.JWT_SECRET = antes;
  }
});
