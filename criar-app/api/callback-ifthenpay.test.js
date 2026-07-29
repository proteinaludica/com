// Testes do callback IfthenPay — validação do montante. Sem rede:
// pro.configSupabase e pro.confirmarPagamentoPro são substituídos por stubs.
// Correr: node --test api/callback-ifthenpay.test.js

'use strict';

const test = require('node:test');
const assert = require('node:assert');

process.env.IFTHENPAY_ANTI_PHISHING_KEY = 'chave-anti-phishing-teste';
const pro = require('../lib/pro-comum');
const handler = require('./callback-ifthenpay');

function resMock() {
  const r = { statusCode: null, payload: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.setHeader = () => {};
  return r;
}

async function chamar(query) {
  const res = resMock();
  await handler({ method: 'GET', query }, res);
  return res;
}

function comStubs(fn) {
  const cfgOrig = pro.configSupabase;
  const confOrig = pro.confirmarPagamentoPro;
  let chamadas = 0;
  pro.configSupabase = () => ({ url: 'https://stub', key: 'k' });
  pro.confirmarPagamentoPro = async () => { chamadas++; return 'token'; };
  return fn(() => chamadas).finally(() => {
    pro.configSupabase = cfgOrig;
    pro.confirmarPagamentoPro = confOrig;
  });
}

const KEY = 'chave-anti-phishing-teste';

test('montante diferente de 49€ -> 400 e não confirma', async () => {
  await comStubs(async (chamadas) => {
    const r = await chamar({ chave: KEY, sessao: 's1', referencia: 'r1', valor: '1.00' });
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(chamadas(), 0, 'não devia confirmar pagamento com montante errado');
  });
});

test('montante em falta -> 400 e não confirma', async () => {
  await comStubs(async (chamadas) => {
    const r = await chamar({ chave: KEY, sessao: 's1', referencia: 'r1' });
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(chamadas(), 0);
  });
});

test('montante correcto (49,00) -> 200 e confirma uma vez', async () => {
  await comStubs(async (chamadas) => {
    const r = await chamar({ chave: KEY, sessao: 's1', referencia: 'r1', valor: '49,00' });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(chamadas(), 1);
  });
});

test('chave anti-phishing errada -> 403 (antes do montante)', async () => {
  await comStubs(async (chamadas) => {
    const r = await chamar({ chave: 'errada', sessao: 's1', referencia: 'r1', valor: '49,00' });
    assert.strictEqual(r.statusCode, 403);
    assert.strictEqual(chamadas(), 0);
  });
});
