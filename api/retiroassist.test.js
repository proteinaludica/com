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

const ra = require('./_lib/retiroassist');
const kit = require('./_lib/retiroassist-kit');

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
  const guias = require('./_lib/guias-instalacao');
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

// ─────────────────── endpoint de verificação do PDF ───────────────────

test('a verificação gera o PDF e devolve a prova, sem o ficheiro', async () => {
  const verificar = require('./retiroassist-verificar');
  const res = respostaFalsa();
  await verificar({ method: 'GET', headers: { 'x-real-ip': '198.51.100.1' } }, res);

  assert.strictEqual(res.codigo, 200);
  assert.strictEqual(res.corpo.ok, true);
  assert.ok(res.corpo.paginas >= 5, 'esperava várias páginas; tem ' + res.corpo.paginas);
  assert.ok(res.corpo.bytes > 1000);
  assert.match(res.corpo.sha256, /^[0-9a-f]{64}$/);
  assert.strictEqual(res.corpo.kit_aprovado, true);
  assert.strictEqual(res.cabecalhos['Cache-Control'], 'no-store');
  assert.strictEqual(res.cabecalhos['X-Robots-Tag'], 'noindex');

  // O que mais importa: o PDF não vai na resposta.
  const serializado = JSON.stringify(res.corpo);
  assert.ok(!serializado.includes('%PDF'), 'o PDF não devia ir na resposta');
  assert.ok(!/RetiroAssist —|INSTRUÇÕES DE SISTEMA/.test(serializado), 'não devia vazar o kit');
  assert.ok(serializado.length < 500, 'resposta grande demais para ser só metadados');
});

test('o sha256 da verificação bate com o PDF gerado', async () => {
  const verificar = require('./retiroassist-verificar');
  const res = respostaFalsa();
  await verificar({ method: 'GET', headers: { 'x-real-ip': '198.51.100.2' } }, res);
  const esperado = crypto.createHash('sha256').update(await ra.construirPDF()).digest('hex');
  assert.strictEqual(res.corpo.sha256, esperado);
});

test('a verificação recusa métodos que não sejam GET', async () => {
  const verificar = require('./retiroassist-verificar');
  const res = respostaFalsa();
  await verificar({ method: 'POST', headers: {} }, res);
  assert.strictEqual(res.codigo, 405);
  assert.strictEqual(res.cabecalhos.Allow, 'GET');
});

test('a verificação trava quem martela o endpoint', async () => {
  const verificar = require('./retiroassist-verificar');
  const req = { method: 'GET', headers: { 'x-real-ip': '198.51.100.99' } };
  let ultimo = null;
  for (let i = 0; i < 6; i++) {
    ultimo = respostaFalsa();
    await verificar(req, ultimo);
  }
  assert.strictEqual(ultimo.codigo, 429, 'o 6.º pedido no mesmo minuto devia ser travado');
});

// ─────────────────── perfil do comprador e prompt personalizado ───────────────────

const RESPOSTAS_OK = {
  nome: 'Ana',
  partida: 'Funchal',
  companhia: 'Casal',
  orcamento: '600 € no total',
  tipos: 'Natureza, Gastronomia',
  transporte: 'Avião até 3 horas',
  evitar: '',
  necessidades: '',
};

test('a licença é sempre a mesma para a mesma compra e muda de compra para compra', () => {
  const a = ra.licencaDe('jti-a');
  assert.match(a, /^RA-[0-9A-F]{6}$/);
  assert.strictEqual(ra.licencaDe('jti-a'), a);
  assert.notStrictEqual(ra.licencaDe('jti-b'), a);
});

test('o perfil válido passa e sai limpo, numa linha e sem chavetas', () => {
  const r = ra.validarPerfil(Object.assign({}, RESPOSTAS_OK, {
    nome: '  Ana\n  {{CODIGO}} ',
    evitar: 'escalas    longas',
  }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.perfil.nome, 'Ana CODIGO');
  assert.strictEqual(r.perfil.evitar, 'escalas longas');
  assert.strictEqual(r.perfil.necessidades, '');
});

test('falta de uma resposta obrigatória é recusada e indica o campo', () => {
  const r = ra.validarPerfil(Object.assign({}, RESPOSTAS_OK, { partida: '   ' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.campo, 'partida');
});

test('uma resposta longa demais é recusada', () => {
  const r = ra.validarPerfil(Object.assign({}, RESPOSTAS_OK, { nome: 'x'.repeat(41) }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.campo, 'nome');
});

test('o prompt composto não deixa marcadores por preencher e prende-se ao comprador', () => {
  const prompt = kit.comporPrompt(RESPOSTAS_OK, 'RA-ABC123');
  assert.ok(!/\{\{[A-Z]+\}\}/.test(prompt), 'ficaram marcadores por preencher');
  assert.match(prompt, /configurado para uma só pessoa: Ana\./);
  assert.match(prompt, /Partida habitual: Funchal/);
  assert.match(prompt, /A evitar: Nada indicado\./);
  assert.match(prompt, /Lista pronta a rever\. A decisão é de quem viaja\. · Licença RA-ABC123/);
  assert.strictEqual(ra.limpar(prompt), prompt);
});

test('o modelo do prompt usa todos os marcadores do questionário', () => {
  for (const p of kit.PERGUNTAS) {
    assert.ok(kit.PROMPT.includes('{{' + p.marcador + '}}'), 'falta {{' + p.marcador + '}}');
  }
  assert.ok(kit.PROMPT.includes('{{CODIGO}}'));
});

test('o PDF personalizado é gerado com o perfil do comprador', async () => {
  const pdf = await ra.construirPDF({ perfil: RESPOSTAS_OK, licenca: 'RA-ABC123' });
  assert.strictEqual(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  const exemplo = await ra.construirPDF();
  assert.notStrictEqual(
    crypto.createHash('sha256').update(pdf).digest('hex'),
    crypto.createHash('sha256').update(exemplo).digest('hex'),
    'o PDF personalizado devia diferir do de exemplo'
  );
});

// Simula o Supabase: devolve a compra dada nas leituras e regista os PATCH.
function supabaseFalso(compra) {
  const chamadas = [];
  const fetchFalso = async (url, opcoes) => {
    const metodo = (opcoes && opcoes.method) || 'GET';
    chamadas.push({ url: String(url), metodo, corpo: opcoes && opcoes.body });
    if (metodo === 'PATCH') return { ok: true, status: 204, text: async () => '' };
    return { ok: true, status: 200, json: async () => (compra ? [compra] : []), text: async () => '' };
  };
  return { chamadas, fetchFalso };
}

async function comSupabase(compra, fn) {
  const fetchOriginal = globalThis.fetch;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://supabase.teste';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-de-teste';
  const falso = supabaseFalso(compra);
  globalThis.fetch = falso.fetchFalso;
  try {
    await fn(falso.chamadas);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = url;
    if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }
}

function compraViva(extra) {
  return Object.assign(
    { token_jti: 'jti-perfil', email: 'a@b.pt', expira_em: new Date(Date.now() + 86400000).toISOString() },
    extra || {}
  );
}

test('o perfil recusa um token inválido', async () => {
  const perfil = require('./retiroassist-perfil');
  const res = respostaFalsa();
  await perfil({ method: 'GET', url: '/api/retiroassist-perfil?t=lixo', headers: {} }, res);
  assert.strictEqual(res.codigo, 403);
});

test('respostas inválidas são recusadas antes de chegar ao Supabase', async () => {
  const perfil = require('./retiroassist-perfil');
  const { token } = ra.emitirToken('jti-perfil');
  await comSupabase(compraViva(), async (chamadas) => {
    const res = respostaFalsa();
    await perfil({ method: 'POST', headers: {}, body: { t: token, respostas: { nome: 'Ana' } } }, res);
    assert.strictEqual(res.codigo, 400);
    assert.strictEqual(res.corpo.campo, 'partida');
    assert.strictEqual(chamadas.length, 0, 'não devia ter contactado o Supabase');
  });
});

test('um perfil válido é gravado e devolve a ligação de descarga com a licença', async () => {
  const perfil = require('./retiroassist-perfil');
  const { token } = ra.emitirToken('jti-perfil');
  await comSupabase(compraViva({ perfil_gravacoes: 1 }), async (chamadas) => {
    const res = respostaFalsa();
    await perfil({ method: 'POST', headers: {}, body: { t: token, respostas: RESPOSTAS_OK } }, res);
    assert.strictEqual(res.codigo, 200);
    assert.strictEqual(res.corpo.licenca, ra.licencaDe('jti-perfil'));
    assert.match(res.corpo.url, /^\/api\/retiroassist-descarregar\?t=/);
    const patch = chamadas.find((c) => c.metodo === 'PATCH');
    assert.ok(patch, 'devia ter gravado o perfil');
    const corpo = JSON.parse(patch.corpo);
    assert.strictEqual(corpo.perfil.nome, 'Ana');
    assert.strictEqual(corpo.perfil_gravacoes, 2);
  });
});

test('o perfil deixa de ser gravado depois do limite de gravações', async () => {
  const perfil = require('./retiroassist-perfil');
  const { token } = ra.emitirToken('jti-perfil');
  await comSupabase(compraViva({ perfil_gravacoes: ra.MAX_GRAVACOES_PERFIL }), async (chamadas) => {
    const res = respostaFalsa();
    await perfil({ method: 'POST', headers: {}, body: { t: token, respostas: RESPOSTAS_OK } }, res);
    assert.strictEqual(res.codigo, 409);
    assert.ok(!chamadas.some((c) => c.metodo === 'PATCH'), 'não devia ter gravado');
  });
});

test('sem perfil gravado, a descarga leva ao questionário', async () => {
  const descarregar = require('./retiroassist-descarregar');
  const { token } = ra.emitirToken('jti-perfil');
  await comSupabase(compraViva({ perfil: null }), async () => {
    const res = respostaFalsa();
    await descarregar({ method: 'GET', url: '/api/retiroassist-descarregar?t=' + token, headers: {} }, res);
    assert.strictEqual(res.codigo, 302);
    assert.strictEqual(res.cabecalhos.Location, '/retiroassist-perfil?t=' + encodeURIComponent(token));
  });
});

test('com perfil gravado, a descarga entrega o PDF com o nome da licença', async () => {
  const descarregar = require('./retiroassist-descarregar');
  const { token } = ra.emitirToken('jti-perfil');
  await comSupabase(compraViva({ perfil: RESPOSTAS_OK }), async () => {
    const res = respostaFalsa();
    await descarregar({ method: 'GET', url: '/api/retiroassist-descarregar?t=' + token, headers: {} }, res);
    assert.strictEqual(res.codigo, 200);
    assert.strictEqual(res.cabecalhos['Content-Type'], 'application/pdf');
    assert.ok(res.cabecalhos['Content-Disposition'].includes(ra.licencaDe('jti-perfil')));
  });
});
