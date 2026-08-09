-- Migração — apagamento automático de registos expirados, via pg_cron.
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo.
--
-- ✅ JÁ APLICADA em 2026-08-09, no projecto "Cliente - criar assistente
--    digital IA" (eu-west-1). A extensão ficou instalada e os quatro jobs
--    activos, com jobid 1 a 4. NÃO voltar a correr sem necessidade: o
--    cron.schedule é idempotente pelo nome do job, mas repetir isto sem
--    motivo só cria oportunidade de enganos.
--    Para ver o que está lá agora:
--      select jobid, jobname, schedule, active from cron.job order by jobid;
--
-- Este ficheiro existe para que o que foi ligado no painel fique registado no
-- repositório. O pg_cron vive dentro da base de dados e é invisível a quem lê
-- o código: sem este ficheiro, ninguém saberia que estes apagamentos existem.
-- Se alterar os horários ou as condições no painel, ALTERAR TAMBÉM AQUI.
--
-- Porquê pg_cron e não um agendamento da Vercel: corre do lado dos dados, não
-- depende de o site estar no ar, sobrevive a mudanças de alojamento, e não
-- gasta nenhuma das 12 vagas de função do plano Hobby (a pasta api/ já tem 11).
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ VERIFICADO em 2026-08-09 — o bloqueio está levantado.                   │
-- │                                                                          │
-- │ A generated_pdfs tem created_at e expires_at, ambas com valor por        │
-- │ omissão (now() e now() + 30 dias) e ambas preenchidas em todas as        │
-- │ linhas. A estrutura real está registada na migração 005.                 │
-- │                                                                          │
-- │ Uma consequência dessa verificação está aplicada aqui: as datas da       │
-- │ generated_pdfs são `timestamp WITHOUT time zone`, ao contrário das das   │
-- │ outras duas tabelas, que são timestamptz. Comparar uma com now()         │
-- │ obrigaria a uma conversão implícita pelo fuso de quem corre a consulta.  │
-- │ Hoje daria certo — o fuso da base é UTC — mas passa a depender de uma    │
-- │ definição que ninguém está a vigiar. Por isso o job da generated_pdfs    │
-- │ compara com (now() at time zone 'utc'): timestamp contra timestamp, sem  │
-- │ conversão nenhuma pelo meio.                                             │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ───────────────────────────── 1. Ligar o pg_cron ─────────────────────────────
-- Alternativa pelo painel: Integrations → Cron → activar a extensão.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ─────────────────────── 2. generated_pdfs ────────────────────────
-- Guarda o texto completo do assistente, que pode ser clínico. Serve o
-- download do PDF e a retoma da criação, ambos presos a um JWT de 30 dias
-- (gerar-pdf-instalacao.js, linha do `exp`). Passado esse prazo o registo
-- deixa de ser alcançável por qualquer caminho: apagá-lo não retira nada ao
-- cliente, só deixa de guardar texto sensível sem finalidade.
--
-- A condição decide linha a linha:
--
--   · com expires_at preenchido → apaga 7 dias DEPOIS da data de expiração.
--     A regra passa a funcionar seja qual for o prazo, hoje ou se um dia
--     mudar, e a margem dá espaço para investigar uma reclamação recente.
--   · sem expires_at (nulo)     → recai no created_at aos 30 dias.
--
-- Na base actual o expires_at está preenchido em todas as linhas, com 30 dias
-- de validade, por isso o ramo que manda é o primeiro: o efeito real é apagar
-- 37 dias depois da criação. O ramo do created_at fica como rede de segurança.
--
-- Sobre o (now() at time zone 'utc'): ver a caixa no topo. Estas duas colunas
-- são `timestamp without time zone`; assim a comparação é timestamp contra
-- timestamp e não depende do fuso da sessão.
--
-- 03:17 UTC, todos os dias.

select cron.schedule(
  'apagar_generated_pdfs_expirados',
  '17 3 * * *',
  $$
    delete from public.generated_pdfs
     where case
             when expires_at is not null
               then expires_at < (now() at time zone 'utc') - interval '7 days'
             else created_at < (now() at time zone 'utc') - interval '30 days'
           end;
  $$
);

-- ───────────────── 3. pro_tokens — expirados há mais de 7 dias ──────────────
-- O critério é a data de expiração de cada registo, não um prazo fixo.
--
-- Porque não "30 dias": lib/pro-comum.js define VALIDADE_SEGUNDOS = 365 dias.
-- O token Pro que o cliente compra por 49€ vale UM ANO. Apagar a linha aos 30
-- dias cortaria uma compra anual ao fim de um mês — quem voltasse ao
-- formulário passados 40 dias já não conseguiria reaver o seu token por
-- GET /api/obter-token, e perderia o acesso pago.
--
-- Assim a regra não depende do prazo em vigor: nunca apaga um token vivo,
-- continua correcta se VALIDADE_SEGUNDOS mudar, e os 7 dias de margem dão
-- espaço para investigar uma reclamação recente.
--
-- VALIDADE_SEGUNDOS fica como está. Esta migração não a toca.
--
-- 03:27 UTC, todos os dias.

select cron.schedule(
  'apagar_pro_tokens_expirados',
  '27 3 * * *',
  $$
    delete from public.pro_tokens
     where expira_em < now() - interval '7 days';
  $$
);

-- ─────────────── 4. assistir_campo_limites — 7 dias ────────────────
-- Contadores do limite de gerações gratuitas. A janela é o dia UTC e a procura
-- é sempre por igualdade dentro do dia corrente (ver verificarLimites em
-- assistir-campo.js): uma linha com mais de um dia já não serve para nada.
-- Sete dias é folga de sobra e deixa margem para investigar um abuso recente.
--
-- Desde a mesma alteração, a coluna `chave` guarda um resumo irreversível do
-- IP, não o endereço. Este apagamento é a segunda metade da mesma medida.
--
-- 03:37 UTC, todos os dias.

select cron.schedule(
  'apagar_limites_antigos',
  '37 3 * * *',
  $$
    delete from public.assistir_campo_limites
     where criado_em < now() - interval '7 days';
  $$
);

-- ────────────── 5. Histórico do próprio pg_cron — 30 dias ──────────────
-- O pg_cron regista cada execução em cron.job_run_details e NUNCA a limpa
-- sozinho. Sem isto, resolver-se-ia o problema de três tabelas criando um
-- quarto, que cresce para sempre. (É também um problema conhecido nas
-- actualizações de versão do Postgres, que duplicam esta tabela.)
--
-- 03:47 UTC, todos os dias.

select cron.schedule(
  'apagar_historico_cron',
  '47 3 * * *',
  $$
    delete from cron.job_run_details
     where end_time < now() - interval '30 days';
  $$
);

-- ─────────────────────────── O que NÃO se apaga ───────────────────────────
--
-- pagamentos_pro — registos contabilísticos de cada pagamento confirmado.
-- Conservados por obrigação fiscal, não por conveniência. NÃO agendar
-- apagamento. O fundamento é declarado na política de privacidade.

-- ─────────────────────── Ensaio a seco (antes de aplicar) ───────────────────
--
-- Conta o que cada job apagaria HOJE, sem apagar nada. Correr isto primeiro:
-- se algum número parecer alto de mais, é melhor descobri-lo agora.
--
--   select 'generated_pdfs' as tabela,
--          (select count(*) from public.generated_pdfs) as total,
--          (select count(*) from public.generated_pdfs
--            where case when expires_at is not null
--                       then expires_at < (now() at time zone 'utc') - interval '7 days'
--                       else created_at < (now() at time zone 'utc') - interval '30 days' end) as apagaria
--   union all
--   select 'pro_tokens',
--          (select count(*) from public.pro_tokens),
--          (select count(*) from public.pro_tokens where expira_em < now() - interval '7 days')
--   union all
--   select 'assistir_campo_limites',
--          (select count(*) from public.assistir_campo_limites),
--          (select count(*) from public.assistir_campo_limites where criado_em < now() - interval '7 days')
--   order by tabela;
--
-- Resultado em 2026-08-09, corrido contra produção:
--
--   assistir_campo_limites   total 25   apagaria 25
--   generated_pdfs           total  6   apagaria  0
--   pro_tokens               total  0   apagaria  0
--
-- Os 25 são contadores diários parados desde 1 de Agosto — incluem as 8 linhas
-- que ainda guardam endereços IP em claro, e é bom que desapareçam. Os 6 PDF
-- ficam: o mais antigo expira a 15 de Agosto, e só sai a 22.

-- ───────────────────────────── Verificação ─────────────────────────────
--
-- Depois de aplicar, confirmar que os quatro jobs ficaram registados:
--
--   select jobid, jobname, schedule, active
--     from cron.job
--    order by jobname;
--
-- E, no dia seguinte, que correram sem erro:
--
--   select jobid, status, return_message, start_time
--     from cron.job_run_details
--    order by start_time desc
--    limit 20;
--
-- Para desligar um deles sem apagar este ficheiro:
--
--   select cron.unschedule('apagar_generated_pdfs_expirados');
