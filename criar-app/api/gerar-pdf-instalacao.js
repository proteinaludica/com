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
const crypto = require('crypto');

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

// ─── GERADOR DE JWT (30 dias) ───
function gerarJWT(payload) {
  const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 dias
  const jti = crypto.randomBytes(16).toString('hex'); // JWT ID único
  const body = Buffer.from(JSON.stringify({ ...payload, exp, jti })).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return {
    token: `${header}.${body}.${signature}`,
    jti: jti,
  };
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
//
// Paleta "Laurissilva Digital" já usada no resto do site (proteinaludica.com):
// fundo/texto principal quase-preto, verde-musgo e dourado-ocre como destaques.
// Tipografia real do site é Fraunces (display) + Geist (corpo); pdf-lib não
// embebe essas fontes sem carregar ficheiros .ttf externos (o que obrigaria a
// depender de fontkit + bundle de fontes, contra o critério de função leve
// definido para este endpoint) — por isso usam-se as 14 fontes padrão do PDF
// mais próximas: Times (serif, para títulos/notas) e Helvetica (sans, corpo).

const COR = {
  escuro: rgb(11 / 255, 14 / 255, 12 / 255), // #0B0E0C
  verde: rgb(143 / 255, 170 / 255, 107 / 255), // #8FAA6B
  verdeClaro: rgb(169 / 255, 194 / 255, 135 / 255),
  dourado: rgb(200 / 255, 168 / 255, 107 / 255), // #C8A86B
  douradoEscuro: rgb(0.5, 0.38, 0.16),
  papel: rgb(0.968, 0.965, 0.951),
  branco: rgb(1, 1, 1),
  texto: rgb(0.11, 0.13, 0.11),
  textoSuave: rgb(0.33, 0.37, 0.31),
  textoFraco: rgb(0.48, 0.52, 0.45),
  caixaCopiarFundo: rgb(0.918, 0.936, 0.888),
  caixaCopiarLinha: rgb(0.72, 0.79, 0.62),
  notaFundo: rgb(0.973, 0.951, 0.899),
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
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

// Desenha texto com tracking (espaçamento entre letras) manual — usado só no
// wordmark, para simular o efeito "small caps" tracked do resto do site.
function desenharTexto(page, texto, x, y, font, size, color, tracking) {
  if (!tracking) {
    page.drawText(texto, { x, y, size, font, color });
    return;
  }
  let cursorX = x;
  for (const ch of String(texto)) {
    page.drawText(ch, { x: cursorX, y, size, font, color });
    cursorX += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

async function gerarPdf({ plataforma, nome_assistente, missao, prompt_completo }) {
  const guia = escolherGuia(plataforma);
  const valores = { nome_assistente, missao, prompt_completo };

  const pdf = await PDFDocument.create();
  const fontDisplay = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const fontDisplayItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const fontDisplayBoldItalic = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);

  // ── Cabeçalho: dimensões calculadas uma vez (é igual em todas as páginas) ──
  const HEAD_PAD_TOP = 24;
  const HEAD_PAD_BOTTOM = 20;
  const WORDMARK_H = 12;
  const GAP_WORDMARK_TITULO = 10;
  const GAP_TITULO_ASSISTENTE = 6;
  const TITULO_SIZE = 21;
  const TITULO_LH = 25;
  const ASSISTENTE_SIZE = 12;
  const ASSISTENTE_LH = 15;

  const tituloLinhas = quebrarLinhas(guia.titulo, fontDisplay, TITULO_SIZE, CONTENT_WIDTH);
  const assistenteLinhas = quebrarLinhas(
    'Assistente: ' + (nome_assistente || '—'),
    fontDisplayItalic,
    ASSISTENTE_SIZE,
    CONTENT_WIDTH
  );

  const HEADER_HEIGHT =
    HEAD_PAD_TOP +
    WORDMARK_H +
    GAP_WORDMARK_TITULO +
    tituloLinhas.length * TITULO_LH +
    GAP_TITULO_ASSISTENTE +
    assistenteLinhas.length * ASSISTENTE_LH +
    HEAD_PAD_BOTTOM;

  // ── Rodapé: dimensões calculadas uma vez ──
  const FOOT_PAD_TOP = 14;
  const FOOT_PAD_BOTTOM = 16;
  const LINHA_MARCA_H = 12;
  const GAP_RODAPE = 4;
  const NOTA_RODAPE_SIZE = 7.5;
  const NOTA_RODAPE_LH = 10;
  const notaRodapeTexto = 'Gerado automaticamente a partir do assistente digital IA criado em criar.proteinaludica.com';
  const notaRodapeLinhas = quebrarLinhas(notaRodapeTexto, fontRegular, NOTA_RODAPE_SIZE, CONTENT_WIDTH);
  const FOOTER_HEIGHT =
    FOOT_PAD_TOP + LINHA_MARCA_H + GAP_RODAPE + notaRodapeLinhas.length * NOTA_RODAPE_LH + FOOT_PAD_BOTTOM;

  const CONTENT_TOP_GAP = 26;
  const CONTENT_TOP = PAGE_HEIGHT - HEADER_HEIGHT - CONTENT_TOP_GAP;
  const CONTENT_BOTTOM = FOOTER_HEIGHT + 14;

  function criarPagina() {
    const p = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    // Fundo da página (papel quente, nunca branco puro nem preto puro) —
    // tem de ser o primeiro traço na página, antes de qualquer conteúdo.
    p.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: COR.papel });
    return p;
  }

  let page = criarPagina();
  let y = CONTENT_TOP;

  function novaPagina() {
    page = criarPagina();
    y = CONTENT_TOP;
  }

  function garantirEspaco(altura) {
    if (y - altura < CONTENT_BOTTOM) novaPagina();
  }

  function desenharLinhas(x, largura, linhas, font, size, lineHeight, color) {
    linhas.forEach((linha) => {
      garantirEspaco(lineHeight);
      if (linha) {
        page.drawText(linha, { x, y, size, font, color: color || COR.texto, maxWidth: largura });
      }
      y -= lineHeight;
    });
  }

  // ── Bloco "isto é para copiar": fundo verde muito claro, barra de destaque
  // à esquerda, tipografia monoespaçada — paginação própria porque o
  // prompt_completo pode ser bastante longo. ──
  function desenharBlocoCopiar(x, largura, conteudo) {
    const PAD_X = 12;
    const PAD_Y = 10;
    const BARRA = 4;
    const LH = 13;
    const SIZE = 9.5;
    const larguraTexto = largura - BARRA - PAD_X * 2;
    const linhas = quebrarLinhas(conteudo, fontMono, SIZE, larguraTexto);

    let idx = 0;
    while (idx < linhas.length) {
      if (y - (PAD_Y * 2 + LH) < CONTENT_BOTTOM) {
        novaPagina();
        continue;
      }
      const disponivel = y - CONTENT_BOTTOM;
      const maxLinhas = Math.max(1, Math.floor((disponivel - PAD_Y * 2) / LH));
      const linhasPagina = linhas.slice(idx, idx + maxLinhas);
      const altura = PAD_Y * 2 + linhasPagina.length * LH;

      page.drawRectangle({
        x,
        y: y - altura,
        width: largura,
        height: altura,
        color: COR.caixaCopiarFundo,
        borderColor: COR.caixaCopiarLinha,
        borderWidth: 0.75,
      });
      page.drawRectangle({ x, y: y - altura, width: BARRA, height: altura, color: COR.verde });

      let ty = y - PAD_Y - SIZE * 0.85;
      linhasPagina.forEach((linha) => {
        if (linha) {
          page.drawText(linha, { x: x + BARRA + PAD_X, y: ty, size: SIZE, font: fontMono, color: COR.escuro });
        }
        ty -= LH;
      });

      y -= altura + 10;
      idx += linhasPagina.length;
      if (idx < linhas.length) novaPagina();
    }
  }

  // ── Bloco "Nota": fundo dourado muito claro, itálico, mais discreto ──
  function desenharNota(passo) {
    const PAD_X = 12;
    const PAD_Y = 10;
    const BARRA = 4;
    const LH = 13.5;
    const larguraTexto = CONTENT_WIDTH - BARRA - PAD_X * 2;

    const headingLinhas = passo.heading
      ? quebrarLinhas(passo.heading, fontDisplayBoldItalic, 10.5, larguraTexto)
      : [];
    const textoLinhas = passo.texto ? quebrarLinhas(passo.texto, fontDisplayItalic, 10, larguraTexto) : [];
    const gapInterno = headingLinhas.length && textoLinhas.length ? 4 : 0;
    const altura = PAD_Y * 2 + headingLinhas.length * LH + gapInterno + textoLinhas.length * LH;

    garantirEspaco(altura);
    const topo = y;
    page.drawRectangle({ x: MARGIN, y: topo - altura, width: CONTENT_WIDTH, height: altura, color: COR.notaFundo });
    page.drawRectangle({ x: MARGIN, y: topo - altura, width: BARRA, height: altura, color: COR.dourado });

    let ty = topo - PAD_Y - 9;
    headingLinhas.forEach((linha) => {
      page.drawText(linha, { x: MARGIN + BARRA + PAD_X, y: ty, size: 10.5, font: fontDisplayBoldItalic, color: COR.douradoEscuro });
      ty -= LH;
    });
    ty -= gapInterno;
    textoLinhas.forEach((linha) => {
      if (linha) {
        page.drawText(linha, { x: MARGIN + BARRA + PAD_X, y: ty, size: 10, font: fontDisplayItalic, color: COR.textoSuave });
      }
      ty -= LH;
    });

    y = topo - altura - 14;
  }

  // ── Passo numerado: círculo de destaque + título ao lado ──
  const INDENT = 34; // diâmetro do círculo (22) + espaço (12)
  function desenharPassoNumerado(numero, heading) {
    const larguraHeading = CONTENT_WIDTH - INDENT;
    const headingLinhas = quebrarLinhas(heading, fontBold, 13, larguraHeading);
    const alturaBloco = Math.max(22, headingLinhas.length * 16);

    garantirEspaco(alturaBloco);
    const raio = 11;
    const cx = MARGIN + raio;
    const cy = y - alturaBloco / 2; // círculo centrado com a altura total do heading (1 ou várias linhas)
    page.drawCircle({ x: cx, y: cy, size: raio, color: COR.verde });
    const numTexto = String(numero);
    const numLargura = fontBold.widthOfTextAtSize(numTexto, 11);
    page.drawText(numTexto, { x: cx - numLargura / 2, y: cy - 4, size: 11, font: fontBold, color: COR.branco });

    let ty = y - 13 * 0.8; // baseline da 1ª linha, alinhada ao topo do bloco
    headingLinhas.forEach((linha) => {
      page.drawText(linha, { x: MARGIN + INDENT, y: ty, size: 13, font: fontBold, color: COR.texto });
      ty -= 16;
    });

    y -= alturaBloco + 6;
  }

  // ═══════════════ CONTEÚDO ═══════════════
  guia.passos.forEach((passo) => {
    const isNota = !!(passo.heading && /^Nota/i.test(passo.heading));
    const numeroMatch = !isNota && passo.heading && passo.heading.match(/^Passo\s+(\d+)/i);

    if (isNota) {
      desenharNota(passo);
      return;
    }

    const indentX = numeroMatch ? MARGIN + INDENT : MARGIN;
    const larguraIndentada = numeroMatch ? CONTENT_WIDTH - INDENT : CONTENT_WIDTH;

    if (numeroMatch) {
      desenharPassoNumerado(numeroMatch[1], passo.heading);
    } else if (passo.heading) {
      desenharLinhas(MARGIN, CONTENT_WIDTH, quebrarLinhas(passo.heading, fontBold, 13, CONTENT_WIDTH), fontBold, 13, 18);
      y -= 2;
    }

    if (passo.texto) {
      desenharLinhas(
        indentX,
        larguraIndentada,
        quebrarLinhas(passo.texto, fontRegular, 11, larguraIndentada),
        fontRegular,
        11,
        15,
        COR.textoSuave
      );
    }

    if (passo.copiar) {
      y -= 4;
      const conteudo = cortar(valores[passo.copiar], LIMITES[passo.copiar] || 20000) || '(não indicado)';
      desenharBlocoCopiar(MARGIN, CONTENT_WIDTH, conteudo);
    }

    y -= 12;
  });

  // ═══════════════ CABEÇALHO + RODAPÉ (em todas as páginas) ═══════════════
  const paginas = pdf.getPages();
  paginas.forEach((pagina, i) => {
    // Cabeçalho — faixa escura de topo a fundo, com wordmark, título do guia
    // e nome do assistente. Desenhado por cima do conteúdo (que já respeita
    // CONTENT_TOP, portanto não há sobreposição real).
    pagina.drawRectangle({ x: 0, y: PAGE_HEIGHT - HEADER_HEIGHT, width: PAGE_WIDTH, height: HEADER_HEIGHT, color: COR.escuro });

    let hy = PAGE_HEIGHT - HEAD_PAD_TOP - 9;
    desenharTexto(pagina, 'PROTEÍNA LÚDICA', MARGIN, hy, fontBold, 9.5, COR.dourado, 1.6);
    hy -= WORDMARK_H + GAP_WORDMARK_TITULO;

    tituloLinhas.forEach((linha) => {
      pagina.drawText(linha, { x: MARGIN, y: hy, size: TITULO_SIZE, font: fontDisplay, color: COR.branco });
      hy -= TITULO_LH;
    });
    hy -= GAP_TITULO_ASSISTENTE;

    assistenteLinhas.forEach((linha) => {
      pagina.drawText(linha, { x: MARGIN, y: hy, size: ASSISTENTE_SIZE, font: fontDisplayItalic, color: COR.verdeClaro });
      hy -= ASSISTENTE_LH;
    });

    // Rodapé — linha subtil, marca + domínio à esquerda, página à direita,
    // nota de proveniência por baixo.
    pagina.drawLine({
      start: { x: MARGIN, y: FOOTER_HEIGHT },
      end: { x: PAGE_WIDTH - MARGIN, y: FOOTER_HEIGHT },
      thickness: 0.75,
      color: COR.caixaCopiarLinha,
    });

    let fy = FOOTER_HEIGHT - FOOT_PAD_TOP - 8;
    pagina.drawText('Proteína Lúdica · proteinaludica.com', { x: MARGIN, y: fy, size: 8.5, font: fontRegular, color: COR.textoFraco });
    const pagLabel = (i + 1) + '/' + paginas.length;
    const pagLabelLargura = fontRegular.widthOfTextAtSize(pagLabel, 8.5);
    pagina.drawText(pagLabel, { x: PAGE_WIDTH - MARGIN - pagLabelLargura, y: fy, size: 8.5, font: fontRegular, color: COR.textoFraco });

    fy -= LINHA_MARCA_H + GAP_RODAPE;
    notaRodapeLinhas.forEach((linha) => {
      pagina.drawText(linha, { x: MARGIN, y: fy, size: NOTA_RODAPE_SIZE, font: fontRegular, color: COR.textoFraco });
      fy -= NOTA_RODAPE_LH;
    });
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

    // ─── GERAR JWT PARA DOWNLOAD (30 dias) ───
    const jwtData = gerarJWT({
      email: email,
      plataforma: plataforma,
      nome_assistente: nome_assistente,
    });

    // ─── PERSISTIR DADOS (indexado por token_jti) — serve /api/download-pdf e /api/retoma-dados ───
    // Best-effort: não bloqueia a entrega por email do PDF. Se falhar, o download/retoma
    // ficam indisponíveis mas o utilizador já recebeu o guia em anexo.
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta.');
    } else {
      try {
        const insertResp = await fetch(`${supabaseUrl}/rest/v1/generated_pdfs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            token_jti: jwtData.jti,
            email: email,
            plataforma: plataforma || '',
            nome_assistente: nome_assistente,
            missao: missao || null,
            prompt_completo: prompt_completo,
          }),
        });
        if (!insertResp.ok) {
          const detalhe = await insertResp.text();
          console.error('Erro Supabase (generated_pdfs):', insertResp.status, detalhe);
        }
      } catch (err) {
        console.error('Erro ao inserir em Supabase (generated_pdfs):', err);
      }
    }

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

    return res.status(200).json({
      ok: true,
      message: 'PDF gerado e enviado com sucesso.',
      downloadUrl: `/api/download-pdf?token=${jwtData.token}`,
      retomaUrl: `https://criar.proteinaludica.com/criar/retomar/${jwtData.token}`,
    });
  } catch (err) {
    console.error('Erro no handler de geração do PDF:', err);
    return res.status(500).json({ ok: false, error: 'Ocorreu um erro inesperado.' });
  }
};

module.exports.gerarPdf = gerarPdf;
