// Testes de obterIp() — o IP do rate-limit tem de vir de fontes que a Vercel
// define e o cliente não consegue falsificar. Sem rede.
// Correr: node --test api/assistir-campo.obterip.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const mod = require('./assistir-campo');
const obterIp = mod.obterIp;

test('prefere x-real-ip (fidedigno) a x-forwarded-for (falsificável)', () => {
  const ip = obterIp({ headers: { 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '1.2.3.4' } });
  assert.strictEqual(ip, '203.0.113.9');
});

test('x-forwarded-for isolado é ignorado (não falsificável escapa ao limite)', () => {
  const ip = obterIp({
    headers: { 'x-forwarded-for': '9.9.9.9' },
    socket: { remoteAddress: '198.51.100.7' },
  });
  assert.strictEqual(ip, '198.51.100.7');
});

test('usa x-vercel-forwarded-for quando não há x-real-ip', () => {
  const ip = obterIp({ headers: { 'x-vercel-forwarded-for': '203.0.113.20, 70.1.1.1' } });
  assert.strictEqual(ip, '203.0.113.20');
});

test('recai em remoteAddress sem headers fidedignos', () => {
  const ip = obterIp({ headers: {}, socket: { remoteAddress: '10.0.0.5' } });
  assert.strictEqual(ip, '10.0.0.5');
});

test('sem qualquer fonte devolve string vazia', () => {
  assert.strictEqual(obterIp({ headers: {} }), '');
});
