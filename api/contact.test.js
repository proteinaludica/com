// Testes do rate-limit por IP de POST /api/contact. Sem rede: os pedidos
// param em 400 (corpo inválido) antes de qualquer chamada ao Resend, mas
// ainda assim consomem a cota do IP — o 4.º pedido na janela recebe 429.
// Correr: node --test api/contact.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const handler = require('./contact');

function reqDe(ip, body) {
  return { method: 'POST', headers: { 'x-real-ip': ip }, body: body || {}, socket: {} };
}

function resMock() {
  const r = { statusCode: null, payload: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.setHeader = () => {};
  return r;
}

async function chamar(ip, body) {
  const res = resMock();
  await handler(reqDe(ip, body), res);
  return res;
}

test('4.º envio do mesmo IP na janela -> 429', async () => {
  const ip = '203.0.113.100';
  // 3 pedidos inválidos (400) consomem a cota sem tocar na rede.
  for (let i = 0; i < 3; i++) {
    const r = await chamar(ip, {});
    assert.strictEqual(r.statusCode, 400, `pedido ${i + 1} devia ser 400, foi ${r.statusCode}`);
  }
  const quarto = await chamar(ip, {});
  assert.strictEqual(quarto.statusCode, 429, 'o 4.º pedido devia ser barrado (429)');
});

test('IP diferente tem cota própria', async () => {
  const r = await chamar('203.0.113.200', {});
  assert.strictEqual(r.statusCode, 400, 'novo IP não deve estar limitado');
});
