// ═══════════════════════════════════════════════════════════════════
// FICHEIRO: /api/gerar-pdf-instalacao.js (VERSÃO ACTUALIZADA)
// ═══════════════════════════════════════════════════════════════════
// Função serverless (Vercel) — gera PDF personalizado com guia de instalação,
// insere em Supabase (generated_pdfs), envia via Resend com attachment,
// e devolve JWT token para download.
//
// Rate limit: 5 PDFs por IP por 24h (via Supabase `rate_limits` table)
//
// Variáveis de ambiente:
//   SUPABASE_URL                  — URL da API Supabase
//   SUPABASE_SERVICE_ROLE_KEY     — chave service_role
//   RESEND_API_KEY                — chave da API Resend
//   JWT_SECRET                    — chave para assinar JWT (32+ chars)
//   PDF_FROM                      — remetente (fallback: nao-responder@proteinaludica.com)
//
// Dependências: pdfkit

const PDFDocument = require('pdfkit');
const crypto = require('crypto');

function cortar(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

function formatarDataPT() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const ano = agora.getFullYear();
  const hora = String(agora.getHours()).padStart(2, '0');
  const minuto = String(agora.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

// ─── TEMPLATES DOS 3 GUIAS ───
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

// ─── GERADOR DE PDF ───
function gerarPDF(conteudo_texto) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
    });

    let buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Título
    doc.fontSize(16).font('Helvetica-Bold').text('Guia de instalação', { align: 'left' });
    doc.moveDown(0.5);

    // Conteúdo (quebra de linhas respeitadas)
    doc.fontSize(10).font('Helvetica');
    const linhas = conteudo_texto.split('\n');
    linhas.forEach((linha) => {
      if (linha.trim() === '') {
        doc.moveDown(0.3);
      } else if (linha.startsWith('─')) {
        doc.moveDown(0.2);
      } else {
        doc.text(linha, { width: 495 });
      }
    });

    doc.end();
  });
}

// ─── GERADOR DE JWT (30 dias) ───
function gerarJWT(payload) {
  const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const exp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 dias
  const jti = crypto.randomBytes(16).toString('hex'); // JWT ID único
  const body = Buffer.from(JSON.stringify({ ...payload, exp, jti })).toString('base64');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64');
  return {
    token: `${header}.${body}.${signature}`,
    jti: jti,
  };
}

// ─── VERIFICAÇÃO RATE LIMIT ───
async function verificarRateLimit(ip) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Rate limit desactivado (Supabase não configurado)');
    return { ok: true };
  }

  try {
    const getResp = await fetch(
      `${supabaseUrl}/rest/v1/rate_limits?ip_address=eq.${encodeURIComponent(ip)}`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!getResp.ok) throw new Error(`GET rate_limits failed: ${getResp.status}`);

    const records = await getResp.json();
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

    if (records.length === 0) {
      await fetch(`${supabaseUrl}/rest/v1/rate_limits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          ip_address: ip,
          request_count: 1,
          last_reset: hoje.toISOString(),
        }),
      });
      return { ok: true };
    }

    const record = records[0];
    const lastReset = new Date(record.last_reset);
    const lastResetDate = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());

    if (lastResetDate.getTime() < hoje.getTime()) {
      await fetch(`${supabaseUrl}/rest/v1/rate_limits?id=eq.${record.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          request_count: 1,
          last_reset: hoje.toISOString(),
        }),
      });
      return { ok: true };
    }

    if (record.request_count >= 5) {
      return { ok: false, error: 'Limite de 5 PDFs por 24 horas atingido. Tenta mais tarde.' };
    }

    await fetch(`${supabaseUrl}/rest/v1/rate_limits?id=eq.${record.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        request_count: record.request_count + 1,
      }),
    });
    return { ok: true };
  } catch (err) {
    console.error('Erro ao verificar rate limit:', err);
    return { ok: true };
  }
}

// ─── HANDLER PRINCIPAL ───
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Validação de entrada
    const plataforma = cortar(body.plataforma, 60);
    const nome_assistente = cortar(body.nome_assistente, 120);
    const prompt_completo = cortar(body.prompt_completo, 50000);
    const email = cortar(body.email, 200);

    if (!plataforma || !['claude', 'chatgpt', 'gemini'].includes(plataforma)) {
      return res.status(400).json({ ok: false, error: 'Plataforma inválida.' });
    }
    if (!nome_assistente || !prompt_completo || !email) {
      return res.status(400).json({ ok: false, error: 'Campos obrigatórios em falta.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Email inválido.' });
    }

    // Rate limit
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    const rateLimitCheck = await verificarRateLimit(ip);
    if (!rateLimitCheck.ok) {
      return res.status(429).json({ ok: false, error: rateLimitCheck.error });
    }

    // Gerar conteúdo do PDF
    const templateFunc = templates[plataforma];
    const conteudo_pdf = templateFunc(nome_assistente, prompt_completo);

    // Gerar PDF
    const pdfBuffer = await gerarPDF(conteudo_pdf);
    const pdfBase64 = pdfBuffer.toString('base64');

    // Gerar JWT para download (30 dias)
    const jwtData = gerarJWT({
      email: email,
      plataforma: plataforma,
      nome_assistente: nome_assistente,
    });

    // ─── INSERIR EM SUPABASE (generated_pdfs) ───
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/generated_pdfs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            email: email,
            nome_assistente: nome_assistente,
            prompt_completo: prompt_completo,
            plataforma: plataforma,
            token_jti: jwtData.jti,
          }),
        });
      } catch (err) {
        console.error('Erro ao guardar em generated_pdfs:', err);
        // Não bloquear; continuar com email
      }
    }

    // ─── EMAIL VIA RESEND ───
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY em falta.');
      return res.status(500).json({ ok: false, error: 'Serviço de email não configurado.' });
    }

    const from = process.env.PDF_FROM || 'Proteína Lúdica <nao-responder@proteinaludica.com>';
    const dataPT = formatarDataPT();

    const emailBody = [
      `Olá!`,
      ``,
      `O teu assistente digital IA "${nome_assistente}" está pronto.`,
      `Anexado encontras o guia passo-a-passo para instalares em ${plataforma === 'claude' ? 'Claude Projects' : plataforma === 'chatgpt' ? 'ChatGPT' : 'Google Gemini'}.`,
      ``,
      `Se tiveres dúvidas, responde a este email ou visita:`,
      `proteinaludica.com/suporte`,
      ``,
      `Podes voltar a editar e re-gerar o PDF sem pagar outra vez:`,
      `proteinaludica.com/criar/retomar/${jwtData.token}`,
      ``,
      `—`,
      `Proteína Lúdica`,
      `proteinaludica.com`,
    ].join('\n');

    const emailResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [email],
        subject: `O teu assistente digital IA: ${nome_assistente} — Guia de instalação`,
        text: emailBody,
        attachments: [
          {
            filename: `Guia_${nome_assistente.replace(/\s+/g, '_')}.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!emailResp.ok) {
      const detalhe = await emailResp.text();
      console.error('Erro Resend:', emailResp.status, detalhe);
      return res.status(502).json({ ok: false, error: 'Não foi possível enviar o email agora.' });
    }

    // Resposta sucesso
    return res.status(200).json({
      ok: true,
      message: 'PDF gerado e enviado com sucesso.',
      downloadUrl: `/api/download-pdf?token=${jwtData.token}`,
      retomaUrl: `proteinaludica.com/criar/retomar/${jwtData.token}`,
    });
  } catch (err) {
    console.error('Erro no handler gerar-pdf-instalacao:', err);
    return res.status(500).json({ ok: false, error: 'Ocorreu um erro inesperado.' });
  }
};
