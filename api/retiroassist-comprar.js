// Função serverless (Vercel) — POST /api/retiroassist-comprar
//
// Cria a sessão de pagamento do RetiroAssist (19€, pagamento único) e devolve
// a URL para onde o browser é redirigido. NÃO entrega nada: a entrega só
// acontece depois de a Stripe confirmar, em /api/retiroassist-webhook. O
// cliente nunca se auto-atribui a compra nem dita o preço.
//
// Contrato:
//   Request  {}                          — sem corpo; a Stripe recolhe o email
//   Response { ok: true, url }           — redirigir o browser para `url`
//            { ok: false, error }        — mostrar mensagem, não redirigir
//
// Variáveis de ambiente (painel da Vercel):
//   STRIPE_SECRET_KEY — chave secreta Stripe (obrigatória)
//   SITE_BASE         — (opcional) base do site, por defeito proteinaludica.com
//
// Sem dependências externas: fetch nativo do Node 18+ na Vercel.

'use strict';

const ra = require('../lib/retiroassist');
const kit = require('../lib/retiroassist-kit');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  // Trava de segurança: sem kit aprovado não se cobra. Isto vem antes de
  // tudo — a Stripe nem chega a ser contactada.
  if (!kit.estaAprovado()) {
    console.error('RetiroAssist: compra pedida com o kit por aprovar.');
    return res.status(503).json({
      ok: false,
      error: 'A venda do RetiroAssist ainda não está aberta.',
    });
  }

  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) {
    console.error('STRIPE_SECRET_KEY em falta.');
    return res.status(503).json({
      ok: false,
      error: 'Pagamento indisponível de momento.',
    });
  }

  const base = ra.baseSite();
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', ra.MOEDA);
  params.set('line_items[0][price_data][unit_amount]', String(ra.PRECO_CENTS));
  params.set('line_items[0][price_data][product_data][name]', 'RetiroAssist · assistente digital IA');
  // A Stripe recolhe o email no checkout; volta em customer_details.email.
  params.set('success_url', base + '/retiroassist-obrigado?s={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', base + '/assistentes-pessoais');
  params.set('metadata[produto]', 'retiroassist');
  params.set('metadata[versao_kit]', kit.VERSAO);

  let dados;
  try {
    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + chave,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    dados = await resp.json().catch(() => null);
    if (!resp.ok || !dados || !dados.url) {
      console.error('Erro Stripe checkout.sessions:', resp.status, dados && dados.error);
      return res.status(502).json({
        ok: false,
        error: 'Não foi possível iniciar o pagamento. Tentar de novo.',
      });
    }
  } catch (err) {
    console.error('Falha de rede a contactar a Stripe:', err && err.message);
    return res.status(502).json({
      ok: false,
      error: 'Não foi possível iniciar o pagamento. Tentar de novo.',
    });
  }

  return res.status(200).json({ ok: true, url: dados.url });
};
