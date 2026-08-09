-- Migração — registo da estrutura da tabela generated_pdfs.
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo.
--
-- ESTA MIGRAÇÃO É DOCUMENTAÇÃO, NÃO É UMA ALTERAÇÃO.
-- A tabela já existe em produção. Tudo o que está aqui é `if not exists`, por
-- isso correr este ficheiro numa base que já a tenha não faz absolutamente
-- nada. Serve para a estrutura passar a existir no repositório e para a tabela
-- poder ser recriada de raiz noutro projecto.
--
-- Porquê: a generated_pdfs foi criada à mão no painel, em data que o
-- repositório não regista, e era a única tabela em uso sem migração. Quem
-- lesse o código não tinha como saber que colunas existiam.
--
-- Estrutura VERIFICADA contra a base de dados de produção em 2026-08-09
-- (projecto "Cliente - criar assistente digital IA", região eu-west-1), por
-- information_schema.columns, pg_indexes e pg_constraint. Não é inferida do
-- código: é o que lá está.
--
-- Quem a usa:
--   gerar-pdf-instalacao.js — escreve (INSERT de 6 colunas)
--   download-pdf.js         — lê por token_jti, para regerar o PDF
--   retoma-dados.js         — lê por token_jti, para retomar a criação
--
-- É a tabela mais sensível do projecto: prompt_completo pode conter informação
-- clínica. Acedida apenas pelo backend com a chave service_role, que ignora
-- RLS. Apagamento automático: ver migração 004.

create table if not exists public.generated_pdfs (
  -- Chave primária própria. NÃO é usada por nenhum caminho do código — todas
  -- as leituras são por token_jti. Existe por ser o hábito ao criar tabelas
  -- no painel.
  id               bigserial   primary key,

  -- Email para onde o guia foi enviado.
  email            text        not null,

  -- Nome dado ao assistente.
  nome_assistente  text        not null,

  -- O prompt completo. O código corta a 20 000 caracteres antes de enviar
  -- (LIMITES.prompt_completo em gerar-pdf-instalacao.js); a coluna em si não
  -- tem limite.
  prompt_completo  text        not null,

  -- Plataforma escolhida no passo 1 (claude, gemini, …). NOT NULL, mas o
  -- código envia '' quando não há escolha — nunca nulo.
  plataforma       text        not null,

  -- Identificador único do JWT emitido na compra (claim `jti`). É por aqui
  -- que download-pdf e retoma-dados encontram a linha.
  token_jti        text        not null unique,

  -- ATENÇÃO — as três datas são `timestamp WITHOUT time zone`, não timestamptz.
  -- Guardam UTC porque o fuso da base de dados é UTC (verificado:
  -- current_setting('TimeZone') = 'UTC'), mas o tipo não o diz. Comparar estas
  -- colunas com now() obriga a uma conversão implícita pelo fuso da sessão.
  -- Por isso a migração 004 compara com (now() at time zone 'utc'), que é
  -- timestamp contra timestamp e não depende do fuso de quem corre.
  --
  -- Nenhuma das três é escrita pelo código: vêm todas dos valores por omissão.
  created_at       timestamp   default now(),
  expires_at       timestamp   default (now() + interval '30 days'),

  -- Escrita uma vez, no INSERT, e nunca mais: não há UPDATE nenhum a esta
  -- tabela em todo o repositório. Na prática é igual a created_at.
  updated_at       timestamp   default now(),

  -- Missão. O código envia explicitamente null quando fica por preencher.
  missao           text
);

-- Índices existentes em produção. Nota: o token_jti fica com DOIS índices —
-- o único da restrição UNIQUE e mais um btree criado à parte. É redundante e
-- pode ser largado sem consequência; fica registado por ser o que lá está.
create index if not exists idx_generated_pdfs_email
  on public.generated_pdfs (email);
create index if not exists idx_generated_pdfs_token
  on public.generated_pdfs (token_jti);

-- Acedida apenas pelo backend com a chave service_role. Manter RLS activo sem
-- políticas fecha o acesso a chaves anon/public. Já está activo em produção.
alter table public.generated_pdfs enable row level security;

-- ─────────────────────── O que a verificação encontrou ───────────────────────
--
-- Em 2026-08-09, com 6 linhas na tabela:
--
--   · created_at preenchida nas 6           (default now() a funcionar)
--   · expires_at preenchida nas 6           (default now() + 30 dias)
--   · a diferença é exactamente 30 dias em todas
--
-- Ou seja, o ramo do CASE da migração 004 que manda é o do expires_at, e o
-- efeito real é apagar 37 dias depois da criação (30 de validade + 7 de
-- margem). O ramo do created_at fica como rede de segurança, para linhas que
-- venham a existir sem expires_at.
--
-- Para repetir a verificação:
--
--   select count(*)          as total,
--          count(created_at) as com_created_at,
--          count(expires_at) as com_expires_at,
--          min(created_at)   as mais_antigo,
--          max(created_at)   as mais_recente
--     from public.generated_pdfs;
