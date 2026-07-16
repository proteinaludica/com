// Função serverless (Vercel) — GET /api/retoma-dados?token=<jwt>
// Valida o JWT (HS256, 30 dias) emitido por gerar-pdf-instalacao e devolve os
// dados do wizard guardados na tabela Supabase generated_pdfs (indexada por
// token_jti), para pré-preencher a retoma da criação.
//
// Variáveis de ambiente a definir no painel da Vercel:
//   JWT_SECRET                 — segredo HS256 (o MESMO usado em gerar-pdf-instalacao)
//   SUPABASE_URL               — URL da API Supabase, ex: https://xxxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  — chave service_role (secreta · obrigatória)

const crypto = require('crypto');

// Verifica a assinatura HS256 e a validade (exp) de um JWT em base64url.
// Devolve o payload descodificado, ou null se inválido/expirado.
function verificarJWT(token) {
  if (!token || typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [header, body, signature] = partes;

  const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
  const esperada = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  const a = Buffer.from(signature);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const token = req.query && req.query.token;
  const payload = verificarJWT(token);
  if (!payload || !payload.jti) {
    return res.status(401).json({ ok: false, error: 'Ligação inválida ou expirada.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta.');
    return res.status(500).json({ ok: false, error: 'Serviço indisponível.' });
  }

  try {
    const query = `${supabaseUrl}/rest/v1/generated_pdfs?token_jti=eq.${encodeURIComponent(payload.jti)}` +
      '&select=email,plataforma,nome_assistente,missao,prompt_completo&limit=1';
    const resp = await fetch(query, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    if (!resp.ok) {
      const detalhe = await resp.text();
      console.error('Erro Supabase (retoma-dados):', resp.status, detalhe);
      return res.status(502).json({ ok: false, error: 'Não foi possível obter os dados agora.' });
    }

    const linhas = await resp.json();
    if (!Array.isArray(linhas) || linhas.length === 0) {
      return res.status(404).json({ ok: false, error: 'Dados não encontrados.' });
    }

    return res.status(200).json({ ok: true, dados: linhas[0] });
  } catch (err) {
    console.error('Erro no handler de retoma de dados:', err);
    return res.status(500).json({ ok: false, error: 'Ocorreu um erro inesperado.' });
  }
};
