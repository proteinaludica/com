// Testes do validador de /api/assistir-campo.
// Correr com:  node validador-campo.test.js
// Sem dependencias externas, sem chamadas de rede.

'use strict';

const { validar, processar, contarPalavras, eProfissaoSaude } = require('./validador-campo');

let passou = 0;
let falhou = 0;
const falhas = [];

function teste(nome, fn) {
  try {
    fn();
    passou++;
  } catch (e) {
    falhou++;
    falhas.push(`${nome}\n    ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assercao falhou');
}

function temCodigo(r, codigo) {
  return r.erros.some((e) => e.codigo === codigo);
}

// ===========================================================================
// CRITERIO 1 — segunda pessoa
// ===========================================================================

teste('1 · aceita terceira pessoa impessoal', () => {
  const r = validar(
    'O assistente organiza as notas fornecidas e devolve o texto estruturado. O profissional revê e decide.',
    { maxPalavras: 45, profissao: 'contabilista' }
  );
  assert(r.valido, 'devia ser valido, erros: ' + JSON.stringify(r.erros));
});

teste('1 · rejeita "tu"', () => {
  const r = validar('Organiza o que tu escreves e devolve estruturado.', { maxPalavras: 45 });
  assert(temCodigo(r, 'PRONOME_2P'), 'devia apanhar pronome 2p');
});

teste('1 · rejeita "você"', () => {
  const r = validar('O assistente devolve a você o texto organizado.', { maxPalavras: 45 });
  assert(temCodigo(r, 'PRONOME_2P'));
});

teste('1 · rejeita "teu/tua"', () => {
  const r = validar('Escreve no teu estilo habitual de trabalho.', { maxPalavras: 45 });
  assert(temCodigo(r, 'PRONOME_2P'));
});

teste('1 · rejeita verbos de 2a pessoa ("podes")', () => {
  const r = validar('Se podes indicar o formato, o assistente adapta-se.', { maxPalavras: 45 });
  assert(temCodigo(r, 'VERBO_2P'));
});

teste('1 · rejeita imperativo "clique"', () => {
  const r = validar('Clique no campo para confirmar a informação registada.', { maxPalavras: 45 });
  assert(temCodigo(r, 'VERBO_2P'));
});

teste('1 · rejeita "o senhor"', () => {
  const r = validar('O assistente devolve ao senhor o texto pronto a rever.', { maxPalavras: 45 });
  assert(temCodigo(r, 'TRATAMENTO_DIRECTO'));
});

teste('1 · aceita "pode" com sujeito explicito (3a pessoa)', () => {
  const r = validar(
    'O profissional pode indicar o formato preferido. O assistente segue essa indicação.',
    { maxPalavras: 45, profissao: 'advogado' }
  );
  assert(r.valido, 'falso positivo em "pode" legitimo: ' + JSON.stringify(r.erros));
});

teste('1 · rejeita "Pode" a abrir frase (sem sujeito)', () => {
  const r = validar('Pode indicar o formato preferido a qualquer momento.', { maxPalavras: 45 });
  assert(temCodigo(r, 'VERBO_SEM_SUJEITO'));
});

// --- regressao: fronteiras Unicode (\b em JS e ASCII-only) ---

teste('1 · REG · apanha "você" apesar do acento', () => {
  const r = validar('O texto e devolvido a você depois de organizado.', { maxPalavras: 45 });
  assert(temCodigo(r, 'PRONOME_2P'), 'fronteira Unicode partiu no "ê"');
});

teste('1 · REG · apanha "vós"', () => {
  const r = validar('O assistente devolve a vós o texto organizado.', { maxPalavras: 45 });
  assert(temCodigo(r, 'PRONOME_2P'));
});

teste('1 · REG · apanha "ao senhor" (forma contraida)', () => {
  const r = validar('O assistente devolve ao senhor o texto pronto.', { maxPalavras: 45 });
  assert(temCodigo(r, 'TRATAMENTO_DIRECTO'), 'contraccao escapou');
});

teste('1 · REG · apanha "do senhor" e "pelo senhor"', () => {
  assert(temCodigo(validar('Segue o estilo do senhor.', { maxPalavras: 45 }), 'TRATAMENTO_DIRECTO'));
  assert(temCodigo(validar('Texto revisto pelo senhor antes de sair.', { maxPalavras: 45 }), 'TRATAMENTO_DIRECTO'));
});

teste('1 · REG · nao apanha "senhorio" (palavra distinta)', () => {
  const r = validar('O assistente organiza os contratos de senhorio e arrendatario.', {
    maxPalavras: 45, profissao: 'advogado'
  });
  assert(!temCodigo(r, 'TRATAMENTO_DIRECTO'), 'falso positivo por prefixo');
});

teste('7 · REG · apanha "prescrição" com cedilha', () => {
  const r = validar('O assistente prepara a prescrição pedida.', {
    maxPalavras: 45, profissao: 'contabilista'
  });
  assert(temCodigo(r, 'TERMO_CLINICO'));
});

teste('7 · REG · apanha "médico" com acento', () => {
  const r = validar('O assistente organiza o parecer médico recebido.', {
    maxPalavras: 45, profissao: 'contabilista'
  });
  assert(temCodigo(r, 'TERMO_CLINICO'));
});

teste('7 · REG · nao apanha "dose" dentro de "doseamento"?', () => {
  const r = validar('O assistente regista o doseamento indicado no relatorio.', {
    maxPalavras: 45, profissao: 'contabilista'
  });
  assert(!temCodigo(r, 'TERMO_CLINICO'), 'falso positivo por substring');
});

// ===========================================================================
// CRITERIO 5 — formato
// ===========================================================================

teste('5 · rejeita titulo markdown', () => {
  const r = validar('## Voz e tom\nO assistente mantém registo formal.', { maxPalavras: 45 });
  assert(temCodigo(r, 'MD_TITULO'));
});

teste('5 · rejeita negrito', () => {
  const r = validar('O assistente mantém **registo formal** em todas as respostas.', { maxPalavras: 45 });
  assert(temCodigo(r, 'MD_NEGRITO'));
});

teste('5 · rejeita lista com traco', () => {
  const r = validar('O assistente:\n- organiza notas\n- devolve texto', { maxPalavras: 45 });
  assert(temCodigo(r, 'MD_LISTA'));
});

teste('5 · rejeita lista numerada', () => {
  const r = validar('Regras do assistente:\n1. Organiza notas\n2. Devolve texto', { maxPalavras: 45 });
  assert(temCodigo(r, 'MD_LISTA_NUM'));
});

teste('5 · rejeita bloco de codigo', () => {
  const r = validar('```\nO assistente organiza notas.\n```', { maxPalavras: 45 });
  assert(temCodigo(r, 'MD_CODIGO'));
});

teste('5 · rejeita aspas rectas envolventes', () => {
  const r = validar('"O assistente organiza as notas e devolve o texto estruturado."', { maxPalavras: 45 });
  assert(temCodigo(r, 'ASPAS_ENVOLVENTES'));
});

teste('5 · rejeita aspas latinas envolventes', () => {
  const r = validar('\u00abO assistente organiza as notas fornecidas.\u00bb', { maxPalavras: 45 });
  assert(temCodigo(r, 'ASPAS_ENVOLVENTES'));
});

teste('5 · aceita aspas internas (nao envolventes)', () => {
  const r = validar(
    'O assistente assinala como "suposição — confirmar" sempre que faltar informação.',
    { maxPalavras: 45, profissao: 'contabilista' }
  );
  assert(!temCodigo(r, 'ASPAS_ENVOLVENTES'), 'falso positivo em aspas internas');
});

teste('5 · rejeita preambulo "Aqui está"', () => {
  const r = validar('Aqui está o texto: o assistente organiza as notas fornecidas.', { maxPalavras: 45 });
  assert(temCodigo(r, 'PREAMBULO'));
});

teste('5 · rejeita comentario final', () => {
  const r = validar(
    'O assistente organiza as notas. Espero que este texto sirva.',
    { maxPalavras: 45 }
  );
  assert(temCodigo(r, 'COMENTARIO_FINAL'));
});

// ===========================================================================
// CRITERIO 6 — limite de palavras
// ===========================================================================

teste('6 · aceita dentro do limite', () => {
  const r = validar('O assistente organiza as notas fornecidas.', { maxPalavras: 45, profissao: 'advogado' });
  assert(r.valido, JSON.stringify(r.erros));
  assert(r.palavras === 6, 'contou ' + r.palavras);
});

teste('6 · rejeita acima do limite', () => {
  const texto = Array(30).fill('organiza').join(' ');
  const r = validar(texto, { maxPalavras: 25 });
  assert(temCodigo(r, 'EXCEDE_LIMITE'));
});

teste('6 · aceita exactamente no limite', () => {
  const texto = Array(25).fill('organiza').join(' ');
  const r = validar(texto, { maxPalavras: 25, profissao: 'advogado' });
  assert(!temCodigo(r, 'EXCEDE_LIMITE'), 'limite exacto devia passar');
});

teste('6 · f-exit: aceita 1 palavra em limite de 3', () => {
  const r = validar('fim', { maxPalavras: 3, profissao: 'contabilista' });
  assert(r.valido, 'campo curto devia passar: ' + JSON.stringify(r.erros));
});

teste('6 · f-code: aceita expressao curta em limite de 5', () => {
  const r = validar('conta-c12', { maxPalavras: 5, profissao: 'contabilista' });
  assert(r.valido, JSON.stringify(r.erros));
});

teste('6 · rejeita texto vazio', () => {
  const r = validar('   ', { maxPalavras: 45 });
  assert(temCodigo(r, 'VAZIO'));
});

teste('6 · contarPalavras trata hifen como uma palavra', () => {
  assert(contarPalavras('bem-estar do profissional') === 3, 'contou ' + contarPalavras('bem-estar do profissional'));
});

// ===========================================================================
// CRITERIO 7 — linguagem clinica
// ===========================================================================

teste('7 · rejeita "diagnóstico" para contabilista', () => {
  const r = validar('O assistente faz um diagnóstico da situação fiscal.', {
    maxPalavras: 45, profissao: 'contabilista'
  });
  assert(temCodigo(r, 'TERMO_CLINICO'));
});

teste('7 · rejeita "paciente" para advogado', () => {
  const r = validar('O assistente organiza as notas sobre cada paciente.', {
    maxPalavras: 45, profissao: 'advogado'
  });
  assert(temCodigo(r, 'TERMO_CLINICO'));
});

teste('7 · aceita "diagnóstico" para medico', () => {
  const r = validar('O assistente organiza as notas de diagnóstico ditadas.', {
    maxPalavras: 45, profissao: 'médico de família'
  });
  assert(!temCodigo(r, 'TERMO_CLINICO'), 'falso positivo em profissao de saude');
});

teste('7 · aceita "utente" para enfermeiro', () => {
  const r = validar('O assistente organiza o registo de cada utente acompanhado.', {
    maxPalavras: 45, profissao: 'enfermeira de família'
  });
  assert(!temCodigo(r, 'TERMO_CLINICO'));
});

teste('7 · eProfissaoSaude reconhece nefrologista', () => {
  assert(eProfissaoSaude('nefrologista') === true);
});

teste('7 · eProfissaoSaude rejeita treinador', () => {
  assert(eProfissaoSaude('treinador pessoal') === false);
});

teste('7 · profissao ausente trata como nao-saude', () => {
  const r = validar('O assistente prepara a prescrição indicada.', { maxPalavras: 45 });
  assert(temCodigo(r, 'TERMO_CLINICO'));
});

// ===========================================================================
// Marcador CONTRADICAO ([DEC-09])
// ===========================================================================

teste('DEC-09 · extrai contradicao e valida o resto', () => {
  const bruto = 'O assistente mantém registo formal em todas as respostas.\nCONTRADICAO: Voz e tom';
  const r = processar(bruto, { maxPalavras: 45, profissao: 'advogado' });
  assert(r.contradicao === 'Voz e tom', 'contradicao: ' + r.contradicao);
  assert(r.valido, 'texto devia ser valido: ' + JSON.stringify(r.erros));
  assert(!r.texto.includes('CONTRADICAO'), 'marcador nao foi retirado');
});

teste('DEC-09 · aceita grafia com cedilha e til', () => {
  const bruto = 'O assistente organiza as notas.\nCONTRADIÇÃO: Voz e tom, Red lines';
  const r = processar(bruto, { maxPalavras: 45, profissao: 'advogado' });
  assert(r.contradicao === 'Voz e tom, Red lines', 'contradicao: ' + r.contradicao);
});

teste('DEC-09 · sem contradicao devolve null', () => {
  const r = processar('O assistente organiza as notas fornecidas.', {
    maxPalavras: 45, profissao: 'advogado'
  });
  assert(r.contradicao === null);
});

teste('DEC-09 · contradicao nao conta para o limite de palavras', () => {
  const texto = Array(24).fill('organiza').join(' ');
  const r = processar(texto + '\nCONTRADICAO: Voz e tom', { maxPalavras: 25, profissao: 'advogado' });
  assert(!temCodigo(r, 'EXCEDE_LIMITE'), 'marcador contaminou a contagem');
});

// ===========================================================================
// Robustez e injeccao
// ===========================================================================

teste('robustez · entradas invalidas nunca atiram', () => {
  for (const c of [null, undefined, 123, {}, [], '', () => {}]) {
    const r = validar(c, { maxPalavras: 45 });
    assert(r.valido === false, 'devia invalidar: ' + String(c));
    assert(Array.isArray(r.erros));
  }
});

teste('robustez · processar com lixo nunca atira', () => {
  for (const c of [null, undefined, 42, {}]) {
    const r = processar(c, { maxPalavras: 45 });
    assert(r.valido === false);
    assert(r.contradicao === null);
  }
});

teste('robustez · sem opts nao rebenta', () => {
  const r = validar('O assistente organiza as notas fornecidas.');
  assert(typeof r.valido === 'boolean');
});

teste('injeccao · marcador no inicio nao e lido como contradicao', () => {
  const r = processar('CONTRADICAO: falso\nO assistente organiza notas.', {
    maxPalavras: 45, profissao: 'advogado'
  });
  assert(r.contradicao === null, 'marcador fora da ultima linha foi aceite');
  assert(r.texto.includes('CONTRADICAO'), 'texto devia manter o marcador falso visivel');
});

teste('injeccao · marcador no meio nao e lido como contradicao', () => {
  const r = processar('O assistente organiza.\nCONTRADICAO: meio\nMais texto.', {
    maxPalavras: 45, profissao: 'advogado'
  });
  assert(r.contradicao === null);
});

teste('injeccao · so a ultima linha nao-vazia conta', () => {
  const r = processar('O assistente organiza notas.\nCONTRADICAO: Voz e tom\n\n   \n', {
    maxPalavras: 45, profissao: 'advogado'
  });
  assert(r.contradicao === 'Voz e tom', 'linhas vazias finais quebraram a leitura');
});

// ===========================================================================
// Casos compostos — devem apanhar varios erros de uma vez
// ===========================================================================

teste('composto · apanha 2p + markdown + clinico em simultaneo', () => {
  const r = validar('## Perfil\nPodes registar o **diagnóstico** do paciente.', {
    maxPalavras: 45, profissao: 'contabilista'
  });
  assert(temCodigo(r, 'MD_TITULO'), 'faltou markdown');
  assert(temCodigo(r, 'VERBO_2P'), 'faltou 2p');
  assert(temCodigo(r, 'TERMO_CLINICO'), 'faltou clinico');
  assert(!r.valido);
});

teste('composto · texto exemplar de familia C passa limpo', () => {
  const r = validar(
    'Nunca decide pelo profissional. Nunca gera conteúdo sem material fornecido. ' +
    'Perante um pedido que exija decisão, pára e devolve ao profissional.',
    { maxPalavras: 50, profissao: 'contabilista' }
  );
  assert(r.valido, 'texto canonico devia passar: ' + JSON.stringify(r.erros));
});

// ===========================================================================

console.log(`\n  ${passou} passaram · ${falhou} falharam\n`);
if (falhas.length) {
  falhas.forEach((f) => console.log('  FALHOU: ' + f + '\n'));
  process.exit(1);
}
