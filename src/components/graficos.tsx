import { useState, type ReactNode } from 'react'
import { format, subDays } from 'date-fns'
import clsx from 'clsx'
import { useCampanhas, type Periodo } from '@/lib/dados'

export function periodoPadrao(dias = 30): Periodo {
  return { de: format(subDays(new Date(), dias - 1), 'yyyy-MM-dd'), ate: format(new Date(), 'yyyy-MM-dd') }
}

const PRESETS = [{ d: 7, n: '7 dias' }, { d: 30, n: '30 dias' }, { d: 90, n: '90 dias' }]

/** Linha única de filtros acima dos gráficos: período e campanha. */
export function Filtros({ periodo, aoMudar, campanha, aoMudarCampanha }: { periodo: Periodo; aoMudar: (p: Periodo) => void; campanha?: string; aoMudarCampanha?: (c?: string) => void }) {
  const { data } = useCampanhas()
  const [custom, setCustom] = useState(false)
  const ativo = PRESETS.find((p) => periodoPadrao(p.d).de === periodo.de && periodoPadrao(p.d).ate === periodo.ate)
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-pequeno border border-concreto-200 bg-white p-0.5" role="group" aria-label="Período">
        {PRESETS.map((p) => (
          <button key={p.d} className={clsx('btn h-9 px-3 font-medium', ativo?.d === p.d && !custom ? 'bg-concreto-100' : 'text-concreto-500')} aria-pressed={ativo?.d === p.d && !custom}
            onClick={() => { setCustom(false); aoMudar(periodoPadrao(p.d)) }}>{p.n}</button>
        ))}
        <button className={clsx('btn h-9 px-3 font-medium', custom || !ativo ? 'bg-concreto-100' : 'text-concreto-500')} onClick={() => setCustom(true)} aria-pressed={custom || !ativo}>Escolher datas</button>
      </div>
      {(custom || !ativo) && (
        <div className="flex items-center gap-2 text-sm">
          <input type="date" className="campo w-auto" value={periodo.de} max={periodo.ate} onChange={(e) => e.target.value && aoMudar({ ...periodo, de: e.target.value })} aria-label="De" />
          <span className="text-concreto-500">até</span>
          <input type="date" className="campo w-auto" value={periodo.ate} min={periodo.de} onChange={(e) => e.target.value && aoMudar({ ...periodo, ate: e.target.value })} aria-label="Até" />
        </div>
      )}
      {aoMudarCampanha && !!data?.campanhas.length && (
        <select className="campo w-auto max-w-[280px]" value={campanha ?? ''} onChange={(e) => aoMudarCampanha(e.target.value || undefined)} aria-label="Campanha">
          <option value="">Todas as campanhas</option>
          {data.campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      )}
    </div>
  )
}

export function Numero({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: ReactNode; destaque?: boolean }) {
  return (
    <div className={clsx('px-5 py-4', destaque && 'bg-petroleo-800 text-white rounded-medio')}>
      <div className={clsx('text-sm', destaque ? 'text-petroleo-200' : 'text-concreto-500')}>{rotulo}</div>
      <div className="font-display text-[30px] font-bold leading-tight tabular-nums mt-0.5" style={destaque ? { color: 'white' } : undefined}>{valor}</div>
      {detalhe && <div className={clsx('text-xs mt-0.5', destaque ? 'text-petroleo-200' : 'text-concreto-500')}>{detalhe}</div>}
    </div>
  )
}

export function Bloco({ titulo, descricao, children, className, acoes }: { titulo: string; descricao?: string; children: ReactNode; className?: string; acoes?: ReactNode }) {
  return (
    <section className={clsx('painel p-5', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div><h2 className="font-sans text-base font-semibold">{titulo}</h2>{descricao && <p className="text-sm text-concreto-500">{descricao}</p>}</div>
        {acoes}
      </div>
      {children}
    </section>
  )
}

/** Barras horizontais simples, com rótulo e valor em texto (sem depender só da cor). */
export function BarrasH({ itens, cor = '#0E8A78', formatar = (n: number) => n.toLocaleString('pt-BR'), max }: { itens: { nome: string; valor: number; extra?: string }[]; cor?: string; formatar?: (n: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...itens.map((i) => i.valor))
  if (!itens.length) return <p className="text-sm text-concreto-500 py-6 text-center">Sem dados no período.</p>
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.nome} className="group" title={`${i.nome}: ${formatar(i.valor)}${i.extra ? ` (${i.extra})` : ''}`}>
          <div className="flex justify-between gap-3 text-sm"><span className="truncate">{i.nome}</span><span className="tabular-nums text-concreto-600 shrink-0">{formatar(i.valor)}{i.extra && <span className="text-concreto-400"> · {i.extra}</span>}</span></div>
          <div className="mt-1 h-2 rounded-full bg-concreto-100"><div className="h-full rounded-full transition-opacity group-hover:opacity-80" style={{ width: `${(i.valor / m) * 100}%`, background: cor }} /></div>
        </li>
      ))}
    </ul>
  )
}

export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-concreto-600" aria-label="Legenda">
      {itens.map((i) => <li key={i.nome} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.cor }} />{i.nome}</li>)}
    </ul>
  )
}

export function DicaGrafico({ active, payload, label, formatar }: any) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0)
  return (
    <div className="rounded-pequeno border border-concreto-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold mb-1">{label}</div>
      {payload.slice().reverse().map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.fill }} />{p.name}</span><span className="tabular-nums">{formatar ? formatar(p.value) : p.value}</span></div>
      ))}
      {payload.length > 1 && <div className="mt-1 border-t border-concreto-100 pt-1 flex justify-between"><span>Total</span><span className="tabular-nums font-semibold">{total}</span></div>}
    </div>
  )
}
