// Webhook da WhatsApp Cloud API.
// Um único app da Meta atende todas as empresas: a empresa é identificada pelo phone_number_id.
import { adminClient, assinaturaMetaValida, normalizarTelefone } from '../_shared/util.ts'
import { atenderLead, configWA, registrarEvento, upsertLead, vincularAnuncio } from '../_shared/fluxo.ts'
import { marcarComoLida } from '../_shared/whatsapp.ts'

// Agrupa mensagens enviadas em sequência (a pessoa manda 3 mensagens seguidas → 1 resposta)
const ESPERA_MS = Number(Deno.env.get('AGENTE_ESPERA_MS') ?? 6000)

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Verificação do webhook (configuração no painel da Meta)
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === Deno.env.get('META_VERIFY_TOKEN')) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
    }
    return new Response('forbidden', { status: 403 })
  }

  const corpo = await req.text()
  if (!(await assinaturaMetaValida(req, corpo))) return new Response('assinatura inválida', { status: 401 })
  const payload = JSON.parse(corpo)
  const db = adminClient()

  const tarefas: Promise<unknown>[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value
      if (!v?.metadata?.phone_number_id) continue
      const { data: integ } = await db.from('integracoes').select('empresa_id').eq('wa_phone_number_id', v.metadata.phone_number_id).maybeSingle()
      if (!integ) continue
      const empresaId = integ.empresa_id
      const cfg = await configWA(db, empresaId)

      // Status de entrega das mensagens enviadas
      for (const st of v.statuses ?? []) {
        await db.from('mensagens').update({ status_entrega: st.status }).eq('wa_message_id', st.id)
      }

      for (const msg of v.messages ?? []) {
        const contato = (v.contacts ?? []).find((c: any) => c.wa_id === msg.from)
        const telefone = normalizarTelefone(msg.from)
        const texto =
          msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ??
          (msg.type === 'audio' ? '[áudio recebido]' : msg.type === 'image' ? `[imagem] ${msg.image?.caption ?? ''}` : `[${msg.type}]`)

        // Origem: anúncio de clique para WhatsApp (referral)
        const ref = msg.referral
        let vinculo: { campanha_id?: string; criativo_id?: string } = {}
        if (ref?.source_type === 'ad' && ref.source_id) {
          vinculo = await vincularAnuncio(db, empresaId, { ad_id: ref.source_id, headline: ref.headline, body: ref.body, thumbnail_url: ref.thumbnail_url ?? ref.image_url })
        }

        const { lead, novo } = await upsertLead(db, empresaId, {
          telefone,
          nome: contato?.profile?.name ?? null,
          origem: ref ? 'meta_ctwa' : 'whatsapp_direto',
          ctwa_clid: ref?.ctwa_clid ?? null,
          ...vinculo,
        })

        await db.from('mensagens').insert({ empresa_id: empresaId, lead_id: lead.id, autor: 'lead', conteudo: texto, tipo: msg.type, wa_message_id: msg.id })
        await db.from('leads').update({ ultima_mensagem_em: new Date().toISOString() }).eq('id', lead.id)
        if (cfg) marcarComoLida(cfg, msg.id)

        // Lead antigo voltando após ser perdido → reabre
        if (!novo && lead.temperatura === 'frio') await registrarEvento(db, lead, 'nota', 'Lead frio voltou a conversar')

        if (!lead.atendimento_humano) {
          const ultimaId = msg.id
          tarefas.push((async () => {
            await new Promise((r) => setTimeout(r, ESPERA_MS))
            // Só responde se esta ainda for a última mensagem do lead
            const { data: ult } = await db.from('mensagens').select('wa_message_id').eq('lead_id', lead.id).eq('autor', 'lead').order('criado_em', { ascending: false }).limit(1).single()
            if (ult?.wa_message_id !== ultimaId) return
            await atenderLead(db, lead.id, cfg)
          })().catch((e) => console.error('atender', e)))
        }
      }
    }
  }

  // Responde 200 rápido para a Meta e continua o processamento em segundo plano
  // @ts-ignore EdgeRuntime existe no Supabase
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(Promise.all(tarefas))
  else await Promise.all(tarefas)
  return new Response('ok', { status: 200 })
})
