-- Migração — tabela das compras do RetiroAssist (19€, pagamento único).
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo.
--
-- ⚠️ AINDA NÃO APLICADA. A venda só pode abrir depois de esta tabela existir
--    (e depois de o kit estar aprovado — ver lib/retiroassist-kit.js).
--
-- Numeração: continua a série de criar-app/api/migrations, que vai até à 006.
-- A tabela vive no MESMO projecto Supabase; o que muda é o projecto Vercel que
-- lhe acede (o site principal, e não o wizard).
--
-- Quem a usa:
--   api/retiroassist-webhook.js      — escreve (INSERT idempotente por referencia)
--   api/retiroassist-token.js        — lê por referencia, para a página de obrigado
--   api/retiroassist-descarregar.js  — lê por token_jti, para servir o PDF
--
-- Acedida apenas pelo backend com a chave service_role, que ignora RLS.

create table if not exists public.retiroassist_compras (
  id            bigserial   primary key,

  -- Identificador da sessão de checkout da Stripe. É a chave de idempotência:
  -- a Stripe repete o webhook até receber 2xx, e o UNIQUE garante que a mesma
  -- compra não gera duas linhas nem dois tokens.
  referencia    text        not null unique,

  -- Email recolhido pela Stripe no checkout. Para onde o kit foi enviado.
  email         text,

  -- Claim `jti` do token de descarga. É por aqui que retiroassist-descarregar
  -- encontra a linha.
  token_jti     text        not null unique,

  -- Valor efectivamente cobrado, em cêntimos, como a Stripe o reportou.
  -- Guardado tal como veio, não assumido a partir do preço do código.
  valor_cents   integer,
  moeda         text        default 'EUR',

  -- Versão do kit entregue (lib/retiroassist-kit.js). Quando o conteúdo for
  -- revisto, permite saber quem recebeu o quê.
  versao_kit    text,

  -- Datas em timestamptz — ao contrário da generated_pdfs, que ficou em
  -- timestamp sem fuso por ter sido criada à mão no painel. Aqui não há
  -- histórico a respeitar, por isso fica o tipo correcto.
  created_at    timestamptz default now(),
  expira_em     timestamptz
);

create index if not exists idx_retiroassist_compras_email
  on public.retiroassist_compras (email);

-- Fechado a chaves anon/public. O backend usa service_role, que ignora RLS.
alter table public.retiroassist_compras enable row level security;

-- Apagamento automático: a ligação de descarga vale 30 dias (VALIDADE_SEGUNDOS
-- em lib/retiroassist.js). Não há aqui o equivalente à migração 004 — se se
-- quiser limpar as linhas velhas, seguir o mesmo padrão de pg_cron usado lá.
