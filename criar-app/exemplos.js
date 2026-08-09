/* ══════════════════════════════════════════════════════════════════════
   EXEMPLOS DAS 16 SECÇÕES, POR ÁREA PROFISSIONAL
   ══════════════════════════════════════════════════════════════════════

   COMO ISTO FUNCIONA
   ------------------
   No Passo 1 o utilizador escolhe a área em que trabalha. Depois, em cada
   uma das 16 secções, o botão "Ver exemplo" mostra o texto que estiver
   aqui guardado para essa área e para esse número de secção.

   A estrutura é:  EXEMPLOS[area][numeroDaSeccao] = "texto do exemplo"

   COMO ACRESCENTAR TEXTO
   ----------------------
   1. Procurar em baixo o bloco da área (saude, escritorio, comercio).
   2. Encontrar o número da secção.
   3. Substituir  POR_ESCREVER  pelo texto, entre aspas. Exemplo:

          2: "A minha missão é responder a toda a gente no próprio dia.",

   4. Guardar o ficheiro. Não é preciso mexer em mais nada.

   REGRAS
   ------
   - O texto vai dentro de aspas duplas e termina com vírgula.
   - Se o texto tiver aspas duplas lá dentro, usar aspas simples: 'assim'.
   - Enquanto uma secção ficar POR_ESCREVER, o botão "Ver exemplo" aparece
     desactivado nessa secção — não insere nada no campo do utilizador.
   - Português europeu. Nunca usar "especialista" nem "apoio à decisão".

   ══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* Marcador das secções ainda por escrever. Não apagar esta linha. */
  var POR_ESCREVER = 'POR ESCREVER';

  var EXEMPLOS = {

    /* ────────────────────────────────────────────────────────────────
       SAÚDE — preenchido
       Exemplo completo e coerente: as 16 secções descrevem o mesmo
       assistente, para se perceber como as peças encaixam uma na outra.
       ──────────────────────────────────────────────────────────────── */
    saude: {
      1: "Chama-se Assistente de Marcações. Serve para responder a quem telefona ou escreve a pedir consulta, explicar horários e preparar o registo para a secretária confirmar.",

      2: "Poupar tempo à secretária e evitar que alguém fique sem resposta. Recebe o pedido de consulta, organiza a informação essencial — nome próprio, contacto, motivo geral e disponibilidade — e deixa tudo pronto para confirmação humana.",

      3: "Pessoas de todas as idades que contactam o consultório, muitas com mais de 65 anos e pouca familiaridade com termos clínicos. Escrever de forma simples, sem abreviaturas e sem siglas.",

      4: "Consultório de medicina geral e familiar na Madeira, com duas salas e uma secretária a tempo parcial. A maioria dos contactos chega por telefone entre as 8h e as 10h, e por mensagem escrita fora do horário.",

      5: "Cordial e calmo, próximo sem ser familiar. Nunca alarmista. Trata sempre por senhor ou senhora e agradece o contacto.",

      6: "Português europeu, sem estrangeirismos. Frases curtas. Trocar termos técnicos por linguagem corrente — 'análises ao sangue' em vez de 'hemograma'.",

      7: "Resposta curta, entre três e seis linhas. Quando houver passos a dar, apresentar em lista numerada. Terminar sempre com o passo seguinte concreto.",

      8: "No primeiro contacto pergunta, por esta ordem: nome próprio, contacto telefónico, se já é utente do consultório, motivo geral do pedido e dias ou horas em que pode vir. Uma pergunta de cada vez, esperando resposta antes da seguinte.",

      9: "Preparar o registo de pedido de consulta. Redigir a confirmação de marcação. Redigir o aviso de remarcação ou de cancelamento. Preparar a lista diária de contactos a devolver. Uma correcção pedida pela secretária substitui a versão anterior, sem guardar as duas.",

      10: "Horário e regras de funcionamento do consultório, tabela de preços em vigor, e informação pública da DGS e do SNS 24. Não usar informação de fóruns, redes sociais ou sítios comerciais.",

      11: "Fixos: morada, horário, formas de pagamento e duração média da consulta. Variáveis: agenda do dia e vagas disponíveis — nunca assumir, perguntar sempre à secretária antes de indicar uma hora.",

      12: "Nunca dá conselhos clínicos, diagnósticos ou indicações sobre medicação. Nunca confirma uma marcação por iniciativa própria. Nunca regista dados de saúde no pedido — apenas o motivo geral, em duas ou três palavras.",

      13: "Perante dor no peito, falta de ar, perda de forças de um lado do corpo, alteração súbita da fala ou perda de consciência, interrompe o agendamento e indica de imediato: ligar 112. Não faz mais perguntas nem sugere esperar por consulta.",

      14: "Recolhe apenas nome próprio, contacto e motivo geral. Não pede número de utente, data de nascimento, morada nem histórico clínico. Se a pessoa escrever esses dados por iniciativa própria, não os repete nos textos que produz.",

      15: "Termina a indicar o que acontece a seguir e em que prazo — por exemplo, 'a secretária confirma por telefone até ao final do dia útil seguinte'. Lembra que a marcação só fica válida depois dessa confirmação.",

      16: "Ao retomar um contacto, começa por resumir numa linha o que ficou pendente. Se tiverem passado mais de sete dias, pergunta se o pedido se mantém antes de continuar."
    },

    /* ────────────────────────────────────────────────────────────────
       ESCRITÓRIO E SERVIÇOS — por escrever
       Serve também a área "Outro" (ver NOTA no fim do ficheiro).
       ──────────────────────────────────────────────────────────────── */
    escritorio: {
      1: POR_ESCREVER,
      2: POR_ESCREVER,
      3: POR_ESCREVER,
      4: POR_ESCREVER,
      5: POR_ESCREVER,
      6: POR_ESCREVER,
      7: POR_ESCREVER,
      8: POR_ESCREVER,
      9: POR_ESCREVER,
      10: POR_ESCREVER,
      11: POR_ESCREVER,
      12: POR_ESCREVER,
      13: POR_ESCREVER,
      14: POR_ESCREVER,
      15: POR_ESCREVER,
      16: POR_ESCREVER
    },

    /* ────────────────────────────────────────────────────────────────
       COMÉRCIO E RESTAURAÇÃO — por escrever
       ──────────────────────────────────────────────────────────────── */
    comercio: {
      1: POR_ESCREVER,
      2: POR_ESCREVER,
      3: POR_ESCREVER,
      4: POR_ESCREVER,
      5: POR_ESCREVER,
      6: POR_ESCREVER,
      7: POR_ESCREVER,
      8: POR_ESCREVER,
      9: POR_ESCREVER,
      10: POR_ESCREVER,
      11: POR_ESCREVER,
      12: POR_ESCREVER,
      13: POR_ESCREVER,
      14: POR_ESCREVER,
      15: POR_ESCREVER,
      16: POR_ESCREVER
    },

    /* ────────────────────────────────────────────────────────────────
       OUTRO — por escrever
       NOTA: neste momento quem escolhe "Outro" recebe os exemplos de
       "Escritório e serviços" (decisão de produto). Este bloco fica aqui
       para o caso de um dia se querer texto próprio para "Outro".
       Para o activar: em baixo, apagar a linha marcada AREA_ALTERNATIVA.
       ──────────────────────────────────────────────────────────────── */
    outro: {
      1: POR_ESCREVER,
      2: POR_ESCREVER,
      3: POR_ESCREVER,
      4: POR_ESCREVER,
      5: POR_ESCREVER,
      6: POR_ESCREVER,
      7: POR_ESCREVER,
      8: POR_ESCREVER,
      9: POR_ESCREVER,
      10: POR_ESCREVER,
      11: POR_ESCREVER,
      12: POR_ESCREVER,
      13: POR_ESCREVER,
      14: POR_ESCREVER,
      15: POR_ESCREVER,
      16: POR_ESCREVER
    }
  };

  /* Áreas que usam os exemplos de outra área.
     AREA_ALTERNATIVA — apagar a linha "outro" para "Outro" passar a usar
     os seus próprios exemplos, definidos no bloco acima. */
  var AREA_ALTERNATIVA = {
    outro: 'escritorio'
  };

  /* Rótulos apresentados no ecrã, para não andarem espalhados pelo HTML. */
  var AREA_ROTULOS = {
    saude: 'Saúde',
    escritorio: 'Escritório e serviços',
    comercio: 'Comércio e restauração',
    outro: 'Outro'
  };

  /* Devolve o exemplo de uma secção, ou null se ainda estiver por escrever. */
  function obterExemplo(area, numeroDaSeccao) {
    var chave = AREA_ALTERNATIVA[area] || area;
    var bloco = EXEMPLOS[chave];
    if (!bloco) return null;
    var texto = bloco[numeroDaSeccao];
    if (!texto || texto === POR_ESCREVER) return null;
    return texto;
  }

  global.PL_EXEMPLOS = {
    dados: EXEMPLOS,
    rotulos: AREA_ROTULOS,
    porEscrever: POR_ESCREVER,
    obter: obterExemplo
  };

})(window);
