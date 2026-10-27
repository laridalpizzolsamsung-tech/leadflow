// Entrada genérica de leads: site, landing page, Google Ads (formulário), RD, Zapier etc.
// POST /lead-entrada?chave=<chave_webhook da empresa>
// Corpo JSON: { nome, telefone, email, empreendimento, utm_source, utm_medium, utm_campaign, utm_content, utm_term, origem }
import { adminClient, corsHeaders, json, normalizarTelefone } from '../_shared/util.ts'
import { configWA, upsertLead } from '../_shared/fluxo.ts'
import { enviarModelo } from '../_shared/whatsapp.ts'

const MODELO = Deno.env.get('WA_MODELO_BOAS_VINDAS') ?? 'boas_vindas_lead'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const chave = new URL(req.url).searchParams.get('chave')
  if (!chave) return json({ erro: 'chave ausente' }, 401)
  const db = adminClient()
  const { data: empresa } = await db.from('empresas').select('id').eq('chave_webhook', chave).maybeSingle()
  if (!empresa) return json({ erro: 'chave inválida' }, 401)

  let b: Record<string, any>
  const tipo = req.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) b = await req.json()
  else b = Object.fromEntries((await req.formData()).entries())

  const telefone = normalizarTelefone(b.telefone ?? b.phone ?? b.whatsapp ?? '')
  if (telefone.length < 12) return json({ erro: 'telefone inválido' }, 400)

  let empreendimento_id: string | undefined
  if (b.empreendimento) {
    const { data } = await db.from('empreendimentos').select('id').eq('empresa_id', empresa.id).ilike('nome', `%${b.empreendimento}%`).limit(1).maybeSingle()
    empreendimento_id = data?.id
  }

  // Campanha pelo utm_campaign (cruza com campanhas sincronizadas do Meta/Google pelo nome)
  let campanha_id: string | undefined
  if (b.utm_campaign) {
    const { data } = await db.from('campanhas').select('id').eq('empresa_id', empresa.id).or(`nome.eq.${b.utm_campaign},id_externo.eq.${b.utm_campaign}`).limit(1).maybeSingle()
    campanha_id = data?.id
  }

  const origem = ['google_ads', 'site', 'manual', 'outro'].includes(b.origem) ? b.origem : (b.utm_source?.includes('google') ? 'google_ads' : 'site')
  const { lead, novo } = await upsertLead(db, empresa.id, {
    telefone, nome: b.nome ?? b.name ?? null, email: b.email ?? null, origem, empreendimento_id, campanha_id,
    utm_source: b.utm_source ?? null, utm_medium: b.utm_medium ?? null, utm_campaign: b.utm_campaign ?? null,
    utm_content: b.utm_content ?? null, utm_term: b.utm_term ?? null,
  })

  const cfg = await configWA(db, empresa.id)
  if (novo && cfg) {
    const primeiroNome = (lead.nome ?? '').split(' ')[0] || 'tudo bem'
    try {
      const waId = await enviarModelo(cfg, telefone, MODELO, 'pt_BR', [primeiroNome])
      await db.from('mensagens').insert({ empresa_id: empresa.id, lead_id: lead.id, autor: 'agente', conteudo: `[modelo ${MODELO}] Olá ${primeiroNome}! Recebemos seu interesse. Posso te ajudar por aqui?`, wa_message_id: waId })
    } catch (e) { console.error(e) }
  }
  return json({ ok: true, lead_id: lead.id, novo })
})
