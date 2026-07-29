-- Migração — incremento ATÓMICO do rate-limit de POST /api/assistir-campo.
--
-- APLICAR MANUALMENTE no painel Supabase (SQL Editor). Esta migração NÃO é
-- corrida automaticamente por nenhum processo do repo. Aplicar ANTES (ou em
-- conjunto com) o deploy que passa a chamar esta função, senão o endpoint
-- falha fechado (503) por a função não existir.
--
-- Motivo: o incremento anterior era ler-contagem-e-escrever-contagem+1 no
-- backend, o que sob concorrência perde escritas (dois pedidos lêem N e ambos
-- escrevem N+1), subcontando e deixando ultrapassar o limite. Esta função faz
-- o upsert+incremento numa única instrução atómica no Postgres e devolve a
-- contagem já actualizada.

create or replace function public.incrementar_limite(
  p_chave  text,
  p_campo  text,
  p_janela date
)
returns integer
language sql
as $$
  insert into public.assistir_campo_limites (chave, campo, janela, contagem)
  values (p_chave, p_campo, p_janela, 1)
  on conflict (chave, campo, janela)
  do update set contagem = public.assistir_campo_limites.contagem + 1
  returning contagem;
$$;
