// Conexão "em um clique" com a Meta, feita pelo próprio cliente:
//  - acao "whatsapp": cadastro incorporado (Embedded Signup) do WhatsApp Business
//  - acao "anuncios_token": troca o login do Facebook por token de longa duração e lista contas/páginas
//  - acao "anuncios_salvar": salva conta de anúncios, página e pixel escolhidos e assina o webhook de leads
import { adminClient, corsHeaders, GRAPH, json, userClient } from '../_shared/util.ts'

const APP_ID = Deno.env.get('META_APP_ID')!
const APP_SECRET = Deno.env.get('META_APP_SECRET')!

async function g(path: string, params: Record<string, string> = {}, method = 'GET') {
  const qs = new URLSearchParams(params).toString()
  const r = await fetch(`${GRAPH}/${path}${qs ? `?${qs}` : ''}`, { method })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.error?.message ?? JSON.stringify(d))
  return d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const uc = userClient(req)
  const { data: { user } } = await uc.auth.getUser()
  if (!user) return json({ erro: 'não autenticado' }, 401)
  const { data: m } = await uc.from('membros').select('empresa_id, papel').eq('user_id', user.id).limit(1).single()
  if (!m || m.papel !== 'admin') return json({ erro: 'apenas administradores' }, 403)
  const db = adminClient()
  const b = await req.json()

  try {
    if (b.acao === 'whatsapp') {
      // b: { code, waba_id, phone_number_id }
      const tok = await g('oauth/access_token', { client_id: APP_ID, client_secret: APP_SECRET, code: b.code })
      const token = tok.access_token as string
      // Inscreve nosso app nos webhooks da WABA do cliente
      await fetch(`${GRAPH}/${b.waba_id}/subscribed_apps`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      // Registra o número na Cloud API (PIN de 2 etapas definido pelo sistema)
      const pin = String(Math.floor(100000 + Math.random() * 900000))
      await fetch(`${GRAPH}/${b.phone_number_id}/register`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
      })
      const num = await g(b.phone_number_id, { fields: 'display_phone_number,verified_name', access_token: token })
      await db.from('integracoes').update({
        wa_access_token: token, wa_business_account_id: b.waba_id, wa_phone_number_id: b.phone_number_id,
        wa_numero_exibicao: num.display_phone_number, wa_conectado: true, atualizado_em: new Date().toISOString(),
      }).eq('empresa_id', m.empresa_id)
      return json({ ok: true, numero: num.display_phone_number, nome: num.verified_name })
    }

    if (b.acao === 'anuncios_token') {
      // b: { access_token } vindo do FB.login no navegador
      const longo = await g('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: b.access_token })
      const token = longo.access_token as string
      const [contas, paginas] = await Promise.all([
        g('me/adaccounts', { fields: 'id,name,account_status,currency', limit: '100', access_token: token }),
        g('me/accounts', { fields: 'id,name,access_token', limit: '100', access_token: token }),
      ])
      let pixels: unknown[] = []
      if (contas.data?.[0]) {
        const px = await g(`${contas.data[0].id}/adspixels`, { fields: 'id,name', access_token: token }).catch(() => ({ data: [] }))
        pixels = px.data
      }
      await db.from('integracoes').update({ meta_access_token: token }).eq('empresa_id', m.empresa_id)
      return json({ contas: contas.data, paginas: (paginas.data ?? []).map((p: any) => ({ id: p.id, name: p.name })), pixels })
    }

    if (b.acao === 'anuncios_salvar') {
      // b: { ad_account_id, page_id, pixel_id }
      const { data: integ } = await db.from('integracoes').select('meta_access_token').eq('empresa_id', m.empresa_id).single()
      const paginas = await g('me/accounts', { fields: 'id,access_token', access_token: integ!.meta_access_token })
      const pagina = paginas.data.find((p: any) => p.id === b.page_id)
      if (pagina) {
        // Assina o webhook de leads (formulários) da página
        await fetch(`${GRAPH}/${b.page_id}/subscribed_apps?subscribed_fields=leadgen&access_token=${pagina.access_token}`, { method: 'POST' })
      }
      await db.from('integracoes').update({
        meta_ad_account_id: b.ad_account_id, meta_page_id: b.page_id, meta_pixel_id: b.pixel_id ?? null,
        meta_conectado: true, atualizado_em: new Date().toISOString(),
      }).eq('empresa_id', m.empresa_id)
      // Primeira sincronização de campanhas
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-sincronizar`, {
        method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: m.empresa_id, dias: 30 }),
      }).catch(() => {})
      return json({ ok: true })
    }

    if (b.acao === 'desconectar') {
      const campos = b.qual === 'whatsapp'
        ? { wa_conectado: false, wa_access_token: null }
        : { meta_conectado: false, meta_access_token: null }
      await db.from('integracoes').update(campos).eq('empresa_id', m.empresa_id)
      return json({ ok: true })
    }
  } catch (e) {
    return json({ erro: (e as Error).message }, 400)
  }
  return json({ erro: 'ação desconhecida' }, 400)
})
