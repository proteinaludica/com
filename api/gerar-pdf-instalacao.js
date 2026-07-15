// Função serverless (Vercel) — gera PDF personalizado com guia de instalação,
// envia via Resend, implementa rate limit via Supabase.
//
// Variáveis de ambiente a definir no painel da Vercel:
//   SUPABASE_URL                  — URL da API Supabase
//   SUPABASE_SERVICE_ROLE_KEY     — chave service_role (secreta)
//   RESEND_API_KEY                — chave da API Resend (secreta)
//   JWT_SECRET                    — chave para assinar tokens de download (secreta)
//   PDF_FROM                      — remetente verificado no Resend (fallback: onboarding@resend.dev)
//
// Dependências: pdfkit (instalado em criar-app/package.json)

const PDFDocument = require('pdfkit');

// ─── TEMPLATES DOS 3 GUIAS (PT-PT, validados AMÁLIA) ───
const templates = {
  claude: (nome_assistente, prompt_completo) => `Guia de instalação
Assistente digital IA: ${nome_assistente}
Plataforma: Claude (Projects)

──────────────────────────────────────
O que é preciso ter
──────────────────────────────────────
Uma conta Claude. A conta gratuita serve para começar.
O acesso a Projects está disponível nos planos pagos.

──────────────────────────────────────
Passo a passo
──────────────────────────────────────

1. Abrir claude.ai e iniciar sessão.

2. Na barra do lado esquerdo, escolher «Projects».

3. Carregar em «Create project» (Criar projeto).

4. Dar um nome ao projeto: ${nome_assistente}.

5. Dentro do projeto, procurar «Set project instructions»
   (Instruções do projeto). Carregar em «Edit» (Editar).

6. Copiar o texto que se segue, na secção «O prompt do
   assistente». Colar nesse espaço.

7. Guardar.

8. Está pronto. A partir daqui, basta escrever ao
   assistente dentro deste projeto. Ele responde sempre
   com estas instruções.

──────────────────────────────────────
O prompt do assistente
──────────────────────────────────────
Copiar o texto que se segue.

────────────────────────────────
${prompt_completo}
────────────────────────────────

──────────────────────────────────────
Nota
──────────────────────────────────────
O assistente organiza e dá forma ao que o profissional
escreve ou dita. O profissional revê e decide sempre.`,

  chatgpt: (nome_assistente, prompt_completo) => `Guia de instalação
Assistente digital IA: ${nome_assistente}
Plataforma: ChatGPT (GPT personalizado)

──────────────────────────────────────
O que é preciso ter
──────────────────────────────────────
Uma conta ChatGPT. A criação de um GPT personalizado
está disponível nos planos pagos.

──────────────────────────────────────
Passo a passo
──────────────────────────────────────

1. Abrir chatgpt.com e iniciar sessão.

2. Na barra do lado esquerdo, escolher «GPTs».

3. Carregar em «Create» (Criar).

4. Escolher o separador «Configure» (Configurar).

5. No campo «Name» (Nome), escrever: ${nome_assistente}.

6. No campo «Instructions» (Instruções), copiar o texto
   que se segue, na secção «O prompt do assistente».
   Colar nesse espaço.

7. Carregar em «Create» ou «Save» (Guardar), no canto
   superior direito.

8. Está pronto. O assistente fica guardado na lista de
   GPTs. Responde sempre com estas instruções.

──────────────────────────────────────
O prompt do assistente
──────────────────────────────────────
Copiar o texto que se segue.

────────────────────────────────
${prompt_completo}
────────────────────────────────

──────────────────────────────────────
Nota
──────────────────────────────────────
O assistente organiza e dá forma ao que o profissional
escreve ou dita. O profissional revê e decide sempre.`,

  gemini: (nome_assistente, prompt_completo) => `Guia de instalação
Assistente digital IA: ${nome_assistente}
Plataforma: Google Gemini (Gem)

──────────────────────────────────────
O que é preciso ter
──────────────────────────────────────
Uma conta Google. A criação de uma Gem está disponível
no Gemini.

──────────────────────────────────────
Passo a passo
──────────────────────────────────────

1. Abrir gemini.google.com e iniciar sessão com a
   conta Google.

2. Na barra do lado esquerdo, procurar «Gems».
   Carregar em «Novo Gem» (New Gem).

3. No campo do nome, escrever: ${nome_assistente}.

4. No campo das instruções, copiar o texto que se segue,
   na secção «O prompt do assistente». Colar nesse espaço.

5. Carregar em «Guardar» (Save).

6. Está pronto. O Gem fica guardado na lista. Responde
   sempre com estas instruções.

──────────────────────────────────────
O prompt do assistente
──────────────────────────────────────
Copiar o texto que se segue.

────────────────────────────────
${prompt_completo}
────────────────────────────────

──────────────────────────────────────
Nota
──────────────────────────────────────
O assistente organiza e dá forma ao que o profissional
escreve ou dita. O profissional revê e decide sempre.`
};

// ─── RATE LIMIT: verificar e atualizar ───
async function verificarRateLimit(ipAddress) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Se Supabase não está configurado, permitir (fallback)
    return { permitido: true, mensagem: 'Rate limit não configurado' };
  }

  try {
    // Tentar buscar o registo actual
    const getResp = await fetch(`${supabaseUrl}/rest/v1/rate_limits?ip_address=eq.${encodeURIComponent(ipAddress)}`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (!getResp.ok) {
      console.error('Erro ao buscar rate limit:', getResp.status);
      return { permitido: true, mensagem: 'Erro ao verificar rate limit' };
    }

    const dados = await getResp.json();
    const agora = new Date();
    const limiteRequisicoes = 5; // max 5 por hora
    const janela = 3600000; // 1 hora em ms

    if (dados.length === 0) {
      // Primeiro pedido desta IP — criar registo
      const insertResp = await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          ip_address: ipAddress,
          request_count: 1,
          last_reset: agora.toISOString(),
        }),
      });

      if (!insertResp.ok) {
        console.error('Erro ao criar rate limit:', insertResp.status);
      }

      return { permitido: true, mensagem: 'Primeira requisição' };
    }

    const registo = dados[0];
    const lastReset = new Date(registo.last_reset);
    const tempoDecorrido = agora - lastReset;

    if (tempoDecorrido > janela) {
      // Janela expirou — resetar contador
      const updateResp = await fetch(`${supabaseUrl}/rest/v1/rate_limits?ip_address=eq.${encodeURIComponent(ipAddress)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          request_count: 1,
          last_reset: agora.toISOString(),
        }),
      });

      if (!updateResp.ok) {
        console.error('Erro ao resetar rate limit:', updateResp.status);
      }

      return { permitido: true, mensagem: 'Contador resetado' };
    }

    // Janela ainda activa — verificar se atingiu limite
    if (registo.request_count >= limiteRequisicoes) {
      return { permitido: false, mensagem: `Limite de ${limiteRequisicoes} PDFs por hora atingido. Tenta novamente mais tarde.` };
    }

    // Incrementar contador
    const updateResp = await fetch(`${supabaseUrl}/rest/v1/rate_limits?ip_address=eq.${encodeURIComponent(ipAddress)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        request_count: registo.request_count + 1,
      }),
    });

    if (!updateResp.ok) {
      console.error('Erro ao incrementar rate limit:', updateResp.status);
    }

    return { permitido: true, mensagem: 'Dentro do limite' };
  } catch (err) {
    console.error('Erro ao verificar rate limit:', err);
    return { permitido: true, mensagem: 'Erro ao verificar rate limit (fallback)' };
  }
}

// ─── GERAR PDF ───
function gerarPDF(conteudo) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      bufferPages: true,
    });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Fonte padrão
    doc.fontSize(11).font('Helvetica');

    // Dividir conteúdo em linhas e renderizar
    const linhas = conteudo.split('\n');
    let y = doc.y;
    const maxY = doc.page.height - 40;

    linhas.forEach((linha, index) => {
      // Verificar se precisa de nova página
      if (y > maxY) {
        doc.addPage();
        y = 40;
      }

      // Detectar títulos (linhas com apenas '─' ou texto simples)
      if (linha.startsWith('──────')) {
        doc.fontSize(10).font('Helvetica-Bold');
        y = doc.y;
      } else if (linha.match(/^Guia de instalação|^Assistente digital|^Plataforma:/)) {
        doc.fontSize(13).font('Helvetica-Bold');
        y = doc.y;
      } else if (linha.match(/^O que é preciso ter|^Passo a passo|^O prompt do assistente|^Nota/)) {
        doc.fontSize(11).font('Helvetica-Bold');
        y = doc.y;
      } else if (linha.match(/^\d+\.|^────────/)) {
        doc.fontSize(10).font('Helvetica');
        y = doc.y;
      } else {
        doc.fontSize(10).font('Helvetica');
        y = doc.y;
      }

      doc.text(linha);
      y = doc.y;
    });

    doc.end();
  });
}

// ─── EMAIL TEMPLATE ───
function gerarEmailBody(nome_assistente, plataforma_label) {
  return `Olá!

O teu assistente digital IA "${nome_assistente}" está pronto para usar em ${plataforma_label}.

Anexado encontras o guia passo-a-passo com todas as instruções de instalação.

Se tiveres dúvidas, responde a este email ou visita proteinaludica.com/suporte.

Podes voltar a editar e re-gerar o PDF sem pagar outra vez em:
proteinaludica.com/criar/retomar

—
Proteína Lúdica
proteinaludica.com`;
}

// ─── HANDLER PRINCIPAL ───
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Método não permitido.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Validar campos obrigatórios
    const { plataforma, nome_assistente, missao, prompt_completo, email } = body;

    if (!plataforma || !['claude', 'chatgpt', 'gemini'].includes(plataforma)) {
      return res.status(400).json({ success: false, error: 'Plataforma inválida. Use: claude, chatgpt ou gemini.' });
    }

    if (!nome_assistente || nome_assistente.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Nome do assistente obrigatório.' });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Email inválido.' });
    }

    if (!prompt_completo || prompt_completo.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Prompt completo obrigatório.' });
    }

    // ─── RATE LIMIT ───
    const ipAddress = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const rateLimit = await verificarRateLimit(ipAddress);

    if (!rateLimit.permitido) {
      return res.status(429).json({ success: false, error: rateLimit.mensagem });
    }

    // ─── GERAR PDF ───
    const template = templates[plataforma];
    const conteudo = template(nome_assistente, prompt_completo);
    const pdfBuffer = await gerarPDF(conteudo);
    const pdfBase64 = pdfBuffer.toString('base64');

    // ─── PREPARAR EMAIL ───
    const plataformas = { claude: 'Claude Projects', chatgpt: 'ChatGPT', gemini: 'Google Gemini' };
    const plataformaLabel = plataformas[plataforma];
    const resendApiKey = process.env.RESEND_API_KEY;
    const pdfFrom = process.env.PDF_FROM || 'Proteína Lúdica <onboarding@resend.dev>';

    if (!resendApiKey) {
      console.error('RESEND_API_KEY em falta.');
      return res.status(500).json({ success: false, error: 'Serviço de email não configurado.' });
    }

    // ─── ENVIAR RESEND COM ATTACHMENT ───
    const emailBody = gerarEmailBody(nome_assistente, plataformaLabel);

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: pdfFrom,
        to: [email],
        subject: `O teu assistente digital IA: ${nome_assistente} — Guia de instalação`,
        text: emailBody,
        attachments: [
          {
            filename: `${nome_assistente.replace(/\s+/g, '-')}-guia-instalacao.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!emailResp.ok) {
      const detalhe = await emailResp.text();
      console.error('Erro Resend:', emailResp.status, detalhe);
      return res.status(502).json({ success: false, error: 'Não foi possível enviar o PDF agora.' });
    }

    // ─── RESPOSTA COM DOWNLOAD URL ───
    // Nota: Para MVP, devolver um placeholder. A URL real seria gerada com token JWT.
    const downloadUrl = `/download-pdf?token=temp-${Date.now()}`;

    return res.status(200).json({
      success: true,
      downloadUrl: downloadUrl,
      mensagem: `PDF enviado para ${email}`,
    });
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    return res.status(500).json({ success: false, error: 'Ocorreu um erro inesperado.' });
  }
};
