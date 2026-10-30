// Testes de /api/encomenda.
// Correr com:  node encomenda.test.js
// Sem rede: global.fetch é substituído por um stub que regista o que
// seria enviado ao Supabase.

'use strict';

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-stub';

const handler = require('./encomenda');

let passou = 0, falhou = 0;
const falhas = [];
const registados = [];
const teste = (nome, fn) => registados.push({ nome, fn });
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assercao falhou'); }

function montarStub(opcoes) {
  const o = opcoes || {};
  const enviado = { supabase: null, chamadas: 0 };
  global.fetch = async (url, options) => {
    const u = String(url);
    if (u.includes('/rest/v1/encomendas')) {
      enviado.chamadas++;
      enviado.supabase = JSON.parse(options.body);
      if (o.falhar) return { ok: false, status: 500, text: async () => 'erro', json: async () => ({}) };
      return { ok: true, status: 201, text: async () => '', json: async () => [{ id: 'uuid-1' }] };
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

async function pedir(body, method) {
  const res = mockRes();
  await handler({ method: method || 'POST', headers: {}, body }, res);
  return res;
}

const base = {
  profissao: 'contabilista', tarefa: 'prazos-fiscais', ferramenta: 'claude',
  nome: 'Dr. Silva', email: 'dr.silva@exemplo.pt',
  aceitaTermos: true, renunciaLivreResolucao: true,
};
const com = (extra) => Object.assign({}, base, extra);

// ─────────────── Caminho feliz ───────────────

teste('encomenda válida -> 200, id devolvido, estado por omissão', async () => {
  const enviado = montarStub();
  const res = await pedir(com({}));
  assert(res.statusCode === 200, 'devia ser 200, foi ' + res.statusCode);
  assert(res.corpo.id === 'uuid-1', 'id devia vir do Supabase');
  assert(!('estado' in enviado.supabase), 'o estado fica com o valor por omissão da tabela');
});

teste('o valor é decidido pelo servidor, mesmo que o cliente envie outro', async () => {
  const enviado = montarStub();
  await pedir(com({ valor_cents: 1, valorCents: 1 }));
  assert(enviado.supabase.valor_cents === 4900, 'valor devia ser 4900');
});

teste('termos e renúncia ficam com hora e versão', async () => {
  const enviado = montarStub();
  await pedir(com({}));
  assert(!isNaN(Date.parse(enviado.supabase.termos_aceites_em)), 'falta hora dos termos');
  assert(!isNaN(Date.parse(enviado.supabase.renuncia_livre_resolucao_em)), 'falta hora da renúncia');
  assert(enviado.supabase.versao_termos === '2026-10', 'versão dos termos errada');
});

teste('NIF vazio vai a null; NIF com espaços é aceite', async () => {
  let enviado = montarStub();
  await pedir(com({ nif: '  ' }));
  assert(enviado.supabase.nif === null, 'NIF vazio devia ser null');
  enviado = montarStub();
  const res = await pedir(com({ nif: '123 456 789' }));
  assert(res.statusCode === 200 && enviado.supabase.nif === '123456789', 'NIF com espaços devia passar');
});

// ─────────────── Recusas ───────────────

for (const [nome, extra] of [
  ['profissão desconhecida', { profissao: 'medico' }],
  ['tarefa de outra profissão', { tarefa: 'contestacao' }],
  ['ferramenta desconhecida', { ferramenta: 'outra-coisa' }],
  ['nome vazio', { nome: '  ' }],
  ['email inválido', { email: 'sem-arroba' }],
  ['NIF com 8 algarismos', { nif: '12345678' }],
  ['termos não aceites', { aceitaTermos: false }],
  ['renúncia não confirmada', { renunciaLivreResolucao: 'true' }],
]) {
  teste(nome + ' -> 400 sem gravar', async () => {
    const enviado = montarStub();
    const res = await pedir(com(extra));
    assert(res.statusCode === 400, 'devia ser 400, foi ' + res.statusCode);
    assert(enviado.chamadas === 0, 'não devia gravar');
  });
}

teste('GET -> 405', async () => {
  montarStub();
  const res = await pedir(null, 'GET');
  assert(res.statusCode === 405, 'devia ser 405');
});

teste('campo-armadilha preenchido -> 200 sem gravar', async () => {
  const enviado = montarStub();
  const res = await pedir(com({ website: 'http://spam' }));
  assert(res.statusCode === 200 && enviado.chamadas === 0, 'não devia gravar');
});

teste('falha do Supabase -> 502, sem fingir sucesso', async () => {
  montarStub({ falhar: true });
  const res = await pedir(com({}));
  assert(res.statusCode === 502 && res.corpo.ok === false, 'devia ser 502');
});

// ─────────────── Registo impessoal ───────────────

teste('nenhuma mensagem de erro trata o utilizador por tu ou por você', async () => {
  const proibidas = /\b(tenta|preenche|indica|escreve|verifica|clica|podes|tens|você)\b/i;
  const casos = [com({ profissao: 'x' }), com({ email: 'mau' }), com({ nif: '1' }),
                 com({ aceitaTermos: false }), com({ renunciaLivreResolucao: false })];
  for (const c of casos) {
    montarStub();
    const res = await pedir(c);
    assert(!proibidas.test(res.corpo.error || ''), 'tratamento proibido: ' + res.corpo.error);
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
