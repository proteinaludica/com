// Testes da venda do RetiroAssist — sem rede, sem Supabase, sem Stripe.
// Correr: node --test api/retiroassist.test.js
//
// Cobrem o que se pode verificar sem infra: o token de descarga (o que dá
// acesso ao ficheiro pago), a assinatura do webhook, a limpeza de texto que
// alimenta o PDF, e a trava que impede cobrar sem kit aprovado.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-com-32-caracteres!!';

const ra = require('../lib/retiroassist');
const kit = require('../lib/retiroassist-kit');

// ─────────────────────────── token de descarga ───────────────────────────

test('o token emitido é aceite e devolve o jti', () => {
  const { token, jti } = ra.emitirToken('abc123');
  const payload = ra.verificarToken(token);
  assert.ok(payload, 'devia ser válido');
  assert.strictEqual(payload.jti, 'abc123');
  assert.strictEqual(jti, 'abc123');
});

test('um token com a assinatura trocada é recusado', () => {
  const { token } = ra.emitirToken('abc123');
  const [h, b] = token.split('.');
  const falso = h + '.' + b + '.' + crypto.randomBytes(32).toString('base64url');
  assert.strictEqual(ra.verificarToken(falso), null);
});

test('um token com o corpo alterado é recusado', () => {
  const { token } = ra.emitirToken('abc123');
  const [h, , s] = token.split('.');
  const outroCorpo = Buffer.from(
    JSON.stringify({ sub: 'retiroassist', jti: 'outro', exp: 4102444800 })
  ).toString('base64url');
  assert.strictEqual(ra.verificarToken(h + '.' + outroCorpo + '.' + s), null);
});

test('um token expirado é recusado', () => {
  const secret = process.env.JWT_SECRET;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ sub: 'retiroassist', jti: 'x', iat: 1, exp: 2 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url');
  assert.strictEqual(ra.verificarToken(header + '.' + body + '.' + sig), null);
});

test('um token sem jti é recusado', () => {
  const secret = process.env.JWT_SECRET;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ sub: 'retiroassist', exp: Math.floor(Date.now() / 1000) + 999 })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url');
  assert.strictEqual(ra.verificarToken(header + '.' + body + '.' + sig), null);
});

test('lixo não passa por token', () => {
  for (const v of [null, undefined, '', 'a.b', 'a.b.c.d', 42, {}]) {
    assert.strictEqual(ra.verificarToken(v), null);
  }
});

// ─────────────────────── assinatura do webhook Stripe ───────────────────────
// assinaturaValida não é exportada (o export é o handler). Reconstrói-se aqui
// o mesmo algoritmo, como em criar-app/api/webhook-stripe.test.js.

const TOLERANCIA_S = 300;

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
  if (!Number.isFinite(idade) || Math.abs(idade) > TOLERANCIA_S) return false;
  const esperada = crypto.createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex');
  const b = Buffer.from(esperada);
  return v1.some((assin) => {
    const a = Buffer.from(assin);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

const SEGREDO = 'whsec_teste';
const CORPO = JSON.stringify({ type: 'checkout.session.completed' });

test('a assinatura de referência é aceite', () => {
  const t = 1000000;
  const sig = crypto.createHmac('sha256', SEGREDO).update(t + '.' + CORPO).digest('hex');
  assert.ok(assinaturaValida(CORPO, `t=${t},v1=${sig}`, SEGREDO, t));
});

test('assinatura de outro segredo é recusada', () => {
  const t = 1000000;
  const sig = crypto.createHmac('sha256', 'outro').update(t + '.' + CORPO).digest('hex');
  assert.ok(!assinaturaValida(CORPO, `t=${t},v1=${sig}`, SEGREDO, t));
});

test('assinatura fora da tolerância de tempo é recusada', () => {
  const t = 1000000;
  const sig = crypto.createHmac('sha256', SEGREDO).update(t + '.' + CORPO).digest('hex');
  assert.ok(!assinaturaValida(CORPO, `t=${t},v1=${sig}`, SEGREDO, t + TOLERANCIA_S + 1));
});

test('corpo alterado depois de assinado é recusado', () => {
  const t = 1000000;
  const sig = crypto.createHmac('sha256', SEGREDO).update(t + '.' + CORPO).digest('hex');
  assert.ok(!assinaturaValida(CORPO + ' ', `t=${t},v1=${sig}`, SEGREDO, t));
});

test('header sem v1 é recusado', () => {
  assert.ok(!assinaturaValida(CORPO, 't=1000000', SEGREDO, 1000000));
});

// ───────────────────────────── texto do PDF ─────────────────────────────

test('limpar mantém o português e o euro', () => {
  const s = ra.limpar('Escapadinha à noite: 438 € · ação, coração, Olhão');
  assert.ok(s.includes('à'));
  assert.ok(s.includes('€'));
  assert.ok(s.includes('ção'));
  assert.ok(s.includes('·'));
});

test('limpar preserva a pontuação tipográfica', () => {
  // A WinAnsi escreve tudo isto. O texto do kit é aprovado — não se degrada.
  const s = '“a” — ‘b’ … 500€ · «c» – d';
  assert.strictEqual(ra.limpar(s), s);
});

test('limpar preserva as quebras de linha', () => {
  // Sem isto, as dez secções do prompt colapsavam num parágrafo só.
  assert.strictEqual(ra.limpar('a\nb\n\nc'), 'a\nb\n\nc');
});

test('limpar remove o que a fonte WinAnsi não escreve', () => {
  assert.strictEqual(ra.limpar('ok 😀 fim'), 'ok  fim');
});

test('o prompt aprovado atravessa a limpeza sem perder um único carácter', () => {
  assert.strictEqual(ra.limpar(kit.PROMPT), kit.PROMPT);
});

test('quebrar respeita as linhas que já existem no texto', () => {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  return PDFDocument.create().then(async (doc) => {
    const fonte = await doc.embedFont(StandardFonts.Courier);
    const linhas = ra.quebrar('um\ndois\ntrês', fonte, 9, 400);
    assert.deepStrictEqual(linhas, ['um', 'dois', 'três']);
  });
});

test('quebrar parte o texto sem exceder a largura', async () => {
  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const linhas = ra.quebrar('palavra '.repeat(80), fonte, 11, 400);
  assert.ok(linhas.length > 1, 'devia partir em várias linhas');
  for (const l of linhas) {
    assert.ok(fonte.widthOfTextAtSize(l, 11) <= 400, 'linha larga demais: ' + l);
  }
});

test('o PDF do kit é gerado e é mesmo um PDF', async () => {
  const pdf = await ra.construirPDF();
  assert.ok(Buffer.isBuffer(pdf));
  assert.strictEqual(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(pdf.length > 1000, 'PDF suspeitosamente pequeno');
});

// ──────────────────────── trava: não cobrar sem kit ────────────────────────

function respostaFalsa() {
  const r = {
    codigo: null,
    corpo: null,
    cabecalhos: {},
    status(c) { r.codigo = c; return r; },
    json(d) { r.corpo = d; return r; },
    setHeader(k, v) { r.cabecalhos[k] = v; },
    end() { return r; },
  };
  return r;
}

test('com o kit por aprovar, a compra devolve 503 e não contacta a Stripe', async () => {
  const anterior = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_nao_deve_ser_usada';

  const fetchOriginal = globalThis.fetch;
  const aprovadoOriginal = kit.estaAprovado;
  let contactou = false;
  globalThis.fetch = async () => { contactou = true; throw new Error('não devia ter chamado a Stripe'); };
  kit.estaAprovado = () => false;

  try {
    const comprar = require('./retiroassist-comprar');
    const res = respostaFalsa();
    await comprar({ method: 'POST', headers: {} }, res);
    assert.strictEqual(res.codigo, 503);
    assert.strictEqual(res.corpo.ok, false);
    assert.strictEqual(contactou, false, 'a Stripe não devia ter sido contactada');
  } finally {
    globalThis.fetch = fetchOriginal;
    kit.estaAprovado = aprovadoOriginal;
    if (anterior === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = anterior;
  }
});

// Guardas contra entregar um kit vazio ou de exemplo a quem pagou.
test('o kit está aprovado e tem prompt a sério', () => {
  assert.strictEqual(kit.estaAprovado(), true);
  assert.ok(kit.PROMPT.length > 1000, 'o prompt parece curto demais');
  assert.ok(!/Por preencher/i.test(kit.PROMPT), 'ficou texto de exemplo no prompt');
  assert.ok(!/Por preencher/i.test(kit.MISSAO), 'ficou texto de exemplo na missão');
  assert.match(kit.PROMPT, /RETIROASSIST/);
  assert.match(kit.PROMPT, /Lista pronta a rever\. A decisão é de quem viaja\./);
});

test('o PDF leva uma página por guia, mais a capa', async () => {
  const { PDFDocument } = require('pdf-lib');
  const guias = require('../lib/guias-instalacao');
  const pdf = await ra.construirPDF();
  // Contado pelo pdf-lib: os object streams vão comprimidos, por isso
  // procurar "/Type /Page" no texto cru não encontra nada.
  const doc = await PDFDocument.load(pdf);
  const minimo = guias.GUIAS.length + 2; // guias + fallback + capa
  assert.ok(
    doc.getPageCount() >= minimo,
    'esperava pelo menos ' + minimo + ' páginas; tem ' + doc.getPageCount()
  );
});

test('a compra recusa métodos que não sejam POST', async () => {
  const comprar = require('./retiroassist-comprar');
  const res = respostaFalsa();
  await comprar({ method: 'GET', headers: {} }, res);
  assert.strictEqual(res.codigo, 405);
  assert.strictEqual(res.cabecalhos.Allow, 'POST');
});

test('o preço é 19€ e vive no servidor', () => {
  assert.strictEqual(ra.PRECO_CENTS, 1900);
  assert.strictEqual(ra.MOEDA, 'eur');
});
