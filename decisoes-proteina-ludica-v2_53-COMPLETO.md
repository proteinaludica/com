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
