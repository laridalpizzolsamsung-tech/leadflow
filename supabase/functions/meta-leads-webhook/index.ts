// Webhook de formulários de anúncio do Meta (Lead Ads / leadgen).
// O lead entra no CRM e recebe na hora a primeira mensagem do agente no WhatsApp.
import { adminClient, assinaturaMetaValida, GRAPH, normalizarTelefone } from '../_shared/util.ts'
import { configWA, upsertLead, vincularAnuncio } from '../_shared/fluxo.ts'
import { enviarModelo } from '../_shared/whatsapp.ts'

const MODELO = Deno.env.get('WA_MODELO_BOAS_VINDAS') ?? 'boas_vindas_lead'

function campo(fields: any[], ...nomes: string[]) {
  for (const n of nomes) {
    const f = fields.find((x) => x.name?.toLowerCase() === n)
    if (f?.values?.[0]) return String(f.values[0])
  }
  return null
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.verify_token') === Deno.env.get('META_VERIFY_TOKEN')) return new Response(url.searchParams.get('hub.challenge') ?? '')
    return new Response('forbidden', { status: 403 })
  }
  const corpo = await req.text()
  if (!(await assinaturaMetaValida(req, corpo))) return new Response('assinatura inválida', { status: 401 })
  const payload = JSON.parse(corpo)
  const db = adminClient()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue
      const v = change.value
      const { data: integ } = await db.from('integracoes').select('empresa_id, meta_access_token').eq('meta_page_id', v.page_id).maybeSingle()
      if (!integ?.meta_access_token) continue

      try {
        const r = await fetch(`${GRAPH}/${v.leadgen_id}?fields=field_data,ad_id,ad_name,campaign_id,campaign_name,adset_name,created_time&access_token=${integ.meta_access_token}`)
        const ld = await r.json()
        if (!r.ok) throw new Error(JSON.stringify(ld))
        const f = ld.field_data ?? []
        const telefone = normalizarTelefone(campo(f, 'phone_number', 'telefone', 'whatsapp', 'celular') ?? '')
        if (!telefone) continue

        const vinculo = await vincularAnuncio(db, integ.empresa_id, { campaign_id: ld.campaign_id, campaign_name: ld.campaign_name, ad_id: ld.ad_id, ad_name: ld.ad_name })
        const { lead, novo } = await upsertLead(db, integ.empresa_id, {
          telefone,
          nome: campo(f, 'full_name', 'nome', 'first_name'),
          email: campo(f, 'email'),
          cidade: campo(f, 'city', 'cidade'),
          origem: 'meta_lead_ads',
          meta_lead_id: v.leadgen_id,
          ...vinculo,
        })

        // Primeira mensagem: fora da janela de 24h exige modelo aprovado pela Meta
        const cfg = await configWA(db, integ.empresa_id)
        if (novo && cfg) {
          const primeiroNome = (lead.nome ?? '').split(' ')[0] || 'tudo bem'
          const waId = await enviarModelo(cfg, telefone, MODELO, 'pt_BR', [primeiroNome])
          await db.from('mensagens').insert({ empresa_id: integ.empresa_id, lead_id: lead.id, autor: 'agente', conteudo: `[modelo ${MODELO}] Olá ${primeiroNome}! Recebemos seu interesse. Posso te ajudar por aqui?`, wa_message_id: waId })
        }
      } catch (e) {
        console.error('leadgen', e)
      }
    }
  }
  return new Response('ok')
})
