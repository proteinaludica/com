// Função serverless (Vercel) — POST /api/natal-comprar
//
// Cria a sessão de pagamento do Natal IA 2026 (19€, pagamento único) e devolve
// a URL para onde o browser é redirigido. NÃO entrega nada: a entrega só
// acontece depois de a Stripe confirmar, em /api/natal-webhook. Quem compra
// nunca dita o preço nem se auto-atribui a compra.
//
// Só abre a sessão se quem compra confirmou a renúncia ao direito de livre
// resolução (caixa na página de venda). A hora da confirmação vai nos metadados
// da sessão e fica guardada com a compra.
//
// Contrato:
//   Request  { renuncia: true }          — a caixa da renúncia, marcada
//   Response { ok: true, url }           — redirigir o browser para `url`
//            { ok: false, error }        — mostrar mensagem, não redirigir
//
// Variáveis de ambiente (painel da Vercel):
//   STRIPE_SECRET_KEY — chave secreta Stripe (obrigatória)
//   SITE_BASE         — (opcional) base do site

'use strict';

const natal = require('./_lib/natal');
const kit = require('./_lib/natal-kit');

function lerCorpo(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (_) { return null; }
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  // Trava de segurança: sem aprovação não se cobra. Vem antes de tudo — a
  // Stripe nem chega a ser contactada.
  if (!kit.estaAprovado()) {
    console.error('Natal IA 2026: compra pedida com a venda por aprovar.');
    return res.status(503).json({
      ok: false,
      error: 'A venda do Natal IA 2026 ainda não está aberta.',
    });
  }

  const corpo = lerCorpo(req);
  if (!corpo || corpo.renuncia !== true) {
    return res.status(400).json({
      ok: false,
      error: 'Marque a caixa da renúncia ao direito de livre resolução para continuar.',
    });
  }

  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) {
    console.error('STRIPE_SECRET_KEY em falta (natal-comprar).');
    return res.status(503).json({ ok: false, error: 'Pagamento indisponível de momento.' });
  }

  const base = natal.baseSite();
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('payment_method_types[0]', 'card');
  // Códigos de oferta criados no painel da Stripe (cupões). Com 100 % de
  // desconto, a Stripe não pede cartão e a sessão chega com
  // payment_status 'no_payment_required' (ver natal.sessaoEntregavel).
  params.set('allow_promotion_codes', 'true');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', natal.MOEDA);
  params.set('line_items[0][price_data][unit_amount]', String(natal.PRECO_CENTS));
  params.set('line_items[0][price_data][product_data][name]', kit.NOME + ' · assistente digital IA');
  // A Stripe recolhe o email no checkout; volta em customer_details.email.
  params.set('success_url', base + '/natal-obrigado?s={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', base + '/natal-ia-2026');
  params.set('metadata[produto]', kit.PRODUTO);
  params.set('metadata[versao_kit]', kit.VERSAO);
  params.set('metadata[versao_termos]', kit.VERSAO_TERMOS);
  params.set('metadata[renuncia_em]', new Date().toISOString());

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
      console.error('Erro Stripe checkout.sessions (natal):', resp.status, dados && dados.error);
      return res.status(502).json({
        ok: false,
        error: 'Não foi possível iniciar o pagamento. Tente de novo.',
      });
    }
  } catch (err) {
    console.error('Falha de rede a contactar a Stripe (natal):', err && err.message);
    return res.status(502).json({
      ok: false,
      error: 'Não foi possível iniciar o pagamento. Tente de novo.',
    });
  }

  return res.status(200).json({ ok: true, url: dados.url });
};
