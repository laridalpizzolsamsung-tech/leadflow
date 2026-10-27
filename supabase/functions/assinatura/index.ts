// Cobrança recorrente automática pelo Asaas (Pix, boleto ou cartão).
//  POST (logado)  { acao: "assinar", plano, cpf_cnpj, forma: "PIX"|"BOLETO"|"CREDIT_CARD" } → link de pagamento
//  POST (Asaas)   webhook de pagamentos → ativa, marca inadimplente ou cancela a empresa sozinho
import { adminClient, corsHeaders, json, userClient } from '../_shared/util.ts'

const ASAAS = Deno.env.get('ASAAS_URL') ?? 'https://api.asaas.com/v3' // sandbox: https://api-sandbox.asaas.com/v3
const KEY = Deno.env.get('ASAAS_API_KEY') ?? ''

async function asaas(path: string, body?: unknown, method = 'POST') {
  const r = await fetch(`${ASAAS}${path}`, {
    method, headers: { access_token: KEY, 'Content-Type': 'application/json', 'User-Agent': 'LeadFlow' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const d = await r.json()
  if (!r.ok) throw new Error(d?.errors?.[0]?.description ?? JSON.stringify(d))
  return d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const db = adminClient()

  // Webhook do Asaas (configurado com o token em ASAAS_WEBHOOK_TOKEN)
  const tokenWebhook = req.headers.get('asaas-access-token')
  if (tokenWebhook) {
    if (tokenWebhook !== Deno.env.get('ASAAS_WEBHOOK_TOKEN')) return json({ erro: 'token' }, 401)
    const ev = await req.json()
    const assinaturaId = ev.payment?.subscription ?? ev.subscription?.id
    if (!assinaturaId) return json({ ok: true })
    const mapa: Record<string, string> = {
      PAYMENT_CONFIRMED: 'ativa', PAYMENT_RECEIVED: 'ativa',
      PAYMENT_OVERDUE: 'inadimplente',
      SUBSCRIPTION_DELETED: 'cancelada', SUBSCRIPTION_INACTIVATED: 'cancelada',
    }
    const status = mapa[ev.event]
    if (status) {
      await db.from('empresas').update({ status_assinatura: status, proximo_vencimento: ev.payment?.dueDate ?? null }).eq('asaas_assinatura_id', assinaturaId)
    }
    return json({ ok: true })
  }

  // Ação do cliente logado
  const uc = userClient(req)
  const { data: { user } } = await uc.auth.getUser()
  if (!user) return json({ erro: 'não autenticado' }, 401)
  const { data: m } = await uc.from('membros').select('empresa_id, papel').eq('user_id', user.id).limit(1).single()
  if (m?.papel !== 'admin') return json({ erro: 'apenas administradores' }, 403)
  const b = await req.json()

  try {
    if (b.acao === 'assinar') {
      const [{ data: empresa }, { data: plano }] = await Promise.all([
        db.from('empresas').select('*').eq('id', m.empresa_id).single(),
        db.from('planos').select('*').eq('id', b.plano).single(),
      ])
      if (!plano) return json({ erro: 'plano inválido' }, 400)
      let clienteId = empresa.asaas_cliente_id
      if (!clienteId) {
        const c = await asaas('/customers', { name: empresa.nome, cpfCnpj: b.cpf_cnpj, email: user.email, externalReference: empresa.id })
        clienteId = c.id
      }
      if (empresa.asaas_assinatura_id) await asaas(`/subscriptions/${empresa.asaas_assinatura_id}`, undefined, 'DELETE').catch(() => {})
      const venc = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
      const s = await asaas('/subscriptions', {
        customer: clienteId, billingType: b.forma ?? 'UNDEFINED', value: plano.preco_mensal, nextDueDate: venc,
        cycle: 'MONTHLY', description: `LeadFlow — plano ${plano.nome}`, externalReference: empresa.id,
      })
      await db.from('empresas').update({ asaas_cliente_id: clienteId, asaas_assinatura_id: s.id, plano: plano.id, limite_leads_mes: plano.limite_leads_mes }).eq('id', empresa.id)
      const pags = await asaas(`/subscriptions/${s.id}/payments`, undefined, 'GET')
      return json({ ok: true, link_pagamento: pags.data?.[0]?.invoiceUrl })
    }
    if (b.acao === 'cancelar') {
      const { data: empresa } = await db.from('empresas').select('asaas_assinatura_id').eq('id', m.empresa_id).single()
      if (empresa?.asaas_assinatura_id) await asaas(`/subscriptions/${empresa.asaas_assinatura_id}`, undefined, 'DELETE')
      await db.from('empresas').update({ status_assinatura: 'cancelada' }).eq('id', m.empresa_id)
      return json({ ok: true })
    }
  } catch (e) {
    return json({ erro: (e as Error).message }, 400)
  }
  return json({ erro: 'ação desconhecida' }, 400)
})
