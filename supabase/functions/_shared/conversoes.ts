// API de Conversões da Meta: devolve ao algoritmo de anúncios os eventos que
// importam (lead qualificado, visita, venda), para otimizar por qualidade.
import { GRAPH, sha256 } from './util.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type EventoConversao = 'LeadQualificado' | 'LeadQuente' | 'VisitaAgendada' | 'VisitaRealizada' | 'Venda'

export async function enviarConversao(db: SupabaseClient, lead: Record<string, any>, evento: EventoConversao, valor?: number) {
  if (lead.conversao_enviada?.[evento]) return // já enviado
  const { data: integ } = await db.from('integracoes').select('meta_pixel_id, meta_access_token').eq('empresa_id', lead.empresa_id).single()
  if (!integ?.meta_pixel_id || !integ?.meta_access_token) return

  const user_data: Record<string, unknown> = { ph: [await sha256(lead.telefone)], country: [await sha256('br')] }
  if (lead.email) user_data.em = [await sha256(lead.email)]
  if (lead.meta_lead_id) user_data.lead_id = lead.meta_lead_id
  if (lead.ctwa_clid) user_data.ctwa_clid = lead.ctwa_clid

  const payload = {
    data: [{
      event_name: evento,
      event_time: Math.floor(Date.now() / 1000),
      action_source: lead.ctwa_clid ? 'business_messaging' : 'system_generated',
      messaging_channel: lead.ctwa_clid ? 'whatsapp' : undefined,
      user_data,
      custom_data: { lead_event_source: 'LeadFlow', event_source: 'crm', ...(valor ? { value: valor, currency: 'BRL' } : {}) },
    }],
  }
  const r = await fetch(`${GRAPH}/${integ.meta_pixel_id}/events?access_token=${integ.meta_access_token}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  if (r.ok) {
    await db.from('leads').update({ conversao_enviada: { ...(lead.conversao_enviada ?? {}), [evento]: new Date().toISOString() } }).eq('id', lead.id)
  } else {
    console.error('CAPI', await r.text())
  }
}
