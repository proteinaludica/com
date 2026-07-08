# criar-app — fonte do wizard `criar.proteinaludica.com`

Esta pasta é o **ponto de entrada dedicado** para o projeto Vercel `criar`
(que serve `criar.proteinaludica.com`), permitindo que o wizard viva na
**mesma fonte** que o resto do site (`proteinaludica/com`), sem duplicação.

- `index.html` — o wizard `/criar`, versão limpa e canónica (cópia de
  `criar.html` na raiz deste repo). Sem vocabulário de "rascunho": parte
  sempre do que o profissional determina.
- `vercel.json` — `cleanUrls`, `trailingSlash:false` e `X-Robots-Tag:
  noindex, nofollow` (protótipo de validação, fora dos índices de pesquisa).

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
