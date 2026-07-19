-- Migração — tabela de rate-limit do endpoint POST /api/assistir-campo ([DEC-05]).
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo.
--
-- Contadores de geração de campos do assistente digital IA. Uma linha por
-- combinação (chave, campo, janela). A janela é o dia UTC (DATE).
--
-- Chaves usadas pelo endpoint:
--   Grátis  — 'sess:<id>'  campo '__all__'  limite 1  (1 geração por sessão/dia)
--           — 'ip:<ip>'    campo '__all__'  limite 3  (3 gerações por IP/dia)
--   Pago    — 'pro:<sub>'  campo '<id>'     limite 3  (3 gerações por campo/dia)
--
-- O endpoint falha FECHADO: se esta tabela não existir ou o Supabase falhar,
-- a geração é recusada (HTTP 503). Nunca deixa passar sem contar.

create table if not exists public.assistir_campo_limites (
  chave      text        not null,
  campo      text        not null,
  contagem   integer     not null default 0,
  janela     date        not null,
  criado_em  timestamptz not null default now()
);

-- Índice único que suporta o upsert on_conflict=(chave,campo,janela) do endpoint.
create unique index if not exists assistir_campo_limites_chave_campo_janela_idx
  on public.assistir_campo_limites (chave, campo, janela);

-- A tabela é acedida apenas pelo backend com a chave service_role, que ignora
-- RLS. Manter RLS ativo sem políticas fecha o acesso a chaves anon/public.
alter table public.assistir_campo_limites enable row level security;
