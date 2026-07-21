// Função serverless (Vercel) — POST /api/criar-sessao-pagamento
//
// Cria a sessão de pagamento do patamar Pro (49€, pagamento único) e devolve a
// URL para onde o cliente é redirecionado. NÃO emite acesso: o acesso Pro só é
// concedido depois de o provedor confirmar (webhook Stripe / callback IfthenPay),
// nunca a partir do cliente.
//
// Contrato:
//   Request  { metodo: 'card' | 'mbway', email?, sessao }
//   Response { ok: true, url }              — redirecionar o browser para `url`
//            { ok: false, error, ... }      — mostrar mensagem, não redirecionar
//
// `sessao` é o pl_sessao do wizard: viaja nos metadados do pagamento e volta no
// webhook/callback para indexar o token em pro_tokens.
//
// Variáveis de ambiente (painel da Vercel):
//   STRIPE_SECRET_KEY     — chave secreta Stripe (obrigatória para cartão)
//   PRO_RETURN_BASE       — base do wizard, ex: https://criar.proteinaludica.com
//                           (opcional; por defeito https://criar.proteinaludica.com)
//   IFTHENPAY_MBWAY_KEY    — chave MB WAY IfthenPay (necessária para MB WAY)
//
// Sem dependências externas: fetch nativo do Node 18+ na Vercel.

'use strict';

// Preço do Pro em cêntimos. Fonte única — o cliente não o dita.
const PRO_VALOR_CENTS = 4900;
const PRO_MOEDA = 'eur';
const LIMITES = { email: 200, sessao: 200, metodo: 20 };

function cortar(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

function baseRetorno() {
  const b = (process.env.PRO_RETURN_BASE || 'https://criar.proteinaludica.com').replace(/\/+$/, '');
  return b;
}

// Cria uma Checkout Session Stripe via REST (x-www-form-urlencoded). Devolve a
// URL da página de pagamento alojada pela Stripe.
async function criarSessaoStripe({ email, sessao }) {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) {
    const err = new Error('cartao_indisponivel');
    err.status = 503;
    err.publico = 'Pagamento por cartão indisponível de momento.';
    throw err;
  }

  const base = baseRetorno();
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', PRO_MOEDA);
  params.set('line_items[0][price_data][unit_amount]', String(PRO_VALOR_CENTS));
  params.set('line_items[0][price_data][product_data][name]', 'Assistente digital IA · Pro');
  // Ao regressar, o wizard lê ?pro=1 e pede o token por /api/obter-token.
  params.set('success_url', base + '/?pro=1');
  params.set('cancel_url', base + '/?pro=cancelado');
  if (email) params.set('customer_email', email);
  params.set('metadata[sessao]', sessao);
  params.set('metadata[produto]', 'pro');

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + chave,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const dados = await resp.json().catch(() => null);
  if (!resp.ok || !dados || !dados.url) {
    console.error('Erro Stripe checkout.sessions:', resp.status, dados && dados.error);
    const err = new Error('stripe_falhou');
    err.status = 502;
    err.publico = 'Não foi possível iniciar o pagamento. Tentar de novo.';
    throw err;
  }
  return dados.url;
}

// MB WAY / IfthenPay. A integração real exige a chave MB WAY e a confirmação
// dos parâmetros da API IfthenPay (infra a não inventar). Sem a chave
// configurada, degrada com uma mensagem clara em vez de um redireccionamento
// partido — o cartão continua a funcionar.
async function criarSessaoMbway() {
  const chave = process.env.IFTHENPAY_MBWAY_KEY;
  if (!chave) {
    const err = new Error('mbway_indisponivel');
    err.status = 503;
    err.publico = 'MB WAY indisponível de momento. É favor usar o cartão.';
    throw err;
  }
  // A activação do fluxo MB WAY (init do pedido IfthenPay + URL de retorno) fica
  // para quando as credenciais IfthenPay reais estiverem disponíveis.
  const err = new Error('mbway_por_activar');
  err.status = 503;
  err.publico = 'MB WAY indisponível de momento. É favor usar o cartão.';
  throw err;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (_) {
    return res.status(400).json({ ok: false, error: 'Corpo do pedido inválido.' });
  }

  const metodo = cortar(body.metodo, LIMITES.metodo).toLowerCase();
  const email = cortar(body.email, LIMITES.email);
  const sessao = cortar(body.sessao, LIMITES.sessao);

  if (!sessao) {
    return res.status(400).json({ ok: false, error: 'Sessão em falta.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'O email não parece válido.' });
  }
  if (metodo !== 'card' && metodo !== 'mbway') {
    return res.status(400).json({ ok: false, error: 'Método de pagamento inválido.' });
  }

  try {
    const url = metodo === 'card'
      ? await criarSessaoStripe({ email, sessao })
      : await criarSessaoMbway({ email, sessao });
    return res.status(200).json({ ok: true, url });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const mensagem = (err && err.publico) || 'Não foi possível iniciar o pagamento.';
    if (status >= 500 && !err.publico) console.error('Erro em criar-sessao-pagamento:', err && err.message);
    return res.status(status).json({ ok: false, error: mensagem });
  }
};
