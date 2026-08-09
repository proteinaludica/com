-- Migração — apagamento automático de registos expirados, via pg_cron.
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo.
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
-- │ BLOQUEIO POR CONFIRMAR — generated_pdfs.created_at                       │
-- │                                                                          │
-- │ A tabela generated_pdfs foi criada à mão e nunca teve migração (a 005    │
-- │ passa a documentá-la). O código NÃO escreve created_at: se a coluna      │
-- │ existir com `default now()`, é a base de dados que a preenche; se não    │
-- │ existir, ou existir vazia, o job abaixo não apaga nada — em silêncio.    │
-- │                                                                          │
-- │ ANTES de agendar, correr esta verificação:                              │
-- │                                                                          │
-- │   select count(*)              as total,                                 │
-- │          count(created_at)     as com_created_at,                        │
-- │          count(expires_at)     as com_expires_at,                        │
-- │          min(created_at)       as mais_antigo,                           │
-- │          max(created_at)       as mais_recente                           │
-- │     from public.generated_pdfs;                                          │
-- │                                                                          │
-- │ · com_created_at igual a total  → seguir, está tudo bem.                │
-- │ · erro "column ... does not exist" para created_at, ou com_created_at    │
-- │   a 0 com total > 0  → PARAR. Aplicar primeiro a 005 e acrescentar a    │
-- │   coluna, senão fica com um apagamento que nunca apaga, em silêncio.     │
-- │ · erro só para expires_at  → a coluna não existe; retirar o ramo do     │
-- │   CASE no job da generated_pdfs e deixar só a condição do created_at.    │
-- │ · total = 0  → a tabela está vazia; pode agendar à mesma, mas repetir a │
-- │   verificação depois da primeira compra.                                 │
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
-- A condição decide linha a linha, e não é preciso escolher de antemão:
--
--   · com expires_at preenchido → apaga 7 dias DEPOIS da data de expiração.
--     A regra passa a funcionar seja qual for o prazo, hoje ou se um dia
--     mudar, e a margem dá espaço para investigar uma reclamação recente.
--   · sem expires_at (nulo)     → recai no created_at aos 30 dias.
--
-- Uma tabela com umas linhas de cada tipo é tratada correctamente sem
-- intervenção. Se a coluna expires_at NÃO existir de todo, o SQL dá erro de
-- coluna inexistente: nesse caso, retirar o ramo do CASE e deixar só a
-- condição do created_at.
--
-- 03:17 UTC, todos os dias.

select cron.schedule(
  'apagar_generated_pdfs_expirados',
  '17 3 * * *',
  $$
    delete from public.generated_pdfs
     where case
             when expires_at is not null then expires_at < now() - interval '7 days'
             else created_at < now() - interval '30 days'
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
