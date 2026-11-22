# CLAUDE.md — proteinaludica/com

## Antes de qualquer alteração
- Verificar sempre o estado REAL do repo antes de assumir algo do Project Knowledge.
  Ficheiros/mockups no Project Knowledge podem NUNCA ter sido implementados.
  Confirmar com grep/leitura directa do ficheiro no repo.
- Ficheiros minificados (bundle único numa linha): `grep -n` não funciona.
  Usar Python `re.finditer` com janelas de contexto. `wc -c` para tamanho, não `wc -l`.

## PRs
- Um PR por frente/tema. Nunca misturar assuntos diferentes na mesma PR.
- Antes de abrir PR: confirmar que não há conteúdo de outra frente acidentalmente incluído.

## Vocabulário obrigatório (produto público)
- SEMPRE "assistente digital IA" — nunca "secretário digital", "agente IA", "LLM",
  "plataforma", "apoio à decisão", "especialista" (substantivo), "avatar" (é termo interno).
- Permitido: "assistente digital IA especializado".
- Demo outputs: sempre "Dr. Silva", nunca nome real do fundador.
- Tratamento de quem lê: imperativo na 3.ª pessoa ("faça", "escreva", "diga").
  Nunca "você", "tu" nem "o senhor".
- Wizard e frente genérica: nunca "o profissional". Usar "cada um" ou "quem o usa".
- Exemplos das caixas e propostas do Bob Pro: o assistente na 3.ª pessoa e quem
  preenche na 1.ª ("devolve-me o trabalho", "a decisão é minha").
- A montra por profissão e o catálogo de saúde mantêm "o profissional".

## Infra (não inventar/assumir)
- DNS: Squarespace (NÃO Cloudflare, NÃO Google Cloud DNS).
- Repo único: proteinaludica/com — fonte para todos os projectos Vercel.
- criar.proteinaludica.com serve criar-app/index.html via Root Directory na Vercel.
- Stack: Vercel + Supabase EU + Resend + Stripe + IfthenPay. Sem Cloud Run.

## Modelo de negócio (nunca misturar)
- Linha 1 B2B: produtos prontos (pagamento avulso/contrato).
- Linha 2 B2B2C: subscrição mensal (Dr. <nome> IA personalizável).
- Wizard genérico: pagamento único, qualquer profissão.

## Validação
- QA visual: usar sempre o alias mutável do Vercel, nunca o link de inspector/snapshot.
- Texto final em PT-PT: apresentar em bloco de código para validação externa (AMÁLIA)
  antes de qualquer implementação.
