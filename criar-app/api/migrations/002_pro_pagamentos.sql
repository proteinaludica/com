-- Migração — tabelas do gating Pro (49€): pagamentos confirmados e tokens Pro.
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo.
--
-- Fluxo:
--   1) O cliente escolhe Pro e inicia o pagamento (Stripe ou MB WAY/IfthenPay).
--   2) O provedor confirma via webhook (Stripe) ou callback (IfthenPay).
--   3) O backend regista o pagamento e emite um JWT Pro, guardado em pro_tokens
--      indexado pela sessão do cliente (o mesmo `pl_sessao` do wizard).
--   4) De volta ao wizard, o cliente pede o token por GET /api/obter-token e
--      passa a ter tier=pro (JWT enviado no header Authorization ao assistir-campo).
--
-- Ambas as tabelas são acedidas apenas pelo backend com a chave service_role,
-- que ignora RLS. RLS activo sem políticas fecha o acesso a chaves anon/public.

-- Registo de cada pagamento Pro confirmado (auditoria e idempotência).
create table if not exists public.pagamentos_pro (
  id             uuid        primary key default gen_random_uuid(),
  provedor       text        not null,           -- 'stripe' | 'ifthenpay'
  referencia     text        not null,           -- id da sessão Stripe / id do pedido IfthenPay
  email          text,
  sessao_cliente text        not null,           -- pl_sessao do wizard
  valor_cents    integer     not null,
  moeda          text        not null default 'EUR',
  criado_em      timestamptz not null default now()
);

-- Idempotência: cada (provedor, referencia) confirma no máximo uma vez.
create unique index if not exists pagamentos_pro_provedor_referencia_idx
  on public.pagamentos_pro (provedor, referencia);

-- Tokens Pro emitidos, indexados pela sessão do cliente. O wizard obtém o token
-- por GET /api/obter-token?sessao=<pl_sessao> ao regressar do pagamento.
create table if not exists public.pro_tokens (
  sessao_cliente text        primary key,        -- pl_sessao do wizard
  token          text        not null,           -- JWT HS256 { sub, tier:'pro', iat, exp }
  email          text,
  expira_em      timestamptz not null,
  criado_em      timestamptz not null default now()
);

alter table public.pagamentos_pro enable row level security;
alter table public.pro_tokens     enable row level security;
