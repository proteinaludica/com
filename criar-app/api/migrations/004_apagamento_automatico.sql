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
-- │   select count(*)                       as total,                        │
-- │          count(created_at)              as com_data,                     │
-- │          min(created_at)                as mais_antigo                   │
-- │     from public.generated_pdfs;                                          │
-- │                                                                          │
-- │ Se `com_data` for igual a `total`, está tudo bem. Se der erro de coluna  │
-- │ inexistente, ou se `com_data` for 0, PARAR: aplicar primeiro a 005 e     │
-- │ acrescentar a coluna, senão fica com um apagamento que nunca apaga.      │
-- └──────────────────────────────────────────────────────────────────────────┘

-- ───────────────────────────── 1. Ligar o pg_cron ─────────────────────────────
-- Alternativa pelo painel: Integrations → Cron → activar a extensão.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ─────────────────────── 2. generated_pdfs — 30 dias ────────────────────────
-- Guarda o texto completo do assistente, que pode ser clínico. Serve o
-- download do PDF e a retoma da criação, ambos presos a um JWT de 30 dias
-- (gerar-pdf-instalacao.js, linha do `exp`). Passados os 30 dias o registo
-- deixa de ser alcançável por qualquer caminho: apagá-lo não retira nada ao
-- cliente, só deixa de guardar texto sensível sem finalidade.
--
-- 03:17 UTC, todos os dias.

select cron.schedule(
  'apagar_generated_pdfs_expirados',
  '17 3 * * *',
  $$
    delete from public.generated_pdfs
     where created_at < now() - interval '30 days';
  $$
);

-- ───────────────── 3. pro_tokens — só os que já expiraram ──────────────────
-- ATENÇÃO — DESVIO DELIBERADO À INSTRUÇÃO RECEBIDA, POR CONFIRMAR.
--
-- O pedido dizia "apagar aos 30 dias", no pressuposto de que expira_em fosse
-- de 30 dias. Não é: lib/pro-comum.js define VALIDADE_SEGUNDOS = 365 dias.
-- O token Pro que o cliente compra por 49€ vale UM ANO.
--
-- Apagar a linha aos 30 dias cortaria uma compra anual ao fim de um mês: o
-- cliente que voltasse ao formulário passados 40 dias já não conseguiria
-- reaver o seu token por GET /api/obter-token, e perderia o acesso pago.
--
-- Por isso apaga-se apenas o que JÁ está expirado — que é o mesmo princípio
-- (não guardar o que já não serve) sem encurtar nada que o cliente comprou.
-- Se preferir mesmo os 30 dias, é trocar a condição por
--   criado_em < now() - interval '30 days'
-- e reduzir também VALIDADE_SEGUNDOS, senão o produto e a base de dados
-- passam a discordar um do outro.
--
-- 03:27 UTC, todos os dias.

select cron.schedule(
  'apagar_pro_tokens_expirados',
  '27 3 * * *',
  $$
    delete from public.pro_tokens
     where expira_em < now();
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
