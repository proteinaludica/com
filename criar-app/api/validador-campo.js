// Validador de output do endpoint /api/assistir-campo.
// Verifica por código os critérios 1, 5, 6 e 7 de [DEC-07]. Os critérios 2, 3,
// 4 e 8 são de julgamento e ficam a cargo do prompt.
//
//   1 — PT-PT, terceira pessoa impessoal (zero segunda pessoa)
//   5 — sem markdown, aspas envolventes, preambulo ou comentario
//   6 — dentro do limite de palavras
//   7 — zero linguagem clinica, salvo se a profissao o for
//
// Sem dependencias externas. Testavel por Node sem chamar a API.
//
// Uso:
//   const { validar, extrairContradicao } = require('./validador-campo');
//   const r = validar(texto, { maxPalavras: 45, profissao: 'contabilista' });
//   r.valido -> boolean ; r.erros -> [{ criterio, codigo, detalhe }]

'use strict';

// ---------------------------------------------------------------------------
// Criterio 1 — segunda pessoa e tratamento directo
// ---------------------------------------------------------------------------

// Pronomes e determinantes de segunda pessoa. Palavra inteira, sem acentos
// obrigatorios porque o texto vem acentuado do modelo.
const PRONOMES_2P = [
  'tu', 'ti', 'contigo', 'teu', 'teus', 'tua', 'tuas',
  'voce', 'você', 'voces', 'vocês',
  'vos', 'vós', 'convosco', 'vosso', 'vossos', 'vossa', 'vossas'
];

// Formas verbais de segunda pessoa do singular (-s final caracteristico) e
// imperativos de tratamento directo mais frequentes neste dominio.
const VERBOS_2P = [
  'podes', 'deves', 'tens', 'fazes', 'escreves', 'usas', 'queres', 'sabes',
  'consegues', 'precisas', 'indicas', 'defines', 'preenches', 'escolhes',
  'clica', 'clique', 'carregue', 'preencha', 'escreva', 'indique', 'defina',
  'escolha', 'utilize', 'consulte', 'verifique', 'confirme', 'reveja',
  'introduza', 'selecione', 'seleccione'
];

// Tratamento cerimonioso directo. Basta a raiz: "senhor" nunca e legitimo
// neste contexto, e assim apanha tambem as formas contraidas ("ao senhor",
// "do senhor", "pelo senhor") que um "o senhor" literal deixaria passar.
const TRATAMENTO_DIRECTO = [
  'senhor', 'senhora', 'senhores', 'senhoras',
  'vossa excelencia', 'vossa excelência', 'v. exa', 'v. ex.a'
];

// "pode" e "consegue" sao 3a pessoa legitima quando tem sujeito explicito
// ("o profissional pode"). So sao erro quando abrem frase ou surgem sem sujeito.
// Regex: inicio de texto ou depois de pontuacao final, seguido de "pode/consegue".
const RE_PODE_SEM_SUJEITO = /(^|[.;:!?]\s+)(pode|podera|poderá|consegue|deve|devera|deverá)\b/i;

function verificarSegundaPessoa(texto) {
  const erros = [];
  const t = texto.toLowerCase();

  for (const p of PRONOMES_2P) {
    if (rePalavra(p).test(t)) {
      erros.push({ criterio: 1, codigo: 'PRONOME_2P', detalhe: p });
    }
  }

  for (const v of VERBOS_2P) {
    if (rePalavra(v).test(t)) {
      erros.push({ criterio: 1, codigo: 'VERBO_2P', detalhe: v });
    }
  }

  for (const tr of TRATAMENTO_DIRECTO) {
    if (rePalavra(tr).test(t)) {
      erros.push({ criterio: 1, codigo: 'TRATAMENTO_DIRECTO', detalhe: tr });
    }
  }

  const m = RE_PODE_SEM_SUJEITO.exec(texto);
  if (m) {
    erros.push({ criterio: 1, codigo: 'VERBO_SEM_SUJEITO', detalhe: m[2] });
  }

  return erros;
}

// ---------------------------------------------------------------------------
// Criterio 5 — markdown, aspas envolventes, preambulo, comentario
// ---------------------------------------------------------------------------

// Marcas de markdown que nunca devem aparecer no output.
const RE_MARKDOWN = [
  { re: /(^|\n)\s{0,3}#{1,6}\s/, codigo: 'MD_TITULO' },
  { re: /\*\*[^*\n]+\*\*/, codigo: 'MD_NEGRITO' },
  { re: /(^|\s)\*[^*\n]+\*(\s|$|[.,;:!?])/, codigo: 'MD_ITALICO' },
  { re: /(^|\n)\s{0,3}[-*+]\s+\S/, codigo: 'MD_LISTA' },
  { re: /(^|\n)\s{0,3}\d+[.)]\s+\S/, codigo: 'MD_LISTA_NUM' },
  { re: /```/, codigo: 'MD_CODIGO' },
  { re: /(^|\n)>\s/, codigo: 'MD_CITACAO' },
  { re: /\[[^\]\n]+\]\([^)\n]+\)/, codigo: 'MD_LINK' }
];

// Preambulos e comentarios finais tipicos do modelo.
const RE_PREAMBULO = [
  /^\s*(aqui\s+(esta|está|fica|vai)|segue|eis|proposta\s*:|sugest(a|ã)o\s*:|texto\s*:|resposta\s*:)/i,
  /^\s*(claro|certamente|com\s+certeza|sem\s+problema)\b/i,
  /^\s*(como\s+solicitado|conforme\s+pedido)\b/i
];

const RE_COMENTARIO_FINAL = [
  /\n\s*\(?(nota|obs|observa(c|ç)(a|ã)o|aviso)\s*:/i,
  /(espero\s+que|caso\s+pretenda|se\s+precisar|fico\s+(ao\s+dispor|disponivel|disponível))/i,
  /\b(posso\s+ajustar|quer\s+que\s+altere|diga\s+se)\b/i
];

function verificarFormato(texto) {
  const erros = [];

  for (const { re, codigo } of RE_MARKDOWN) {
    if (re.test(texto)) {
      erros.push({ criterio: 5, codigo, detalhe: null });
    }
  }

  // Aspas a envolver o texto inteiro (rectas, curvas ou aspas latinas).
  const t = texto.trim();
  const paresAspas = [['"', '"'], ['\u201c', '\u201d'], ['\u00ab', '\u00bb'], ["'", "'"]];
  for (const [ab, fe] of paresAspas) {
    if (t.length >= 2 && t.startsWith(ab) && t.endsWith(fe)) {
      erros.push({ criterio: 5, codigo: 'ASPAS_ENVOLVENTES', detalhe: ab + fe });
      break;
    }
  }

  for (const re of RE_PREAMBULO) {
    if (re.test(t)) {
      erros.push({ criterio: 5, codigo: 'PREAMBULO', detalhe: null });
      break;
    }
  }

  for (const re of RE_COMENTARIO_FINAL) {
    if (re.test(t)) {
      erros.push({ criterio: 5, codigo: 'COMENTARIO_FINAL', detalhe: null });
      break;
    }
  }

  return erros;
}

// ---------------------------------------------------------------------------
// Criterio 6 — limite de palavras
// ---------------------------------------------------------------------------

// Conta palavras: sequencias de letras (com acentos), digitos e hifen interno.
function contarPalavras(texto) {
  const m = texto.match(/[\p{L}\p{N}]+(?:[-'\u2019][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

function verificarLimite(texto, maxPalavras) {
  if (typeof maxPalavras !== 'number' || maxPalavras <= 0) return [];
  const n = contarPalavras(texto);
  if (n === 0) {
    return [{ criterio: 6, codigo: 'VAZIO', detalhe: '0 palavras' }];
  }
  if (n > maxPalavras) {
    return [{ criterio: 6, codigo: 'EXCEDE_LIMITE', detalhe: `${n}/${maxPalavras}` }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Criterio 7 — linguagem clinica fora de profissao de saude
// ---------------------------------------------------------------------------

// Profissoes de saude reconhecidas. A comparacao e por inclusao de raiz, para
// apanhar "medico dentista", "enfermeira de familia", etc.
const RAIZES_SAUDE = [
  'medic', 'médic', 'enferm', 'farmac', 'fisioterap', 'nutricion', 'dietist',
  'psicolog', 'psiquiatr', 'terapeut', 'dentist', 'estomatolog', 'odontolog',
  'optometr', 'oftalmolog', 'podolog', 'osteopat', 'quiroprat', 'obstetr',
  'parteir', 'radiolog', 'clinic', 'clínic', 'saude', 'saúde', 'hospital',
  'veterinar', 'veterinár', 'nefrolog', 'cardiolog', 'pediatr', 'geriatr'
];

// Termos clinicos proibidos fora do dominio da saude.
const TERMOS_CLINICOS = [
  'diagnostico', 'diagnóstico', 'diagnosticar', 'diagnostica',
  'prognostico', 'prognóstico', 'sintoma', 'sintomas', 'sintomatologia',
  'patologia', 'patologico', 'patológico', 'doente', 'doentes',
  'paciente', 'pacientes', 'utente', 'utentes',
  'consulta medica', 'consulta médica', 'anamnese',
  'prescricao', 'prescrição', 'prescrever', 'prescreve',
  'medicacao', 'medicação', 'medicamento', 'medicamentos', 'farmaco', 'fármaco',
  'posologia', 'dose', 'dosagem', 'terapeutica', 'terapêutica',
  'tratamento clinico', 'tratamento clínico',
  'exame fisico', 'exame físico', 'auscultacao', 'auscultação',
  'triagem clinica', 'triagem clínica', 'urgencia medica', 'urgência médica',
  'historia clinica', 'história clínica', 'registo clinico', 'registo clínico',
  'sinais vitais', 'tensao arterial', 'tensão arterial', 'glicemia', 'glicémia',
  'comorbilidade', 'comorbilidades', 'etiologia', 'clinico', 'clínico',
  'clinica', 'clínica', 'medico', 'médico', 'enfermeiro', 'enfermeira'
];

function eProfissaoSaude(profissao) {
  if (!profissao || typeof profissao !== 'string') return false;
  const p = profissao.toLowerCase();
  return RAIZES_SAUDE.some((r) => p.includes(r));
}

function verificarClinico(texto, profissao) {
  if (eProfissaoSaude(profissao)) return [];
  const erros = [];
  const t = texto.toLowerCase();
  for (const termo of TERMOS_CLINICOS) {
    if (rePalavra(termo).test(t)) {
      erros.push({ criterio: 7, codigo: 'TERMO_CLINICO', detalhe: termo });
    }
  }
  return erros;
}

// ---------------------------------------------------------------------------
// Marcador de contradicao ([DEC-09])
// ---------------------------------------------------------------------------

// O prompt instrui o modelo a acrescentar, quando aplicavel, uma ultima linha
// "CONTRADICAO: <seccoes>". Essa linha e retirada ANTES de validar e devolvida
// em separado, para o frontend mostrar o aviso de [DEC-11] por baixo do campo.
function extrairContradicao(bruto) {
  if (typeof bruto !== 'string') return { texto: '', contradicao: null };
  const linhas = bruto.replace(/\r\n/g, '\n').split('\n');
  let contradicao = null;

  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i].trim();
    if (l === '') continue;
    const m = /^CONTRADI(?:C|Ç)(?:A|Ã)O\s*:\s*(.+)$/i.exec(l);
    if (m) {
      contradicao = m[1].trim();
      linhas.splice(i, 1);
    }
    break;
  }

  return { texto: linhas.join('\n').trim(), contradicao };
}

// ---------------------------------------------------------------------------
// API publica
// ---------------------------------------------------------------------------

function escapar(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// \b em JavaScript e ASCII-only: "voce" apanha, "você" nao, porque o "ê" conta
// como caracter de nao-palavra e a fronteira parte. Estes lookarounds usam a
// classe Unicode de letra/numero e funcionam com texto acentuado.
const ANTES = '(?<![\\p{L}\\p{N}])';
const DEPOIS = '(?![\\p{L}\\p{N}])';

// Constroi a regex de palavra inteira, com fronteiras Unicode.
function rePalavra(termo) {
  return new RegExp(ANTES + escapar(termo) + DEPOIS, 'iu');
}

/**
 * Valida o texto de um campo.
 * @param {string} texto            texto ja sem a linha CONTRADICAO
 * @param {object} opts
 * @param {number} opts.maxPalavras limite de [DEC-06]
 * @param {string} opts.profissao   profissao indicada pelo utilizador
 * @returns {{ valido: boolean, erros: Array, palavras: number }}
 */
function validar(texto, opts) {
  const o = opts || {};
  if (typeof texto !== 'string' || texto.trim() === '') {
    return {
      valido: false,
      erros: [{ criterio: 6, codigo: 'VAZIO', detalhe: 'texto ausente' }],
      palavras: 0
    };
  }

  const t = texto.trim();
  const erros = [].concat(
    verificarSegundaPessoa(t),
    verificarFormato(t),
    verificarLimite(t, o.maxPalavras),
    verificarClinico(t, o.profissao)
  );

  return { valido: erros.length === 0, erros, palavras: contarPalavras(t) };
}

/**
 * Conveniencia: recebe o bruto do modelo, separa a contradicao e valida.
 */
function processar(bruto, opts) {
  const { texto, contradicao } = extrairContradicao(bruto);
  const r = validar(texto, opts);
  return Object.assign({}, r, { texto, contradicao });
}

module.exports = {
  validar,
  processar,
  extrairContradicao,
  contarPalavras,
  eProfissaoSaude
};
