// Conteúdo e regras do Natal IA — o que quem paga 19€ recebe.
//
// NÃO é um endpoint. É `require`-d por _lib/natal.js e pelos endpoints
// api/natal-*.js. Os três textos do assistente estão em _lib/natal-textos.js;
// aqui ficam o interruptor, os limites, a validação das respostas, a junção dos
// campos e o texto do email.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ INTERRUPTOR DE SEGURANÇA                                                 │
// │                                                                          │
// │ APROVADO = false trava o checkout inteiro: /api/natal-comprar responde   │
// │ 503 e a Stripe nem chega a ser contactada. Só passa a true com o parecer │
// │ escrito do advogado (renúncia à livre resolução, Termos e regras para    │
// │ casas com crianças) e com VERSAO_TERMOS preenchida. O teste "a venda     │
// │ aberta exige a versão dos Termos" falha se isto for esquecido.           │
// └──────────────────────────────────────────────────────────────────────────┘
'use strict';

const textos = require('./natal-textos');

const APROVADO = false;

// Versão do conteúdo, guardada em cada compra. Subir sempre que um dos três
// textos mudar, para se saber quem recebeu o quê.
const VERSAO = '1';

// Data dos Termos aceites no momento da compra (como VERSAO_TERMOS em
// criar-app/api/encomenda.js). Fica POR-DEFINIR até haver a versão dos Termos
// com o parágrafo do Natal IA, aprovada pelo advogado.
const VERSAO_TERMOS = 'POR-DEFINIR';

const PRODUTO = 'natal2026';
const NOME = 'Natal IA';

// Limites de caracteres de cada ferramenta (contados em caracteres, não em
// bytes). O objecto é mutável de propósito: os testes baixam o limite para
// provar o aviso.
const LIMITES = { completa: 8000, gem: 4000 };

// Limites das respostas. São o que garante que o Gem fica abaixo de 4000 no
// pior caso (12 pessoas com nomes de 12 letras): ver o teste do pior caso.
const MAX_PESSOAS = 12;
const MAX_NOME = 12;
const IDADE_MAX = 110;
const ORCAMENTO_MAX = 99999;

// Os 11 concelhos: 10 na ilha da Madeira e o Porto Santo. Lista fechada, sem
// texto livre.
const CONCELHOS = [
  'Calheta', 'Câmara de Lobos', 'Funchal', 'Machico', 'Ponta do Sol',
  'Porto Moniz', 'Porto Santo', 'Ribeira Brava', 'Santa Cruz', 'Santana',
  'São Vicente',
];

const SEM_RESPOSTA = 'Nada indicado.';

// Perfil fictício, para testes. Nunca vai para quem compra.
const DADOS_EXEMPLO = {
  nome: 'Marta',
  pessoas: [
    { nome: 'Rui', idade: 45 },
    { nome: 'Inês', idade: 10 },
    { nome: 'Ana', idade: 40 },
  ],
  local: 'Funchal',
  orcamento: 600,
};

// ───────────────────────────── Validação ─────────────────────────────

function comprimento(s) {
  return Array.from(s).length;
}

// Limpa um nome: sem chavetas (que marcam os campos do texto), sem
// caracteres de controlo, sem espaços repetidos.
function limparNome(bruto) {
  return String(typeof bruto === 'string' ? bruto : '')
    .replace(/[{}]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Só letras (com acentos), espaço, hífen e apóstrofo. Um nome de 12 letras
// assim limitado não deixa passar instruções para o assistente.
const NOME_VALIDO = /^\p{L}[\p{L} '’-]*$/u;

function inteiro(valor, min, max) {
  let n = valor;
  if (typeof n === 'string' && /^\d{1,6}$/.test(n.trim())) n = Number(n.trim());
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

// Valida e limpa as respostas. Devolve { ok: true, dados } ou
// { ok: false, erro, campo }.
function validarDados(bruto) {
  if (!bruto || typeof bruto !== 'object') {
    return { ok: false, erro: 'Respostas em falta.' };
  }

  const nome = limparNome(bruto.nome);
  if (!nome) return { ok: false, erro: 'Escreva o seu primeiro nome.', campo: 'nome' };
  if (comprimento(nome) > MAX_NOME) {
    return { ok: false, erro: 'O nome passa o limite de ' + MAX_NOME + ' letras.', campo: 'nome' };
  }
  if (!NOME_VALIDO.test(nome)) {
    return { ok: false, erro: 'Escreva só letras no nome.', campo: 'nome' };
  }

  const listaBruta = bruto.pessoas == null ? [] : bruto.pessoas;
  if (!Array.isArray(listaBruta)) {
    return { ok: false, erro: 'Lista de pessoas inválida.', campo: 'pessoas' };
  }
  if (listaBruta.length > MAX_PESSOAS) {
    return { ok: false, erro: 'Pode acrescentar até ' + MAX_PESSOAS + ' pessoas.', campo: 'pessoas' };
  }
  const pessoas = [];
  for (const p of listaBruta) {
    if (!p || typeof p !== 'object') {
      return { ok: false, erro: 'Pessoa inválida.', campo: 'pessoas' };
    }
    const n = limparNome(p.nome);
    if (!n) return { ok: false, erro: 'Falta o primeiro nome de uma pessoa.', campo: 'pessoas' };
    if (comprimento(n) > MAX_NOME) {
      return { ok: false, erro: 'Um nome passa o limite de ' + MAX_NOME + ' letras.', campo: 'pessoas' };
    }
    if (!NOME_VALIDO.test(n)) {
      return { ok: false, erro: 'Escreva só letras nos nomes.', campo: 'pessoas' };
    }
    const idade = inteiro(p.idade, 0, IDADE_MAX);
    if (idade === null) {
      return { ok: false, erro: 'Escreva uma idade entre 0 e ' + IDADE_MAX + '.', campo: 'pessoas' };
    }
    pessoas.push({ nome: n, idade });
  }

  const local = typeof bruto.local === 'string' ? bruto.local.trim() : '';
  if (!CONCELHOS.includes(local)) {
    return { ok: false, erro: 'Escolha um concelho da lista.', campo: 'local' };
  }

  const orcamento = inteiro(bruto.orcamento, 1, ORCAMENTO_MAX);
  if (orcamento === null) {
    return { ok: false, erro: 'Escreva um valor entre 1 e ' + ORCAMENTO_MAX + ' euros.', campo: 'orcamento' };
  }

  return { ok: true, dados: { nome, pessoas, local, orcamento } };
}

// ──────────────────────────── Junção dos textos ────────────────────────────

function valoresDe(dados, licenca) {
  const pessoas = (dados.pessoas || []).map((p) => p.nome + ', ' + p.idade).join('; ');
  return {
    NOME: dados.nome,
    CODIGO: licenca,
    PESSOAS: pessoas || SEM_RESPOSTA,
    LOCAL: dados.local,
    ORCAMENTO: dados.orcamento + ' euros',
  };
}

function preencher(modelo, valores) {
  return modelo.replace(/\{\{([A-Z]+)\}\}/g, (todo, chave) =>
    Object.prototype.hasOwnProperty.call(valores, chave) ? valores[chave] : todo
  );
}

// Preenche os três textos e verifica o resultado. Devolve:
//   { ok: true, textos: { completa|gem|conhecimento: { texto, caracteres, limite } } }
//   { ok: false, codigo: 'limite', ficheiro, excesso }   — passa o limite
//   { ok: false, codigo: 'marcador', ficheiro }          — sobrou um "{{"
function comporTextos(dados, licenca) {
  const valores = valoresDe(dados, licenca);
  const modelos = [
    ['completa', textos.TEXTO_COMPLETA, LIMITES.completa],
    ['gem', textos.TEXTO_GEM, LIMITES.gem],
    ['conhecimento', textos.TEXTO_CONHECIMENTO, null],
  ];
  const saida = {};
  for (const [ficheiro, modelo, limite] of modelos) {
    const texto = preencher(modelo, valores);
    if (texto.includes('{{') || texto.includes('}}')) {
      return { ok: false, codigo: 'marcador', ficheiro };
    }
    const caracteres = comprimento(texto);
    if (limite !== null && caracteres > limite) {
      return { ok: false, codigo: 'limite', ficheiro, excesso: caracteres - limite };
    }
    saida[ficheiro] = { texto, caracteres, limite };
  }
  return { ok: true, textos: saida };
}

// ─────────────────────────────── Email ───────────────────────────────

const EMAIL_ASSUNTO = 'O seu Natal IA: faltam quatro perguntas';

// Parágrafos antes e depois da ligação. `data` é o fim do prazo, por extenso.
// `confirmacao` confirma o contrato e a renúncia à livre resolução em suporte
// duradouro (DL 24/2014, art. 17.º, al. m)). Os campos chegam já formatados.
// Sem hora de renúncia, as frases da renúncia não aparecem: o email não afirma
// uma declaração que não ficou registada.
function emailPartes({ licenca, data, valor, oferta, dataCompra, versaoTermos, renunciaData, renunciaHora }) {
  const confirmacao = [
    'Este email confirma a sua compra.',
    'Comprou o Natal IA, um assistente digital IA com licença pessoal.',
    oferta
      ? 'Recebeu o Natal IA sem custo, numa oferta de lançamento, a ' + dataCompra + '.'
      : 'Pagou ' + valor + ' a ' + dataCompra + '.',
    'Aceitou os Termos de venda na versão de ' + versaoTermos + '.',
  ];
  if (renunciaData && renunciaHora) {
    confirmacao.push(
      'Antes de pagar, pediu para receber o assistente de imediato.',
      'Declarou também que sabia que, por isso, perdia o direito de livre resolução de 14 dias.',
      'Esta declaração ficou registada a ' + renunciaData + ', às ' + renunciaHora + '.'
    );
  }
  confirmacao.push('Guarde este email como comprovativo.');
  return {
    antes: [
      'Obrigado pela compra.',
      'Código de licença: ' + licenca,
      'Abra a ligação abaixo para responder a quatro perguntas curtas e receber o assistente pronto a usar. A ligação serve também para mudar os dados até ' + data + '.',
    ],
    confirmacao,
    depois: [
      'Esta ligação é pessoal. Não a partilhe.',
      'Proteína Lúdica, Lda. · NIF 514411520 · Madeira',
    ],
  };
}

// HTML do email, com o design de Natal (tema claro «Dia de Reis» do sistema
// de design). Estilos em linha e tabelas, porque os clientes de email ignoram
// folhas de estilo. Os textos vêm de emailPartes; aqui só se desenha.
const EMAIL_CORES = {
  fundo: '#F3EDE0', cartao: '#FBF7EF', texto: '#1F2719', texto2: '#4A5440',
  texto3: '#5E6654', linha: '#DED6C4', bago: '#A3291F', sobreBago: '#FFF7EC',
};
const EMAIL_LOGO = 'https://proteinaludica.com/logo-marca.png';

function escaparEmail(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function emailHtml(partes, url) {
  const c = EMAIL_CORES;
  const fonte = 'Arial,Helvetica,sans-serif';
  const p = (t, estilo) => '<p style="margin:0 0 14px;' + (estilo || '') + '">' + escaparEmail(t) + '</p>';
  const antes = partes.antes.map((t) => p(t)).join('');
  const confirmacao = '<p style="margin:0;color:' + c.texto2 + ';font-size:14px;line-height:1.6">' +
    partes.confirmacao.map(escaparEmail).join('<br>') + '</p>';
  const depois = partes.depois.map((t) => p(t, 'color:' + c.texto3 + ';font-size:13px;margin:0 0 6px')).join('');
  const botao =
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>' +
    '<td style="background:' + c.bago + ';border-radius:999px">' +
    '<a href="' + escaparEmail(url) + '" style="display:inline-block;padding:13px 24px;font-family:' + fonte +
    ';font-size:16px;font-weight:bold;color:' + c.sobreBago + ';text-decoration:none;border-radius:999px">' +
    'Responder às quatro perguntas</a></td></tr></table>';
  return (
    '<!DOCTYPE html><html lang="pt-PT"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escaparEmail(EMAIL_ASSUNTO) + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + c.fundo + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + c.fundo + '"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:' + c.cartao +
    ';border:1px solid ' + c.linha + ';border-radius:12px;font-family:' + fonte + ';font-size:16px;line-height:1.6;color:' + c.texto + '">' +
    '<tr><td style="padding:16px 24px;border-bottom:3px solid ' + c.bago + '">' +
    '<img src="' + EMAIL_LOGO + '" width="32" height="32" alt="" style="vertical-align:middle;border-radius:7px;margin-right:10px">' +
    '<span style="vertical-align:middle;font-weight:bold">Proteína Lúdica</span></td></tr>' +
    '<tr><td style="padding:22px 24px 6px">' + antes + botao + '</td></tr>' +
    '<tr><td style="padding:14px 24px 18px;border-top:1px solid ' + c.linha + '">' + confirmacao + '</td></tr>' +
    '<tr><td style="padding:14px 24px;border-top:1px solid ' + c.linha + '">' + depois + '</td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}

function estaAprovado() {
  return APROVADO === true;
}

module.exports = {
  APROVADO,
  VERSAO,
  VERSAO_TERMOS,
  PRODUTO,
  NOME,
  LIMITES,
  MAX_PESSOAS,
  MAX_NOME,
  IDADE_MAX,
  ORCAMENTO_MAX,
  CONCELHOS,
  SEM_RESPOSTA,
  DADOS_EXEMPLO,
  validarDados,
  comporTextos,
  EMAIL_ASSUNTO,
  emailPartes,
  emailHtml,
  estaAprovado,
};
