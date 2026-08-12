// Guias de instalação — como instalar um assistente digital IA numa plataforma.
//
// NÃO é um endpoint. É `require`-d por lib/retiroassist.js para construir o
// PDF do kit.
//
// ⚠️ ORIGEM DO TEXTO — não reescrever à toa.
// Isto é uma cópia FIEL, palavra por palavra, das constantes GUIAS e
// GUIA_FALLBACK de criar-app/api/gerar-pdf-instalacao.js, que já está em
// produção a entregar o "Kit completo" (19€) do wizard. Nada aqui é texto
// novo: é o mesmo guia, para o mesmo preço, do mesmo produto.
//
// Está duplicado, e isso é uma dívida assumida: o wizard e o site principal
// são projectos Vercel diferentes, e apontar o wizard para este ficheiro
// significava mexer num caminho de entrega que já está a funcionar — outra
// frente, outra PR. Quando se fizer, apaga-se a cópia de lá e passa a haver
// uma fonte só. Até lá: se o guia mudar num lado, tem de mudar no outro.
//
// Os campos `copiar` são preenchidos por quem constrói o PDF:
//   nome_assistente · missao · prompt_completo

'use strict';

const GUIAS = [
  {
    titulo: 'Guia de instalação — Claude Projects',
    passos: [
      {
        heading: 'Passo 1 — Aceder',
        texto: 'Em claude.ai, na barra lateral esquerda, clicar em "Projects". Depois em "Create Project".',
      },
      {
        heading: 'Passo 2 — Campo "Nome do Projeto"',
        texto: 'Copiar e colar:',
        copiar: 'nome_assistente',
      },
      {
        heading: 'Passo 3 — Campo "Descrição" (opcional, logo abaixo do nome)',
        texto: 'Copiar e colar:',
        copiar: 'missao',
      },
      {
        heading: 'Passo 4 — Campo "Instruções" (botão "+" junto a "Instruções")',
        texto: 'Copiar e colar o texto completo abaixo:',
        copiar: 'prompt_completo',
      },
      {
        heading: 'Nota — personalização de conta (opcional)',
        texto: 'Se quiser que parte destas instruções (por exemplo, o tom de voz) se aplique também fora deste Projeto, pode colar essa parte em Definições > Perfil > Instruções de conta. Não é obrigatório.',
      },
    ],
  },
  {
    titulo: 'Guia de instalação — Gemini',
    passos: [
      {
        heading: 'Passo 1 — Aceder',
        texto: 'Em gemini.google.com, na barra lateral esquerda, "Veja alguns Gems" > "Novo Gem".',
      },
      {
        heading: 'Passo 2 — Campo "Nome"',
        texto: 'Copiar e colar:',
        copiar: 'nome_assistente',
      },
      {
        heading: 'Passo 3 — Campo "Descrição"',
        texto: 'Copiar e colar:',
        copiar: 'missao',
      },
      {
        heading: 'Passo 4 — Campo "Instruções"',
        texto: 'Copiar e colar o texto completo abaixo, depois clicar em "Salvar":',
        copiar: 'prompt_completo',
      },
      {
        heading: 'Nota — "Experiência pessoal" (opcional)',
        texto: 'Se quiser que o Gemini mantenha o mesmo tom fora deste Gem, pode colar parte das instruções em Definições e ajuda > Experiência pessoal > "As suas instruções para o Gemini" — não se aplica dentro de Gems, só fora deles. Exige conta Google pessoal.',
      },
    ],
  },
  {
    titulo: 'Guia de instalação — ChatGPT',
    passos: [
      {
        heading: 'Passo 1 — Aceder',
        texto: 'Em chatgpt.com, "Explorar GPTs" > "Criar" > aba "Configure".',
      },
      {
        heading: 'Passo 2 — Campo "Name"',
        texto: 'Copiar e colar:',
        copiar: 'nome_assistente',
      },
      {
        heading: 'Passo 3 — Campo "Description"',
        texto: 'Copiar e colar:',
        copiar: 'missao',
      },
      {
        heading: 'Passo 4 — Campo "Instructions"',
        texto: 'Copiar e colar o texto completo abaixo:',
        copiar: 'prompt_completo',
      },
      {
        heading: 'Nota — "Custom Instructions" da conta (opcional)',
        texto: 'Se quiser manter o mesmo tom fora deste GPT, pode colar parte das instruções em Definições > Personalização > "Custom Instructions" — disponível mesmo na versão gratuita. Criar um GPT dedicado exige conta paga (Plus ou superior).',
      },
    ],
  },
];

// Para qualquer outra plataforma (Copilot, Perplexity, Mistral, Outro).
const GUIA_FALLBACK = {
  titulo: 'Guia de instalação',
  passos: [
    {
      heading: null,
      texto: 'Copie o texto abaixo e cole na área de instruções/prompt do sistema da sua plataforma:',
      copiar: 'prompt_completo',
    },
  ],
};

module.exports = { GUIAS, GUIA_FALLBACK };
