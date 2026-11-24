// Função serverless (Vercel) — POST /api/natal-webhook
//
// Recebe os eventos da Stripe e, em checkout.session.completed com pagamento
// concluído, regista a compra do Natal IA e envia por email (Resend) a
// ligação para as quatro perguntas. Os textos só são montados depois, na
// página, com as respostas de quem comprou. É a ÚNICA fonte de entrega.
//
// Endpoint próprio, com segredo próprio: configurar na Stripe um webhook novo a
// apontar para aqui, com o evento checkout.session.completed, e guardar o
// segredo dele em STRIPE_WEBHOOK_SECRET_NATAL. O webhook do RetiroAssist fica
// como está.
//
// A assinatura é verificada sobre o corpo BRUTO: por isso o bodyParser da
// Vercel é desligado no fim do ficheiro.
//
// Variáveis de ambiente (painel da Vercel):
//   STRIPE_WEBHOOK_SECRET_NATAL — segredo deste endpoint (whsec_...)
//   RESEND_API_KEY              — chave da API Resend (secreta)
//   NATAL_FROM                  — remetente verificado no Resend; se faltar, usa
//                                 RETIROASSIST_FROM
//   JWT_SECRET / SUPABASE_*     — usados por _lib/natal
//   SITE_BASE                   — (opcional) base do site

'use strict';

const natal = require('./_lib/natal');
const kit = require('./_lib/natal-kit');

function lerRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function enviarEmail({ email, url, licenca, expira, valorCents, compradoEm, versaoTermos, renunciaEm }) {
  const chave = process.env.RESEND_API_KEY;
  const remetente = process.env.NATAL_FROM || process.env.RETIROASSIST_FROM;
  if (!chave || !remetente) {
    throw new Error('RESEND_API_KEY ou NATAL_FROM/RETIROASSIST_FROM em falta.');
  }

  const renuncia = renunciaEm && !isNaN(new Date(renunciaEm)) ? renunciaEm : null;
  const partes = kit.emailPartes({
    licenca,
    data: natal.dataPorExtenso(expira),
    valor: natal.valorPorExtenso(valorCents),
    oferta: Number(valorCents) === 0,
    dataCompra: natal.dataPorExtenso(compradoEm),
    versaoTermos: versaoTermos || kit.VERSAO_TERMOS,
    renunciaData: renuncia ? natal.dataPorExtenso(renuncia) : null,
    renunciaHora: renuncia ? natal.horaPorExtenso(renuncia) : null,
  });
  const html = kit.emailHtml(partes, url);
  const texto = partes.antes.join('\n\n') + '\n\n' + url + '\n\n' +
    partes.confirmacao.join('\n') + '\n\n' + partes.depois.join('\n\n');

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

  const secret = process.env.STRIPE_WEBHOOK_SECRET_NATAL;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET_NATAL em falta (natal-webhook).');
    return res.status(500).json({ ok: false, error: 'Webhook não configurado.' });
  }

  let raw;
  try {
    raw = await lerRawBody(req);
  } catch (err) {
    console.error('Falha a ler o corpo do webhook (natal):', err && err.message);
    return res.status(400).json({ ok: false, error: 'Corpo ilegível.' });
  }

  const header = req.headers && (req.headers['stripe-signature'] || req.headers['Stripe-Signature']);
  if (!natal.assinaturaValida(raw, header, secret)) {
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
  if (!natal.sessaoEntregavel(sessao)) {
    return res.status(200).json({ ok: true, ignorado: true });
  }
  // Só as compras do Natal IA.
  if (!sessao.metadata || sessao.metadata.produto !== kit.PRODUTO) {
    return res.status(200).json({ ok: true, ignorado: true });
  }

  const email =
    (sessao.customer_details && sessao.customer_details.email) || sessao.customer_email || null;
  if (!email) {
    // Sem email não há entrega possível. 200 para a Stripe não repetir em vão;
    // fica registado para se ir buscar a compra à mão.
    console.error('Natal IA: compra sem email, sessão', sessao.id);
    return res.status(200).json({ ok: true, ignorado: true, motivo: 'sem_email' });
  }

  const renunciaEm = sessao.metadata.renuncia_em || null;
  if (!renunciaEm) {
    console.error('Natal IA: compra sem hora da renúncia, sessão', sessao.id);
  }

  const cfg = natal.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta (natal-webhook).');
    // 500: a Stripe repete até 2xx, sem perder o pagamento.
    return res.status(500).json({ ok: false, error: 'Serviço indisponível.' });
  }

  const valorCents = sessao.amount_total != null ? sessao.amount_total : natal.PRECO_CENTS;
  const compradoEm = sessao.created ? new Date(sessao.created * 1000) : new Date();
  const versaoTermos = sessao.metadata.versao_termos || null;

  try {
    // 1) Registo idempotente. Repetido pela Stripe, devolve o mesmo token.
    const emitido = await natal.registarCompra(cfg, {
      referencia: sessao.id,
      email,
      valorCents,
      moeda: sessao.currency || natal.MOEDA,
      compradoEm,
      renunciaEm,
      versaoTermos,
    });

    // 2) Email com a ligação. Se falhar, devolve 500 e a Stripe repete: o
    //    registo já ficou feito, por isso a repetição reutiliza o token. Pode
    //    reenviar o email, o que é preferível a não o enviar.
    const url = natal.baseSite() + '/natal-personalizar?t=' + encodeURIComponent(emitido.token);
    await enviarEmail({
      email,
      url,
      licenca: natal.licencaDe(emitido.jti),
      expira: emitido.expira,
      valorCents,
      compradoEm,
      versaoTermos,
      renunciaEm,
    });
  } catch (err) {
    console.error('Falha a entregar o Natal IA:', err && err.message);
    return res.status(500).json({ ok: false, error: 'Não foi possível concluir a entrega.' });
  }

  return res.status(200).json({ ok: true });
};

// A assinatura da Stripe é sobre o corpo bruto — sem isto a Vercel entrega-o
// já parseado e a verificação falha sempre.
module.exports.config = { api: { bodyParser: false } };
