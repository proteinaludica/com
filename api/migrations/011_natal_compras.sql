-- Migração — tabela das compras do Natal IA 2026 (19€, pagamento único).
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor), no projecto
-- "Cliente - criar assistente digital IA" (xmbzdttssdqfdoyprijd, eu-west-1),
-- ANTES de abrir a venda. Esta migração NÃO é corrida automaticamente por
-- nenhum processo do repo.
--
-- ⏳ POR APLICAR. Depois de aplicar, verificar contra a própria base de dados
--    (information_schema.columns, pg_constraint, pg_class.relrowsecurity e
--    cron.job) e só então escrever aqui "JÁ APLICADA em <data>".
--
-- Numeração: continua a série partilhada com criar-app/api/migrations, que já
-- vai na 010.
--
-- Quem a usa:
--   api/natal-webhook.js  — escreve (INSERT idempotente por referencia)
--   api/natal-token.js    — lê por referencia, para a página de obrigado
--   api/natal-dados.js    — lê e grava os dados por token_jti
--
-- Acedida apenas pelo backend com a chave service_role, que ignora RLS.
-- O RLS fica activo e SEM políticas: nenhum acesso pelo cliente. É o mesmo
-- desenho de retiroassist_compras. O advisor de segurança vai assinalar
-- "RLS enabled, no policy"; é intencional.

create table if not exists public.natal_compras (
  id            bigserial   primary key,

  -- Identificador da sessão de checkout da Stripe. É a chave de idempotência:
  -- a Stripe repete o aviso até receber 2xx, e o UNIQUE garante que a mesma
  -- compra não gera duas linhas nem dois tokens.
  referencia    text        not null unique,

  -- Email recolhido pela Stripe no checkout. Para onde a ligação foi enviada.
  email         text,

  -- Claim `jti` do token. É por aqui que natal-dados encontra a linha.
  token_jti     text        not null unique,

  -- Valor efectivamente cobrado, em cêntimos, como a Stripe o reportou.
  valor_cents   integer,
  moeda         text        default 'EUR',

  -- Versão do conteúdo entregue (api/_lib/natal-kit.js) e dos Termos aceites.
  versao_kit    text,
  versao_termos text,

  -- Hora em que quem comprou confirmou a renúncia ao direito de livre
  -- resolução (caixa na página de venda). Vem da sessão da Stripe. Nula só se
  -- o aviso chegar sem ela; o webhook regista o erro no log.
  renuncia_em   timestamptz,

  created_at    timestamptz default now(),

  -- Fim do prazo para alterar os dados: o mais tardio entre 6 de Janeiro de
  -- 2027 e 30 dias depois da compra (prazoAlteracoes em api/_lib/natal.js).
  -- É também a validade da ligação.
  expira_em     timestamptz not null,

  -- As respostas que personalizam o assistente, já validadas pelo servidor
  -- (validarDados): nome, pessoas (primeiro nome e idade aproximada), concelho
  -- e orçamento. Sem moradas, datas de nascimento nem dados de saúde.
  dados            jsonb,
  -- Quantas vezes os dados foram gravados. O servidor recusa a partir de
  -- MAX_GRAVACOES (10).
  dados_gravacoes  integer not null default 0,
  dados_em         timestamptz
);

create index if not exists idx_natal_compras_email
  on public.natal_compras (email);

-- Fechado a chaves anon/public. O backend usa service_role, que ignora RLS.
alter table public.natal_compras enable row level security;

-- ─────────────── Apagar os dados 30 dias depois do prazo ───────────────
-- Depois de expira_em a ligação deixa de abrir e os dados já não servem. Apagam-se
-- 30 dias depois, como margem para investigar uma reclamação recente. A linha da
-- compra fica (contabilidade); só a coluna `dados` sai.
--
-- Requer o pg_cron, já ligado pela migração 004 no mesmo projecto.
-- 03:47 UTC, todos os dias. (03:37 é do apagar_limites_antigos e 03:57 do
-- apagar_retiroassist_perfis_expirados.)

select cron.schedule(
  'apagar_natal_dados_expirados',
  '47 3 * * *',
  $$
    update public.natal_compras
       set dados = null
     where dados is not null
       and expira_em < now() - interval '30 days';
  $$
);
