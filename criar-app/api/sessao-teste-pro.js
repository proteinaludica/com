// Função serverless (Vercel) — emite um JWT Pro de teste para QA.
//
// Existe SÓ para validação/QA. Não é referenciado em nenhum sítio da UI e não
// persiste nada em Supabase. Está protegido por um segredo de teste: sem o
// header correcto responde 404 (não 401), para não revelar a existência do
// endpoint.
//
// Variáveis de ambiente a definir no painel da Vercel:
//   PRO_TEST_SECRET — segredo partilhado para autorizar o pedido (obrigatória)
//   JWT_SECRET      — segredo HS256, o MESMO usado nos endpoints de PDF/retoma
//
// Sem dependências externas de rede.

const crypto = require('crypto');

// Compara dois segredos em tempo constante (evita distinção por timing).
function segredosIguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Emite um JWT HS256/base64url com o mesmo esquema dos restantes endpoints.
// Falha FECHADO: sem JWT_SECRET não há fallback conhecido (ver pro-comum).
function gerarTokenPro() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET em falta.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    sub: crypto.randomUUID(),
    tier: 'pro',
    iat,
    exp: iat + 86400, // 24 horas
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

module.exports = function handler(req, res) {
  // 404 para tudo o que não seja um POST autorizado — o endpoint não se revela.
  if (req.method !== 'POST') {
    return res.status(404).end();
  }

  const segredo = req.headers && (req.headers['x-pl-test-secret'] || req.headers['X-Pl-Test-Secret']);
  const esperado = process.env.PRO_TEST_SECRET;
  if (!esperado || !segredosIguais(String(segredo || ''), esperado)) {
    return res.status(404).end();
  }

  let token;
  try {
    token = gerarTokenPro();
  } catch (_) {
    // JWT_SECRET em falta: não revelar o endpoint.
    return res.status(404).end();
  }
  return res.status(200).json({ token });
};
