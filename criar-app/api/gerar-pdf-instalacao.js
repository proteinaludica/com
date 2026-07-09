// Função serverless (Vercel) — gera o guia de instalação (PDF) com o conteúdo
// real do profissional (plataforma escolhida, nome do assistente, missão e
// prompt completo) e envia-o por email via Resend, como parte da entrega dos
// patamares Kit completo (19€) e Pro (49€).
//
// Variáveis de ambiente a definir no painel da Vercel:
//   RESEND_API_KEY — chave da API Resend (secreta · obrigatória)
//   PDF_FROM       — remetente verificado no Resend, ex: "Proteína Lúdica <ola@proteinaludica.com>"
//                     (enquanto o domínio não estiver verificado, usar "onboarding@resend.dev")
//
// Sem dependências externas de rede: usa pdf-lib (geração de PDF em Node,
// sem browser headless) e o fetch nativo do Node 18+ na Vercel.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const LIMITES = {
  plataforma: 60,
  nome_assistente: 200,
  missao: 800,
  prompt_completo: 20000,
  email: 200,
};

function cortar(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

// ─────────── MAPEAMENTO PLATAFORMA (Ecrã 1) → GUIA ───────────
const GUIAS = {
  claude: {
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
  gemini: {
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
  gpt: {
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
};

// Fallback: qualquer opção do Ecrã 1 que não seja Claude Projects, Gemini ou
// ChatGPT (Copilot, Perplexity, Mistral, Proteína Lúdica "em breve", Outro).
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

function escolherGuia(plataforma) {
  const chave = cortar(plataforma, LIMITES.plataforma).toLowerCase();
  if (chave === 'claude') return GUIAS.claude;
  if (chave === 'gemini') return GUIAS.gemini;
  if (chave === 'gpt') return GUIAS.gpt;
  return GUIA_FALLBACK;
}

// ─────────── GERAÇÃO DO PDF (pdf-lib) ───────────

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function quebrarLinhas(texto, font, size, maxWidth) {
  const linhas = [];
  const paragrafos = String(texto).split(/\r?\n/);
  paragrafos.forEach((paragrafo) => {
    if (paragrafo === '') {
      linhas.push('');
      return;
    }
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    let atual = '';
    palavras.forEach((palavra) => {
      const candidato = atual ? atual + ' ' + palavra : palavra;
      if (font.widthOfTextAtSize(candidato, size) > maxWidth && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = candidato;
      }
    });
    if (atual) linhas.push(atual);
  });
  return linhas;
}

async function gerarPdf({ plataforma, nome_assistente, missao, prompt_completo }) {
  const guia = escolherGuia(plataforma);
  const valores = { nome_assistente, missao, prompt_completo };

  const pdf = await PDFDocument.create();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function novaPagina() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function garantirEspaco(altura) {
    if (y - altura < MARGIN) novaPagina();
  }

  function desenharLinhas(linhas, font, size, lineHeight, color) {
    linhas.forEach((linha) => {
      garantirEspaco(lineHeight);
      if (linha) {
        page.drawText(linha, { x: MARGIN, y, size, font, color: color || rgb(0.1, 0.1, 0.1) });
      }
      y -= lineHeight;
    });
  }

  // Cabeçalho
  desenharLinhas(quebrarLinhas(guia.titulo, fontBold, 20, CONTENT_WIDTH), fontBold, 20, 26);
  y -= 4;
  desenharLinhas(
    quebrarLinhas('Assistente: ' + (nome_assistente || ''), fontRegular, 12, CONTENT_WIDTH),
    fontRegular,
    12,
    16
  );
  desenharLinhas(
    quebrarLinhas('Gerado por Proteína Lúdica · proteinaludica.com', fontRegular, 10, CONTENT_WIDTH),
    fontRegular,
    10,
    14,
    rgb(0.4, 0.4, 0.4)
  );
  y -= 12;

  guia.passos.forEach((passo) => {
    if (passo.heading) {
      garantirEspaco(22);
      desenharLinhas(quebrarLinhas(passo.heading, fontBold, 13, CONTENT_WIDTH), fontBold, 13, 18);
      y -= 2;
    }
    if (passo.texto) {
      desenharLinhas(quebrarLinhas(passo.texto, fontRegular, 11, CONTENT_WIDTH), fontRegular, 11, 15);
    }
    if (passo.copiar) {
      y -= 4;
      const conteudo = cortar(valores[passo.copiar], LIMITES[passo.copiar] || 20000) || '(não indicado)';
      desenharLinhas(quebrarLinhas(conteudo, fontMono, 10, CONTENT_WIDTH), fontMono, 10, 14, rgb(0.05, 0.05, 0.35));
    }
    y -= 14;
  });

  return pdf.save();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const plataforma = cortar(body.plataforma, LIMITES.plataforma);
    const nome_assistente = cortar(body.nome_assistente, LIMITES.nome_assistente);
    const missao = cortar(body.missao, LIMITES.missao);
    const prompt_completo = cortar(body.prompt_completo, LIMITES.prompt_completo);
    const email = cortar(body.email, LIMITES.email);

    if (!nome_assistente || !prompt_completo) {
      return res.status(400).json({ ok: false, error: 'Indique pelo menos o nome do assistente e o prompt completo.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'O email não parece válido.' });
    }

    const pdfBytes = await gerarPdf({ plataforma, nome_assistente, missao, prompt_completo });
    const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY em falta.');
      return res.status(500).json({ ok: false, error: 'Serviço de email não configurado.' });
    }

    const from = process.env.PDF_FROM || 'Proteína Lúdica <onboarding@resend.dev>';
    const nomeFicheiro = 'guia-instalacao-' + (plataforma || 'assistente').toLowerCase() + '.pdf';

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [email],
        subject: 'O teu guia de instalação · Proteína Lúdica',
        text: 'Em anexo o guia de instalação do teu assistente digital IA (' + nome_assistente + ').',
        attachments: [
          {
            filename: nomeFicheiro,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detalhe = await resp.text();
      console.error('Erro Resend:', resp.status, detalhe);
      return res.status(502).json({ ok: false, error: 'Não foi possível enviar o guia agora.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro no handler de geração do PDF:', err);
    return res.status(500).json({ ok: false, error: 'Ocorreu um erro inesperado.' });
  }
};

module.exports.gerarPdf = gerarPdf;
