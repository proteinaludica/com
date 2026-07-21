// Função serverless (Vercel) — POST /api/webhook-stripe
//
// Recebe os eventos da Stripe e, em checkout.session.completed com pagamento
// concluído, regista o pagamento e emite o token Pro (via pro-comum), indexado
// pela sessão do cliente que viajou nos metadados. É a ÚNICA fonte de acesso
// Pro por cartão — o cliente nunca se auto-atribui o tier.
//
// A assinatura é verificada a partir do corpo BRUTO do pedido: por isso o corpo
// é lido do stream e nunca de req.body (que viria já parseado e não bateria com
// a assinatura).
//
// Variáveis de ambiente (painel da Vercel):
//   STRIPE_WEBHOOK_SECRET      — segredo do endpoint de webhook (whsec_...)
//   JWT_SECRET / SUPABASE_*    — usados por pro-comum
//
// Configurar na Stripe o webhook a apontar para este endpoint, com o evento
// checkout.session.completed.

'use strict';

const crypto = require('crypto');
const pro = require('./pro-comum');

// Tolerância do timestamp da assinatura (5 minutos), como a lib oficial Stripe.
const TOLERANCIA_S = 300;

function lerRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Verifica a assinatura do header `stripe-signature` sobre o corpo bruto.
// Devolve true/false. Formato do header: "t=<ts>,v1=<hex>[,v1=<hex>...]".
function assinaturaValida(rawBody, header, secret) {
  if (!header || !secret) return false;
  let t = null;
  const v1 = [];
  for (const parte of String(header).split(',')) {
    const [k, v] = parte.split('=');
    if (k === 't') t = v;
    else if (k === 'v1' && v) v1.push(v);
  }
  if (!t || !v1.length) return false;

  const idade = Math.floor(Date.now() / 1000) - Number(t);
  if (!Number.isFinite(idade) || Math.abs(idade) > TOLERANCIA_S) return false;

  const esperada = crypto
    .createHmac('sha256', secret)
    .update(t + '.' + rawBody.toString('utf8'))
    .digest('hex');
  const b = Buffer.from(esperada);
  return v1.some((assin) => {
    const a = Buffer.from(assin);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET em falta.');
    return res.status(500).json({ ok: false, error: 'Webhook não configurado.' });
  }

  let raw;
  try {
    raw = await lerRawBody(req);
  } catch (err) {
    console.error('Falha a ler o corpo do webhook Stripe:', err && err.message);
    return res.status(400).json({ ok: false, error: 'Corpo ilegível.' });
  }

  const header = req.headers && (req.headers['stripe-signature'] || req.headers['Stripe-Signature']);
  if (!assinaturaValida(raw, header, secret)) {
    return res.status(400).json({ ok: false, error: 'Assinatura inválida.' });
  }

  let evento;
  try {
    evento = JSON.parse(raw.toString('utf8'));
  } catch (_) {
    return res.status(400).json({ ok: false, error: 'Evento inválido.' });
  }

  // Só interessa a conclusão de checkout com pagamento efectivo.
  if (!evento || evento.type !== 'checkout.session.completed') {
    return res.status(200).json({ ok: true, ignorado: true });
  }
  const sessao = evento.data && evento.data.object;
  if (!sessao || sessao.payment_status !== 'paid') {
    return res.status(200).json({ ok: true, ignorado: true });
  }

  const meta = sessao.metadata || {};
  const sessaoCliente = meta.sessao;
  if (meta.produto !== 'pro' || !sessaoCliente) {
    return res.status(200).json({ ok: true, ignorado: true });
  }

  const cfg = pro.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta (webhook-stripe).');
    // 500: a Stripe repete o webhook até 2xx, sem perder o pagamento.
    return res.status(500).json({ ok: false, error: 'Serviço indisponível.' });
  }

  try {
    await pro.confirmarPagamentoPro(cfg, {
      provedor: 'stripe',
      referencia: sessao.id,
      email: (sessao.customer_details && sessao.customer_details.email) || sessao.customer_email || meta.email || null,
      sessao: sessaoCliente,
      valorCents: sessao.amount_total != null ? sessao.amount_total : null,
      moeda: (sessao.currency || 'eur').toUpperCase(),
    });
  } catch (err) {
    console.error('Falha a confirmar pagamento Pro (Stripe):', err && err.message);
    // 500 → a Stripe repete. Idempotência garante que não duplica.
    return res.status(500).json({ ok: false, error: 'Não foi possível registar o acesso.' });
  }

  return res.status(200).json({ ok: true });
};
