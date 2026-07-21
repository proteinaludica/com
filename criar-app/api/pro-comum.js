// Módulo comum ao gating Pro — reutilizado pelos endpoints de pagamento.
//
// NÃO é um endpoint: não exporta handler. É apenas `require`-d pelos ficheiros
// criar-sessao-pagamento / webhook-stripe / callback-ifthenpay / obter-token,
// tal como validador-campo.js é required por assistir-campo.js.
//
// Concentra o que esses endpoints partilham:
//   - emissão do JWT Pro (mesmo esquema HS256/base64url de sessao-teste-pro.js,
//     payload { sub, tier:'pro', iat, exp } — o que assistir-campo.js verifica);
//   - registo idempotente do pagamento e upsert do token em Supabase (mesmo
//     padrão REST via fetch já usado em retoma-dados.js / assistir-campo.js).
//
// Variáveis de ambiente (painel da Vercel):
//   JWT_SECRET                 — segredo HS256 (o MESMO dos restantes endpoints)
//   SUPABASE_URL               — URL da API Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — chave service_role (secreta)

'use strict';

const crypto = require('crypto');

// Validade do acesso Pro. Pagamento único; o token dura 1 ano.
const VALIDADE_SEGUNDOS = 365 * 24 * 60 * 60;

// Emite um JWT Pro HS256/base64url. `sub` identifica o acesso (usado como
// chave `pro:<sub>` no rate-limit de assistir-campo). Devolve { token, exp }.
function emitirJWTpro(sub) {
  const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + VALIDADE_SEGUNDOS;
  const payload = {
    sub: sub || crypto.randomUUID(),
    tier: 'pro',
    iat,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return { token: `${header}.${body}.${signature}`, exp };
}

// Verifica assinatura HS256 e validade (exp) de um JWT base64url. Devolve o
// payload ou null. Idêntico ao verificarJWT dos restantes endpoints.
function verificarJWT(token) {
  if (!token || typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [header, body, signature] = partes;

  const secret = process.env.JWT_SECRET || 'fallback-secret-dev-only-32chars!!';
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
  } catch (_) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
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

// Confirma um pagamento Pro e emite o token Pro, de forma idempotente:
//   1) regista o pagamento (ignora conflito por (provedor, referencia));
//   2) faz upsert do token em pro_tokens pela sessão do cliente.
// Se a mesma referência já tiver sido confirmada, mantém o token existente em
// vez de emitir outro (o mesmo pagamento nunca gera dois acessos). Lança em
// qualquer falha de Supabase — quem chama decide o status HTTP.
async function confirmarPagamentoPro(cfg, { provedor, referencia, email, sessao, valorCents, moeda }) {
  // 1) Registo do pagamento (idempotente). Se já existir, o upsert com
  //    ignore-duplicates não escreve nada e não falha.
  const urlPag = cfg.url + '/rest/v1/pagamentos_pro?on_conflict=provedor,referencia';
  const respPag = await fetch(urlPag, {
    method: 'POST',
    headers: cabecalhosSupabase(cfg.key, {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      provedor,
      referencia,
      email: email || null,
      sessao_cliente: sessao,
      valor_cents: valorCents,
      moeda: moeda || 'EUR',
    }),
  });
  if (!respPag.ok) {
    const detalhe = await respPag.text().catch(() => '');
    throw new Error('Supabase pagamentos_pro ' + respPag.status + ': ' + detalhe);
  }

  // Se já havia token para esta sessão, reutiliza-o (idempotência ponta-a-ponta).
  const existente = await obterTokenPorSessao(cfg, sessao);
  if (existente) return existente;

  // 2) Emite e guarda o token.
  const { token, exp } = emitirJWTpro('pro-' + sessao);
  const urlTok = cfg.url + '/rest/v1/pro_tokens?on_conflict=sessao_cliente';
  const respTok = await fetch(urlTok, {
    method: 'POST',
    headers: cabecalhosSupabase(cfg.key, {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify({
      sessao_cliente: sessao,
      token,
      email: email || null,
      expira_em: new Date(exp * 1000).toISOString(),
    }),
  });
  if (!respTok.ok) {
    const detalhe = await respTok.text().catch(() => '');
    throw new Error('Supabase pro_tokens ' + respTok.status + ': ' + detalhe);
  }
  return token;
}

// Devolve o token Pro válido de uma sessão, ou null se não existir/expirou.
// Lança em falha de rede/status de Supabase.
async function obterTokenPorSessao(cfg, sessao) {
  const url =
    cfg.url + '/rest/v1/pro_tokens?sessao_cliente=eq.' + encodeURIComponent(sessao) +
    '&select=token,expira_em&limit=1';
  const resp = await fetch(url, { headers: cabecalhosSupabase(cfg.key) });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    throw new Error('Supabase pro_tokens (leitura) ' + resp.status + ': ' + detalhe);
  }
  const linhas = await resp.json().catch(() => null);
  if (!Array.isArray(linhas) || linhas.length === 0) return null;
  const linha = linhas[0];
  if (!linha.token) return null;
  if (linha.expira_em && new Date(linha.expira_em).getTime() <= Date.now()) return null;
  return linha.token;
}

module.exports = {
  VALIDADE_SEGUNDOS,
  emitirJWTpro,
  verificarJWT,
  configSupabase,
  cabecalhosSupabase,
  confirmarPagamentoPro,
  obterTokenPorSessao,
};
