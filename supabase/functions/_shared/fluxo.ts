// Fluxo central: recebe/cria o lead, roda o agente, aplica a classificação,
// entrega ao corretor na etapa de visita e notifica.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { rodarAgente } from './agente.ts'
import { enviarTexto, type ConfigWA } from './whatsapp.ts'
import { enviarConversao } from './conversoes.ts'
import { mesAtual } from './util.ts'

const CAMPOS_LEAD = [
  'nome', 'email', 'genero', 'idade', 'faixa_etaria', 'cidade', 'bairro_interesse', 'tipo_imovel', 'finalidade',
  'renda_familiar', 'orcamento', 'usa_financiamento', 'usa_fgts', 'prazo_compra', 'primeiro_imovel', 'objecao_principal',
]

export async function etapaPorTipoOuOrdem(db: SupabaseClient, empresaId: string, alvo: { tipo?: string; ordem?: number }) {
  let q = db.from('etapas_funil').select('id').eq('empresa_id', empresaId)
  q = alvo.tipo ? q.eq('tipo', alvo.tipo) : q.eq('ordem', alvo.ordem!)
  const { data } = await q.order('ordem').limit(1).maybeSingle()
  return data?.id as string | undefined
}

export async function registrarEvento(db: SupabaseClient, lead: { id: string; empresa_id: string }, tipo: string, descricao: string, dados?: unknown) {
  await db.from('eventos_lead').insert({ empresa_id: lead.empresa_id, lead_id: lead.id, tipo, descricao, dados })
}

export async function incrementarUso(db: SupabaseClient, empresaId: string, campo: 'leads' | 'mensagens_ia', tokens = 0) {
  const mes = mesAtual()
  const { data } = await db.from('uso_mensal').select('*').eq('empresa_id', empresaId).eq('mes', mes).maybeSingle()
  const atual = data ?? { empresa_id: empresaId, mes, leads: 0, mensagens_ia: 0, tokens_ia: 0 }
  atual[campo] += 1
  atual.tokens_ia += tokens
  await db.from('uso_mensal').upsert(atual)
}

/** Atribui o lead ao próximo corretor do rodízio e avisa no WhatsApp dele. */
export async function atribuirCorretor(db: SupabaseClient, lead: Record<string, any>, cfg: ConfigWA | null) {
  if (lead.corretor_id) return lead.corretor_id
  const { data: corretorId } = await db.rpc('proximo_corretor', { eid: lead.empresa_id })
  if (!corretorId) return null
  const agora = new Date().toISOString()
  await db.from('leads').update({ corretor_id: corretorId, atribuido_em: agora, sla_alertado: false }).eq('id', lead.id)
  await db.from('membros').update({ ultimo_lead_em: agora }).eq('id', corretorId)
  const { data: corretor } = await db.from('membros').select('nome, telefone').eq('id', corretorId).single()
  await registrarEvento(db, lead as any, 'atribuido', `Lead entregue para ${corretor?.nome}`)
  if (cfg && corretor?.telefone) {
    const app = Deno.env.get('APP_URL') ?? ''
    const texto = `🔥 *Novo lead ${lead.temperatura === 'quente' ? 'QUENTE' : ''} para você*\n\n` +
      `*${lead.nome ?? 'Sem nome'}* — wa.me/${lead.telefone}\n\n${lead.resumo_ia ?? ''}\n\n` +
      (app ? `Abrir no sistema: ${app}/leads/${lead.id}` : '')
    await enviarTexto(cfg, corretor.telefone, texto).catch((e) => console.error('notificar corretor', e))
  }
  return corretorId
}

/** Processa uma mensagem recebida do lead (ou o primeiro contato) e responde. */
export async function atenderLead(db: SupabaseClient, leadId: string, cfg: ConfigWA | null) {
  const { data: lead } = await db.from('leads').select('*').eq('id', leadId).single()
  if (!lead || lead.atendimento_humano) return

  const [{ data: empresa }, { data: agente }, { data: emps }, { data: hist }] = await Promise.all([
    db.from('empresas').select('nome, cidade, status_assinatura').eq('id', lead.empresa_id).single(),
    db.from('agentes').select('*').eq('empresa_id', lead.empresa_id).single(),
    db.from('empreendimentos').select('nome,cidade,bairro,tipo,status_obra,preco_minimo,preco_maximo,metragens,dormitorios,diferenciais,condicoes_pagamento,aceita_financiamento,programa_habitacional,previsao_entrega,material_texto,link_material').eq('empresa_id', lead.empresa_id).eq('ativo', true),
    db.from('mensagens').select('autor, conteudo').eq('lead_id', leadId).order('criado_em'),
  ])
  if (!agente?.ativo || empresa?.status_assinatura === 'cancelada' || empresa?.status_assinatura === 'inadimplente') return

  const conhecidos: Record<string, unknown> = {}
  for (const k of CAMPOS_LEAD) if (lead[k] != null) conhecidos[k] = lead[k]

  const r = await rodarAgente({
    empresa: empresa!,
    agente: { ...agente, perguntas_qualificacao: agente.perguntas_qualificacao ?? [] },
    empreendimentos: emps ?? [],
    lead: conhecidos,
    historico: hist ?? [],
  })

  // 1) Envia a resposta
  let waId: string | undefined
  if (cfg && r.resposta) waId = await enviarTexto(cfg, lead.telefone, r.resposta)
  await db.from('mensagens').insert({ empresa_id: lead.empresa_id, lead_id: leadId, autor: 'agente', conteudo: r.resposta, wa_message_id: waId })
  await incrementarUso(db, lead.empresa_id, 'mensagens_ia', r.tokens)

  // 2) Atualiza dados do lead
  const upd: Record<string, unknown> = { resumo_ia: r.resumo, pontuacao: r.pontuacao, ultima_mensagem_em: new Date().toISOString() }
  for (const k of CAMPOS_LEAD) if (r.dados?.[k] != null && r.dados[k] !== '') upd[k] = r.dados[k]
  if (r.dados?.empreendimento_interesse) {
    const { data: e } = await db.from('empreendimentos').select('id').eq('empresa_id', lead.empresa_id).ilike('nome', String(r.dados.empreendimento_interesse)).maybeSingle()
    if (e) upd.empreendimento_id = e.id
  }
  if (r.temperatura !== lead.temperatura && r.temperatura !== 'nao_classificado') {
    upd.temperatura = r.temperatura
    await registrarEvento(db, lead, 'temperatura', `Classificado como ${r.temperatura}`)
  }

  // Avança no funil: Novo → Em atendimento IA → Qualificado
  const { data: etapaAtual } = lead.etapa_id
    ? await db.from('etapas_funil').select('ordem, tipo').eq('id', lead.etapa_id).single()
    : { data: null }
  const ordemAtual = etapaAtual?.ordem ?? 1
  if (ordemAtual < 2) upd.etapa_id = await etapaPorTipoOuOrdem(db, lead.empresa_id, { ordem: 2 })
  if (ordemAtual < 3 && (r.temperatura === 'quente' || r.temperatura === 'morno') && r.pontuacao >= 50) {
    upd.etapa_id = await etapaPorTipoOuOrdem(db, lead.empresa_id, { ordem: 3 })
  }

  // 3) Visita / humano → entrega ao corretor e pausa o agente
  if (r.pronto_para_visita || r.pedir_humano) {
    upd.atendimento_humano = true
    if (r.pronto_para_visita) {
      const etapaVisita = await etapaPorTipoOuOrdem(db, lead.empresa_id, { tipo: 'visita' })
      if (etapaVisita) upd.etapa_id = etapaVisita
    }
  }
  await db.from('leads').update(upd).eq('id', leadId)
  const atualizado = { ...lead, ...upd }

  if (r.pronto_para_visita || r.pedir_humano) {
    await registrarEvento(db, lead, r.pronto_para_visita ? 'visita' : 'humano',
      r.pronto_para_visita ? `Lead pronto para visita${r.dados?.visita_sugerida ? ` (sugeriu: ${r.dados.visita_sugerida})` : ''}` : 'Lead pediu atendimento humano')
    await atribuirCorretor(db, atualizado, cfg)
    if (r.pronto_para_visita) await enviarConversao(db, atualizado, 'VisitaAgendada')
  }
  if (upd.temperatura === 'quente') await enviarConversao(db, atualizado, 'LeadQuente')
  else if (upd.etapa_id && ordemAtual < 3 && r.pontuacao >= 50) await enviarConversao(db, atualizado, 'LeadQualificado')
}

/** Busca o token/número do WhatsApp da empresa. */
export async function configWA(db: SupabaseClient, empresaId: string): Promise<ConfigWA | null> {
  const { data } = await db.from('integracoes').select('wa_phone_number_id, wa_access_token, wa_conectado').eq('empresa_id', empresaId).single()
  if (!data?.wa_conectado || !data.wa_phone_number_id || !data.wa_access_token) return null
  return { wa_phone_number_id: data.wa_phone_number_id, wa_access_token: data.wa_access_token }
}

/** Cria (ou reaproveita) um lead pelo telefone. */
export async function upsertLead(db: SupabaseClient, empresaId: string, dados: Record<string, unknown> & { telefone: string }) {
  const { data: existente } = await db.from('leads').select('*').eq('empresa_id', empresaId).eq('telefone', dados.telefone).maybeSingle()
  if (existente) {
    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(dados)) if (v != null && existente[k] == null) patch[k] = v
    if (Object.keys(patch).length) await db.from('leads').update(patch).eq('id', existente.id)
    return { lead: { ...existente, ...patch }, novo: false }
  }
  const etapa = await etapaPorTipoOuOrdem(db, empresaId, { ordem: 1 })
  const { data: lead, error } = await db.from('leads').insert({ empresa_id: empresaId, etapa_id: etapa, ...dados }).select('*').single()
  if (error) throw error
  await registrarEvento(db, lead, 'criado', `Lead criado via ${dados.origem ?? 'desconhecido'}`)
  await incrementarUso(db, empresaId, 'leads')
  return { lead, novo: true }
}

/** Garante campanha/criativo a partir de IDs externos do Meta. */
export async function vincularAnuncio(db: SupabaseClient, empresaId: string, ad: { campaign_id?: string; campaign_name?: string; ad_id?: string; ad_name?: string; headline?: string; body?: string; thumbnail_url?: string }) {
  let campanha_id: string | undefined
  let criativo_id: string | undefined
  if (ad.campaign_id) {
    const { data } = await db.from('campanhas').upsert({ empresa_id: empresaId, plataforma: 'meta', id_externo: ad.campaign_id, nome: ad.campaign_name ?? `Campanha ${ad.campaign_id}` }, { onConflict: 'empresa_id,plataforma,id_externo', ignoreDuplicates: false }).select('id').single()
    campanha_id = data?.id
  }
  if (ad.ad_id) {
    const { data } = await db.from('criativos').upsert({ empresa_id: empresaId, campanha_id, id_externo: ad.ad_id, nome: ad.ad_name ?? ad.headline ?? `Anúncio ${ad.ad_id}`, titulo: ad.headline, texto: ad.body, thumbnail_url: ad.thumbnail_url }, { onConflict: 'empresa_id,id_externo' }).select('id').single()
    criativo_id = data?.id
  }
  return { campanha_id, criativo_id }
}
