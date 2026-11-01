// Função serverless (Vercel) — POST /api/encomenda
//
// Regista uma encomenda da montra por profissão (tabela `encomendas`, migração
// 009) com estado 'pendente'. NÃO cobra nem dá acesso ao wizard: a ligação ao
// pagamento chega depois.
//
// Contrato:
//   Request  { profissao, tarefa, ferramenta, nome, email, nif?,
//              aceitaTermos: true, renunciaLivreResolucao: true }
//   Response { ok: true, id }                — encomenda gravada
//            { ok: false, error }            — mostrar mensagem
//
// Campanha de lançamento: enquanto o pagamento não abre, as primeiras
// CAMPANHA.limite encomendas até CAMPANHA.ate recebem por email o acesso Pro
// ao guia de criação, sem custo. Uma por email. A encomenda fica com estado
// 'campanha'. Fora da campanha, a encomenda fica 'pendente', como antes.
//
// Variáveis de ambiente (painel da Vercel):
//   SUPABASE_URL               — URL da API Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — chave service_role (secreta)
//   JWT_SECRET                 — segredo do acesso Pro (o mesmo de _lib/pro-comum)
//   RESEND_API_KEY             — chave da API Resend (email de acesso)
//   PDF_FROM                   — remetente verificado no Resend
//   PRO_RETURN_BASE            — base do wizard (opcional; https://criar.proteinaludica.com)
//
// Sem dependências externas: fetch nativo do Node 18+ na Vercel.

'use strict';

const crypto = require('crypto');
const pro = require('./_lib/pro-comum');

// Preço do primeiro assistente, em cêntimos. Fonte única: o cliente não o dita.
const VALOR_CENTS = 4900;

// Versão dos termos aceites: a data de "Última actualização" de /termos.
const VERSAO_TERMOS = '2026-11';

// Campanha de lançamento. Fim às 23:59 de Lisboa (UTC em Novembro).
const CAMPANHA = {
  ate: Date.parse('2026-11-30T23:59:59Z'),
  limite: 50,
};

const NOMES_PROFISSAO = {
  contabilista: 'Contabilista',
  advogado: 'Advogado',
  arquitecto: 'Arquitecto ou engenheiro',
  professor: 'Professor ou formador',
};

const NOMES_TAREFA = {
  'prazos-fiscais': 'Cartas a clientes sobre prazos fiscais',
  'resumo-mensal': 'Resumo mensal das contas do cliente',
  'duvidas-frequentes': 'Respostas a dúvidas frequentes',
  'contestacao': 'Primeira versão de contestação',
  'estado-processo': 'Cartas a clientes sobre o estado do processo',
  'resumo-documentos': 'Resumo de documentos recebidos',
  'memoria-descritiva': 'Memória descritiva',
  'visita-obra': 'Relatório de visita à obra',
  'honorarios': 'Propostas de honorários',
  'planos-aula': 'Planos de aula',
  'avaliacoes': 'Comentários às avaliações dos alunos',
  'encarregados-educacao': 'Comunicações aos encarregados de educação',
};

// Tarefas de cada profissão. Os identificadores são os das páginas da montra.
const TAREFAS = {
  contabilista: ['prazos-fiscais', 'resumo-mensal', 'duvidas-frequentes'],
  advogado: ['contestacao', 'estado-processo', 'resumo-documentos'],
  arquitecto: ['memoria-descritiva', 'visita-obra', 'honorarios'],
  professor: ['planos-aula', 'avaliacoes', 'encarregados-educacao'],
};

// As mesmas ferramentas do Passo 1 do wizard.
const FERRAMENTAS = ['claude', 'gpt', 'gemini', 'copilot', 'perplexity', 'outra'];

const LIMITES = { nome: 120, email: 200, nif: 20, slug: 40 };

function cortar(v, max) {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

// Valida o pedido. Devolve { erro } ou { dados } pronto a gravar.
function validar(body) {
  const profissao = cortar(body.profissao, LIMITES.slug);
  const tarefa = cortar(body.tarefa, LIMITES.slug);
  const ferramenta = cortar(body.ferramenta, LIMITES.slug);
  const nome = cortar(body.nome, LIMITES.nome);
  const email = cortar(body.email, LIMITES.email);
  const nif = cortar(body.nif, LIMITES.nif).replace(/\s/g, '');

  if (!TAREFAS[profissao]) return { erro: 'Escolher a profissão.' };
  if (!TAREFAS[profissao].includes(tarefa)) return { erro: 'Escolher a tarefa.' };
  if (!FERRAMENTAS.includes(ferramenta)) return { erro: 'Escolher a ferramenta.' };
  if (!nome) return { erro: 'Falta preencher o nome.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: 'O email não parece válido.' };
  if (nif && !/^\d{9}$/.test(nif)) return { erro: 'O NIF tem 9 algarismos.' };
  if (body.aceitaTermos !== true) return { erro: 'É preciso aceitar os termos de utilização.' };
  if (body.renunciaLivreResolucao !== true) {
    return { erro: 'É preciso confirmar o pedido de acesso imediato.' };
  }

  const agora = new Date().toISOString();
  return {
    dados: {
      profissao,
      tarefa,
      ferramenta,
      nome,
      email,
      nif: nif || null,
      termos_aceites_em: agora,
      renuncia_livre_resolucao_em: agora,
      versao_termos: VERSAO_TERMOS,
      valor_cents: VALOR_CENTS,
    },
  };
}

function cabecalhos(chave, extra) {
  return Object.assign({ apikey: chave, Authorization: `Bearer ${chave}` }, extra || {});
}

// Escapa os caracteres especiais do ILIKE, para comparar o email tal e qual,
// sem distinguir maiúsculas.
function emailExacto(email) {
  return encodeURIComponent(email.replace(/[\\%_]/g, (c) => '\\' + c));
}

// Há lugar na campanha para este email? Em caso de dúvida (erro de rede ou
// do Supabase), responde que não: a encomenda segue como 'pendente'.
async function campanhaDisponivel(url, chave, email, agora) {
  if ((agora || Date.now()) > CAMPANHA.ate) return false;
  try {
    const base = `${url}/rest/v1/encomendas?estado=eq.campanha&select=id`;
    const usado = await fetch(`${base}&email=ilike.${emailExacto(email)}&limit=1`, { headers: cabecalhos(chave) });
    if (!usado.ok) return false;
    const linhas = await usado.json().catch(() => null);
    if (!Array.isArray(linhas) || linhas.length > 0) return false;

    const total = await fetch(base, { headers: cabecalhos(chave, { Prefer: 'count=exact', Range: '0-0' }) });
    if (!total.ok) return false;
    const n = Number(String(total.headers.get('content-range') || '').split('/')[1]);
    return Number.isFinite(n) && n < CAMPANHA.limite;
  } catch (err) {
    console.error('Erro a verificar a campanha:', err && err.message);
    return false;
  }
}

// Emite o acesso Pro (7 dias) e envia por email a ligação para o guia.
// Devolve true só se o email seguiu.
async function enviarAcessoCampanha(dados) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY em falta: campanha sem email de acesso.');
    return false;
  }
  try {
    const { token } = pro.emitirJWTpro('campanha-' + crypto.randomUUID());
    const base = (process.env.PRO_RETURN_BASE || 'https://criar.proteinaludica.com').replace(/\/+$/, '');
    const ligacao = `${base}/?acesso=${encodeURIComponent(token)}&ferramenta=${dados.ferramenta}`;
    const texto = [
      'Bom dia,',
      '',
      `A encomenda do assistente para «${NOMES_TAREFA[dados.tarefa]}» (${NOMES_PROFISSAO[dados.profissao]}) foi registada na campanha de lançamento da Proteína Lúdica, sem custo.`,
      '',
      'O guia de criação abre nesta ligação e fica disponível durante 7 dias:',
      ligacao,
      '',
      'No fim, o assistente e o PDF de instruções seguem por email.',
      '',
      'Durante o preenchimento, não se escrevem nomes, moradas, contactos nem números de identificação de terceiros.',
      '',
      'Um testemunho sobre a experiência é bem-vindo, sem qualquer obrigação. Basta responder a este email.',
      '',
      'Proteína Lúdica',
    ].join('\n');

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.PDF_FROM || 'Proteína Lúdica <onboarding@resend.dev>',
        to: [dados.email],
        reply_to: process.env.CONTACT_TO || 'info@proteinaludica.com',
        subject: 'Acesso ao guia de criação do assistente digital IA',
        text: texto,
      }),
    });
    if (!resp.ok) {
      console.error('Erro Resend (campanha):', resp.status, await resp.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Erro a enviar o acesso de campanha:', err && err.message);
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Campo-armadilha: invisível no formulário. Só um robô o preenche. Responde
    // como se tivesse corrido bem, para não ensinar o robô a contorná-lo.
    if (cortar(body.website, 50)) return res.status(200).json({ ok: true, id: null });

    // O cliente já valida antes de enviar; repete-se aqui porque o endpoint é
    // público e ninguém garante que o pedido veio do formulário.
    const { erro, dados } = validar(body);
    if (erro) return res.status(400).json({ ok: false, error: erro });

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta.');
      return res.status(503).json({ ok: false, error: 'Não foi possível registar a encomenda. Tentar de novo.' });
    }

    // Campanha: só se ainda houver lugar e o email não tiver tido acesso.
    // O email de acesso segue antes da gravação: se falhar, a encomenda fica
    // 'pendente' e ninguém fica com um lugar de campanha sem o ter recebido.
    let campanha = false;
    if (await campanhaDisponivel(supabaseUrl, supabaseKey, dados.email)) {
      campanha = await enviarAcessoCampanha(dados);
      if (campanha) dados.estado = 'campanha';
    }

    // Aqui a gravação bloqueia: sem linha na base de dados não há encomenda.
    const resp = await fetch(`${supabaseUrl}/rest/v1/encomendas?select=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(dados),
    });

    if (!resp.ok) {
      console.error('Erro Supabase encomendas:', resp.status, await resp.text());
      return res.status(502).json({ ok: false, error: 'Não foi possível registar a encomenda. Tentar de novo.' });
    }

    const linhas = await resp.json().catch(() => null);
    const id = Array.isArray(linhas) && linhas[0] ? linhas[0].id : null;
    return res.status(200).json({ ok: true, id, campanha });
  } catch (err) {
    console.error('Erro no handler de encomenda:', err);
    return res.status(500).json({ ok: false, error: 'Não foi possível registar a encomenda. Tentar de novo.' });
  }
};

module.exports.validar = validar;
module.exports.TAREFAS = TAREFAS;
module.exports.CAMPANHA = CAMPANHA;
module.exports.campanhaDisponivel = campanhaDisponivel;
