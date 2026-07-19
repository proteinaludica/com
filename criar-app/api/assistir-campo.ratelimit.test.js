// Testes do rate-limit de /api/assistir-campo ([DEC-05] + [DEC-22]).
// Correr com:  node assistir-campo.ratelimit.test.js
// Sem dependencias externas e sem rede: o fetch global e substituido por um
// stub que emula a tabela Supabase `assistir_campo_limites` em memoria.

'use strict';

const mod = require('./assistir-campo');

let passou = 0;
let falhou = 0;
const falhas = [];

// Regista o teste; a execucao e sequencial (global.fetch e partilhado, nao
// pode haver dois testes a correr em simultaneo).
const registados = [];
function teste(nome, fn) {
  registados.push({ nome, fn });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assercao falhou');
}

// ---------------------------------------------------------------------------
// Stub de Supabase: emula a tabela (chave,campo,janela)->contagem em memoria,
// reproduzindo o contrato REST que lerContagem/incrementarContagem esperam.
// ---------------------------------------------------------------------------

function montarStore() {
  const store = new Map(); // key "chave|campo|janela" -> contagem (numero)
  const cfg = { url: 'https://stub.supabase.co', key: 'service-role-stub' };

  global.fetch = async (url, options) => {
    const metodo = (options && options.method) || 'GET';

    if (metodo === 'POST') {
      const corpo = JSON.parse(options.body);
      const k = corpo.chave + '|' + corpo.campo + '|' + corpo.janela;
      store.set(k, Number(corpo.contagem) || 0);
      return { ok: true, status: 200, text: async () => '', json: async () => [] };
    }

    // GET (lerContagem): extrair chave/campo/janela dos filtros eq.<valor>.
    const sp = new URL(url).searchParams;
    const chave = (sp.get('chave') || '').replace(/^eq\./, '');
    const campo = (sp.get('campo') || '').replace(/^eq\./, '');
    const janela = (sp.get('janela') || '').replace(/^eq\./, '');
    const k = chave + '|' + campo + '|' + janela;
    const linhas = store.has(k) ? [{ contagem: store.get(k) }] : [];
    return { ok: true, status: 200, json: async () => linhas };
  };

  // Emula uma tentativa de geracao gratuita: replica a ordem do handler —
  // verificar limites ANTES, e so incrementar os contadores apos sucesso.
  async function gerar(campoId, sessao, ip) {
    const r = await mod.verificarLimites(cfg, {
      ehPago: false, subPago: null, sessao, ip, campoId,
    });
    if (!r.permitido) return { status: 429, motivo: r.motivo };
    for (const inc of r.incrementos) {
      await mod.incrementarContagem(cfg, inc.chave, inc.campo, mod.janelaHoje());
    }
    return { status: 200 };
  }

  const contagem = (chave, campo) =>
    store.get(chave + '|' + campo + '|' + mod.janelaHoje()) || 0;

  return { cfg, store, gerar, contagem };
}

// ===========================================================================
// [DEC-22] f-nome tem contador de sessao proprio (3/dia); os outros 18 campos
// partilham o contador de sessao geral (__all__, 1/dia).
// ===========================================================================

const SESS = 'sess-abc';
const IP = '10.0.0.1';

teste('DEC-22 · 3 geracoes seguidas em f-nome na mesma sessao -> todas 200', async () => {
    const { gerar } = montarStore();
    for (let i = 1; i <= 3; i++) {
      const r = await gerar('f-nome', SESS, IP);
      assert(r.status === 200, `geracao ${i} devia ser 200, foi ${r.status} (${r.motivo})`);
    }
});

  teste('DEC-22 · 4a geracao em f-nome na mesma sessao -> 429 (limite do proprio campo)', async () => {
    const { gerar } = montarStore();
    for (let i = 1; i <= 3; i++) await gerar('f-nome', SESS, IP);
    const r = await gerar('f-nome', SESS, IP);
    assert(r.status === 429, `4a devia ser 429, foi ${r.status}`);
    // A sessao e verificada antes do IP: identifica o limite do proprio campo.
    assert(r.motivo === 'Limite gratuito de 3 gerações neste campo por sessão atingido.',
      'motivo devia identificar o limite do proprio campo: ' + r.motivo);
});

  teste('DEC-05 · 1 geracao noutro campo qualquer, na mesma sessao -> 200', async () => {
    const { gerar } = montarStore();
    const r = await gerar('f-tom', SESS, IP);
    assert(r.status === 200, `devia ser 200, foi ${r.status} (${r.motivo})`);
});

  teste('DEC-05 · 2a geracao noutro campo (nao f-nome) -> 429, identificando a sessao', async () => {
    const { gerar } = montarStore();
    await gerar('f-tom', SESS, IP);
    const r = await gerar('f-missao', SESS, IP); // qualquer campo != f-nome partilha __all__
    assert(r.status === 429, `2a devia ser 429, foi ${r.status}`);
    assert(r.motivo === 'Limite gratuito de 1 geração por sessão atingido.',
      'texto do 429 de sessao nao deve mudar: ' + r.motivo);
});

  teste('DEC-22 · gastar cota geral (__all__) NAO afecta a cota de f-nome', async () => {
    const { gerar } = montarStore();
    await gerar('f-tom', SESS, IP);       // esgota o __all__ da sessao (1/dia)
    const r2 = await gerar('f-tom', SESS, IP);
    assert(r2.status === 429, 'segundo campo geral devia estar esgotado');
    const rNome = await gerar('f-nome', SESS, IP); // f-nome mantem cota propria
    assert(rNome.status === 200, `f-nome devia ter cota propria, foi ${rNome.status} (${rNome.motivo})`);
});

  teste('DEC-22 · gastar cota de f-nome NAO afecta a cota geral (__all__)', async () => {
    const { gerar, contagem } = montarStore();
    const r1 = await gerar('f-nome', SESS, IP);
    assert(r1.status === 200);
    // A geracao de f-nome incrementa o contador proprio, nao o __all__ da sessao.
    assert(contagem('sess:' + SESS, 'f-nome') === 1, 'contador de f-nome devia ser 1');
    assert(contagem('sess:' + SESS, '__all__') === 0, '__all__ da sessao nao devia ter sido tocado');
    // Logo, um campo geral ainda tem a sua cota de 1/dia intacta.
    const rOutro = await gerar('f-tom', SESS, IP);
    assert(rOutro.status === 200, `campo geral devia estar intacto, foi ${rOutro.status} (${rOutro.motivo})`);
});

  teste('IP · o limite de IP (__all__, 3/dia) mantem-se por cima de ambos', async () => {
    const { gerar } = montarStore();
    // 3 geracoes no total (misturando f-nome e outros) esgotam o IP.
    assert((await gerar('f-nome', SESS, IP)).status === 200);
    assert((await gerar('f-nome', SESS, IP)).status === 200);
    assert((await gerar('f-nome', SESS, IP)).status === 200);
    // 4a num campo com cota de sessao ainda livre (outra sessao) -> barrada pelo IP.
    const r = await gerar('f-nome', 'sess-outra', IP);
    assert(r.status === 429, `IP devia barrar, foi ${r.status}`);
    assert(r.motivo === 'Limite gratuito de 3 gerações por dia atingido.',
      'texto do 429 de IP nao deve mudar: ' + r.motivo);
});

  teste('DEC-22 · contadores de sessoes diferentes sao independentes em f-nome', async () => {
    const { gerar, contagem } = montarStore();
    await gerar('f-nome', 'sess-1', '10.0.0.1');
    await gerar('f-nome', 'sess-2', '10.0.0.2');
    assert(contagem('sess:sess-1', 'f-nome') === 1, 'sess-1 devia ter 1');
    assert(contagem('sess:sess-2', 'f-nome') === 1, 'sess-2 devia ter 1');
});


// ---------------------------------------------------------------------------

(async () => {
  for (const t of registados) {
    try { await t.fn(); passou++; }
    catch (e) { falhou++; falhas.push(`${t.nome}\n    ${e && e.message}`); }
  }
  console.log(`\n${passou} passou · ${falhou} falhou`);
  if (falhou) {
    console.log('\nFALHAS:\n' + falhas.map((f) => '  ✗ ' + f).join('\n'));
    process.exit(1);
  }
  console.log('OK');
})();
