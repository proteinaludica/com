# DECISÕES PROTEÍNA LÚDICA · v2.53 · 20 Julho 2026
Substitui: v2.52, v2.45. Fonte única de verdade — compilado em chat (Claude Code não acede a Project Knowledge).

---

## RESUMO ACUMULADO

**Sessão 1 (19 Jul):** Especificação completa do tier Pro (49€) — modelo, prompts, copy, avisos, plano técnico.

**Sessão 2 (20 Jul):** Confirmação de que wizard genérico já estava 100% completo (16 secções); remoção de secção órfã (#72); hotfix RGPD (#73); contador dinâmico implementado.

**Esta sessão:** Mesclagem de especificação Pro com estado actual do repo.

---

## [DEC-01] Correcção de memória: as 17 secções estão TODAS implementadas
Investigação no repo confirmou que as secções 06, 07, 09, 10, 12, 14, 15 e 17
existem no ficheiro. A entrada anterior de "9 secções em falta" estava errada.
**Actualização:** secção 09 ("Protocolo de reconhecimento") removida em PR #72 por ser órfã.
Wizard passa de 17 para **16 secções** (renumeradas). Estado confirmado em produção.

## [DEC-02] Achado crítico: o tier Pro (49€) não entrega nada (ANTES DE IMPLEMENTAÇÃO)
Investigação confirmou que Pro e Kit partilham o mesmo fluxo pós-pagamento.
`state.tier` não é enviado ao backend. Os painéis "Pro" contêm texto estático
hardcoded, sem qualquer chamada a API de IA. Cobra 30€ a mais por
funcionalidade inexistente. **Não pode chegar a produção com tráfego real.**

## [DEC-03] Decisão: implementar o Pro a sério (opção D)
Rejeitadas: retirar o chip, lista de espera, serviço humano.

## [DEC-04] Fluxo escolhido
1 geração gratuita → paywall → acesso completo no patamar Pro (após pagamento).
Escolhido porque o utilizador experimenta o valor antes de pagar.
**Detalhe do fluxo final:**
Preencher (obrigatórios 01,02,13,14,16)
→ clica Pro num campo opcional
→ gera 1 amostra (grátis, contexto acumulado)
→ mostra resultado + paywall
→ paga 49€ (JWT emitido, state.tier='pro')
→ volta a Preencher com Pro activo
→ preenche resto com IA (5 gerações/campo)
→ clica "Gerar assistente" no ecrã 4
→ PDF para download + email enviado
→ ecrã 6 (Sucesso)

## [DEC-05] Especificação técnica fechada (ACTUALIZADO 20 Julho 2026)

| Item | Valor |
|---|---|
| Modelo | `claude-sonnet-5` |
| Grátis | 1 geração por sessão · rate-limit 3 por IP por dia |
| Pago | 5 gerações por campo · **sem tecto global** |
| Total máximo | 100 gerações (20 campos × 5) |
| Contexto | Todos os campos preenchidos, truncado a 8000 caracteres |
| Endpoint | `/api/assistir-campo` |
| Gating | JWT emitido pelo backend após pagamento |
| Custo máximo | ~0,58€ por cliente pago |
| Margem em 49€ | 98,8% |
| API key | Já obtida; `ANTHROPIC_API_KEY` a configurar no painel Vercel |

## [DEC-06] Arquitectura de prompts: 4 famílias + orientação por campo
Rejeitados: prompt único (qualidade insuficiente) e 17 prompts (risco de deriva das regras PT-PT).

**Família A · Identidade:** `f-nome` (25), `f-missao` (25), `f-publico` (45), `f-contexto` (45)

**Família B · Comportamento:** `f-tom` (45), `f-linguagem` (50), `f-estilo` (55), `f-onboarding` (60), `f-behaviour` (45), `f-tarefas` (70), `f-fecho` (35), `f-continuidade` (55)

**Família C · Restrições:** `f-redline` (50), `f-emerg` (45), `f-fontes` (40), `f-dados` (55)

**Família D · Estrutura:** `f-conhecimento` (80), `f-code` (5), `f-exit` (3)

Números entre parênteses = máximo de palavras.

## [DEC-07] Critérios de aceitação (8)
1. PT-PT, terceira pessoa impessoal — zero "tu", "você", "pode", "clique"
2. Não contradiz campos já preenchidos
3. Não afirma factos não constantes do contexto
4. Sem superlativos nem marketing
5. Sem markdown, aspas envolventes, preâmbulo ou comentário
6. Dentro do limite de palavras
7. Zero linguagem clínica, salvo se a profissão o for
8. Utilizável sem edição obrigatória

Verificáveis por código: 1, 5, 6, 7 → validador.
De julgamento: 2, 3, 4, 8 → prompt.

## [DEC-08] Comportamento ao regenerar
**Acumulam** (papel protector): `f-redline`, `f-emerg`, `f-fecho`, `f-fontes`, `f-dados`.
**Substituem**: os restantes 15.
`f-fecho` acumula por sustentar o escudo regulatório ("a decisão final é do profissional").

## [DEC-09] Aviso de contradição
Quando o contexto se contradiz, a resposta inclui aviso que **nomeia as secções em conflito** (pode ser mais do que uma). Aparece por baixo do campo.

## [DEC-10] Requisitos de segurança e robustez
- Output inserido sempre como texto, nunca como HTML
- Nunca reproduzir dados pessoais presentes no contexto (NIF, nomes, moradas)
- Resistir a injecção de instruções embutidas nos campos
- Nunca sobrepor texto existente sem confirmação
- Falha de API: botão restaurado, texto intacto, geração não contada
- Retry automático único se o validador rejeitar
- Prompt da família Restrições: proibição explícita de atribuir juízo à máquina

## [DEC-11] Copy validada e avisos (ACTUALIZADO 20 Julho 2026)

**Avisos:**

| # | Quando | Texto |
|---|---|---|
| 1 | Contradição detectada | `Nota: este campo pode estar em conflito com o que foi indicado em Voz e tom. É favor rever.` |
| 2 | Obrigatório com contexto escasso | `Este campo determina os limites do assistente. É favor rever e ajustar.` |
| 3 | Ajuda gratuita esgotada | `A ajuda gratuita já foi utilizada. O patamar Pro dá acesso à ajuda da IA em todos os campos.` |
| 4a | 4ª geração do campo | `Última tentativa para este campo.` |
| 4b | 5ª geração do campo | Botão desactivado (cinzento, não clicável) |
| 5 | Erro de geração | `Não foi possível gerar o texto para este campo. É favor tentar de novo dentro de momentos.` |
| 6 | Campo já preenchido | `Este campo já tem texto. Substituir conteúdo?` |

**Textos validados (PT-PT):**

Nota: este campo pode estar em conflito com o que foi indicado em Voz e tom. É favor rever.

Este campo determina os limites do assistente. É favor rever e ajustar.

A ajuda gratuita já foi utilizada. O patamar Pro dá acesso à ajuda da IA em todos os campos.

Última tentativa para este campo.

Não foi possível gerar o texto para este campo. É favor tentar de novo dentro de momentos.

Este campo já tem texto. Substituir conteúdo?

✨ A IA ajuda a preencher o campo.

✨ A IA ajuda a preencher todos os campos · Pro · 49€

Primeira ajuda usada. A IA já preencheu um campo. Para que a IA ajude em todos os restantes, o patamar Pro dá acesso completo.

Inclui tudo do Kit completo, bem como a ajuda da IA em cada campo do formulário. Até 5 tentativas por campo.

49€ (pagamento único)

A escrever...

## [DEC-12] Plano de implementação — 6 passos
1. ✅ Especificação e copy (concluído)
2. ⬜ Instruções dos 4 grupos de prompt — **chat**
3. ⬜ PR 1 — endpoint `/api/assistir-campo` + validador — Claude Code
4. ⬜ PR 2 — UI: botão, estados, regenerar, paywall — Claude Code
5. ⬜ PR 3 — gating: `state.tier` no checkout, JWT Pro — Claude Code
6. ⬜ QA na preview + teste de quebra deliberado — Chrome

PRs separadas porque a PR 1 é testável por curl e a PR 3 toca no pagamento.

---

## RESUMO DA SESSÃO 2 (20 Julho 2026)

**Objectivo:** completar as 9 secções do wizard genérico dadas como "em falta".

**Achado:** TODAS as secções já existiam no repo com conteúdo mais rico que a spec.
Spec (`17-seccoes-generico-LIMPO.md`) estava desactualizada, não o código.

**Trabalho real executado:**

**PR #72 (merged, `6736ece`):** Remoção da secção 09 "Protocolo de reconhecimento" — funcionalidade órfã, incompatível com modelo B2C do wizard genérico. Wizard: 17 → **16 secções**. Renumeração completa (IDs, índice, badges, contadores).

**Regressão:** remoção de #72 apagou `#rgpdWarn` por engano (estava fisicamente na sec-09 mas era global). Resultado: `TypeError` em produção a cada tecla.

**PR #73 (merged, `6202d80`):**
1. Contador dinâmico de secções — `IntersectionObserver` + listener no índice
2. Hotfix: `#rgpdWarn` reposto num local global

**QA confirmada:** 16 secções, todas com conteúdo, chip Pro incluído, zero erros de consola.

---

## ESTADO ACTUAL DO REPO

- **main:** `6202d80`
- **Wizard genérico:** 16 secções, 100% completo + chip Pro
- Ambos projectos Vercel (`web`, `criar`) — Ready

---

## PRÓXIMO PASSO — PASSO B: Pricing UI mockup

Preço já definido (não mudou):
- 0€ — só o prompt final, sem ajuda de IA
- 19€ — kit = prompt + guia de instalação PDF específico da plataforma
- 49€ — chip Pro (IA ajuda a preencher campos em tempo real) — **já existe na UI**
- 290€ — "entramos em contacto", sem preço fixo, seguimento humano

**Por implementar:** o ecrã de escolha de tier (visual, mockup — sem Stripe/IfthenPay ainda nesta fase). Não confundir com o modelo de subscrição mensal B2B2C da Linha 2 (Dr. Família IA) — são fluxos de pricing completamente separados.

---

## GUARDRAILS (inalterados, reforçados)

- Repo é a verdade — grep sempre antes de assumir
- `git log origin/main` (fetch primeiro!) antes de testar produção
- Ao remover blocos: grep pelos `id`s internos antes, para apanhar dependências globais
- PRs pequenas, single-topic
- QA final sempre em browser real / alias mutável Vercel, nunca só em bytes locais

---

## APRENDIZAGENS

- Deployment Protection da Vercel bloqueia QA pela extensão Chrome; link de bypass exige sessão de browser.
- Relatórios de ferramentas podem alucinar arquitectura (extensão diagnosticou "loop em useEffect" num HTML estático).
- Memória do Project Knowledge pode estar errada — grep sempre.
- Elementos globais fisicamente dentro de blocos de secção são armadilhas em remoções — grep antes.

---

## Próxima sessão

Retomar no **passo 2 de 6:** escrever as instruções dos quatro grupos de prompt.

Confirmar que os 20 ids de campo em [DEC-06] correspondem ao ficheiro actual.

Especificação e copy já fechadas — não reabrir.
