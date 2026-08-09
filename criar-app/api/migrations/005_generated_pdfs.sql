-- Migração — registo da estrutura da tabela generated_pdfs.
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo.
--
-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ ESTE FICHEIRO AINDA NÃO FOI VERIFICADO CONTRA A BASE DE DADOS.           │
-- │                                                                          │
-- │ A generated_pdfs foi criada à mão no painel, em data que o repositório   │
-- │ não regista, e era a única tabela em uso sem migração. O que está abaixo │
-- │ foi reconstruído a partir do código que a lê e escreve — NÃO de uma      │
-- │ leitura da tabela real, porque o projecto Supabase estava suspenso       │
-- │ quando isto foi escrito.                                                 │
-- │                                                                          │
-- │ Fontes usadas:                                                           │
-- │   gerar-pdf-instalacao.js — o INSERT, que envia seis colunas             │
-- │   download-pdf.js         — o comentário de cabeçalho, que menciona      │
-- │                             ainda created_at e expires_at                │
-- │   retoma-dados.js         — o SELECT usado na retoma                     │
-- │                                                                          │
-- │ ANTES de confiar neste ficheiro, correr a verificação do fim e corrigir  │
-- │ o que não bater certo. Depois, apagar esta caixa.                        │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- Para que serve a tabela: guarda o que é preciso para voltar a produzir o
-- guia de instalação e para retomar a criação onde ia, nos 30 dias de validade
-- do JWT emitido na compra. É a tabela mais sensível do projecto — o
-- prompt_completo pode conter informação clínica.
--
-- Acedida apenas pelo backend com a chave service_role, que ignora RLS.
-- Apagamento automático aos 30 dias: ver migração 004.

create table if not exists public.generated_pdfs (
  -- Identificador único do JWT emitido na compra (claim `jti`). É por aqui que
  -- download-pdf e retoma-dados encontram a linha.
  token_jti        text        not null,

  -- Email para onde o guia foi enviado.
  email            text,

  -- Plataforma escolhida no passo 1 (ChatGPT, Claude, …).
  plataforma       text,

  -- Nome dado ao assistente. O INSERT recusa o pedido se vier vazio.
  nome_assistente  text        not null,

  -- Missão. O código envia explicitamente null quando o campo fica por
  -- preencher — por isso não pode ser not null.
  missao           text,

  -- O prompt completo, cortado a 20 000 caracteres no envio
  -- (LIMITES.prompt_completo em gerar-pdf-instalacao.js).
  prompt_completo  text        not null,

  -- Nenhuma das duas é escrita pelo código: têm de vir da base de dados.
  -- Se created_at não tiver default, fica vazia e o apagamento da 004 nunca
  -- encontra nada para apagar.
  created_at       timestamptz not null default now(),
  expires_at       timestamptz
);

-- A leitura é sempre por token_jti, uma linha. O índice único suporta-a e
-- garante que um mesmo JWT não indexa duas linhas.
create unique index if not exists generated_pdfs_token_jti_idx
  on public.generated_pdfs (token_jti);

-- Suporta o apagamento por idade da migração 004 sem varrer a tabela toda.
create index if not exists generated_pdfs_created_at_idx
  on public.generated_pdfs (created_at);

-- Acedida apenas pelo backend com a chave service_role. Manter RLS activo sem
-- políticas fecha o acesso a chaves anon/public.
alter table public.generated_pdfs enable row level security;

-- ───────────────────────────── Verificação ─────────────────────────────
--
-- 1) Estrutura real da tabela, para comparar com o que está aqui escrito:
--
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name  = 'generated_pdfs'
--    order by ordinal_position;
--
-- 2) A created_at existe e está preenchida? E a expires_at? (é disto que a
--    004 depende — a condição de apagamento usa as duas)
--
--   select count(*)              as total,
--          count(created_at)     as com_created_at,
--          count(expires_at)     as com_expires_at,
--          min(created_at)       as mais_antigo,
--          max(created_at)       as mais_recente
--     from public.generated_pdfs;
--
-- 3) Índices já existentes:
--
--   select indexname, indexdef
--     from pg_indexes
--    where schemaname = 'public'
--      and tablename  = 'generated_pdfs';
--
-- Se a coluna created_at não existir, acrescentá-la antes de agendar a 004:
--
--   alter table public.generated_pdfs
--     add column created_at timestamptz not null default now();
--
-- Nota: as linhas que já existam ficam todas com a data do momento em que a
-- coluna for acrescentada, não com a data em que foram criadas. Passam a ser
-- apagadas 30 dias depois DESSE momento — uma vez só, e nunca mais.
