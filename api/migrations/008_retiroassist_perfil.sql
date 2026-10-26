-- Migração — perfil do comprador do RetiroAssist (prompt personalizado).
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor), no projecto
-- "Cliente - criar assistente digital IA" (xmbzdttssdqfdoyprijd), ANTES de
-- publicar o código que a usa: api/_lib/retiroassist.js passa a ler estas
-- colunas, e um SELECT a colunas que não existem faz falhar a descarga.
--
-- ✅ JÁ APLICADA em 2026-10-26. Verificado depois de aplicar, contra a base de
--    dados: perfil (jsonb), perfil_gravacoes (integer) e perfil_em
--    (timestamptz) existem; o job apagar_retiroassist_perfis_expirados está
--    agendado para 57 3 * * *.
--
-- Quem a usa:
--   api/retiroassist-perfil.js       — lê e grava o perfil (PATCH por token_jti)
--   api/retiroassist-descarregar.js  — lê o perfil para gerar o PDF
--
-- Numeração: continua a 007_retiroassist_compras.sql.

-- ───────────────────────────── 1. Colunas novas ─────────────────────────────
-- perfil            — as 8 respostas do questionário, já validadas e limpas
--                     pelo servidor (validarPerfil). A pergunta 8 pode conter
--                     dados de saúde (alergias, mobilidade): é opcional e o
--                     perfil é apagado com a regra do ponto 2.
-- perfil_gravacoes  — quantas vezes o perfil foi gravado. O servidor recusa
--                     a partir de MAX_GRAVACOES_PERFIL (3).
-- perfil_em         — data da última gravação.

alter table public.retiroassist_compras
  add column if not exists perfil           jsonb,
  add column if not exists perfil_gravacoes integer not null default 0,
  add column if not exists perfil_em        timestamptz;

-- ─────────────────── 2. Apagar o perfil quando a ligação expira ──────────────
-- A ligação de descarga vale 30 dias (VALIDADE_SEGUNDOS em
-- api/_lib/retiroassist.js). Depois disso o perfil já não serve para nada:
-- apaga-se, com 7 dias de margem para investigar uma reclamação recente, como
-- na migração 004 do wizard. A linha da compra fica (contabilidade); só o
-- perfil sai.
--
-- Requer o pg_cron, já ligado pela migração 004 no mesmo projecto.
-- 03:57 UTC, todos os dias. (03:37 já é do apagar_limites_antigos.)

select cron.schedule(
  'apagar_retiroassist_perfis_expirados',
  '57 3 * * *',
  $$
    update public.retiroassist_compras
       set perfil = null
     where perfil is not null
       and expira_em < now() - interval '7 days';
  $$
);
