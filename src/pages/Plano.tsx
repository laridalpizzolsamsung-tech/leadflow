import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import { supabase, funcao } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { brl, data, mesAtualIso } from '@/lib/formato'
import { Alerta, Cabecalho, Carregando, Modal } from '@/components/ui'

interface Plano { id: string; nome: string; preco_mensal: number; limite_leads_mes: number; limite_corretores: number; recursos: string[] }

const STATUS: Record<string, string> = { teste: 'Período de teste', ativa: 'Ativa', inadimplente: 'Pagamento pendente', cancelada: 'Cancelada' }

export function PlanoPagina() {
  const { empresa } = useSessao()
  const { data: planos, isLoading } = useQuery({ queryKey: ['planos'], queryFn: async () => (await supabase.from('planos').select('*').order('ordem')).data as Plano[] })
  const { data: uso } = useQuery({ queryKey: ['uso', empresa?.id], enabled: !!empresa, queryFn: async () => (await supabase.from('uso_mensal').select('*').eq('empresa_id', empresa!.id).eq('mes', mesAtualIso()).maybeSingle()).data })
  const [escolhido, setEscolhido] = useState<Plano | null>(null)
  const [doc, setDoc] = useState('')
  const [forma, setForma] = useState('PIX')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (isLoading || !empresa) return <Carregando />
  const usados = uso?.leads ?? 0
  const pctUso = Math.min(100, (usados / empresa.limite_leads_mes) * 100)

  return (
    <>
      <Cabecalho titulo="Plano" descricao="Cobrança mensal automática. Troque de plano ou cancele quando quiser, sem multa." />
      <div className="painel p-5 mb-6 grid gap-5 sm:grid-cols-3">
        <div><div className="text-sm text-concreto-500">Situação</div><div className="font-semibold mt-0.5">{STATUS[empresa.status_assinatura]}{empresa.status_assinatura === 'teste' && empresa.teste_expira_em ? ` até ${data(empresa.teste_expira_em)}` : ''}</div></div>
        <div><div className="text-sm text-concreto-500">Plano atual</div><div className="font-semibold mt-0.5 capitalize">{planos?.find((p) => p.id === empresa.plano)?.nome ?? empresa.plano}{empresa.proximo_vencimento ? `, vence em ${data(empresa.proximo_vencimento)}` : ''}</div></div>
        <div>
          <div className="text-sm text-concreto-500">Leads neste mês</div>
          <div className="font-semibold mt-0.5 tabular-nums">{usados} de {empresa.limite_leads_mes}</div>
          <div className="mt-1.5 h-1.5 rounded-full bg-concreto-100"><div className={clsx('h-full rounded-full', pctUso > 90 ? 'bg-quente' : 'bg-petroleo-500')} style={{ width: `${pctUso}%` }} /></div>
        </div>
      </div>
      {empresa.status_assinatura === 'inadimplente' && <div className="mb-6"><Alerta tipo="erro">O último pagamento não foi identificado e o agente está pausado. Pague o boleto ou Pix enviado ao seu e-mail, ou escolha uma nova forma de pagamento abaixo.</Alerta></div>}

      <div className="grid gap-5 lg:grid-cols-3">
        {planos?.map((p) => {
          const atual = p.id === empresa.plano && empresa.status_assinatura === 'ativa'
          return (
            <article key={p.id} className={clsx('painel p-6 flex flex-col', p.id === 'profissional' && 'border-petroleo-600 border-2')}>
              <h2 className="text-xl font-bold">{p.nome}</h2>
              <div className="mt-2"><span className="font-display text-[34px] font-bold tabular-nums">{brl(p.preco_mensal)}</span><span className="text-concreto-500"> por mês</span></div>
              <p className="text-sm text-concreto-500 mt-1">Até {p.limite_leads_mes.toLocaleString('pt-BR')} leads por mês · {p.limite_corretores >= 999 ? 'corretores ilimitados' : `até ${p.limite_corretores} usuários`}</p>
              <ul className="mt-5 space-y-2 text-sm flex-1">{p.recursos.map((r) => <li key={r} className="flex gap-2"><Check size={16} className="text-petroleo-600 mt-0.5 shrink-0" />{r}</li>)}</ul>
              <button className={clsx('mt-6 w-full', atual ? 'btn-secundario' : 'btn-primario')} disabled={atual} onClick={() => { setEscolhido(p); setErro('') }}>{atual ? 'Seu plano' : `Assinar ${p.nome}`}</button>
            </article>
          )
        })}
      </div>
      {empresa.status_assinatura === 'ativa' && (
        <button className="btn-fantasma mt-6 text-sm text-concreto-500" onClick={async () => { if (confirm('Cancelar a assinatura? O agente para de atender no fim do período pago.')) { await funcao('assinatura', { acao: 'cancelar' }); location.reload() } }}>Cancelar assinatura</button>
      )}

      <Modal aberto={!!escolhido} aoFechar={() => setEscolhido(null)} titulo={`Assinar o plano ${escolhido?.nome}`}>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); setErro(''); setEnviando(true)
          try {
            const r = await funcao<{ link_pagamento?: string }>('assinatura', { acao: 'assinar', plano: escolhido!.id, cpf_cnpj: doc.replace(/\D/g, ''), forma })
            if (r.link_pagamento) window.location.href = r.link_pagamento
          } catch (err) { setErro((err as Error).message) } finally { setEnviando(false) }
        }}>
          <p className="text-sm text-concreto-600">{brl(escolhido?.preco_mensal)} por mês, cobrado automaticamente. A primeira cobrança vence amanhã.</p>
          <div><label className="rotulo" htmlFor="p-doc">CNPJ ou CPF para a nota</label><input id="p-doc" required className="campo" value={doc} onChange={(e) => setDoc(e.target.value)} /></div>
          <div><label className="rotulo" htmlFor="p-forma">Forma de pagamento</label>
            <select id="p-forma" className="campo" value={forma} onChange={(e) => setForma(e.target.value)}><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão de crédito</option></select></div>
          {erro && <Alerta tipo="erro">{erro}</Alerta>}
          <div className="flex justify-end"><button className="btn-primario" disabled={enviando}>Ir para o pagamento</button></div>
        </form>
      </Modal>
    </>
  )
}
