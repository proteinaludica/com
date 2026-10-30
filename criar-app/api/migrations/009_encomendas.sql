-- Migração — tabela das encomendas da montra por profissão.
--
-- APLICAR ANTES do código que a usa chegar a produção. Sem a tabela, o
-- INSERT de encomenda.js é recusado e o cliente vê "Não foi possível
-- registar a encomenda".
--
-- Projecto: "Cliente - criar assistente digital IA" (eu-west-1).
--
-- Fluxo:
--   1) Na montra, o cliente escolhe profissão e tarefa e abre o ecrã de
--      encomenda (/montra/encomenda).
--   2) POST /api/encomenda valida os dados e grava aqui uma linha com
--      estado 'pendente'.
--   3) A ligação ao pagamento (Stripe e IfthenPay) chega numa migração
--      seguinte, com as colunas do pagamento. Esta migração não as cria.
--
-- Acesso só pelo backend, com a chave service_role, que ignora RLS. RLS
-- activo sem políticas fecha o acesso às chaves anon/public.

create table if not exists public.encomendas (
  id                           uuid        primary key default gen_random_uuid(),
  criado_em                    timestamptz not null default now(),
  profissao                    text        not null
    check (profissao in ('contabilista','advogado','arquitecto','professor')),
  tarefa                       text        not null,   -- identificador da tarefa, ex.: 'prazos-fiscais'
  ferramenta                   text        not null
    check (ferramenta in ('claude','gpt','gemini','copilot','perplexity','outra')),
  nome                         text        not null,
  email                        text        not null,
  nif                          text
    check (nif ~ '^[0-9]{9}$'),                       -- opcional
  termos_aceites_em            timestamptz not null,
  renuncia_livre_resolucao_em  timestamptz not null,   -- caixa separada da dos termos
  versao_termos                text        not null,   -- data da versão dos termos aceites
  valor_cents                  integer     not null,   -- decidido pelo servidor, nunca pelo cliente
  estado                       text        not null default 'pendente'
    check (estado in ('pendente','paga','cancelada','expirada'))
);

create index if not exists encomendas_email_idx on public.encomendas (email);

alter table public.encomendas enable row level security;

-- ───────────────────────────── Conservação ─────────────────────────────
-- Pendentes: 30 dias. Uma encomenda que nunca foi paga não tem uso depois
-- disso e guarda nome, email e NIF de quem desistiu.
--
-- Restantes (paga, cancelada, expirada): 10 anos, pelo prazo de conservação
-- dos documentos contabilísticos. O fundamento é declarado na política de
-- privacidade.
--
-- 03:57 e 04:07 UTC, todos os dias (a seguir aos jobs da migração 004).

select cron.schedule(
  'apagar_encomendas_pendentes',
  '57 3 * * *',
  $$
    delete from public.encomendas
     where estado = 'pendente'
       and criado_em < now() - interval '30 days';
  $$
);

select cron.schedule(
  'apagar_encomendas_antigas',
  '7 4 * * *',
  $$
    delete from public.encomendas
     where estado <> 'pendente'
       and criado_em < now() - interval '10 years';
  $$
);

-- ───────────────────────────── Verificação ─────────────────────────────
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'encomendas'
--    order by ordinal_position;
--
--   select jobname, schedule from cron.job where jobname like 'apagar_encomendas%';
