// Testes do passo "ficheiro de exemplos" no guia de instalação — sem rede.
// Correr: node --test criar-app/api/gerar-pdf-instalacao.exemplos.test.js
//
// Quando o wizard tira os exemplos das instruções (secção 00), as instruções
// terminam com uma frase fixa. O guia deve então mostrar um passo extra a
// explicar como carregar exemplos.txt, logo a seguir ao passo das instruções.

'use strict';

process.env.JWT_SECRET = 'segredo-de-teste-32-caracteres!!';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { temExemplos, guiaComExemplos, escolherGuia, gerarPdf } = require('./gerar-pdf-instalacao.js');

// A frase tem de ser a mesma que o wizard escreve nas instruções.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const FRASE = html.match(/const TEXTO_REFERENCIA_EXEMPLOS = '([^']+)'/)[1];
const COM = '## 01. Nome e propósito\nChama-se X.\n\n## 02. Exemplos\n' + FRASE;
const SEM = '## 01. Nome e propósito\nChama-se X.';

test('detecta a frase que o wizard escreve', () => {
  assert.strictEqual(temExemplos(COM), true);
  assert.strictEqual(temExemplos(SEM), false);
  assert.strictEqual(temExemplos(''), false);
});

for (const plataforma of ['claude', 'gemini', 'gpt', 'copilot']) {
  test(`${plataforma}: passo extra logo a seguir às instruções`, () => {
    const base = escolherGuia(plataforma);
    const guia = guiaComExemplos(base, plataforma);
    const i = guia.passos.findIndex((p) => p.copiar === 'prompt_completo');
    assert.strictEqual(guia.passos.length, base.passos.length + 1);
    assert.match(guia.passos[i + 1].texto, /exemplos\.txt/);
  });
}

test('não altera o guia partilhado entre pedidos', () => {
  const antes = escolherGuia('claude').passos.length;
  guiaComExemplos(escolherGuia('claude'), 'claude');
  assert.strictEqual(escolherGuia('claude').passos.length, antes);
});

test('gera o PDF com e sem exemplos', async () => {
  for (const prompt_completo of [COM, SEM]) {
    const bytes = await gerarPdf({ plataforma: 'gemini', nome_assistente: 'Dr. Silva', missao: 'Teste', prompt_completo });
    assert.ok(bytes.length > 1000);
  }
});
