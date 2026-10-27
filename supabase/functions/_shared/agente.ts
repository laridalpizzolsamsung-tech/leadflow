// Agente de atendimento: conversa, qualifica e classifica o lead.
// Usa a API do Claude com uma ferramenta estruturada, para que cada resposta
// traga também os dados extraídos e a classificação (quente/morno/frio).

const MODELO = Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5-5'

export interface ContextoAgente {
  empresa: { nome: string; cidade?: string | null }
  agente: {
    nome_agente: string
    tom_de_voz: string
    mensagem_boas_vindas?: string | null
    perguntas_qualificacao: string[]
    instrucoes_extras?: string | null
  }
  empreendimentos: Record<string, unknown>[]
  lead: Record<string, unknown>
  historico: { autor: string; conteudo: string }[]
}

export interface ResultadoAgente {
  resposta: string
  temperatura: 'quente' | 'morno' | 'frio' | 'nao_classificado'
  pontuacao: number
  pronto_para_visita: boolean
  pedir_humano: boolean
  resumo: string
  dados: Record<string, unknown>
  tokens: number
}

const FERRAMENTA = {
  name: 'responder_e_classificar',
  description: 'Envia a próxima mensagem ao lead e registra o que foi aprendido na conversa.',
  input_schema: {
    type: 'object',
    properties: {
      resposta: { type: 'string', description: 'Mensagem a enviar no WhatsApp. Curta (até 3 frases), natural, uma pergunta por vez.' },
      temperatura: { type: 'string', enum: ['quente', 'morno', 'frio', 'nao_classificado'] },
      pontuacao: { type: 'integer', minimum: 0, maximum: 100, description: 'Probabilidade de compra estimada' },
      pronto_para_visita: { type: 'boolean', description: 'true quando o lead aceitou ou pediu visita / atendimento com corretor' },
      pedir_humano: { type: 'boolean', description: 'true se o lead pediu falar com uma pessoa, reclamou ou fez pergunta que você não pode responder' },
      resumo: { type: 'string', description: 'Resumo em até 5 linhas para o corretor: o que quer, quanto pode pagar, principal dúvida, melhor abordagem.' },
      dados: {
        type: 'object',
        description: 'Somente campos que o lead informou ou que dá para inferir com segurança. Omita o resto.',
        properties: {
          nome: { type: 'string' },
          email: { type: 'string' },
          genero: { type: 'string', enum: ['masculino', 'feminino', 'outro'] },
          idade: { type: 'integer' },
          faixa_etaria: { type: 'string', enum: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] },
          cidade: { type: 'string' },
          bairro_interesse: { type: 'string' },
          tipo_imovel: { type: 'string' },
          finalidade: { type: 'string', enum: ['morar', 'investir'] },
          renda_familiar: { type: 'number' },
          orcamento: { type: 'number' },
          usa_financiamento: { type: 'boolean' },
          usa_fgts: { type: 'boolean' },
          prazo_compra: { type: 'string' },
          primeiro_imovel: { type: 'boolean' },
          objecao_principal: { type: 'string' },
          empreendimento_interesse: { type: 'string', description: 'Nome exato de um dos empreendimentos' },
          visita_sugerida: { type: 'string', description: 'Data/horário que o lead sugeriu para visita, em texto' },
        },
      },
    },
    required: ['resposta', 'temperatura', 'pontuacao', 'pronto_para_visita', 'pedir_humano', 'resumo', 'dados'],
  },
}

function promptSistema(c: ContextoAgente): string {
  const emps = c.empreendimentos.length
    ? c.empreendimentos.map((e) => JSON.stringify(e)).join('\n')
    : '(nenhum empreendimento cadastrado — não invente informações de imóveis)'
  return `Você é ${c.agente.nome_agente}, consultora de atendimento da ${c.empresa.nome}${c.empresa.cidade ? ` (${c.empresa.cidade})` : ''}, uma construtora.
Você atende pelo WhatsApp pessoas que chegaram por anúncios. Tom de voz: ${c.agente.tom_de_voz}.

OBJETIVO
1. Acolher e entender a necessidade da pessoa.
2. Qualificar com naturalidade, uma pergunta por mensagem. Perguntas-guia (adapte, não faça interrogatório):
${c.agente.perguntas_qualificacao.map((p) => `- ${p}`).join('\n')}
3. Apresentar o empreendimento mais adequado usando SOMENTE os dados abaixo.
4. Quando houver interesse real, convidar para uma visita ao decorado/obra ou conversa com o corretor. Ao aceitar, marque pronto_para_visita = true e diga que um corretor vai entrar em contato em seguida.

CLASSIFICAÇÃO
- quente: tem orçamento/renda compatível, prazo de até 6 meses, aceitou visita ou pediu proposta.
- morno: interesse real, mas prazo maior, dúvida de crédito ou ainda comparando.
- frio: só curiosidade, sem condição financeira, prazo indefinido ou parou de responder.
- nao_classificado: ainda sem informação suficiente.

REGRAS
- Mensagens curtas, linguagem de WhatsApp, no máximo 1 emoji ocasional.
- Nunca invente preço, prazo, metragem ou condição. Se não souber, diga que o corretor confirma.
- Não prometa aprovação de financiamento.
- Se pedirem para falar com uma pessoa, ou houver reclamação, marque pedir_humano = true.
- Não peça dados sensíveis (CPF, documentos, senha) pelo chat.
- Respeite a LGPD: se a pessoa pedir para não receber mais mensagens, agradeça e encerre (temperatura frio).
${c.agente.instrucoes_extras ? `\nINSTRUÇÕES DA EMPRESA\n${c.agente.instrucoes_extras}` : ''}

EMPREENDIMENTOS
${emps}

DADOS JÁ CONHECIDOS DO LEAD
${JSON.stringify(c.lead)}

Sempre responda chamando a ferramenta responder_e_classificar.`
}

export async function rodarAgente(c: ContextoAgente): Promise<ResultadoAgente> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada')

  // Converte o histórico para o formato de conversa (lead = user; agente/corretor = assistant)
  const msgs: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of c.historico.slice(-30)) {
    const role = m.autor === 'lead' ? 'user' : 'assistant'
    const texto = m.autor === 'corretor' ? `[corretor] ${m.conteudo}` : m.conteudo
    const ult = msgs[msgs.length - 1]
    if (ult && ult.role === role) ult.content += '\n' + texto
    else msgs.push({ role, content: texto })
  }
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(o lead iniciou contato pelo anúncio)' })
  if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '(sem nova mensagem — continue o atendimento)' })

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1024,
      system: promptSistema(c),
      tools: [FERRAMENTA],
      tool_choice: { type: 'tool', name: FERRAMENTA.name },
      messages: msgs,
    }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(`IA: ${JSON.stringify(data?.error ?? data)}`)
  const bloco = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use')
  if (!bloco) throw new Error('IA não retornou a ferramenta')
  const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
  return { ...(bloco.input as Omit<ResultadoAgente, 'tokens'>), tokens }
}
