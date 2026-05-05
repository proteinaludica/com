# Proteína Lúdica — Registo de Decisões v2.6.1

> Memória viva do projecto. Anexar a novos chats para arranque sem ruído.
> **Última actualização:** 5 Maio 2026 — bloqueador 21 resolvido. `index.html` deste repo é agora a landing institucional alinhada v2.5. O Dr. Escriba IA workspace e o `internato-fase1.patch` foram removidos (a versão produtiva do Dr. Escriba IA vive no repo `drescribia`).
>
> **Este ficheiro substitui o `decisoes-proteina-ludica.md` anterior.**

---

## Contexto

**Empresa:** Proteína Lúdica, Lda.
**Sede:** Seixal, Região Autónoma da Madeira.
**Fundador:** Roberto Gouveia, médico.
**Domínio:** `proteinaludica.com`.

**Natureza:** healthtech madeirense. Secretários digitais IA **não-clínicos**, para profissionais. Preferência declarada: poucos produtos bem feitos.

---

## Regras absolutas (intocáveis)

1. **Nunca misturar a DRC do Roberto com a marca Proteína Lúdica.** A história pessoal não entra na narrativa pública da empresa.
2. **Nunca identificar a Dra. Mónica Armas.** O caso dela é privado. Pode ser usado como prova social apenas de forma anónima ("radiologista sénior especializada em patologia da mama"), nunca com o nome.
3. **Posicionamento legal:** não-clínico, não-dispositivo médico. Não substitui avaliação médica, diagnóstico ou prescrição.
4. **RGPD EU-only.** DPA com todos os subcontratantes. Consentimento explícito. Zero-retention nos LLMs.

---

## Vocabulário público — CRÍTICO

Testes com médicos amigos em Abril 2026 mostraram que vocabulário técnico **não passa**. Regra fundamental:

**Usar SEMPRE:** "secretário digital"
**Nunca usar em público:** "agente IA", "assistente digital IA", "LLM", "plataforma", "system instructions", "prompt"

| Antes (técnico) | Depois (público) |
|---|---|
| "agente IA" | **"secretário digital"** (metáfora central) |
| "onde vive o agente" | "que ferramenta vai usar" |
| "LLM / plataforma" | "ferramenta" (raramente mencionado) |
| "system instructions" | "configuração" |
| "17 secções" | "17 perguntas" |
| "template" | "modelo pronto" |

### Registo de tratamento (regra escrita)

**Em escrita pública usa-se 3.ª pessoa singular impessoal.** É o registo formal padrão dos sites institucionais portugueses (gov.pt, CGD, Ordem dos Médicos, IEFP, formulários do IRN). Pronome de 2.ª pessoa **omitido**; verbo na 3.ª p.s. fala directamente ao leitor sem o nomear.

| Forma | Uso |
|---|---|
| Imperativo singular | acções: *"indique"*, *"preencha"*, *"seleccione"*, *"carregue"* |
| *"deverá"* + infinitivo | obrigações |
| *"pode"* + infinitivo | opções |
| *"se pretender"*, *"caso"*, *"para"* | condicionais |
| Possessivos *"seu / sua"* | neutros de género — usar livremente |

**Não usar em escrita pública:**
- *"você"* — soa brasileiro em PT-PT escrito (é forma oral)
- *"o senhor" / "a senhora"* — antiquado e marcado em género
- *"tu"* — informal demais para o registo

**Exemplos concretos:**
- ❌ *"Você pode parar e voltar mais tarde"* → ✅ *"Pode parar e voltar mais tarde"*
- ❌ *"O senhor já usa esta ferramenta?"* → ✅ *"Já usa esta ferramenta?"*
- ❌ *"para o senhor não ficar parado"* → ✅ *"para não ficar parado"*
- ❌ *"sem o senhor ter de pedir"* → ✅ *"sem ser preciso pedir"*
- ❌ *"uma IA conversa consigo"* → ✅ *"uma IA acompanha o preenchimento"*

**Tom público:** explicação a alguém de 70 anos. Frases curtas. Palavras de rua. Metáforas concretas. Mas tudo isto **em escrita formal portuguesa** — nunca em registo oral disfarçado.

**Excepção — primeira pessoa do Roberto:** quando o Roberto Gouveia fala em nome próprio nos materiais ("conversar 1 hora comigo", "Pedir chamada comigo"), usa-se a 1.ª pessoa naturalmente. Não é tratamento do leitor.

**Tagline central:** *"Um secretário digital que escreve por si."*

O termo "agente IA" só existe no vocabulário técnico interno (backoffice, documentação para devs, conversas Roberto-Claude).

---

## Arquitectura de negócio

Três segmentos distintos.

### A — Saúde · Produtos prontos (catálogo)

Secretários digitais estandardizados por especialidade. Nomes públicos simplificados.

| Secretário | Público | Estado |
|---|---|---|
| **Dr. Escriba** | Médicos de família + urgência | Disponível (1€/dia) |
| **Dr. Escriba · Internato** | Internos de especialidade (MGF) | **Fase 1 implementada (3 Maio 2026)** — modo dentro do Dr. Escriba IA via toggle SOAP/Internato; tabs Logbook · Avaliações · Diário · Journal Club; rubricas OM (Mini-CEX/DOPS/CbD/MSF) funcionais; restantes 3 tabs em Fase 2 |
| **Assistente de Clínica** | Clínicas privadas pequenas | Piloto no Funchal |
| **RehabAssist** | Fisiatras + doentes em casa | A ser construído |
| **Assistente de Saúde** | Pessoas com doenças crónicas | Em breve |

**Modelo de preço do catálogo:** ainda não decidido. Decisão adiada até haver dados de 3-5 pilotos reais.

### B — Secretários digitais à medida

**Estrutura confirmada em Abril 2026 — duas pirâmides paralelas:**

#### B.1 · Individual (um profissional, um secretário)

| Nível | Preço | O que inclui | Para quem |
|---|---|---|---|
| **Grátis** | 0€ | System prompt gerado · sem instruções de instalação · captura email | Curiosos, marketing |
| **Básico** | 19€ | System prompt + guia de instalação manual na plataforma | Quem já percebe de computadores |
| **Premium** | 49€ | Tudo do Básico + IA conversa para ajudar a preencher as 17 perguntas | Quem não é técnico mas prefere self-service |
| **Assistido** | 290€ (Madeira) / 490€ (normal) | Roberto 1h de chamada + ficha preenchida + 14d suporte email | Quem quer ajuda humana |

**Preço Madeira introdutório** (tier Assistido): para os primeiros 10 clientes locais. Depois volta ao preço normal.

#### B.2 · Equipa (empresa ou grupo de profissionais)

| Nível | Preço | O que inclui | Para quem |
|---|---|---|---|
| **Equipa** | 990€ *(provisório)* | Secretário "mãe" com regras comuns + versões por papel (ex: médico, enfermeira, recepção). Qualquer profissão — não é só saúde. | Clínicas, escritórios, gabinetes |

**IMPORTANTE — preço 990€ é provisório.** A arquitectura "mãe + papéis" é tecnicamente mais complexa que um secretário individual. Esforço real pode justificar 1.990€ a 2.990€. **Decisão final adiada até ter o primeiro cliente-piloto real** para calibrar tempo de trabalho.

**Questões em aberto do tier Equipa:**
- Número de pessoas que cabem no pacote base (ainda não definido)
- Número de papéis incluídos vs cobrados à parte
- Modelo de actualização quando o "mãe" muda (quem paga manutenção?)
- Adaptação a plataformas multi-utilizador (Copilot M365 vs Claude Projects vs Gemini Gems)

**Questão em aberto comum a individual e equipa:** distinguir ou não o **número de secções** entre tiers. Hipótese em cima da mesa: 19€ usa versão reduzida de 7-9 secções core, 49€ usa as 17 completas. Decisão adiada — *decidimos depois de ver o protótipo do wizard actualizado*.

### C — Alojamento local (segmento secundário)

**C.1 — Casa da Albertina** (Seixal / Porto Moniz). Não central. Página discreta no footer do site.
**C.2 — Vertical futuro** (agentes IA para outros donos de AL). Lançamento previsto Q4 2026 / 2027.

### D — Rede não-saúde (teaser 2027)

Advogados, arquitectos, engenheiros, contabilistas, notários. **Roberto tem contactos reais** em algumas destas áreas (engenharia civil, arquitectura, herdeiros). Decisão pendente: teaser vago ("em breve 2027") **ou** anunciar parcerias já em negociação.

**Decisão em Abril 2026:** manter teaser vago por agora. Parcerias reais acelerariam o timeline para 2026 e não é prioridade.

---

## Wizard /criar — arquitectura

### Entrada
- URL: `proteinaludica.com/criar` (dentro do site principal, não subdomínio)
- Aberto a qualquer visitante sem login
- Serve segmento B.1 (individual). O segmento B.2 (equipa) usa contacto directo, não wizard.

### Fluxo do wizard (a refazer após auditoria de Abril 2026)

**O wizard `/criar` serve o segmento B.1 (individual).** O segmento B.2 (Equipa, 990€ provisório) **não usa o wizard self-service** — é sempre um processo humano liderado pelo Roberto, dada a complexidade da arquitectura "mãe + papéis".

**Passo 0 (a criar):** página tradutor — explica em 60 segundos o que é um secretário digital, com linguagem acessível. Ponte de entrada para quem chega sem saber. No fim oferece dois caminhos: "Para si" (continua no wizard) ou "Para a sua equipa/clínica" (vai directo para contacto B.2).

**Passo 1:** escolha de plataforma — 7 cards (Claude Projects · ChatGPT Custom GPTs · Google Gemini Gems · Microsoft Copilot Agents · Perplexity Spaces · Mistral Le Chat · Outro). Botão "Responder a 3 perguntas e receber recomendação" abre quiz.

**Passo 2:** ponto de partida — clonar do catálogo OU template em branco de 17 secções.

**Passo 3:** preenchimento — 17 secções, uma por ecrã, barra de progresso, exemplo real anonimizado ao lado, detector RGPD inline, save state localStorage.

**Passo 4 (Grátis 0€):** apenas o system prompt gerado em caixa de código + botão *Copiar*. **Sem guia de instalação.** Banner de upgrade para 19€ (Básico) e 49€ (Premium).

**Passo 5 (Básico 19€):** paywall. Adiciona guia de instalação específico da plataforma + PDF formatado + checklist RGPD + template consentimento doentes.

**Passo 6 (Premium 49€):** alternativo ao 19€. IA conversacional ajuda a preencher as 17 secções durante o Passo 3. Output igual ao Básico mas com preenchimento guiado.

**Ponte para humano (Assistido 290€):** botão permanente em todos os passos — "Prefere que façamos por si?" — redirecciona para formulário de contacto.

### Saída do agente ("agente completo")

Para cada plataforma, a saída inclui **todos os componentes necessários** para criar o agente, não apenas o prompt:

| Componente | Gemini Gems | Custom GPT | Claude Projects | Copilot Agents |
|---|---|---|---|---|
| Título / Nome | ✓ | ✓ | ✓ | ✓ |
| Descrição curta | ✓ | ✓ | — | ✓ |
| System prompt (Instructions) | ✓ | ✓ | ✓ (Project Instructions) | ✓ |
| Ficheiros a anexar | ✓ | ✓ (Knowledge) | ✓ (Knowledge) | ✓ |
| Conversation Starters | — | ✓ | — | — |
| Topics | — | — | — | ✓ |
| Prompts de teste | ✓ (gerados) | ✓ (gerados) | ✓ (gerados) | ✓ (gerados) |

### Pagamento
- **Stripe** para cartão (activação imediata)
- **MB WAY via IfthenPay** (activação quando contrato estiver aprovado, 1-2 semanas)
- Reembolso 7 dias sem perguntas

---

## 17 secções da estrutura do agente

Organizadas em 4 blocos:

**Bloco 1 — Identidade:** 1. Nome e propósito · 2. Missão · 3. Público-alvo · 4. Contexto local
**Bloco 2 — Personalidade:** 5. Voz e tom · 6. Linguagem · 7. Estilo de resposta
**Bloco 3 — Funcionamento:** 8. Onboarding · 9. Protocolo de reconhecimento · 10. Tarefas específicas · 11. Fontes oficiais · 12. Conhecimento técnico
**Bloco 4 — Segurança e fecho:** 13. Red lines · 14. Alertas de emergência · 15. Tratamento de dados · 16. Fecho dinâmico · 17. Continuidade

**5 obrigatórias mínimas:** 1 (nome), 2 (missão), 13 (red lines), 14 (emergências), 16 (fecho).

**Exemplo completo preenchido** existe no ficheiro `17-seccoes-exemplo.html` (Dr. Roberto IA), e nos 4 ficheiros de demonstração da pasta `outputs/` (mesmo conteúdo, formatado por plataforma).

**Decisão (5 Maio 2026):** as 17 secções ficam como estrutura única em todos os tiers. Ver secção *"Decisão sobre número de secções"* para racional completo. Reabrir só se a validação com médicos mostrar abandono por excesso de perguntas.

---

## Stack técnica (decidida)

**Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind v4.
**Deploy:** Vercel.
**Backend/DB:** Supabase EU.
**CDN:** Cloudflare.
**Pagamentos:** Stripe + IfthenPay (MB WAY/Multibanco PT).
**LLM Gateway:** Gemini (Vertex EU) / Claude / GPT, zero-retention.
**Processamento:** stateless. PDF in → PDF out. Link 24h.

**Domínios:**
- `proteinaludica.com` — home institucional
- `proteinaludica.com/criar` — wizard (dentro do site principal)
- `drescribaai.proteinaludica.com` — ficha Dr. Escriba (existente)
- `drescriba-internato.proteinaludica.com` — ficha Internato (pendente)
- `rehabassist.proteinaludica.com` — ficha RehabAssist (pendente)
- `gestordesaude.proteinaludica.com` — ficha Assistente de Saúde (pendente)
- `ajuda.proteinaludica.com` — ficha Assistente de Clínica (pendente)
- `app.proteinaludica.com` — reservado futuro (auth/dashboard)

**Identidade visual:**
- Direcção: Clínico-Tech (híbrido)
- Paleta Laurissilva Digital: verde musgo `#8FAA6B` + ocre `#C8A86B` sobre `#0B0E0C`
- Tipografia: Fraunces (serifa) + Geist (sans) + Geist Mono
- Logotipo e símbolo próprio: pendente

---

## Ficheiros já gerados

| Ficheiro | Estado (5 Maio 2026 · v2.6.1) | Notas |
|---|---|---|
| `index.html` | **Alinhado v2.5 · landing institucional** | Landing institucional (914 linhas). Pirâmide Individual 0/19/49/290€ + Equipa 990€ separada, vocabulário "secretário digital", 3.ª p.s. impessoal, paleta Laurissilva, FAQ 6 perguntas, Rede 2027. Era `index-institucional.html` até v2.6; renomeado e a substituir o workspace Dr. Escriba IA na resolução do bloqueador 21 (5 Maio 2026). |
| `wizard-criar.html` | **Alinhado v2.3** | 7 passos navegáveis (0-6), tradutor inicial, escolha de plataforma com quiz, detector RGPD, paywall diferenciado por tier, floating help para Assistido 290€. Auditoria de jargão (Abril 2026) e reescrita em 3.ª pessoa singular impessoal. |
| `outputs/gemini-gems.html` | **v2.5 · Maio 2026** | Demonstração 1/4 da saída do wizard. Plataforma Google Gemini Gems. 6 secções (3 Grátis + 3 Básico). 861 linhas. |
| `outputs/custom-gpt.html` | **v2.5 · Maio 2026** | Demonstração 2/4. Plataforma ChatGPT Custom GPTs. 7 secções (4 Grátis + 3 Básico) com Conversation Starters + nota Capabilities. 989 linhas. |
| `outputs/claude-projects.html` | **v2.5 · Maio 2026** | Demonstração 3/4. Plataforma Claude Projects. 5 secções (mais enxuta — sem Description, Conversation Starters ou Capabilities; destaque para privacidade por defeito). 852 linhas. |
| `outputs/copilot-agents.html` | **v2.5 · Maio 2026** | Demonstração 4/4. Plataforma Microsoft Copilot Agents. 7 secções com 4 Topics (frases-gatilho clicáveis) + Actions Power Automate sugeridas. 1055 linhas. |
| `17-seccoes-exemplo.html` | **Alinhado** (vive fora deste repo) | Exemplo completo Dr. Roberto IA (Ponta Delgada, código `med46316`, 8 etapas onboarding, red lines), TOC sticky, componentes do "agente completo" |

**Item 2 do roadmap concluído:** os 4 ficheiros de demonstração da saída do wizard estão prontos. Servem para validar formato com médicos antes de codificar o produto real em Next.js.

**Bloqueador 21 resolvido (5 Maio 2026 · v2.6.1):** o `index.html` deste repo é agora a landing institucional. O workspace Dr. Escriba IA + Fase 1 Internato e o ficheiro `internato-fase1.patch` foram removidos. A versão produtiva do Dr. Escriba IA vive no repo separado `drescribia`. Quando este repo for apontado a Vercel (`proteinaludica.com`), serve a landing certa. O Dr. Escriba IA continua a viver em `drescribaai.proteinaludica.com` apontado ao seu repo próprio.

---

## Fluxo de trabalho no Claude (meta)

Como organizar o trabalho entre chats e manter este ficheiro como única fonte de verdade.

### Três camadas de memória

1. **Ficheiros do projecto** (`decisoes-proteina-ludica.md`, `Dr_Robert_IA_Google_Gemini.pdf`) — acompanham todos os chats automaticamente. Verdade oficial.
2. **Chats** — sessões descartáveis. Não partilham contexto entre si.
3. **`conversation_search`** — procura cruzada em chats antigos (mesmo arquivados). Por isso arquivar é quase sempre melhor que apagar.

### Rotina por sessão (obrigatória)

1. Abrir chat novo
2. Primeira mensagem: objectivo em 2-3 linhas (o `decisoes.md` já está anexo)
3. Trabalhar
4. No fim: pedir actualização do `decisoes.md` com nova versão no changelog
5. Descarregar ficheiro actualizado e fazer upload ao projecto (substitui o anterior)
6. Arquivar o chat

### Convenção de nomes dos chats

Prefixo por categoria para tornar a lista lateral legível:

- `[DEC]` — chats de decisão (preços, posicionamento, regras). Output: actualização do `decisoes.md`
- `[PROD]` — chats de produção (HTMLs, contratos, emails, scripts). Output: ficheiros descarregáveis
- `[EXP]` — chats de exploração sem compromisso. Descartáveis
- `[DRESC]`, `[REHAB]`, `[SAUDE]`, etc. — chats específicos de um produto do catálogo

### Arquivar vs apagar

- **Arquivar por defeito.** Tira da lista principal, mantém `conversation_search` activo, recuperável.
- **Apagar** só depois de confirmar que qualquer artefacto útil está descarregado localmente e que a decisão relevante já está no `decisoes.md`.

### Backup local recomendado

Pasta `~/proteinaludica/` no computador do Roberto com subpastas:
- `html/` — versões dos 3 HTMLs por data
- `decisoes/` — histórico de versões do `decisoes.md` (v1.0, v2.0, v2.1, v2.2…)
- `contratos/`, `pdf/`, `scripts/` — à medida que aparecerem

Os chats no Claude podem desaparecer por qualquer motivo técnico; a pasta local é o único seguro verdadeiro.

---

---

## Próximos passos imediatos (ordem)

1. ~~Actualizar `index.html` com estrutura de 5 níveis de preço na secção #medida.~~ ✅ **Feito (21 Abril 2026, refinado v2.5 — 3 Maio).**
2. ~~**Criar ficheiro de demonstração** da saída completa do wizard para o Dr. Roberto IA em cada plataforma (Gemini Gems, Custom GPT, Claude Projects, Copilot Agents).~~ ✅ **Feito (5 Maio 2026, v2.5).** Pasta `outputs/` com os 4 ficheiros — ver tabela acima.
3. ~~Refazer `wizard-criar.html` com nova linguagem ("secretário digital"), 5 níveis de preço, paywall com 3 saídas distintas.~~ ✅ **Feito (21 Abril 2026, refinado v2.3 — 26 Abril).**
4. ~~**Decidir número final de secções** (17 vs 7-9 core).~~ ✅ **Decidido v2.6 (5 Maio 2026): manter as 17 secções como estrutura única.** Reavaliar apenas após validação com médicos. Razões registadas na secção *"Decisão sobre número de secções"* abaixo.
5. **Testar wizard + ficheiros de demonstração** com 3-5 médicos amigos que não perceberam a V1 (preferencialmente os mesmos, para comparar). Protocolo registado na secção *"Protocolo de validação com médicos (Maio 2026)"*. **Próximo passo prioritário.**
6. **Produção de vídeo/áudio/imagens** (pausada, retomar quando homepage e wizard estiverem validados com utilizadores reais).
7. **Desenvolvimento Next.js** do wizard real (só depois da validação HTML com médicos).

---

## Divisão de trabalho Roberto / Claude

**Roberto faz:**
- Responder em 24h a quem contactar
- Assinar contratos
- Cara pública da empresa
- Conversa de 1h no Assistido individual (290€)
- Projectos de Equipa (990€ provisório): negociação, descoberta das regras comuns, definição de papéis, instalação na clínica/escritório

**Pitch de 1 frase (decorar):**
> *"Faço secretários digitais para profissionais. Escrevem as notas por eles. Eu faço a parte difícil, eles só usam. Trabalho com médicos, advogados, clínicas — qualquer profissão com muita papelada."*

**Claude faz (através do Roberto):**
- Toda a parte técnica (estrutura das 17 secções, blocos de configuração, setup)
- Toda a parte comercial escrita (landing, emails, FAQ, scripts, contratos)
- Preparação de respostas a objecções
- Apoio em conversas do Assistido (redacção pós-chamada)
- Arquitectura "mãe + papéis" para tier Equipa (desenho e geração dos múltiplos secretários)

---

## Princípios transversais do produto

- Não-clínico, não-dispositivo médico
- Stateless. PDF in → PDF out. Link 24h
- Zero dados clínicos no servidor
- EU-only. DPA com subcontratantes
- Pseudonimização obrigatória (iniciais + idade)
- Nunca aceita: nome completo, nº utente, nº processo, data nascimento, morada
- RGPD aplicado desde o design

---

## Decisão sobre número de secções (5 Maio 2026)

**Decisão: manter as 17 secções como estrutura única em todos os tiers.** A diferenciação por preço fica na entrega (ficheiros · prompts · guia · IA a guiar), não no número de secções. Reavaliar apenas após validação com médicos.

### Por que 17 e não 7-9 (frameworks consagradas)

Os 4 ficheiros de demonstração construídos em Maio 2026 mostraram que cada secção tem propósito visível e nenhuma é redundante:

| Bloco | Secções | Por que cada uma é necessária |
|---|---|---|
| **Identidade** | 1-4 | Sem isto o secretário fica genérico — perde o "tempero" madeirense (contexto local), o público-alvo definido |
| **Personalidade** | 5-7 | Voz/tom/estilo são diferenciadores fortes — secretário pedagógico vs secretário robótico |
| **Funcionamento** | 8-12 | Onboarding em 8 etapas + protocolo de reconhecimento + tarefas específicas + fontes oficiais — o que faz o secretário **funcionar bem** |
| **Segurança e fecho** | 13-17 | Red lines + emergências + RGPD + fecho dinâmico + continuidade + integração local + limite de turno + registo interno — o que faz o secretário **ser usado em saúde com segurança** |

### Argumentos a favor de manter 17

1. **Frameworks 6-9 são para LLM apps genéricas.** Os secretários da Proteína Lúdica são especializados — red lines clínicos, RGPD reforçado, protocolo de reconhecimento. Precisam dos 17.
2. **Manter duas versões do questionário (Básico 7-9 vs Premium 17) seria pesadelo de manutenção.** Duplicaria todo o conteúdo do wizard, dos ficheiros de demonstração e das fichas dos secretários do catálogo.
3. **A diferenciação por preço já está bem definida na entrega.** Ver tabela de tiers Individual em "Arquitectura de negócio".
4. **Especialização é a vantagem competitiva.** Reduzir para 7-9 aproximaria a Proteína Lúdica de qualquer ferramenta de criação de Custom GPTs — apaga o diferencial.

### Quando reabrir

- Se na validação com médicos (item 5 dos próximos passos) **4/5 disserem que são demasiadas perguntas e abandonam**, reduzir para versão core de 9 (manter 5 obrigatórias mínimas + adicionar 4 para cobrir saúde de forma minimamente segura: 3 Público-alvo, 8 Onboarding, 11 Fontes, 15 Integração local).
- Se **2/5 ou menos** abandonarem por excesso de perguntas, manter 17 e considerar melhorias na UX do wizard (auto-save mais visível, indicador de progresso, possibilidade de saltar e voltar).

### Histórico

- v2.0 (Abril 2026): 17 secções definidas como estrutura.
- v2.5 (3 Maio 2026): hipótese aberta de reduzir para 7-9 core no tier Básico.
- v2.6 (5 Maio 2026): decidido manter 17. Hipótese de redução adiada para depois da validação real com médicos.

---

## Arquitectura plataforma — racional

A Proteína Lúdica opera **dois modelos paralelos**, decisão deliberada:

| Modelo | Onde vive | Segmentos | Porquê |
|---|---|---|---|
| **Plataforma própria** | App/PWA da Proteína Lúdica (ex: Dr. Escriba IA · SOAP v8.0) | Catálogo (A) | Volume justifica; UI portuguesa; controlo da experiência; ditado e features clínicas |
| **Plataformas terceiras** | Claude Projects, ChatGPT Custom GPTs, Gemini Gems, Copilot, Perplexity, Mistral, Universal | À medida — Individual (B.1) | Custos LLM recaem no cliente; stateless verdadeiro; venda única (19€/49€/290€) |

### Porque o "à medida" não é plataforma própria

- **Custos de LLM** — chamar APIs directamente custa ~0,01-0,05€ por nota. 200 notas/mês × cliente pode passar 30€. Receita única de 19€/49€ não cobre. Plataformas terceiras cobram ao próprio cliente
- **Princípio stateless** — *"Zero dados clínicos no servidor"* (regra absoluta). Plataforma própria com persistência colide
- **Compliance** — empurrar para plataforma terceira transfere parte do consentimento e da responsabilidade para o utilizador
- **Time-to-market** — wizard a gerar configuração lança em semanas; app própria com SOAP/ditado/histórico leva meses
- **Modelo de receita** — *"à medida"* é venda única, não subscrição. Faz sentido para arquitecto, advogado, contabilista que quer um secretário só dele e fica com ele

### Posição estratégica

A Proteína Lúdica **não vende tecnologia LLM** (commodity da Anthropic/OpenAI/Google) **nem é dona dos dados** (ficam com o profissional). Vende **conhecimento aplicado** — saber traduzir 17 perguntas + caso real numa configuração que faz o agente comportar-se como secretário fiável.

Defensável a longo prazo:
- LLMs vão baratear → margem do "à medida" melhora sem fazer nada
- Plataformas vão multiplicar-se → o expert que sabe gerar configuração para todas continua útil
- Propriedade intelectual real está nas **17 secções + exemplos preenchidos + metodologia**, não no código

### Quando reavaliar

Manter os dois modelos como estão até:
1. **Primeira venda Equipa real (990€)** — aí avaliar se gateway próprio (`app.proteinaludica.com` como router para LLMs) faz sentido para esse tier. Adiado para o fim do roadmap actual
2. **Cliente com pedido de integração clínica** (SClínico, ALERT, Glintt) — plataforma terceira não chega
3. **Padrão repetido em 5+ clientes "à medida" do mesmo nicho** — promove-se a catálogo (ex: *Dr. Defensor* para advogados). Janela: 6-12 meses após primeiros pilotos

### Riscos macro a vigiar

| Risco | Probabilidade | Mitigação |
|---|---|---|
| OpenAI / Anthropic apertarem ToS para uso clínico | Média | Diversificação entre 7 plataformas; configuração é portátil |
| Plataforma X deixa de existir | Baixa | Wizard regenera configuração para outra plataforma |
| AI Act classificar secretário como dispositivo médico | Média a longo prazo | Posicionamento "não-clínico" registado em todos os materiais; reforço dos *red lines* |
| Plataformas integrarem nativamente "templates de profissão" | Alta a 2-3 anos | Propriedade intelectual fica nas 17 secções + exemplos preenchidos |

---

## Protocolo de validação com médicos (Maio 2026)

Sessão estruturada e gravada com 5 médicos. ~40 min cada.

### Quem (5 perfis-alvo)

- 2 médicos de família 45-65 anos que **viram a v1 e não perceberam** — referência para comparar
- 1 especialista (fisiatra, internista) — testa o tom para fora da família/urgência
- 1 gestor de clínica privada — testa o caminho Equipa
- 1 médico que nunca tenha usado IA — teste mais duro

### Tarefas a pedir (sem explicar nada antes)

1. *"Está nesta página. O que faria?"* — ver se entram no wizard sozinhos
2. *"Imagine que quer um secretário só para si. Faça."* — percorrer passos 0→3
3. *"Decida entre grátis, 19€ ou 49€. Justifique."* — testa se a diferença é clara
4. *"Explique a um colega, em duas frases, o que é isto."* — teste-rei do conceito

### Métricas e metas

| Métrica | Meta |
|---|---|
| Tempo até *"percebi o que isto é"* | < 2 min |
| Termos sublinhados como pouco claros | < 3 por médico |
| Conseguem escolher plataforma sem ajuda | 4/5 |
| Conseguem reformular o conceito a um colega | 4/5 |
| Dizem *"agente IA"* ou *"prompt"* na conversa | 0/5 (sinal de que o vocabulário pegou) |
| *"Isto eu pago"* sem ser perguntado | 2/5 — forte sinal comercial |

### Como conduzir

- **Ambiente real**: casa ou consultório do médico, não estúdio
- **Telemóvel + portátil**: testar ambos (mobile é onde aterra de email; portátil é onde se preenche)
- **Pensar alto**: pedir verbalização contínua — *"Diga o que está a pensar"*
- **Não ajudar**: a fricção é o sinal. Anotar onde param e voltam atrás
- **Gravar áudio** (com consentimento explícito)

### Output após as 5 sessões — secção a criar no `decisoes.md`

*"Resultados validação Maio 2026"* com:
- Conceito passou? (sim/não)
- Os 3 piores termos a refazer
- 17 secções ficam ou reduzem para 7-9
- Diferença 19€/49€ é clara ou precisa de reformulação

---

## Decisões expressamente rejeitadas (não voltar a propor)

- "Família Sombra" como naming unificador dos secretários — rejeitada
- "Método Sombra" como produto — rejeitada
- Preço único para secretários do catálogo — incompatível com stack
- História fundacional da DRC na narrativa pública — proibida por regra absoluta
- Identificação da Dra. Mónica em materiais comerciais — proibida por regra absoluta
- Vocabulário "agente IA" em comunicação pública — rejeitada após testes (Abril 2026)
- Narração de vídeo com actores humanos reais gerados por IA — rejeitada (uncanny valley, mata confiança)
- Guia de instalação gratuita — rejeitada, fica a partir do 19€
- Tratamento por *"você"* ou *"o senhor / a senhora"* em texto escrito — rejeitada em Abril 2026 (soa brasileiro ou antiquado/marcado em género). Em escrita pública usa-se 3.ª pessoa singular impessoal

---

## Pendentes (em aberto)

1. ~~Confirmar número de secções (17 vs 7-9 core) após protótipo.~~ ✅ **Decidido v2.6 (5 Maio 2026): manter 17.** Reabrir só se validação com médicos mostrar abandono por excesso de perguntas.
2. Tagline final (actual: "Um secretário digital que escreve por si.")
3. Logo e símbolo próprio
4. Landing page finalizada com pirâmide dupla (individual + equipa)
5. Deploy Vercel apontado a `proteinaludica.com` — desbloqueado em 5 Maio 2026 (v2.6.1). Pode ser feito quando se quiser.
6. Script do vídeo-guia de 10 min (incluído no tier Básico 19€ — reavaliar formato)
7. Contrato de subcontratante RGPD para Assistido (290€) e Equipa (990€)
8. Validação com TOC do modelo de facturação
9. Autorização da Dra. Mónica para caso anónimo
10. Email de resposta automática para leads
11. FAQ final com 10 perguntas (já temos 6 no index v2)
12. Decisão sobre Casa da Albertina: quando contar publicamente
13. Activação IfthenPay para MB WAY (1-2 semanas de setup)
14. Escolha final de LLM para a IA que ajuda no wizard (Premium 49€)
15. Produção do kit vídeo/áudio/imagens (pausada)
16. Teste do wizard actualizado com médicos amigos
17. Definição de ficheiros sugeridos e prompts de teste por especialidade
18. **Preço final do tier Equipa** — após primeiro cliente real
19. **Arquitectura técnica mãe + papéis** — como se implementa em cada plataforma (Copilot, Claude, Gemini)
20. **Modelo de manutenção do tier Equipa** — quem paga actualizações quando a clínica muda regras?
21. ~~**🔴 BLOQUEADOR — Repor `index.html` institucional antes de qualquer deploy.**~~ ✅ **Resolvido v2.6.1 (5 Maio 2026).** O `index.html` deste repo é agora a landing institucional alinhada v2.5. O workspace Dr. Escriba IA + Fase 1 Internato e o `internato-fase1.patch` foram removidos. A versão produtiva do Dr. Escriba IA continua a viver no repo `drescribia` (separado).

---

## Changelog

**v2.6.1 · 5 Maio 2026:**

- **Bloqueador 21 resolvido.** Limpeza estrutural do repo `proteinaludica/proteinaludica.com`:
  - Apagado o `index.html` workspace (Dr. Escriba IA v9.5 + Fase 1 Internato, 618 KB) — esta versão vivia aqui temporariamente como espaço de edição. A versão produtiva continua no repo `drescribia`
  - Apagado o ficheiro `internato-fase1.patch` (382 linhas) — patch já entregue para aplicação no `drescribia`
  - Renomeado `index-institucional.html` → `index.html` — a landing institucional alinhada v2.5 ocupa agora o nome canónico
- **Pendente 21 fechado** com remissão. Pendente 5 (deploy Vercel) deixa de estar bloqueado.
- **Convenção da v2.5 honrada:** versão `v2.6.1` (não `v2.7`) por ser correcção/limpeza estrutural, não nova decisão.
- **Próximo passo prioritário (mesma posição):** item 5 do roadmap — validação com 5 médicos.

**v2.6 · 5 Maio 2026:**

- **Item 2 do roadmap concluído:** 4 ficheiros de demonstração da saída do wizard `/criar` produzidos e mergeados em `main` (PRs #5 #6 #7 #8). Pasta `outputs/` com:
  - `gemini-gems.html` (861 linhas · 6 secções)
  - `custom-gpt.html` (989 linhas · 7 secções, com Conversation Starters)
  - `claude-projects.html` (852 linhas · 5 secções, mais enxuta, destaque para privacidade)
  - `copilot-agents.html` (1055 linhas · 7 secções, com 4 Topics + Actions Power Automate)
  Todos alinhados com a v2.5 (Laurissilva + Fraunces/Geist + lang pt-PT + 0 ocorrências de termos proibidos).
- **Decisão sobre número de secções:** manter 17 como estrutura única. Hipótese de reduzir para 7-9 no Básico (que vinha aberta desde v2.0) é fechada com fundamentação registada em nova secção dedicada. Reabrir só após validação real com médicos. Pendente 1 actualizado.
- **Tabela "Ficheiros já gerados" reescrita:** distingue agora `index-institucional.html` (alinhado v2.5, pronto para servir como `index.html`) do `index.html` actual (workspace temporário Dr. Escriba IA, sujeito ao bloqueador 21). Adiciona linha por cada ficheiro de demonstração.
- **Próximo passo prioritário:** item 5 do roadmap — testar wizard + ficheiros de demonstração com 5 médicos amigos (protocolo registado em "Protocolo de validação com médicos").

**v2.5 · 3 Maio 2026:** versão fundida — duas iniciativas paralelas da mesma data convergem para um único registo. Fica em aberto a possibilidade de futuras v2.5.x para correcções pontuais sem desalinhar trabalho concorrente.

*Decisões de produto e estrutura:*

- Nova secção **Arquitectura plataforma — racional** entre "Princípios transversais" e "Decisões expressamente rejeitadas". Documenta porque a Proteína Lúdica opera dois modelos paralelos (catálogo na plataforma própria · Dr. Escriba IA SOAP v8.0; à medida em plataformas terceiras), os custos de LLM e o princípio stateless que justificam a separação, a posição estratégica ("expert da configuração", não vendedora de tecnologia LLM), critérios para reavaliar (primeira venda Equipa, integração clínica, padrão repetido em 5+ clientes do mesmo nicho), e tabela de riscos macro
- Nova secção **Protocolo de validação com médicos (Maio 2026)**. 5 perfis-alvo definidos (2 médicos de família que não perceberam a v1, 1 especialista, 1 gestor de clínica, 1 médico sem experiência IA), 4 tarefas sem instruções prévias, 6 métricas com metas concretas, modo de condução (ambiente real, mobile + desktop, pensar alto, não ajudar, gravar áudio), e estrutura do output a registar após as sessões
- **Decisão de roadmap**: gateway próprio para tier Equipa adiado para depois da primeira venda Equipa real. Não é prioridade actual
- **Decisão de roadmap**: produtização de clientes "à medida" para catálogo só após 6-12 meses de pilotos reais, quando aparecer padrão repetido em 5+ clientes do mesmo nicho

*Implementação — Fase 1 do Internato MGF:*

- **Dr. Escriba IA · Internato** passa do estado "produto distinto, em breve" para **esqueleto funcional implementado** sobre o `index.html` v9.5 SOAP. Decisão de não criar produto separado: o Internato é um **modo** dentro do mesmo app (toggle no header), partilhando perfil, auto-save e infra-estrutura do Dr. Escriba IA core
- **Toggle SOAP/Internato** no `.hdr-ctrls` — pill segmentado amber/copper. Modo persistido em `localStorage.dx_int_mode`. Quando Internato activo, painéis S/O/P/R são escondidos via classe `body.dx-mode-internato`; auto-save `dx_autosave_v1` do SOAP fica intacto
- **Painel Internato MGF com 4 tabs internas** (Logbook · Avaliações · Diário · Journal Club). Estrutura paralela aos tabs SOAP, paleta amber/copper para distinção visual sem partir o tema clínico actual (`--s` azul / `--o` verde / `--p` roxo do v9.5 inalterados)
- **Perfil único por navegador** (iniciais, ano 1-4, USF/UCSP) persistido em `dx_int_profile_*`. Multi-perfil adiado para fase com sincronização cloud
- **Tab Avaliações funcional** com rubricas detalhadas da Ordem dos Médicos para MGF: Mini-CEX (consulta observada), DOPS (procedimento), CbD (discussão de caso), MSF (multi-source) + escala 1-6 conforme regulamento. Notas em texto livre. Histórico até 200 avaliações em `dx_int_avaliacoes` (filtros e exportação ficam para Fase 2)
- **Tabs Logbook, Diário, Journal Club** marcados "Fase 2 — em construção" — esqueleto entregue, CRUD chega depois
- **Namespace `dx_int_*`** garante separação total relativamente ao SOAP (`dx_autosave_v1`, `dx_templates_v1`, `dx_history_v1`, `dx_brand_v1`, `dx_vd_patients_v9`)
- **Não-regressão SOAP v9.5 verificada:** funções `generate()`, `buildSoc()`, `buildO()`, `buildP()`, `exportPDF()`, `dxNewSOAP()` zero edições. Auto-save e modais (Templates, Histórico, Médico, Pré-visualizar) inalterados. Sem modo Internato activo, comportamento 100% idêntico ao v9.5
- **3.ª pessoa singular impessoal** mantida em todo o copy novo do Internato
- **Patch `internato-fase1.patch`** (382 linhas, +351 -1 sobre `index.html`) gerado para aplicação no repo `drescribia` (onde reside a versão produtiva do Dr. Escriba IA — Dr. Escriba V9f). Merge no `drescribia` faz-se via `git apply` do raw URL do patch
- **Ramificação operacional:** `proteinaludica.com` ganhou temporariamente uma cópia do `index.html` do Dr. Escriba IA para servir de workspace de edição. Antes de qualquer deploy de `proteinaludica.com` para Vercel, é preciso repor o `index.html` institucional e mover o Dr. Escriba IA para o seu domínio (`drescribaai.proteinaludica.com`) — registado nos pendentes
- **Pendente para Fase 2:** CRUD nos 3 stubs (Logbook com tipos de acto OM, Diário com ditado, Journal Club com DOI/PubMed e templates CASP/AMSTAR), histórico filtrável e exportação no tab Avaliações (PDF para reunião com tutor), genograma do interno opcional

*Operacional / processo:*

- Em `proteinaludica/proteinaludica.com` chegaram a coexistir duas v2.4 incompatíveis (uma com Arquitectura plataforma + Protocolo, outra com Fase 1 Internato). Optou-se por consolidá-las em **v2.5** num único merge para `main`, em vez de manter dois ramos divergentes
- PR #2 (Internato Fase 1, versão 29 Abril) fechado a 3 Maio 2026 por ter sido substituído pelo PR #3 (versão 2 Maio mais completa)
- Convenção: futuras correcções pontuais a esta versão entram como **v2.5.x** (não v2.6) para distinguir bug-fixes editoriais de novas decisões estruturais

**v2.3 · 26 Abril 2026:**
- **Inversão da regra de tratamento.** *"Você"* e *"o senhor / a senhora"* eram regra em v2.0-v2.2 mas pertencem ao registo oral em PT-PT. Em escrita pública aplica-se 3.ª pessoa singular impessoal (padrão de sites institucionais portugueses: gov.pt, CGD, IEFP, IRN, Ordem dos Médicos)
- Auditoria de jargão do `wizard-criar.html`:
  - Antropomorfismos a software: *"vive dentro de"* → *"funciona dentro de"*; *"onde quer que viva"* → *"em qual destas ferramentas vai usar"*
  - Anglicismos traduzidos: *"setup"* → *"configurar"*; *"Conversation Starters"* → *"sugestões prontas para começar a conversa"*; *"self-service"* → *"faz por conta própria"*; *"output"* → *"resultado"*; *"demo"* → *"demonstração"*
  - Verbos técnicos disfarçados: *"integra"* → *"liga ao"*; *"em tempo real"* → *"à medida que escreve"*; *"automaticamente"* → *"sem ser preciso pedir"*; *"detecta inconsistências"* → *"avisa quando uma resposta contradiz outra"*
  - 14 substituições de tratamento ("o senhor" → 3.ª p.s. impessoal), incluindo correcção pré-AO *"direto"* → *"directo"* na linha 1411
- **Revisão de código** posterior detectou e corrigiu mais 6 pontos: bloqueador na linha 1212 (*"O senhor só ajusta..."* tinha escapado às duas auditorias anteriores), concordância flutuante de *"Boa para conversas..."* → *"Indicada para…"* (linhas 1171 e 1630), frase incompleta *"acompanha enquanto preenche"* → *"acompanha o preenchimento das 17 perguntas"* (linha 1325), texto vago em *// PÚBLICO* tornado específico (linha 1298)
- `decisoes-proteina-ludica.md` ganha secção "Registo de tratamento (regra escrita)" com tabela de formas e exemplos concretos antes/depois
- Adicionado a "Decisões expressamente rejeitadas": tratamento por *"você"* ou *"o senhor"* em escrita
- **Pendente** (corrigir mais tarde): bloco do tier Assistido onde o Roberto fala em 1.ª pessoa (*"comigo"*) — aceitável a curto prazo, a rever na próxima passagem
- Próximas adições ao `index.html` e `17-seccoes-exemplo.html` aplicam a mesma regra. Conteúdo já existente nesses ficheiros não foi reescrito nesta sessão

**v2.2 · 21 Abril 2026:**
- 3 HTMLs regenerados e **alinhados com v2.1** após auditoria (vocabulário "secretário digital" confirmado por grep: 0 ocorrências de "agente IA" em ficheiros públicos)
- Itens 1 e 3 dos próximos passos marcados como concluídos (homepage actualizada, wizard refeito)
- Nova secção **Fluxo de trabalho no Claude (meta)** — três camadas de memória, rotina obrigatória por sessão, convenção de nomes `[DEC]`/`[PROD]`/`[EXP]`/`[DRESC]`, regra arquivar-por-defeito, estrutura de backup local `~/proteinaludica/`
- Decisão: arquivar chats antigos em vez de apagar (mantém `conversation_search` funcional)

**v2.1 · Abril 2026 (depois da v2.0 da mesma sessão):**
- Tier 990€ passou de "Completo individual" para **"Equipa"** (qualquer profissão, não só saúde)
- Arquitectura 990€: secretário "mãe" com regras comuns + versões por papel (médico/enfermeira/recepção, advogado/associado/secretária, etc.)
- Preço 990€ marcado como **provisório** — decisão final após primeiro cliente real (pode subir para 1.990€-2.990€)
- Estrutura passa de 5 níveis lineares para **duas pirâmides paralelas**: Individual (0€/19€/49€/290€) e Equipa (990€)
- Wizard self-service serve apenas segmento individual. Equipa usa contacto directo.
- Segmento B deixa de ser "Saúde · à medida" — passa a "Secretários à medida" para qualquer profissão

**v2.0 · Abril 2026:**
- Vocabulário público fixo em "secretário digital"
- Estrutura de preços expandida (antes 3 tiers, passou a 5 níveis antes da v2.1)
- Gratuito inclui system prompt sem guia de instalação
- Saída do wizard passa a ser "agente completo" (título + descrição + prompt + ficheiros + testes)
- Linguagem pública adaptada para "alguém de 70 anos" / tratamento por "você"
- IA a ajudar preencher passa a ser do tier 49€ (Premium)
- Dr. Escriba Internato confirmado como produto distinto, não variante

**v1.0 · anterior:**
- 3 tiers (0€/290€/990€)
- Vocabulário "agente IA" em todo o lado
- Apenas system prompt como saída
