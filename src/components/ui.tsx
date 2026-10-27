import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { iniciais, TEMPERATURAS } from '@/lib/formato'
import type { Temperatura } from '@/lib/tipos'

export function ChipTemperatura({ t, pequeno }: { t: Temperatura; pequeno?: boolean }) {
  const c = TEMPERATURAS[t]
  return (
    <span className={clsx('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium', pequeno ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs')} style={{ color: c.cor, background: c.fundo }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.cor }} />
      {c.nome}
    </span>
  )
}

/** Termômetro: barra de 0 a 100 com a cor da temperatura. Elemento-assinatura do produto. */
export function Termometro({ valor, t }: { valor: number; t: Temperatura }) {
  return (
    <div className="h-1 w-full rounded-full bg-concreto-100 overflow-hidden" role="meter" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100} aria-label="Pontuação do lead">
      <div className="h-full rounded-full" style={{ width: `${Math.max(4, valor)}%`, background: TEMPERATURAS[t].cor }} />
    </div>
  )
}

export function Avatar({ nome, tamanho = 32, cor }: { nome?: string | null; tamanho?: number; cor?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.38, background: cor ?? '#3D877C' }}>
      {iniciais(nome)}
    </span>
  )
}

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-[28px] font-bold leading-tight">{titulo}</h1>
        {descricao && <p className="text-concreto-500 mt-1 max-w-[62ch]">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="painel px-6 py-12 text-center">
      <h3 className="text-lg font-semibold">{titulo}</h3>
      <p className="text-concreto-500 mt-1 max-w-[52ch] mx-auto">{texto}</p>
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  )
}

export function Modal({ aberto, aoFechar, titulo, children, largura = 520 }: { aberto: boolean; aoFechar: () => void; titulo: string; children: ReactNode; largura?: number }) {
  useEffect(() => {
    if (!aberto) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [aberto, aoFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-concreto-900/40 p-4 sm:pt-[8vh]" onMouseDown={aoFechar}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="painel w-full shadow-xl" style={{ maxWidth: largura }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-concreto-200 px-5 py-3.5">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button className="btn-fantasma h-8 w-8 px-0" onClick={aoFechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Carregando({ texto = 'Carregando' }: { texto?: string }) {
  return <div className="py-16 text-center text-concreto-500 text-sm" role="status">{texto}…</div>
}

export function Alerta({ tipo = 'info', children }: { tipo?: 'info' | 'erro' | 'ok' | 'aviso'; children: ReactNode }) {
  const estilos = {
    info: 'bg-petroleo-50 text-petroleo-800 border-petroleo-100',
    erro: 'bg-red-50 text-red-800 border-red-100',
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    aviso: 'bg-amber-50 text-amber-900 border-amber-100',
  }
  return <div className={clsx('rounded-pequeno border px-4 py-3 text-sm', estilos[tipo])} role={tipo === 'erro' ? 'alert' : undefined}>{children}</div>
}

export function Interruptor({ ligado, aoMudar, rotulo }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} onClick={() => aoMudar(!ligado)}
      className={clsx('relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors', ligado ? 'bg-petroleo-600' : 'bg-concreto-300')}>
      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', ligado ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}
