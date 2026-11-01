-- Migração — estado 'campanha' na tabela encomendas.
--
-- APLICAR ANTES do código que a usa chegar a produção. Sem o estado novo, o
-- INSERT de uma encomenda de campanha é recusado e o cliente vê "Não foi
-- possível registar a encomenda", depois de já ter recebido o email.
--
-- Projecto: "Cliente - criar assistente digital IA" (eu-west-1).
--
-- Porquê: na campanha de lançamento (até 30 de Novembro de 2026, 50 acessos,
-- um por email), a encomenda não é paga. Fica com estado 'campanha', que
-- serve para contar os lugares usados e para recusar um segundo acesso ao
-- mesmo email (ver campanhaDisponivel em encomenda.js).

alter table public.encomendas drop constraint if exists encomendas_estado_check;
alter table public.encomendas add constraint encomendas_estado_check
  check (estado in ('pendente','paga','cancelada','expirada','campanha'));

-- ───────────────────────────── Conservação ─────────────────────────────
-- Uma encomenda de campanha não é paga, por isso não há documento
-- contabilístico a conservar. Guarda-se 90 dias: chega para recusar um
-- segundo acesso ao mesmo email durante a campanha e para responder a quem
-- escrever depois dela. Corre antes do job dos 10 anos da migração 009, que
-- assim nunca chega a estas linhas.
--
-- 04:17 UTC, todos os dias.

select cron.schedule(
  'apagar_encomendas_campanha',
  '17 4 * * *',
  $$
    delete from public.encomendas
     where estado = 'campanha'
       and criado_em < now() - interval '90 days';
  $$
);

-- ───────────────────────────── Verificação ─────────────────────────────
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'encomendas_estado_check';
--
--   select jobname, schedule from cron.job where jobname = 'apagar_encomendas_campanha';
