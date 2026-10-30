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
// Variáveis de ambiente (painel da Vercel):
//   SUPABASE_URL               — URL da API Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — chave service_role (secreta)
//
// Sem dependências externas: fetch nativo do Node 18+ na Vercel.

'use strict';

// Preço do primeiro assistente, em cêntimos. Fonte única: o cliente não o dita.
const VALOR_CENTS = 4900;

// Versão dos termos aceites: a data de "Última actualização" de /termos.
const VERSAO_TERMOS = '2026-06';

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
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('Erro no handler de encomenda:', err);
    return res.status(500).json({ ok: false, error: 'Não foi possível registar a encomenda. Tentar de novo.' });
  }
};

module.exports.validar = validar;
module.exports.TAREFAS = TAREFAS;
