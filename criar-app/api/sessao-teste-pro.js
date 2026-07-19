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

// Emite um JWT HS256/base64url com o mesmo esquema dos restantes endpoints.
function gerarTokenPro() {
  const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
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
  if (!esperado || !segredo || segredo !== esperado) {
    return res.status(404).end();
  }

  return res.status(200).json({ token: gerarTokenPro() });
};
