// Testes do módulo comum do gating Pro — sem rede.
// Correr: node --test criar-app/api/pro-comum.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

process.env.JWT_SECRET = 'segredo-de-teste-32-caracteres!!';
const pro = require('./pro-comum');

test('emitirJWTpro produz um JWT Pro válido e verificável', () => {
  const { token, exp } = pro.emitirJWTpro('pro-sessao-abc');
  assert.strictEqual(token.split('.').length, 3);

  const payload = pro.verificarJWT(token);
  assert.ok(payload, 'o token deve verificar');
  assert.strictEqual(payload.tier, 'pro');
  assert.strictEqual(payload.sub, 'pro-sessao-abc');
  assert.strictEqual(payload.exp, exp);
  // Validade ~1 ano.
  assert.strictEqual(exp - payload.iat, pro.VALIDADE_SEGUNDOS);
});

test('verificarJWT rejeita assinatura adulterada', () => {
  const { token } = pro.emitirJWTpro('x');
  const partes = token.split('.');
  const adulterado = partes[0] + '.' + partes[1] + '.' + 'AAAA' + partes[2].slice(4);
  assert.strictEqual(pro.verificarJWT(adulterado), null);
});

test('verificarJWT rejeita token expirado', () => {
  // Constrói manualmente um token já expirado com o mesmo esquema.
  const secret = process.env.JWT_SECRET;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: 'x', tier: 'pro', iat: 1, exp: 2 })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url');
  assert.strictEqual(pro.verificarJWT(header + '.' + body + '.' + sig), null);
});

test('verificarJWT rejeita entradas malformadas', () => {
  assert.strictEqual(pro.verificarJWT(''), null);
  assert.strictEqual(pro.verificarJWT(null), null);
  assert.strictEqual(pro.verificarJWT('a.b'), null);
  assert.strictEqual(pro.verificarJWT('a.b.c.d'), null);
});

test('configSupabase devolve null sem variáveis e config com variáveis', () => {
  const urlAntes = process.env.SUPABASE_URL;
  const keyAntes = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.strictEqual(pro.configSupabase(), null);

  process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  const cfg = pro.configSupabase();
  assert.deepStrictEqual(cfg, { url: 'https://exemplo.supabase.co', key: 'service-role-key' });

  if (urlAntes == null) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = urlAntes;
  if (keyAntes == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = keyAntes;
});
