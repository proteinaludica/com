// Função serverless (Vercel) — POST /api/retiroassist-webhook
//
// Recebe os eventos da Stripe e, em checkout.session.completed com pagamento
// concluído, regista a compra do RetiroAssist e entrega o kit: email via
// Resend com o PDF em anexo, mais a ligação para voltar a descarregá-lo. É a
// ÚNICA fonte de entrega — o cliente nunca se auto-atribui a compra.
//
// A assinatura é verificada sobre o corpo BRUTO: por isso o bodyParser da
// Vercel é desligado no fim do ficheiro e o corpo é lido do stream. Vindo já
// parseado, não bateria com a assinatura.
//
// Variáveis de ambiente (painel da Vercel):
//   STRIPE_WEBHOOK_SECRET      — segredo do endpoint de webhook (whsec_...)
//   RESEND_API_KEY             — chave da API Resend (secreta)
//   RETIROASSIST_FROM          — remetente verificado no Resend, ex:
//                                "Proteína Lúdica <ola@proteinaludica.com>"
//   JWT_SECRET / SUPABASE_*    — usados por lib/retiroassist
//   SITE_BASE                  — (opcional) base do site
//
// Configurar na Stripe um webhook a apontar para este endpoint, com o evento
// checkout.session.completed.

'use strict';

const crypto = require('crypto');
const ra = require('../lib/retiroassist');
const kit = require('../lib/retiroassist-kit');

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
// Formato: "t=<ts>,v1=<hex>[,v1=<hex>...]".
function assinaturaValida(rawBody, header, secret, agora) {
  if (!header || !secret) return false;
  let t = null;
  const v1 = [];
  for (const parte of String(header).split(',')) {
    const [k, v] = parte.split('=');
    if (k === 't') t = v;
    else if (k === 'v1' && v) v1.push(v);
  }
  if (!t || !v1.length) return false;

  const agoraS = agora == null ? Math.floor(Date.now() / 1000) : agora;
  const idade = agoraS - Number(t);
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

function escaparHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function enviarKit({ email, url, pdf }) {
  const chave = process.env.RESEND_API_KEY;
  const remetente = process.env.RETIROASSIST_FROM;
  if (!chave || !remetente) {
    throw new Error('RESEND_API_KEY ou RETIROASSIST_FROM em falta.');
  }

  const intro = kit.EMAIL_INTRO.map((p) => '<p>' + escaparHtml(p) + '</p>').join('\n');
  const html =
    '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#201e1d">' +
    intro +
    '<p><a href="' + escaparHtml(url) + '">Descarregar o kit</a></p>' +
    '<p style="color:#645c50;font-size:13px">' + escaparHtml(kit.AVISO) + '</p>' +
    '</div>';
  const texto = kit.EMAIL_INTRO.join('\n\n') + '\n\n' + url + '\n\n' + kit.AVISO;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + chave,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: remetente,
      to: [email],
      subject: kit.EMAIL_ASSUNTO,
      html,
      text: texto,
      attachments: [{ filename: 'retiroassist.pdf', content: pdf.toString('base64') }],
    }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Resend ' + resp.status + ': ' + detalhe);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET em falta (retiroassist-webhook).');
    return res.status(500).json({ ok: false, error: 'Webhook não configurado.' });
  }

  let raw;
  try {
    raw = await lerRawBody(req);
  } catch (err) {
    console.error('Falha a ler o corpo do webhook:', err && err.message);
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

  if (!evento || evento.type !== 'checkout.session.completed') {
    return res.status(200).json({ ok: true, ignorado: true });
  }
  const sessao = evento.data && evento.data.object;
  if (!sessao || sessao.payment_status !== 'paid') {
    return res.status(200).json({ ok: true, ignorado: true });
  }
  // Só as compras do RetiroAssist. O webhook do wizard tem endpoint próprio.
  if (!sessao.metadata || sessao.metadata.produto !== 'retiroassist') {
    return res.status(200).json({ ok: true, ignorado: true });
  }

  const email =
    (sessao.customer_details && sessao.customer_details.email) || sessao.customer_email || null;
  if (!email) {
    // Sem email não há entrega possível. 200 para a Stripe não repetir em vão;
    // fica registado para se ir buscar a compra à mão.
    console.error('RetiroAssist: compra sem email, sessão', sessao.id);
    return res.status(200).json({ ok: true, ignorado: true, motivo: 'sem_email' });
  }

  const cfg = ra.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta (retiroassist-webhook).');
    // 500: a Stripe repete até 2xx, sem perder o pagamento.
    return res.status(500).json({ ok: false, error: 'Serviço indisponível.' });
  }

  try {
    // 1) Registo idempotente. Repetido pela Stripe, devolve o mesmo token.
    const emitido = await ra.registarCompra(cfg, {
      referencia: sessao.id,
      email,
      valorCents: sessao.amount_total != null ? sessao.amount_total : ra.PRECO_CENTS,
      moeda: sessao.currency || ra.MOEDA,
    });

    // 2) Entrega. Se falhar, devolve 500 e a Stripe repete — o registo já
    //    ficou feito, por isso a repetição reutiliza o token em vez de emitir
    //    outro. Pode reenviar o email, o que é preferível a não o enviar.
    const pdf = await ra.construirPDF();
    const url = ra.baseSite() + '/api/retiroassist-descarregar?t=' + encodeURIComponent(emitido.token);
    await enviarKit({ email, url, pdf });
  } catch (err) {
    console.error('Falha a entregar o RetiroAssist:', err && err.message);
    return res.status(500).json({ ok: false, error: 'Não foi possível concluir a entrega.' });
  }

  return res.status(200).json({ ok: true });
};

// A assinatura da Stripe é sobre o corpo bruto — sem isto a Vercel entrega-o
// já parseado e a verificação falha sempre.
module.exports.config = { api: { bodyParser: false } };
