// Módulo comum à venda do RetiroAssist — 19€, pagamento único, sem subscrição.
//
// NÃO é um endpoint: não exporta handler. É `require`-d por
// retiroassist-comprar.js / retiroassist-webhook.js / retiroassist-token.js /
// retiroassist-descarregar.js, no mesmo espírito do criar-app/api/_lib/pro-comum.js.
//
// Concentra o que esses endpoints partilham:
//   - o preço (fonte única — o cliente nunca o dita);
//   - emissão e verificação do token de descarga (HS256/base64url, com `jti`);
//   - registo idempotente da compra em Supabase (REST via fetch);
//   - o perfil do comprador (validação e gravação) e o código de licença;
//   - construção do PDF do kit, personalizado com o perfil.
//
// Variáveis de ambiente (painel da Vercel, projecto do site principal):
//   JWT_SECRET                 — segredo HS256
//   SUPABASE_URL               — URL da API Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — chave service_role (secreta)
//   SITE_BASE                  — (opcional) base do site, por defeito
//                                https://proteinaludica.com

'use strict';

const crypto = require('crypto');
const kit = require('./retiroassist-kit');
const guias = require('./guias-instalacao');

// Preço em cêntimos. Fonte única, do lado do servidor.
const PRECO_CENTS = 1900;
const MOEDA = 'eur';

// Validade da ligação de descarga. Pagamento único, mas a ligação não é
// eterna: 30 dias, como o guia de instalação do wizard.
const VALIDADE_SEGUNDOS = 30 * 24 * 60 * 60;

// Quantas vezes o comprador pode gravar o perfil. Dá margem para corrigir um
// engano, mas não para ir gerando kits com o nome de outras pessoas.
const MAX_GRAVACOES_PERFIL = 3;

function baseSite() {
  return (process.env.SITE_BASE || 'https://proteinaludica.com').replace(/\/+$/, '');
}

// Segredo HS256. Falha FECHADO: sem JWT_SECRET não há fallback — um valor
// conhecido no repo deixaria qualquer pessoa forjar tokens de descarga.
function segredoJWT() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET em falta.');
  return secret;
}

// Emite o token de descarga. `jti` é a chave por onde a compra é reencontrada.
function emitirToken(jti) {
  const secret = segredoJWT();
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + VALIDADE_SEGUNDOS;
  const body = Buffer.from(
    JSON.stringify({ sub: 'retiroassist', jti, iat, exp })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return { token: `${header}.${body}.${signature}`, exp, jti };
}

// Verifica assinatura e validade. Devolve o payload ou null — nunca lança por
// token inválido (só a ausência de segredo é erro de configuração).
function verificarToken(token) {
  if (!token || typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [header, body, signature] = partes;

  let secret;
  try {
    secret = segredoJWT();
  } catch {
    return null; // sem segredo, nada é válido
  }

  const esperada = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.jti) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// Código de licença, derivado do jti da compra. Não se guarda: o mesmo jti dá
// sempre o mesmo código, e o código não deixa chegar ao jti (é um hash).
function licencaDe(jti) {
  const h = crypto.createHash('sha256').update('retiroassist-licenca:' + jti).digest('hex');
  return 'RA-' + h.slice(0, 6).toUpperCase();
}

// Valida e limpa as respostas do questionário. Cada resposta fica numa linha,
// sem espaços repetidos e sem chavetas (que o modelo do prompt usa como
// marcadores). Devolve { ok: true, perfil } ou { ok: false, erro, campo }.
function validarPerfil(dados) {
  if (!dados || typeof dados !== 'object') {
    return { ok: false, erro: 'Respostas em falta.' };
  }
  const perfil = {};
  for (const p of kit.PERGUNTAS) {
    const bruto = dados[p.campo];
    const v = limpar(typeof bruto === 'string' ? bruto : '')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!v && !p.opcional) {
      return { ok: false, erro: 'Falta responder a uma pergunta obrigatória.', campo: p.campo };
    }
    if (v.length > p.max) {
      return { ok: false, erro: 'Uma resposta passa o limite de ' + p.max + ' caracteres.', campo: p.campo };
    }
    perfil[p.campo] = v;
  }
  return { ok: true, perfil };
}

// Grava o perfil na linha da compra e conta a gravação. Lança em falha de
// Supabase — quem chama decide o status HTTP.
async function guardarPerfil(cfg, jti, perfil, gravacoesAnteriores) {
  const url = cfg.url + '/rest/v1/retiroassist_compras?token_jti=eq.' + encodeURIComponent(jti);
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: cabecalhosSupabase(cfg.key, { Prefer: 'return=minimal' }),
    body: JSON.stringify({
      perfil,
      perfil_gravacoes: (gravacoesAnteriores || 0) + 1,
      perfil_em: new Date().toISOString(),
      versao_kit: kit.VERSAO,
    }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Supabase retiroassist_compras (perfil) ' + resp.status + ': ' + detalhe);
  }
}

function configSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function cabecalhosSupabase(key, extra) {
  return Object.assign(
    {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    extra || {}
  );
}

// Regista a compra de forma idempotente: a referência da Stripe é única, por
// isso a mesma sessão reentregue pelo webhook não cria duas linhas nem emite
// dois tokens. Devolve o token de descarga (o existente, se já houver).
// Lança em falha de Supabase — quem chama decide o status HTTP.
async function registarCompra(cfg, { referencia, email, valorCents, moeda }) {
  const existente = await obterCompraPorReferencia(cfg, referencia);
  if (existente && existente.token_jti) {
    return emitirToken(existente.token_jti);
  }

  const emitido = emitirToken(crypto.randomBytes(16).toString('hex'));

  const url = cfg.url + '/rest/v1/retiroassist_compras?on_conflict=referencia';
  const resp = await fetch(url, {
    method: 'POST',
    headers: cabecalhosSupabase(cfg.key, {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      referencia,
      email: email || null,
      token_jti: emitido.jti,
      valor_cents: valorCents,
      moeda: (moeda || 'EUR').toUpperCase(),
      versao_kit: kit.VERSAO,
      expira_em: new Date(emitido.exp * 1000).toISOString(),
    }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Supabase retiroassist_compras ' + resp.status + ': ' + detalhe);
  }

  // Corrida entre duas entregas do mesmo evento: se outra instância ganhou o
  // INSERT, o nosso foi ignorado — vale o token dela, não o nosso.
  const gravada = await obterCompraPorReferencia(cfg, referencia);
  if (gravada && gravada.token_jti && gravada.token_jti !== emitido.jti) {
    return emitirToken(gravada.token_jti);
  }
  return emitido;
}

async function obterCompraPorReferencia(cfg, referencia) {
  return primeiraLinha(
    cfg,
    '/rest/v1/retiroassist_compras?referencia=eq.' + encodeURIComponent(referencia) +
      '&select=token_jti,email,expira_em&limit=1'
  );
}

// Lê também o perfil: é por aqui que a página do questionário e a descarga
// encontram a compra.
async function obterCompraPorJti(cfg, jti) {
  return primeiraLinha(
    cfg,
    '/rest/v1/retiroassist_compras?token_jti=eq.' + encodeURIComponent(jti) +
      '&select=token_jti,email,expira_em,perfil,perfil_gravacoes&limit=1'
  );
}

async function primeiraLinha(cfg, caminho) {
  const resp = await fetch(cfg.url + caminho, { headers: cabecalhosSupabase(cfg.key) });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Supabase retiroassist_compras (leitura) ' + resp.status + ': ' + detalhe);
  }
  const linhas = await resp.json().catch(() => null);
  if (!Array.isArray(linhas) || linhas.length === 0) return null;
  return linhas[0];
}

// ─────────────────────────────── PDF do kit ───────────────────────────────
// As fontes StandardFonts do pdf-lib escrevem em WinAnsi (CP1252), que cobre
// o português inteiro E a pontuação tipográfica — travessão, aspas curvas,
// reticências, €. Verificado contra o pdf-lib, não assumido: ver o teste
// "limpar preserva a pontuação tipográfica".
//
// Por isso não se troca nada: o texto do kit é aprovado e vai como está. Só
// sai o que a fonte mesmo não escreve (emoji e afins), que de outra forma
// faria a geração rebentar já depois de o pagamento estar feito.
//
// O \n é preservado DE PROPÓSITO. A versão anterior apagava-o (o \n está
// fora do intervalo ' '–'ÿ'), o que colapsava as dez secções do prompt num
// único parágrafo corrido.
const CP1252_EXTRA = '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D' +
                     '\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';
const FORA_DA_FONTE = new RegExp('[^\\n\\u0020-\\u00FF' + CP1252_EXTRA + ']', 'g');

function limpar(texto) {
  return String(texto == null ? '' : texto).replace(FORA_DA_FONTE, '');
}

// Parte um texto em linhas que cabem na largura dada, respeitando os \n que
// já lá estão.
function quebrar(texto, fonte, tamanho, largura) {
  const linhas = [];
  for (const bruta of limpar(texto).split('\n')) {
    if (!bruta.trim()) { linhas.push(''); continue; }
    let atual = '';
    for (const palavra of bruta.split(/\s+/)) {
      if (!palavra) continue;
      const tentativa = atual ? atual + ' ' + palavra : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
        atual = tentativa;
      } else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

// Constrói o PDF do kit: capa, depois um guia de instalação por plataforma,
// cada um com o nome, a missão e o prompt a colar. O prompt sai preenchido com
// o perfil do comprador, e a licença vai no rodapé de todas as páginas. Sem
// perfil, usa o perfil de exemplo (verificação e testes). Devolve um Buffer.
async function construirPDF(opcoes) {
  const o = opcoes || {};
  const perfil = o.perfil || kit.PERFIL_EXEMPLO;
  const licenca = o.licenca || 'RA-EXEMPLO';
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

  const doc = await PDFDocument.create();
  doc.setTitle(kit.NOME);
  doc.setSubject('Assistente digital IA — ' + kit.NOME);

  const corpo = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const A4 = [595.28, 841.89];
  const MARGEM = 56;
  const LARGURA = A4[0] - MARGEM * 2;
  const tinta = rgb(0.125, 0.118, 0.114);    // #201e1d
  const tinta2 = rgb(0.39, 0.36, 0.31);
  const destaque = rgb(0.776, 0.443, 0.224); // #c67139
  const fundoBloco = rgb(0.976, 0.957, 0.929);

  let pagina = doc.addPage(A4);
  let y = A4[1] - MARGEM;

  function novaPagina() {
    pagina = doc.addPage(A4);
    y = A4[1] - MARGEM;
  }

  function espaco(altura) {
    if (y - altura < MARGEM) novaPagina();
  }

  function escrever(texto, opcoes) {
    const o = opcoes || {};
    const fonte = o.fonte || corpo;
    const tamanho = o.tamanho || 11;
    const cor = o.cor || tinta;
    const alturaLinha = tamanho * (o.entrelinha || 1.5);
    for (const linha of quebrar(texto, fonte, tamanho, LARGURA)) {
      espaco(alturaLinha);
      if (linha) {
        pagina.drawText(linha, { x: MARGEM, y: y - tamanho, size: tamanho, font: fonte, color: cor });
      }
      y -= alturaLinha;
    }
  }

  // Bloco a copiar: fundo claro, monoespaçado, para se ver onde começa e
  // onde acaba o que vai para a plataforma.
  function blocoCopiar(texto) {
    const TAM = 8.5;
    const PAD = 10;
    const alturaLinha = TAM * 1.45;
    const linhas = quebrar(texto, mono, TAM, LARGURA - PAD * 2);

    let i = 0;
    while (i < linhas.length) {
      espaco(alturaLinha * 2);
      const cabem = Math.max(1, Math.floor((y - MARGEM - PAD * 2) / alturaLinha));
      const fatia = linhas.slice(i, i + cabem);
      const altura = fatia.length * alturaLinha + PAD * 2;

      pagina.drawRectangle({
        x: MARGEM, y: y - altura, width: LARGURA, height: altura, color: fundoBloco,
      });
      let ty = y - PAD;
      for (const linha of fatia) {
        if (linha) {
          pagina.drawText(linha, { x: MARGEM + PAD, y: ty - TAM, size: TAM, font: mono, color: tinta });
        }
        ty -= alturaLinha;
      }
      y -= altura;
      i += fatia.length;
      if (i < linhas.length) novaPagina();
    }
    y -= 10;
  }

  const VALORES = {
    nome_assistente: kit.NOME,
    missao: kit.MISSAO,
    prompt_completo: kit.comporPrompt(perfil, licenca),
  };

  // ── Capa ──
  escrever(kit.NOME, { fonte: negrito, tamanho: 30, entrelinha: 1.25 });
  y -= 6;
  escrever(kit.MISSAO, { tamanho: 13, cor: tinta2 });
  y -= 6;
  escrever('Configurado para ' + perfil.nome + ' · Licença ' + licenca, {
    fonte: negrito, tamanho: 11, cor: destaque,
  });
  y -= 10;
  escrever(
    'Este kit traz o guia de instalação para as plataformas mais usadas. Basta seguir o da plataforma escolhida — os passos são equivalentes.',
    { tamanho: 11, cor: tinta2 }
  );

  // ── Um guia por plataforma, cada um a começar em página própria ──
  for (const guia of guias.GUIAS.concat([guias.GUIA_FALLBACK])) {
    novaPagina();
    escrever(guia.titulo, { fonte: negrito, tamanho: 17, cor: destaque, entrelinha: 1.35 });
    y -= 8;

    for (const passo of guia.passos) {
      if (passo.heading) {
        espaco(30);
        escrever(passo.heading, { fonte: negrito, tamanho: 11.5, entrelinha: 1.45 });
      }
      if (passo.texto) escrever(passo.texto, { tamanho: 11, cor: tinta2 });
      if (passo.copiar) blocoCopiar(VALORES[passo.copiar]);
      y -= 6;
    }
  }

  espaco(40);
  y -= 18;
  escrever(kit.AVISO, { tamanho: 10, cor: tinta2 });

  // Rodapé em todas as páginas: o kit identifica sempre a quem pertence.
  const rodape = limpar('Licença pessoal de ' + perfil.nome + ' · ' + licenca + ' · Não transmissível');
  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    const texto = rodape + ' · ' + (i + 1) + '/' + paginas.length;
    pg.drawText(texto, { x: MARGEM, y: MARGEM / 2, size: 8, font: corpo, color: tinta2 });
  });

  return Buffer.from(await doc.save());
}

module.exports = {
  PRECO_CENTS,
  MOEDA,
  VALIDADE_SEGUNDOS,
  MAX_GRAVACOES_PERFIL,
  baseSite,
  segredoJWT,
  emitirToken,
  verificarToken,
  configSupabase,
  cabecalhosSupabase,
  registarCompra,
  obterCompraPorReferencia,
  obterCompraPorJti,
  licencaDe,
  validarPerfil,
  guardarPerfil,
  construirPDF,
  limpar,
  quebrar,
};
