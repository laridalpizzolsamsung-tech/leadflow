// Ações feitas por usuários logados no CRM:
//  - enviar_mensagem: corretor responde o lead pelo WhatsApp da empresa
//  - assumir / devolver_ia: pausa ou retoma o agente
//  - visita_realizada / venda / perda: registra e envia conversão ao Meta
//  - testar_agente: simula uma conversa com o agente sem WhatsApp (botão "testar meu agente")
import { adminClient, corsHeaders, json, userClient } from '../_shared/util.ts'
import { atenderLead, configWA, etapaPorTipoOuOrdem, registrarEvento } from '../_shared/fluxo.ts'
import { enviarTexto } from '../_shared/whatsapp.ts'
import { enviarConversao } from '../_shared/conversoes.ts'
import { rodarAgente } from '../_shared/agente.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const uc = userClient(req)
  const { data: { user } } = await uc.auth.getUser()
  if (!user) return json({ erro: 'não autenticado' }, 401)
  const b = await req.json()
  const db = adminClient()

  // Teste do agente (não precisa de lead)
  if (b.acao === 'testar_agente') {
    const { data: m } = await uc.from('membros').select('empresa_id').eq('user_id', user.id).limit(1).single()
    if (!m) return json({ erro: 'sem empresa' }, 403)
    const [{ data: empresa }, { data: agente }, { data: emps }] = await Promise.all([
      db.from('empresas').select('nome, cidade').eq('id', m.empresa_id).single(),
      db.from('agentes').select('*').eq('empresa_id', m.empresa_id).single(),
      db.from('empreendimentos').select('*').eq('empresa_id', m.empresa_id).eq('ativo', true),
    ])
    const r = await rodarAgente({ empresa: empresa!, agente: { ...agente, perguntas_qualificacao: agente.perguntas_qualificacao ?? [] }, empreendimentos: emps ?? [], lead: {}, historico: b.historico ?? [] })
    return json(r)
  }

  // Lê o PDF do material de vendas e devolve os campos do empreendimento preenchidos
  if (b.acao === 'extrair_material') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL') ?? 'claude-sonnet-5-5',
        max_tokens: 4000,
        tools: [{
          name: 'empreendimento', description: 'Dados do empreendimento extraídos do material',
          input_schema: { type: 'object', properties: {
            nome: { type: 'string' }, cidade: { type: 'string' }, bairro: { type: 'string' }, endereco: { type: 'string' },
            tipo: { type: 'string' }, status_obra: { type: 'string' }, preco_minimo: { type: 'number' }, preco_maximo: { type: 'number' },
            metragens: { type: 'string' }, dormitorios: { type: 'string' }, diferenciais: { type: 'string' },
            condicoes_pagamento: { type: 'string' }, programa_habitacional: { type: 'string' }, previsao_entrega: { type: 'string' },
            material_texto: { type: 'string', description: 'Resumo completo e fiel do material, até 3000 caracteres, para o agente consultar' },
          }, required: ['nome', 'material_texto'] },
        }],
        tool_choice: { type: 'tool', name: 'empreendimento' },
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.pdf_base64 } },
          { type: 'text', text: 'Extraia os dados deste material de vendas imobiliário. Não invente valores ausentes.' },
        ] }],
      }),
    })
    const d = await r.json()
    if (!r.ok) return json({ erro: d?.error?.message ?? 'falha ao ler PDF' }, 400)
    return json(d.content.find((c: any) => c.type === 'tool_use')?.input ?? {})
  }

  // Confere acesso ao lead respeitando RLS (corretor só acessa os seus)
  const { data: lead } = await uc.from('leads').select('*').eq('id', b.lead_id).single()
  if (!lead) return json({ erro: 'lead não encontrado' }, 404)
  const { data: membro } = await db.from('membros').select('id, nome').eq('user_id', user.id).eq('empresa_id', lead.empresa_id).single()

  switch (b.acao) {
    case 'enviar_mensagem': {
      const cfg = await configWA(db, lead.empresa_id)
      if (!cfg) return json({ erro: 'WhatsApp não conectado' }, 400)
      const waId = await enviarTexto(cfg, lead.telefone, b.texto)
      await db.from('mensagens').insert({ empresa_id: lead.empresa_id, lead_id: lead.id, autor: 'corretor', membro_id: membro?.id, conteudo: b.texto, wa_message_id: waId })
      const patch: Record<string, unknown> = { atendimento_humano: true, ultima_mensagem_em: new Date().toISOString() }
      if (!lead.primeira_resposta_corretor_em) patch.primeira_resposta_corretor_em = new Date().toISOString()
      await db.from('leads').update(patch).eq('id', lead.id)
      return json({ ok: true })
    }
    case 'assumir':
      await db.from('leads').update({ atendimento_humano: true }).eq('id', lead.id)
      await registrarEvento(db, lead, 'nota', `${membro?.nome} assumiu o atendimento`)
      return json({ ok: true })
    case 'devolver_ia':
      await db.from('leads').update({ atendimento_humano: false }).eq('id', lead.id)
      await registrarEvento(db, lead, 'nota', `${membro?.nome} devolveu o atendimento para a IA`)
      await atenderLead(db, lead.id, await configWA(db, lead.empresa_id))
      return json({ ok: true })
    case 'visita_realizada': {
      await db.from('leads').update({ visita_realizada: true }).eq('id', lead.id)
      await registrarEvento(db, lead, 'visita', 'Visita realizada')
      await enviarConversao(db, lead, 'VisitaRealizada')
      return json({ ok: true })
    }
    case 'venda': {
      const etapa = await etapaPorTipoOuOrdem(db, lead.empresa_id, { tipo: 'ganho' })
      await db.from('leads').update({ valor_venda: b.valor ?? null, etapa_id: etapa, temperatura: 'quente' }).eq('id', lead.id)
      await registrarEvento(db, lead, 'venda', `Venda registrada${b.valor ? ` — R$ ${b.valor}` : ''}`)
      await enviarConversao(db, lead, 'Venda', b.valor)
      return json({ ok: true })
    }
    case 'perda': {
      const etapa = await etapaPorTipoOuOrdem(db, lead.empresa_id, { tipo: 'perdido' })
      await db.from('leads').update({ motivo_perda: b.motivo ?? null, etapa_id: etapa }).eq('id', lead.id)
      await registrarEvento(db, lead, 'perda', `Perdido: ${b.motivo ?? 'sem motivo'}`)
      return json({ ok: true })
    }
  }
  return json({ erro: 'ação desconhecida' }, 400)
})
