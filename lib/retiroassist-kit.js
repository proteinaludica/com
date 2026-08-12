// Conteúdo do RetiroAssist — o que quem paga 19€ recebe.
//
// NÃO é um endpoint. É `require`-d por retiroassist-webhook.js (que envia o
// kit por email) e por retiroassist-descarregar.js (que o regera para
// descarga), tal como criar-app/lib/pro-comum.js é partilhado pelos endpoints
// de pagamento do wizard.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ INTERRUPTOR DE SEGURANÇA                                                 │
// │                                                                          │
// │ APROVADO = false trava o checkout inteiro: /api/retiroassist-comprar     │
// │ responde 503 e a Stripe nunca chega a ser contactada. Enquanto o texto   │
// │ do kit não estiver validado (AMÁLIA), é impossível cobrar 19€ sem ter    │
// │ o que entregar.                                                          │
// │                                                                          │
// │ Para abrir a venda: substituir o conteúdo provisório abaixo pelo texto   │
// │ aprovado e só então passar APROVADO a true.                             │
// └──────────────────────────────────────────────────────────────────────────┘
'use strict';

const APROVADO = false;

// Versão do kit. Fica guardada em cada compra, para se saber que versão foi
// entregue quando o conteúdo for revisto mais tarde.
const VERSAO = '1';

const NOME = 'RetiroAssist';

// ─────────────────────────── CONTEÚDO PROVISÓRIO ───────────────────────────
// Texto por validar. Nada disto chega a um cliente enquanto APROVADO = false.
// Cada secção vira uma página/bloco do PDF, pela ordem em que está aqui.
const SECCOES = [
  {
    titulo: 'O que é',
    paragrafos: [
      'Por preencher — texto por validar.',
    ],
  },
  {
    titulo: 'Como instalar',
    paragrafos: [
      'Por preencher — texto por validar.',
    ],
  },
  {
    titulo: 'O prompt',
    // O prompt do assistente. Vai para o PDF em bloco monoespaçado.
    prompt: 'Por preencher — prompt por validar.',
  },
  {
    titulo: 'Como usar',
    paragrafos: [
      'Por preencher — texto por validar.',
    ],
  },
];

// Assunto e corpo do email de entrega. Também por validar.
const EMAIL_ASSUNTO = 'RetiroAssist — o seu assistente digital IA';
const EMAIL_INTRO = [
  'Obrigado pela compra do RetiroAssist.',
  'O kit segue em anexo, em PDF. A ligação abaixo permite voltar a descarregá-lo.',
];

// Aviso que acompanha a entrega. Frase já aprovada, igual à da página.
const AVISO = 'Não substituem aconselhamento profissional de nenhuma área.';

function estaAprovado() {
  return APROVADO === true;
}

module.exports = {
  APROVADO,
  VERSAO,
  NOME,
  SECCOES,
  EMAIL_ASSUNTO,
  EMAIL_INTRO,
  AVISO,
  estaAprovado,
};
