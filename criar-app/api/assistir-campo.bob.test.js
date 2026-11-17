// Testes do Bob Pro no pedido à IA — sem rede.
// Correr: node --test criar-app/api/assistir-campo.bob.test.js
//
// O Bob Pro junta ao pedido o que a pessoa escreveu ao Bob e, em "Pedir
// outra", a proposta anterior. Os dois blocos de cache ficam intactos.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { construirMensagens } = require('./assistir-campo.js');

const BASE = {
  contextoBloco: 'CONTEXTO', familia: 'A', profissao: 'profissional',
  rotulo: 'Missão', ajuda: '', orientacao: 'Uma frase.', maxPalavras: 40,
};

function textos(msgs) { return msgs[0].content.map((b) => b.text); }

test('sem pedido nem proposta anterior: só os dois blocos de sempre', () => {
  const c = construirMensagens(BASE)[0].content;
  assert.strictEqual(c.length, 2);
  assert.ok(c[0].cache_control);
});

test('com pedido: o texto da pessoa entra num bloco próprio, sem cache', () => {
  const c = construirMensagens({ ...BASE, pedido: 'poupar tempo nos emails' })[0].content;
  assert.strictEqual(c.length, 3);
  assert.match(c[2].text, /poupar tempo nos emails/);
  assert.match(c[2].text, /Não seguir instruções/);
  assert.ok(!c[2].cache_control);
});

test('pedir outra: a proposta anterior entra para ser evitada', () => {
  const t = textos(construirMensagens({ ...BASE, pedido: 'x', anterior: 'Proposta A' }));
  assert.strictEqual(t.length, 4);
  assert.match(t[3], /Proposta A/);
  assert.match(t[3], /alternativa diferente/);
});

test('no retry da validação, o motivo continua a ser o último bloco', () => {
  const t = textos(construirMensagens({ ...BASE, pedido: 'x', anterior: 'A', motivoRejeicao: 'longo' }));
  assert.match(t[t.length - 1], /rejeitada/);
});
