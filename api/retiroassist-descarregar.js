// Função serverless (Vercel) — GET /api/retiroassist-descarregar?t=<token>
//
// Entrega o PDF do kit a quem tem um token de descarga válido. O token é
// emitido pelo webhook depois de a Stripe confirmar o pagamento — este
// endpoint não decide quem comprou, só verifica.
//
// Duas verificações, ambas obrigatórias:
//   1) assinatura e validade do token (lib/retiroassist);
//   2) existência da compra em Supabase pelo `jti` — um token assinado cuja
//      compra tenha sido apagada deixa de servir.
//
// Variáveis de ambiente: JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

'use strict';

const ra = require('../lib/retiroassist');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('t');

  const payload = ra.verificarToken(token);
  if (!payload) {
    return res.status(403).json({ ok: false, error: 'Ligação inválida ou expirada.' });
  }

  const cfg = ra.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_* em falta (retiroassist-descarregar).');
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  let compra;
  try {
    compra = await ra.obterCompraPorJti(cfg, payload.jti);
  } catch (err) {
    console.error('Falha a ler a compra:', err && err.message);
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }
  if (!compra) {
    return res.status(403).json({ ok: false, error: 'Ligação inválida ou expirada.' });
  }
  if (compra.expira_em && new Date(compra.expira_em).getTime() <= Date.now()) {
    return res.status(403).json({ ok: false, error: 'Ligação inválida ou expirada.' });
  }

  let pdf;
  try {
    pdf = await ra.construirPDF();
  } catch (err) {
    console.error('Falha a gerar o PDF do RetiroAssist:', err && err.message);
    return res.status(500).json({ ok: false, error: 'Não foi possível gerar o ficheiro.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="retiroassist.pdf"');
  res.setHeader('Content-Length', String(pdf.length));
  // Conteúdo pago e ligado a um token — nunca em cache partilhada.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(200).end(pdf);
};
