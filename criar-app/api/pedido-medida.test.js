// Testes de /api/pedido-medida com o campo telemóvel.
// Correr com:  node contacto.test.js
// Sem rede: global.fetch é substituído por um stub que regista o que
// seria enviado ao Supabase e ao Resend.

'use strict';

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-stub';
process.env.RESEND_API_KEY = 'chave-stub';

const handler = require('./pedido-medida');

let passou = 0, falhou = 0;
const falhas = [];
const registados = [];
const teste = (nome, fn) => registados.push({ nome, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assercao falhou'); }

function montarStub() {
  const enviado = { supabase: null, email: null };
  global.fetch = async (url, options) => {
    const u = String(url);
    const corpo = options && options.body ? JSON.parse(options.body) : null;
    if (u.includes('/rest/v1/contact_requests')) {
      enviado.supabase = corpo;
      return { ok: true, status: 201, text: async () => '', json: async () => ({}) };
    }
    if (u.includes('api.resend.com')) {
      enviado.email = corpo;
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'x' }) };
    }
    throw new Error('URL inesperado: ' + u);
  };
  return enviado;
}

function mockRes() {
  const r = { statusCode: null, corpo: null };
  r.setHeader = () => {};
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.corpo = o; return r; };
  r.end = () => r;
  return r;
}

async function pedir(body) {
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body }, res);
  return res;
}

const base = { nome: 'Dr. Silva', email: 'dr.silva@exemplo.pt', plataforma: 'claude' };

// ─────────────── Telemóvel facultativo ───────────────

teste('sem telemovel -> 200, e a coluna vai a null', async () => {
  const enviado = montarStub();
  const res = await pedir(Object.assign({}, base));
  assert(res.statusCode === 200, 'devia ser 200, foi ' + res.statusCode);
  assert(enviado.supabase.telemovel === null,
    'telemovel devia ser null, foi ' + JSON.stringify(enviado.supabase.telemovel));
});

teste('telemovel vazio -> tratado como ausente', async () => {
  const enviado = montarStub();
  const res = await pedir(Object.assign({}, base, { telemovel: '   ' }));
  assert(res.statusCode === 200, 'devia ser 200, foi ' + res.statusCode);
  assert(enviado.supabase.telemovel === null, 'espacos nao contam como numero');
});

// ─────────────── Formatos aceites ───────────────

for (const numero of [
  '+351 912 345 678',
  '+351912345678',
  '00351 912345678',
  '912345678',
  '912 345 678',
  '(351) 912-345-678',
]) {
  teste('aceita ' + numero, async () => {
    const enviado = montarStub();
    const res = await pedir(Object.assign({}, base, { telemovel: numero }));
    assert(res.statusCode === 200, numero + ' devia passar, deu ' + res.statusCode +
      ' (' + JSON.stringify(res.corpo) + ')');
    assert(enviado.supabase.telemovel === numero.trim(),
      'devia guardar tal como escrito, guardou ' + enviado.supabase.telemovel);
  });
}

// ─────────────── Formatos recusados ───────────────

for (const mau of ['abc', '12345', '+', 'telefone', '9123456789012345678']) {
  teste('recusa ' + JSON.stringify(mau), async () => {
    montarStub();
    const res = await pedir(Object.assign({}, base, { telemovel: mau }));
    assert(res.statusCode === 400, mau + ' devia dar 400, deu ' + res.statusCode);
    assert(/telem/i.test(res.corpo.error), 'o erro devia falar do telemovel: ' + res.corpo.error);
  });
}

// ─────────────── O que já existia não muda ───────────────

teste('sem nome -> 400', async () => {
  montarStub();
  const res = await pedir({ email: 'a@b.pt' });
  assert(res.statusCode === 400, 'devia ser 400');
});

teste('email invalido -> 400', async () => {
  montarStub();
  const res = await pedir(Object.assign({}, base, { email: 'nao-e-email' }));
  assert(res.statusCode === 400, 'devia ser 400');
  assert(/email/i.test(res.corpo.error), res.corpo.error);
});

// ─────────────── O email chega com o número ───────────────

teste('o email de aviso inclui o telemovel', async () => {
  const enviado = montarStub();
  await pedir(Object.assign({}, base, { telemovel: '+351 912 345 678' }));
  assert(enviado.email.text.includes('Telemóvel: +351 912 345 678'),
    'o corpo do email devia trazer o numero:\n' + enviado.email.text);
});

teste('sem telemovel, o email diz que nao foi indicado', async () => {
  const enviado = montarStub();
  await pedir(Object.assign({}, base));
  assert(enviado.email.text.includes('Telemóvel: (não indicado)'),
    'o corpo do email devia dizer que falta:\n' + enviado.email.text);
});

// ─────────────── Registo impessoal ───────────────

teste('nenhuma mensagem de erro trata o utilizador por tu', async () => {
  const proibidas = /\b(tenta|preenche|indica|escreve|verifica|clica|podes|tens)\b/i;
  const casos = [{ email: 'a@b.pt' }, Object.assign({}, base, { email: 'mau' }),
                 Object.assign({}, base, { telemovel: 'abc' })];
  for (const c of casos) {
    montarStub();
    const res = await pedir(c);
    assert(!proibidas.test(res.corpo.error || ''),
      'segunda pessoa na mensagem: ' + res.corpo.error);
  }
});

(async () => {
  for (const t of registados) {
    try { await t.fn(); passou++; }
    catch (e) { falhou++; falhas.push(t.nome + '\n    ' + (e && e.message)); }
  }
  console.log('\n' + passou + ' passou · ' + falhou + ' falhou');
  if (falhou) { console.log('\nFALHAS:\n' + falhas.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
  console.log('OK');
})();
