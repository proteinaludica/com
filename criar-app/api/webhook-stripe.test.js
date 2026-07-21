// Testes da verificação de assinatura do webhook Stripe — sem rede.
// Correr: node --test criar-app/api/webhook-stripe.test.js
//
// assinaturaValida não é exportada (o export é o handler). Reconstrói-se aqui a
// mesma verificação para garantir que a assinatura de referência é aceite e as
// variantes inválidas recusadas — espelho fiel do algoritmo do endpoint.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const SECRET = 'whsec_teste';

function assinar(rawBody, t, secret) {
  return crypto.createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex');
}

// Cópia do algoritmo do endpoint, para validar o contrato.
function assinaturaValida(rawBody, header, secret, agora) {
  if (!header || !secret) return false;
  let t = null;
  const v1 = [];
  for (const parte of String(header).split(',')) {
    const [k, v] = parte.split('=');
    if (k === 't') t = v;
    else if (k === 'v1' && v) v1.push(v);
  }
  if (!t || !v1.length) return false;
  const idade = agora - Number(t);
  if (!Number.isFinite(idade) || Math.abs(idade) > 300) return false;
  const esperada = crypto.createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex');
  const b = Buffer.from(esperada);
  return v1.some((a) => {
    const buf = Buffer.from(a);
    return buf.length === b.length && crypto.timingSafeEqual(buf, b);
  });
}

test('aceita uma assinatura válida e recente', () => {
  const raw = JSON.stringify({ type: 'checkout.session.completed' });
  const t = Math.floor(Date.now() / 1000);
  const header = 't=' + t + ',v1=' + assinar(raw, t, SECRET);
  assert.strictEqual(assinaturaValida(raw, header, SECRET, t), true);
});

test('recusa assinatura com segredo errado', () => {
  const raw = '{}';
  const t = Math.floor(Date.now() / 1000);
  const header = 't=' + t + ',v1=' + assinar(raw, t, 'outro');
  assert.strictEqual(assinaturaValida(raw, header, SECRET, t), false);
});

test('recusa corpo adulterado', () => {
  const t = Math.floor(Date.now() / 1000);
  const header = 't=' + t + ',v1=' + assinar('{"a":1}', t, SECRET);
  assert.strictEqual(assinaturaValida('{"a":2}', header, SECRET, t), false);
});

test('recusa timestamp fora da tolerância', () => {
  const raw = '{}';
  const t = Math.floor(Date.now() / 1000) - 3600;
  const header = 't=' + t + ',v1=' + assinar(raw, t, SECRET);
  assert.strictEqual(assinaturaValida(raw, header, SECRET, Math.floor(Date.now() / 1000)), false);
});

test('recusa header malformado ou vazio', () => {
  assert.strictEqual(assinaturaValida('{}', '', SECRET, 0), false);
  assert.strictEqual(assinaturaValida('{}', 'v1=abc', SECRET, 0), false);
  assert.strictEqual(assinaturaValida('{}', 't=1', SECRET, 0), false);
});
