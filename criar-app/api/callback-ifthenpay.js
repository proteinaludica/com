// Função serverless (Vercel) — GET /api/callback-ifthenpay
//
// Callback de confirmação de pagamento MB WAY / IfthenPay. A IfthenPay chama
// esta URL (configurada no backoffice) quando um pagamento é confirmado. Tal
// como o webhook Stripe, é a fonte de acesso Pro por MB WAY — o cliente nunca se
// auto-atribui o tier.
//
// A URL de callback é definida no backoffice IfthenPay com os valores próprios
// do pedido. Espera-se, no mínimo:
//   ?chave=<anti-phishing>&sessao=<pl_sessao>&referencia=<id>&valor=<eur>
// A `chave` anti-phishing tem de bater com IFTHENPAY_ANTI_PHISHING_KEY, senão
// o pedido é recusado (não se confirma nada).
//
// NOTA: o fluxo de iniciação MB WAY (criar-sessao-pagamento) ainda está por
// activar à espera das credenciais IfthenPay reais; este callback fica pronto
// para esse momento e não interfere com o pagamento por cartão.
//
// Variáveis de ambiente:
//   IFTHENPAY_ANTI_PHISHING_KEY  — chave anti-phishing do callback (obrigatória)
//   JWT_SECRET / SUPABASE_*      — usados por pro-comum.

'use strict';

const pro = require('../lib/pro-comum');

module.exports = async (req, res) => {
  // A IfthenPay usa GET no callback.
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const esperada = process.env.IFTHENPAY_ANTI_PHISHING_KEY;
  if (!esperada) {
    console.error('IFTHENPAY_ANTI_PHISHING_KEY em falta.');
    return res.status(500).json({ ok: false, error: 'Callback não configurado.' });
  }

  const q = req.query || {};
  const chave = String(q.chave || q.key || '').trim();
  const sessao = String(q.sessao || '').trim().slice(0, 200);
  const referencia = String(q.referencia || q.id || q.requestId || '').trim().slice(0, 200);
  const valorEur = parseFloat(String(q.valor || q.amount || '').replace(',', '.'));

  // Sem a chave anti-phishing correcta, não se confirma nada.
  if (!chave || chave !== esperada) {
    return res.status(403).json({ ok: false, error: 'Não autorizado.' });
  }
  if (!sessao || !referencia) {
    return res.status(400).json({ ok: false, error: 'Parâmetros em falta.' });
  }

  const cfg = pro.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta (callback-ifthenpay).');
    return res.status(500).json({ ok: false, error: 'Serviço indisponível.' });
  }

  try {
    await pro.confirmarPagamentoPro(cfg, {
      provedor: 'ifthenpay',
      referencia,
      email: String(q.email || '').trim().slice(0, 200) || null,
      sessao,
      valorCents: Number.isFinite(valorEur) ? Math.round(valorEur * 100) : null,
      moeda: 'EUR',
    });
  } catch (err) {
    console.error('Falha a confirmar pagamento Pro (IfthenPay):', err && err.message);
    return res.status(500).json({ ok: false, error: 'Não foi possível registar o acesso.' });
  }

  // A IfthenPay espera um 200 simples para dar o callback por entregue.
  return res.status(200).json({ ok: true });
};
