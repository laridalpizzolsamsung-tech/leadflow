// Rotinas automáticas (agendadas pelo pg_cron):
//  - sla: corretor não respondeu o lead entregue dentro do prazo → alerta o gestor e redistribui
//  - retomada: lead parou de responder no meio da qualificação → agente manda um lembrete (dentro da janela de 24h)
//  - relatorio: relatório mensal no WhatsApp dos administradores
import { adminClient, json } from '../_shared/util.ts'
import { atenderLead, atribuirCorretor, configWA, registrarEvento } from '../_shared/fluxo.ts'
import { enviarTexto } from '../_shared/whatsapp.ts'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return json({ erro: 'não autorizado' }, 401)
  const { tipo } = await req.json().catch(() => ({ tipo: 'sla' }))
  const db = adminClient()
  const log: unknown[] = []

  if (tipo === 'sla') {
    const { data: empresas } = await db.from('empresas').select('id, sla_minutos').in('status_assinatura', ['teste', 'ativa'])
    for (const e of empresas ?? []) {
      const limite = new Date(Date.now() - e.sla_minutos * 60000).toISOString()
      const { data: atrasados } = await db.from('leads').select('*, corretor:membros!leads_corretor_id_fkey(nome)')
        .eq('empresa_id', e.id).not('corretor_id', 'is', null).is('primeira_resposta_corretor_em', null)
        .eq('sla_alertado', false).lt('atribuido_em', limite)
      if (!atrasados?.length) continue
      const cfg = await configWA(db, e.id)
      const { data: gestores } = await db.from('membros').select('telefone').eq('empresa_id', e.id).in('papel', ['admin', 'gestor']).eq('ativo', true).not('telefone', 'is', null)
      for (const l of atrasados) {
        const nomeCorretor = (l as any).corretor?.nome ?? 'corretor'
        await registrarEvento(db, l, 'sla', `${nomeCorretor} não respondeu em ${e.sla_minutos} min`)
        if (cfg) for (const g of gestores ?? []) {
          await enviarTexto(cfg, g.telefone, `⏰ *Lead sem resposta*\n${l.nome ?? l.telefone} foi entregue para ${nomeCorretor} há mais de ${e.sla_minutos} min e ainda não teve retorno. Redistribuindo.`).catch(() => {})
        }
        // Redistribui para o próximo do rodízio
        await db.from('leads').update({ corretor_id: null, sla_alertado: true }).eq('id', l.id)
        await atribuirCorretor(db, { ...l, corretor_id: null }, cfg)
        log.push({ lead: l.id })
      }
    }
  }

  if (tipo === 'retomada') {
    // Lead que o agente perguntou algo e ficou sem resposta entre 3h e 22h (ainda dentro da janela de 24h)
    const de = new Date(Date.now() - 22 * 3600000).toISOString()
    const ate = new Date(Date.now() - 3 * 3600000).toISOString()
    const { data: leads } = await db.from('leads').select('id, empresa_id, eventos:eventos_lead(tipo)')
      .eq('atendimento_humano', false).neq('temperatura', 'frio').gte('ultima_mensagem_em', de).lte('ultima_mensagem_em', ate)
    for (const l of leads ?? []) {
      if ((l as any).eventos?.some((ev: any) => ev.tipo === 'retomada')) continue
      const { data: ult } = await db.from('mensagens').select('autor').eq('lead_id', l.id).order('criado_em', { ascending: false }).limit(1).single()
      if (ult?.autor !== 'agente') continue
      await registrarEvento(db, l, 'retomada', 'Agente enviou lembrete de retomada')
      await atenderLead(db, l.id, await configWA(db, l.empresa_id))
      log.push({ lead: l.id })
    }
  }

  if (tipo === 'relatorio') {
    const fim = new Date(); fim.setUTCDate(1); fim.setUTCHours(0, 0, 0, 0)
    const ini = new Date(fim); ini.setUTCMonth(ini.getUTCMonth() - 1)
    const { data: empresas } = await db.from('empresas').select('id, nome').in('status_assinatura', ['teste', 'ativa'])
    for (const e of empresas ?? []) {
      const cfg = await configWA(db, e.id)
      if (!cfg) continue
      const { data: leads } = await db.from('leads').select('temperatura, visita_realizada, valor_venda, etapa:etapas_funil(tipo)').eq('empresa_id', e.id).gte('criado_em', ini.toISOString()).lt('criado_em', fim.toISOString())
      const { data: met } = await db.from('metricas_diarias').select('investimento').eq('empresa_id', e.id).gte('data', ini.toISOString().slice(0, 10)).lt('data', fim.toISOString().slice(0, 10))
      const total = leads?.length ?? 0
      const quentes = leads?.filter((l) => l.temperatura === 'quente').length ?? 0
      const visitas = leads?.filter((l: any) => l.visita_realizada || l.etapa?.tipo === 'visita').length ?? 0
      const vendas = leads?.filter((l: any) => l.etapa?.tipo === 'ganho').length ?? 0
      const invest = met?.reduce((s, m) => s + Number(m.investimento), 0) ?? 0
      const mes = ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      const texto = `📊 *Resumo de ${mes} — ${e.nome}*\n\n` +
        `Investimento em anúncios: ${brl(invest)}\nLeads: ${total}\nLeads quentes: ${quentes}\nVisitas: ${visitas}\nVendas: ${vendas}\n\n` +
        (total ? `Custo por lead: ${brl(invest / total)}\n` : '') +
        (quentes ? `Custo por lead quente: ${brl(invest / quentes)}\n` : '') +
        (visitas ? `Custo por visita: ${brl(invest / visitas)}\n` : '') +
        `\nVeja o detalhe por campanha e criativo no painel.`
      const { data: admins } = await db.from('membros').select('telefone').eq('empresa_id', e.id).eq('papel', 'admin').not('telefone', 'is', null)
      for (const a of admins ?? []) await enviarTexto(cfg, a.telefone, texto).catch(() => {})
      log.push({ empresa: e.id })
    }
  }

  return json({ tipo, processados: log.length })
})
