// Módulo comum à venda do Natal IA 2026 — 19€, pagamento único, sem subscrição.
//
// NÃO é um endpoint: não exporta handler. É `require`-d por
// natal-comprar.js / natal-webhook.js / natal-token.js / natal-dados.js, no
// mesmo espírito de _lib/retiroassist.js, que reaproveita para a configuração
// do Supabase, o endereço do site e o segredo do token.
//
// Concentra o que esses endpoints partilham:
//   - o preço (fonte única — o cliente nunca o dita);
//   - o prazo para alterar os dados e a validade da ligação;
//   - emissão e verificação do token (HS256/base64url, com `jti` e `sub`);
//   - o código de licença;
//   - a assinatura do aviso da Stripe;
//   - o registo idempotente da compra e a gravação dos dados em Supabase.
//
// Variáveis de ambiente (painel da Vercel, projecto do site principal):
//   JWT_SECRET                 — segredo HS256 (o mesmo do RetiroAssist)
//   SUPABASE_URL               — URL da API Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — chave service_role (secreta)
//   SITE_BASE                  — (opcional) base do site

'use strict';

const crypto = require('crypto');
const ra = require('./retiroassist');
const kit = require('./natal-kit');

// Preço em cêntimos. Fonte única, do lado do servidor.
const PRECO_CENTS = 1900;
const MOEDA = 'eur';

// O token só serve este produto: um token do RetiroAssist nunca abre uma
// compra do Natal, nem o contrário.
const SUB = 'natal2026';

// Quantas vezes se podem gravar os dados. Dá margem para ajustar o mês todo.
const MAX_GRAVACOES = 10;

// Prazo para alterar os dados: o mais tardio entre o Dia de Reis de 2027 e
// 30 dias depois da compra. É também a validade da ligação. Em Janeiro a
// Madeira está em UTC+0, por isso 23:59:59 UTC é o fim do dia.
const FIM_FIXO_MS = Date.parse('2027-01-06T23:59:59.000Z');
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_APOS_COMPRA = 30;

// Os dados apagam-se 30 dias depois do prazo (cron na migração 011).
const DIAS_ATE_APAGAR = 30;

const TABELA = '/rest/v1/natal_compras';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function prazoAlteracoes(compradoEm) {
  const base = compradoEm instanceof Date && !isNaN(compradoEm) ? compradoEm.getTime() : Date.now();
  return new Date(Math.max(FIM_FIXO_MS, base + DIAS_APOS_COMPRA * DIA_MS));
}

function apagamentoEm(expiraEm) {
  return new Date(new Date(expiraEm).getTime() + DIAS_ATE_APAGAR * DIA_MS);
}

// "6 de Janeiro de 2027", na hora da Madeira.
function dataPorExtenso(data) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Atlantic/Madeira', day: 'numeric', month: 'numeric', year: 'numeric',
  }).formatToParts(new Date(data));
  const get = (t) => Number(partes.find((p) => p.type === t).value);
  return get('day') + ' de ' + MESES[get('month') - 1] + ' de ' + get('year');
}

// ─────────────────────────────── token ───────────────────────────────

function codificar(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function assinar(secret, texto) {
  return crypto.createHmac('sha256', secret).update(texto).digest('base64url');
}

// Emite o token. `exp` é o fim do prazo, em segundos desde 1970.
function emitirToken(jti, exp) {
  const secret = ra.segredoJWT();
  const header = codificar({ alg: 'HS256', typ: 'JWT' });
  const iat = Math.floor(Date.now() / 1000);
  const body = codificar({ sub: SUB, jti, iat, exp });
  return { token: header + '.' + body + '.' + assinar(secret, header + '.' + body), exp, jti };
}

// Verifica assinatura, produto e validade. Nunca lança por token inválido.
// Devolve { estado: 'invalido' } | { estado: 'expirado', payload } | { estado: 'ok', payload }.
// O estado "expirado" só existe para um token de assinatura válida: é o que
// deixa a página dizer "o prazo terminou" em vez de "ligação inválida".
function estadoToken(token) {
  if (!token || typeof token !== 'string') return { estado: 'invalido' };
  const partes = token.split('.');
  if (partes.length !== 3) return { estado: 'invalido' };
  const [header, body, assinatura] = partes;

  let secret;
  try {
    secret = ra.segredoJWT();
  } catch {
    return { estado: 'invalido' }; // sem segredo, nada é válido
  }

  const esperada = Buffer.from(assinar(secret, header + '.' + body));
  const recebida = Buffer.from(assinatura);
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) {
    return { estado: 'invalido' };
  }

  let cabecalho;
  let payload;
  try {
    cabecalho = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { estado: 'invalido' };
  }
  if (!cabecalho || cabecalho.alg !== 'HS256') return { estado: 'invalido' };
  if (!payload || typeof payload !== 'object') return { estado: 'invalido' };
  if (payload.sub !== SUB) return { estado: 'invalido' };
  if (typeof payload.jti !== 'string' || !payload.jti) return { estado: 'invalido' };
  if (typeof payload.exp !== 'number') return { estado: 'invalido' };
  if (payload.exp <= Math.floor(Date.now() / 1000)) return { estado: 'expirado', payload };
  return { estado: 'ok', payload };
}

function verificarToken(token) {
  const e = estadoToken(token);
  return e.estado === 'ok' ? e.payload : null;
}

// Código de licença, derivado do jti da compra. Não se guarda: o mesmo jti dá
// sempre o mesmo código, e o código não deixa chegar ao jti (é um hash).
function licencaDe(jti) {
  const h = crypto.createHash('sha256').update('natal26-licenca:' + jti).digest('hex');
  return 'NATAL26-' + h.slice(0, 6).toUpperCase();
}

// ─────────────────────── assinatura do aviso da Stripe ───────────────────────

// Tolerância do timestamp da assinatura (5 minutos), como a lib oficial Stripe.
const TOLERANCIA_S = 300;

// Verifica o header `stripe-signature` sobre o corpo BRUTO.
// Formato: "t=<ts>,v1=<hex>[,v1=<hex>...]".
function assinaturaValida(rawBody, header, secret, agora) {
  if (!header || !secret) return false;
  let t = null;
  const v1 = [];
  for (const parte of String(header).split(',')) {
    const [k, v] = parte.split('=');
    if (k === 't') t = v;
    else if (k === 'v1' && v) v1.push(v);
  }
  if (!t || !v1.length) return false;

  const agoraS = agora == null ? Math.floor(Date.now() / 1000) : agora;
  const idade = agoraS - Number(t);
  if (!Number.isFinite(idade) || Math.abs(idade) > TOLERANCIA_S) return false;

  const esperada = crypto
    .createHmac('sha256', secret)
    .update(t + '.' + Buffer.from(rawBody).toString('utf8'))
    .digest('hex');
  const b = Buffer.from(esperada);
  return v1.some((assin) => {
    const a = Buffer.from(assin);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// ───────────────────────────── Supabase ─────────────────────────────

function segundosDe(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(prazoAlteracoes(new Date()).getTime() / 1000);
}

async function primeiraLinha(cfg, caminho) {
  const resp = await fetch(cfg.url + caminho, { headers: ra.cabecalhosSupabase(cfg.key) });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Supabase natal_compras (leitura) ' + resp.status + ': ' + detalhe);
  }
  const linhas = await resp.json().catch(() => null);
  if (!Array.isArray(linhas) || linhas.length === 0) return null;
  return linhas[0];
}

async function obterCompraPorReferencia(cfg, referencia) {
  return primeiraLinha(
    cfg,
    TABELA + '?referencia=eq.' + encodeURIComponent(referencia) +
      '&select=token_jti,email,expira_em&limit=1'
  );
}

// Lê também os dados: é por aqui que a página e a descarga encontram a compra.
async function obterCompraPorJti(cfg, jti) {
  return primeiraLinha(
    cfg,
    TABELA + '?token_jti=eq.' + encodeURIComponent(jti) +
      '&select=token_jti,email,expira_em,dados,dados_gravacoes&limit=1'
  );
}

// Regista a compra de forma idempotente: a referência da Stripe é única, por
// isso a mesma sessão reentregue pelo aviso não cria duas linhas nem emite
// dois tokens. Devolve { token, exp, jti, expira } com o token existente, se
// já houver. Lança em falha de Supabase — quem chama decide o status HTTP.
async function registarCompra(cfg, { referencia, email, valorCents, moeda, compradoEm, renunciaEm, versaoTermos }) {
  const existente = await obterCompraPorReferencia(cfg, referencia);
  if (existente && existente.token_jti) {
    const exp = segundosDe(existente.expira_em);
    return Object.assign(emitirToken(existente.token_jti, exp), { expira: new Date(exp * 1000) });
  }

  const expira = prazoAlteracoes(compradoEm);
  const emitido = emitirToken(
    crypto.randomBytes(16).toString('hex'),
    Math.floor(expira.getTime() / 1000)
  );

  const resp = await fetch(cfg.url + TABELA + '?on_conflict=referencia', {
    method: 'POST',
    headers: ra.cabecalhosSupabase(cfg.key, {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      referencia,
      email: email || null,
      token_jti: emitido.jti,
      valor_cents: valorCents,
      moeda: (moeda || 'EUR').toUpperCase(),
      versao_kit: kit.VERSAO,
      versao_termos: versaoTermos || null,
      renuncia_em: renunciaEm || null,
      expira_em: expira.toISOString(),
    }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Supabase natal_compras ' + resp.status + ': ' + detalhe);
  }

  // Corrida entre duas entregas do mesmo aviso: se outra instância ganhou o
  // INSERT, o nosso foi ignorado — vale o token dela, não o nosso.
  const gravada = await obterCompraPorReferencia(cfg, referencia);
  if (gravada && gravada.token_jti && gravada.token_jti !== emitido.jti) {
    const exp = segundosDe(gravada.expira_em);
    return Object.assign(emitirToken(gravada.token_jti, exp), { expira: new Date(exp * 1000) });
  }
  return Object.assign(emitido, { expira });
}

// Grava os dados e conta a gravação. Só grava se o contador ainda for o que
// se leu: duas gravações em simultâneo não passam ambas. Devolve true se
// gravou, false se perdeu a corrida. Lança em falha de Supabase.
async function guardarDados(cfg, jti, dados, gravacoesAnteriores) {
  const anteriores = gravacoesAnteriores || 0;
  const url = cfg.url + TABELA + '?token_jti=eq.' + encodeURIComponent(jti) +
    '&dados_gravacoes=eq.' + anteriores;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: ra.cabecalhosSupabase(cfg.key, { Prefer: 'return=representation' }),
    body: JSON.stringify({
      dados,
      dados_gravacoes: anteriores + 1,
      dados_em: new Date().toISOString(),
      versao_kit: kit.VERSAO,
    }),
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Supabase natal_compras (dados) ' + resp.status + ': ' + detalhe);
  }
  const linhas = await resp.json().catch(() => null);
  return Array.isArray(linhas) && linhas.length > 0;
}

module.exports = {
  PRECO_CENTS,
  MOEDA,
  SUB,
  MAX_GRAVACOES,
  FIM_FIXO_MS,
  DIAS_APOS_COMPRA,
  DIAS_ATE_APAGAR,
  baseSite: ra.baseSite,
  configSupabase: ra.configSupabase,
  prazoAlteracoes,
  apagamentoEm,
  dataPorExtenso,
  emitirToken,
  estadoToken,
  verificarToken,
  licencaDe,
  assinaturaValida,
  obterCompraPorReferencia,
  obterCompraPorJti,
  registarCompra,
  guardarDados,
};
