// Sincroniza campanhas, criativos, investimento diário e perfil (idade x gênero) do Meta Ads.
// Chamado pelo agendamento diário (todas as empresas) ou logo após conectar (uma empresa).
import { adminClient, GRAPH, json } from '../_shared/util.ts'

async function paginar(url: string): Promise<any[]> {
  const out: any[] = []
  let next: string | null = url
  while (next) {
    const r: Response = await fetch(next)
    const d: any = await r.json()
    if (!r.ok) throw new Error(d?.error?.message ?? JSON.stringify(d))
    out.push(...(d.data ?? []))
    next = d.paging?.next ?? null
  }
  return out
}

async function sincronizarEmpresa(db: ReturnType<typeof adminClient>, empresaId: string, dias: number) {
  const { data: integ } = await db.from('integracoes').select('meta_ad_account_id, meta_access_token').eq('empresa_id', empresaId).single()
  if (!integ?.meta_ad_account_id || !integ.meta_access_token) return { empresaId, pulado: true }
  const tk = integ.meta_access_token
  const conta = integ.meta_ad_account_id.startsWith('act_') ? integ.meta_ad_account_id : `act_${integ.meta_ad_account_id}`
  const ate = new Date()
  const de = new Date(Date.now() - dias * 86400000)
  const range = encodeURIComponent(JSON.stringify({ since: de.toISOString().slice(0, 10), until: ate.toISOString().slice(0, 10) }))

  // 1) Campanhas
  const camps = await paginar(`${GRAPH}/${conta}/campaigns?fields=id,name,status,objective&limit=200&access_token=${tk}`)
  const mapaCamp = new Map<string, string>()
  for (const c of camps) {
    const { data } = await db.from('campanhas').upsert({ empresa_id: empresaId, plataforma: 'meta', id_externo: c.id, nome: c.name, status: c.status, objetivo: c.objective }, { onConflict: 'empresa_id,plataforma,id_externo' }).select('id').single()
    if (data) mapaCamp.set(c.id, data.id)
  }

  // 2) Anúncios (criativos) com miniatura
  const ads = await paginar(`${GRAPH}/${conta}/ads?fields=id,name,campaign_id,creative{title,body,thumbnail_url,image_url}&limit=200&access_token=${tk}`)
  const mapaAd = new Map<string, string>()
  for (const a of ads) {
    const { data } = await db.from('criativos').upsert({
      empresa_id: empresaId, campanha_id: mapaCamp.get(a.campaign_id) ?? null, id_externo: a.id, nome: a.name,
      titulo: a.creative?.title ?? null, texto: a.creative?.body ?? null, thumbnail_url: a.creative?.thumbnail_url ?? a.creative?.image_url ?? null,
    }, { onConflict: 'empresa_id,id_externo' }).select('id').single()
    if (data) mapaAd.set(a.id, data.id)
  }

  // 3) Investimento diário por anúncio
  const ins = await paginar(`${GRAPH}/${conta}/insights?level=ad&time_increment=1&time_range=${range}&fields=ad_id,campaign_id,spend,impressions,clicks,reach&limit=500&access_token=${tk}`)
  const linhas = ins.map((i) => ({
    empresa_id: empresaId, data: i.date_start,
    campanha_id: mapaCamp.get(i.campaign_id) ?? null, criativo_id: mapaAd.get(i.ad_id) ?? null,
    investimento: Number(i.spend ?? 0), impressoes: Number(i.impressions ?? 0), cliques: Number(i.clicks ?? 0), alcance: Number(i.reach ?? 0),
  })).filter((l) => l.campanha_id && l.criativo_id)
  for (let k = 0; k < linhas.length; k += 500) {
    await db.from('metricas_diarias').upsert(linhas.slice(k, k + 500), { onConflict: 'empresa_id,data,campanha_id,criativo_id' })
  }

  // 4) Perfil: idade x gênero por campanha
  const demo = await paginar(`${GRAPH}/${conta}/insights?level=campaign&time_increment=1&time_range=${range}&breakdowns=age,gender&fields=campaign_id,spend,actions&limit=500&access_token=${tk}`)
  const linhasDemo = demo.map((d) => ({
    empresa_id: empresaId, data: d.date_start, campanha_id: mapaCamp.get(d.campaign_id) ?? null,
    faixa_etaria: d.age, genero: d.gender === 'male' ? 'masculino' : d.gender === 'female' ? 'feminino' : 'outro',
    investimento: Number(d.spend ?? 0),
    leads: Number((d.actions ?? []).filter((a: any) => ['lead', 'onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.lead_grouped'].includes(a.action_type)).reduce((s: number, a: any) => s + Number(a.value), 0)),
  })).filter((l) => l.campanha_id)
  for (let k = 0; k < linhasDemo.length; k += 500) {
    await db.from('metricas_demograficas').upsert(linhasDemo.slice(k, k + 500), { onConflict: 'empresa_id,data,campanha_id,faixa_etaria,genero' })
  }

  return { empresaId, campanhas: camps.length, anuncios: ads.length, linhas: linhas.length, demografia: linhasDemo.length }
}

Deno.serve(async (req) => {
  // Só o próprio servidor (service role) ou o agendador chamam esta função
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return json({ erro: 'não autorizado' }, 401)
  const b = await req.json().catch(() => ({}))
  const db = adminClient()
  const dias = Number(b.dias ?? 3)
  const empresas = b.empresa_id
    ? [{ empresa_id: b.empresa_id }]
    : (await db.from('integracoes').select('empresa_id').eq('meta_conectado', true)).data ?? []
  const resultados = []
  for (const e of empresas) {
    try { resultados.push(await sincronizarEmpresa(db, e.empresa_id, dias)) }
    catch (err) { resultados.push({ empresaId: e.empresa_id, erro: (err as Error).message }) }
  }
  return json({ resultados })
})
