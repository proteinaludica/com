// ═══════════════════════════════════════════════════════════════════
// FICHEIRO: /api/retoma-dados.js (NOVO)
// ═══════════════════════════════════════════════════════════════════
// Endpoint que valida JWT e devolve os dados guardados em generated_pdfs
// para o cliente re-editar e re-gerar o PDF.
//
// Fluxo:
// 1. Cliente acede /criar/retomar/[token]
// 2. JS faz: GET /api/retoma-dados?token=[token]
// 3. Valida JWT
// 4. Busca em generated_pdfs
// 5. Devolve JSON com dados (ou erro 401/410)
//
// Env vars:
//   JWT_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const crypto = require('crypto');

// ─── VALIDAÇÃO DE JWT ───
function validarJWT(token) {
  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
    const [header, body, signature] = token.split('.');

    if (!header || !body || !signature) {
      return { ok: false, error: 'Token inválido (formato).' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64');

    if (signature !== expectedSignature) {
      return { ok: false, error: 'Token inválido (assinatura).' };
    }

    const payload = JSON.parse(Buffer.from(body, 'base64').toString());

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: 'Token expirado.' };
    }

    return { ok: true, payload };
  } catch (err) {
    console.error('Erro ao validar JWT:', err);
    return { ok: false, error: 'Token inválido.' };
  }
}

// ─── HANDLER ───
module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  // CORS permissivo para /criar-app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    // ─── BUSCAR EM SUPABASE ───
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase não configurado.');
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
      return res.status(500).json({ ok: false, error: 'Erro ao carregar dados.' });
    }

    const records = await getResp.json();
    if (records.length === 0) {
      return res.status(404).json({ ok: false, error: 'Dados não encontrados.' });
    }

    const record = records[0];

    // Validar expiração
    const expiresAt = new Date(record.expires_at);
    if (expiresAt < new Date()) {
      return res.status(410).json({ ok: false, error: 'Link expirado (30 dias).' });
    }

    // Devolve dados para preencher o wizard
    return res.status(200).json({
      ok: true,
      data: {
        email: record.email,
        nome_assistente: record.nome_assistente,
        prompt_completo: record.prompt_completo,
        plataforma: record.plataforma,
        token_jti: record.token_jti,
        expires_at: record.expires_at,
      },
    });
  } catch (err) {
    console.error('Erro no handler retoma-dados:', err);
    return res.status(500).json({ ok: false, error: 'Erro inesperado.' });
  }
};
