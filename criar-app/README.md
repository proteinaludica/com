# criar-app — fonte do wizard `criar.proteinaludica.com`

Esta pasta é o **ponto de entrada dedicado** para o projeto Vercel `criar`
(que serve `criar.proteinaludica.com`), permitindo que o wizard viva na
**mesma fonte** que o resto do site (`proteinaludica/com`), sem duplicação.

- `index.html` — o wizard `/criar`, versão limpa e **canónica**. É a única
  que existe: a cópia antiga `criar.html`, na raiz do repo, foi apagada por
  ser divergente e não ser servida em lado nenhum. Sem vocabulário de
  "rascunho": parte sempre do que o profissional determina.
- `vercel.json` — `cleanUrls`, `trailingSlash:false`, `X-Robots-Tag:
  noindex, nofollow` (protótipo de validação, fora dos índices de pesquisa)
  e `regions: ["dub1"]` (ver abaixo).

## Região de execução — `dub1` (Dublin, Irlanda)

As funções de `api/` correm em Dublin, fixado por `regions` no
`vercel.json`. Não é uma preferência de desempenho — é uma exigência de
protecção de dados.

Estas funções recebem o texto que o profissional escreve no formulário,
que pode conter informação clínica. Sem esta linha, a plataforma escolhe
a região por si, e a escolha observada era `iad1` — Virgínia, Estados
Unidos. O conteúdo saía da União Europeia sem que nada no repositório o
declarasse.

Dublin, e não Paris, porque a base de dados Supabase está em `eu-west-1`,
que é a mesma zona (Irlanda). Cada pedido faz várias chamadas à base de
dados; mantê-las dentro da mesma região poupa uma ida e volta atlântica
a cada uma.

Isto cobre onde o **nosso** código corre. Não cobre o processamento feito
pela Anthropic no preenchimento assistido, que é matéria de contrato e
não de configuração.

## Como ligar (dashboard Vercel — 3 passos)

No projeto Vercel **`criar`** (o que já tem o domínio `criar.proteinaludica.com`):

1. **Settings → Git** — reapontar o repositório ligado de
   `proteinaludica/criar` para `proteinaludica/com`.
2. **Settings → General → Root Directory** — definir `criar-app`.
   (Assim o subdomínio serve `criar-app/index.html`, e não a homepage
   de `com`.)
3. Arquivar o repo antigo `proteinaludica/criar` (Settings → Archive)
   para ninguém o voltar a editar por engano.

O `vercel.json` da raiz de `com` mantém o redirect
`proteinaludica.com/criar → https://criar.proteinaludica.com` — o
subdomínio fica, só muda a fonte que o alimenta.
