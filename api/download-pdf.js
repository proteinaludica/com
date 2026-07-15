// ═══════════════════════════════════════════════════════════════════
// FICHEIRO: /api/download-pdf.js (NOVO)
// ═══════════════════════════════════════════════════════════════════
// Função serverless (Vercel) — valida JWT, busca prompt em Supabase,
// re-gera o PDF e serve para download.
//
// Fluxo:
// 1. Cliente clica em "Descarregar PDF" com token JWT
// 2. Valida JWT (assinatura + expiração)
// 3. Busca em generated_pdfs via token_jti
// 4. Valida expires_at
// 5. Re-gera PDF com o prompt original
// 6. Serve como download (Content-Disposition: attachment)
//
// Env vars:
//   JWT_SECRET — chave para validar JWT (mesma de gerar-pdf-instalacao.js)
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const PDFDocument = require('pdfkit');
const crypto = require('crypto');

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

// ─── VALIDAÇÃO DE JWT ───
function validarJWT(token) {
  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
    const [header, body, signature] = token.split('.');

    if (!header || !body || !signature) {
      return { ok: false, error: 'Token inválido (formato).' };
    }

    // Validar assinatura
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64');

    if (signature !== expectedSignature) {
      return { ok: false, error: 'Token inválido (assinatura).' };
    }

    // Descodificar payload
    const payload = JSON.parse(Buffer.from(body, 'base64').toString());

    // Validar expiração
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: 'Token expirado.' };
    }

    return { ok: true, payload };
  } catch (err) {
    console.error('Erro ao validar JWT:', err);
    return { ok: false, error: 'Token inválido.' };
  }
}

// ─── HANDLER PRINCIPAL ───
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  try {
    const token = req.query.token;

    if (!token) {
      return res.status(400).json({ ok: false, error: 'Token em falta.' });
    }

    // Validar JWT
    const validation = validarJWT(token);
    if (!validation.ok) {
      return res.status(401).json({ ok: false, error: validation.error });
    }

    const { jti } = validation.payload;

    // ─── BUSCAR EM SUPABASE (generated_pdfs) ───
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta.');
      return res.status(500).json({ ok: false, error: 'Serviço não configurado.' });
    }

    const getResp = await fetch(
      `${supabaseUrl}/rest/v1/generated_pdfs?token_jti=eq.${encodeURIComponent(jti)}`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!getResp.ok) {
      console.error('Erro ao buscar em generated_pdfs:', getResp.status);
      return res.status(500).json({ ok: false, error: 'Erro ao buscar o PDF.' });
    }

    const records = await getResp.json();
    if (records.length === 0) {
      return res.status(404).json({ ok: false, error: 'PDF não encontrado.' });
    }

    const record = records[0];

    // Validar expiração
    const expiresAt = new Date(record.expires_at);
    if (expiresAt < new Date()) {
      return res.status(410).json({ ok: false, error: 'PDF expirado.' });
    }

    // Gerar PDF
    const { nome_assistente, prompt_completo, plataforma } = record;
    const templateFunc = templates[plataforma];
    if (!templateFunc) {
      return res.status(400).json({ ok: false, error: 'Plataforma inválida.' });
    }

    const conteudo_pdf = templateFunc(nome_assistente, prompt_completo);
    const pdfBuffer = await gerarPDF(conteudo_pdf);

    // Headers para download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Guia_${nome_assistente.replace(/\s+/g, '_')}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('Erro no handler download-pdf:', err);
    return res.status(500).json({ ok: false, error: 'Erro ao descarregar PDF.' });
  }
};
