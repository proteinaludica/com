-- Migração — «Outra profissão» na tabela encomendas.
--
-- Porquê: o guia de criação deixou de abrir sem encomenda. Quem não é de
-- nenhuma das quatro profissões da montra encomenda como «Outra profissão»
-- e define a tarefa no próprio guia (tarefa 'tarefa-propria').
--
-- Aplicar ANTES de publicar o código: sem isto, o INSERT de uma encomenda
-- com profissao = 'outra' é recusado e o cliente vê "Não foi possível
-- registar a encomenda."

alter table public.encomendas drop constraint if exists encomendas_profissao_check;
alter table public.encomendas add constraint encomendas_profissao_check
  check (profissao in ('contabilista','advogado','arquitecto','professor','outra'));

-- ───────────────────────────── Verificação ─────────────────────────────
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'encomendas_profissao_check';
