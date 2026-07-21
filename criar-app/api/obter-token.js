// Função serverless (Vercel) — GET /api/obter-token?sessao=<pl_sessao>
//
// Devolve o token Pro emitido para uma sessão, depois de o pagamento ter sido
// confirmado pelo webhook/callback. O wizard chama este endpoint ao regressar
// do pagamento (URL com ?pro=1) e guarda o token em sessionStorage.
//
// Sem token ainda (pagamento por confirmar, ou nenhum pagamento) → 404 pendente,
// que o cliente trata como "ainda não disponível" e pode voltar a pedir.
//
// Variáveis de ambiente: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (via pro-comum).

'use strict';

const pro = require('../lib/pro-comum');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const sessao = req.query && String(req.query.sessao || '').trim().slice(0, 200);
  if (!sessao) {
    return res.status(400).json({ ok: false, error: 'Sessão em falta.' });
  }

  const cfg = pro.configSupabase();
  if (!cfg) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta (obter-token).');
    return res.status(503).json({ ok: false, error: 'Serviço indisponível.' });
  }

  let token;
  try {
    token = await pro.obterTokenPorSessao(cfg, sessao);
  } catch (err) {
    console.error('Falha a obter token Pro:', err && err.message);
    return res.status(502).json({ ok: false, error: 'Não foi possível confirmar o acesso agora.' });
  }

  if (!token) {
    return res.status(404).json({ ok: false, pendente: true, error: 'Acesso ainda não disponível.' });
  }
  return res.status(200).json({ ok: true, token });
};
