import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import clsx from 'clsx'
import { useCampanhas, useEtapas, useLeads, useMetricas, type Periodo } from '@/lib/dados'
import { brl, pct } from '@/lib/formato'
import type { Lead } from '@/lib/tipos'
import { Bloco, Filtros, periodoPadrao } from '@/components/graficos'
import { Alerta, Cabecalho, Carregando } from '@/components/ui'

interface Linha { id: string; nome: string; thumb?: string | null; campanha?: string; invest: number; leads: number; quentes: number; visitas: number; vendas: number }
type Ordem = 'quente' | 'visita' | 'leads' | 'invest'

export function Campanhas() {
  const [periodo, setPeriodo] = useState<Periodo>(periodoPadrao(30))
  const [campanha, setCampanha] = useState<string>()
  const [nivel, setNivel] = useState<'campanha' | 'criativo'>('criativo')
  const [ordem, setOrdem] = useState<Ordem>('quente')
  const { data: leads, isLoading } = useLeads({ ...periodo, campanha_id: campanha })
  const { data: met } = useMetricas(periodo, campanha)
  const { data: camp } = useCampanhas()
  const { data: etapas } = useEtapas()

  const { linhas, demo, semOrigem } = useMemo(() => {
    const tipo = new Map((etapas ?? []).map((e) => [e.id, e.tipo]))
    const ls = leads ?? []
    const chave = (l: Lead) => (nivel === 'campanha' ? l.campanha_id : l.criativo_id)
    const lista = nivel === 'campanha' ? camp?.campanhas ?? [] : camp?.criativos ?? []
    const nomeCamp = new Map((camp?.campanhas ?? []).map((c) => [c.id, c.nome]))
    const linhas: Linha[] = lista.map((x: any) => {
      const doItem = ls.filter((l) => chave(l) === x.id)
      return {
        id: x.id, nome: x.nome, thumb: x.thumbnail_url, campanha: x.campanha_id ? nomeCamp.get(x.campanha_id) : undefined,
        invest: (met?.diarias ?? []).filter((d) => (nivel === 'campanha' ? d.campanha_id : d.criativo_id) === x.id).reduce((s, d) => s + Number(d.investimento), 0),
        leads: doItem.length,
        quentes: doItem.filter((l) => l.temperatura === 'quente').length,
        visitas: doItem.filter((l) => l.visita_realizada || l.visita_agendada_para || tipo.get(l.etapa_id ?? '') === 'visita').length,
        vendas: doItem.filter((l) => l.valor_venda || tipo.get(l.etapa_id ?? '') === 'ganho').length,
      }
    }).filter((l) => l.invest > 0 || l.leads > 0)

    const custo = (inv: number, n: number) => (n ? inv / n : Infinity)
    linhas.sort((a, b) => ordem === 'leads' ? b.leads - a.leads : ordem === 'invest' ? b.invest - a.invest
      : ordem === 'visita' ? custo(a.invest, a.visitas) - custo(b.invest, b.visitas) : custo(a.invest, a.quentes) - custo(b.invest, b.quentes))

    // Perfil do Meta (idade x gênero) com custo por lead
    const mapa = new Map<string, { faixa: string; genero: string; invest: number; leads: number }>()
    for (const d of met?.demograficas ?? []) {
      const k = `${d.faixa_etaria}|${d.genero}`
      const a = mapa.get(k) ?? { faixa: d.faixa_etaria, genero: d.genero, invest: 0, leads: 0 }
      a.invest += Number(d.investimento); a.leads += Number(d.leads); mapa.set(k, a)
    }
    return { linhas, demo: [...mapa.values()].sort((a, b) => a.faixa.localeCompare(b.faixa) || a.genero.localeCompare(b.genero)), semOrigem: ls.filter((l) => !l.campanha_id && !l.criativo_id).length }
  }, [leads, met, camp, etapas, nivel, ordem])

  const exportarPublico = () => {
    const quentes = (leads ?? []).filter((l) => l.temperatura === 'quente' || l.valor_venda)
    const csv = ['phone,email,fn,ct,country', ...quentes.map((l) => [l.telefone, l.email ?? '', (l.nome ?? '').split(' ')[0], l.cidade ?? '', 'BR'].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `publico-leads-quentes-${periodo.de}-a-${periodo.ate}.csv`
    a.click()
  }

  const c = (inv: number, n: number) => (n && inv ? brl(inv / n) : '—')
  const melhor = linhas.find((l) => l.quentes > 0 && l.invest > 0)
  const maxDemo = Math.max(1, ...demo.map((d) => d.leads))

  return (
    <>
      <Cabecalho titulo="Campanhas" descricao="Quais campanhas e criativos trazem lead quente, visita e venda, e quanto custa cada um."
        acoes={<button className="btn-secundario" onClick={exportarPublico}><Download size={16} />Público de leads quentes</button>} />
      <Filtros periodo={periodo} aoMudar={setPeriodo} campanha={campanha} aoMudarCampanha={setCampanha} />
      {isLoading ? <Carregando /> : !camp?.campanhas.length ? (
        <Alerta tipo="info">Conecte a conta de anúncios do Meta em <Link to="/integracoes" className="font-semibold underline">Conexões</Link> para ver investimento e custo por resultado de cada campanha e criativo.</Alerta>
      ) : (
        <div className="space-y-6">
          {melhor && (
            <div className="painel flex flex-wrap items-center gap-5 p-5">
              {melhor.thumb && <img src={melhor.thumb} alt="" className="h-20 w-20 rounded-medio object-cover" />}
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm text-concreto-500">{nivel === 'criativo' ? 'Criativo' : 'Campanha'} com o lead quente mais barato</div>
                <div className="font-display text-2xl font-bold">{melhor.nome}</div>
                <div className="text-sm text-concreto-600 mt-0.5">{melhor.quentes} leads quentes por {c(melhor.invest, melhor.quentes)} cada{melhor.visitas ? `, ${melhor.visitas} visitas por ${c(melhor.invest, melhor.visitas)} cada` : ''}.</div>
              </div>
            </div>
          )}

          <Bloco titulo="Resultado por anúncio" acoes={
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-pequeno border border-concreto-200 bg-white p-0.5" role="group" aria-label="Nível">
                {(['criativo', 'campanha'] as const).map((n) => <button key={n} className={clsx('btn h-8 px-3 text-xs', nivel === n ? 'bg-concreto-100' : 'text-concreto-500')} aria-pressed={nivel === n} onClick={() => setNivel(n)}>{n === 'criativo' ? 'Criativos' : 'Campanhas'}</button>)}
              </div>
              <select className="campo h-9 w-auto text-xs" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar por">
                <option value="quente">Menor custo por lead quente</option><option value="visita">Menor custo por visita</option><option value="leads">Mais leads</option><option value="invest">Maior investimento</option>
              </select>
            </div>}>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-concreto-500 border-y border-concreto-100"><tr>
                  <th className="px-5 py-2.5 font-medium">{nivel === 'criativo' ? 'Criativo' : 'Campanha'}</th>
                  <th className="px-3 py-2.5 font-medium text-right">Investido</th><th className="px-3 py-2.5 font-medium text-right">Leads</th><th className="px-3 py-2.5 font-medium text-right">Custo por lead</th>
                  <th className="px-3 py-2.5 font-medium text-right">Quentes</th><th className="px-3 py-2.5 font-medium text-right">Custo por quente</th>
                  <th className="px-3 py-2.5 font-medium text-right">Visitas</th><th className="px-3 py-2.5 font-medium text-right">Custo por visita</th>
                  <th className="px-5 py-2.5 font-medium text-right">Vendas</th>
                </tr></thead>
                <tbody className="tabular-nums">
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-b border-concreto-100 last:border-0">
                      <td className="px-5 py-2.5"><div className="flex items-center gap-3 min-w-[220px]">
                        {nivel === 'criativo' && (l.thumb ? <img src={l.thumb} alt="" className="h-10 w-10 rounded-pequeno object-cover" /> : <div className="h-10 w-10 rounded-pequeno bg-concreto-100" />)}
                        <div className="min-w-0"><div className="font-medium truncate max-w-[280px]">{l.nome}</div>{l.campanha && <div className="text-xs text-concreto-500 truncate max-w-[280px]">{l.campanha}</div>}</div>
                      </div></td>
                      <td className="px-3 py-2.5 text-right">{brl(l.invest)}</td>
                      <td className="px-3 py-2.5 text-right">{l.leads}</td>
                      <td className="px-3 py-2.5 text-right">{c(l.invest, l.leads)}</td>
                      <td className="px-3 py-2.5 text-right">{l.quentes} <span className="text-concreto-400 text-xs">{l.leads ? pct(l.quentes / l.leads) : ''}</span></td>
                      <td className="px-3 py-2.5 text-right font-semibold">{c(l.invest, l.quentes)}</td>
                      <td className="px-3 py-2.5 text-right">{l.visitas}</td>
                      <td className="px-3 py-2.5 text-right">{c(l.invest, l.visitas)}</td>
                      <td className="px-5 py-2.5 text-right">{l.vendas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {semOrigem > 0 && <p className="text-xs text-concreto-500 mt-3">{semOrigem} leads do período não têm campanha identificada (WhatsApp direto, site sem UTM ou cadastro manual).</p>}
          </Bloco>

          <Bloco titulo="Quem o Meta está alcançando" descricao="Leads e custo por lead por idade e gênero, segundo o Meta Ads. Compare com o perfil que a IA descobriu na Visão geral.">
            {!demo.length ? <p className="text-sm text-concreto-500">Sem dados de idade e gênero no período.</p> : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-concreto-500 border-y border-concreto-100"><tr><th className="px-5 py-2.5 font-medium">Idade</th><th className="px-3 py-2.5 font-medium">Gênero</th><th className="px-3 py-2.5 font-medium w-1/3">Leads</th><th className="px-3 py-2.5 font-medium text-right">Investido</th><th className="px-5 py-2.5 font-medium text-right">Custo por lead</th></tr></thead>
                  <tbody>
                    {demo.map((d) => (
                      <tr key={d.faixa + d.genero} className="border-b border-concreto-100 last:border-0">
                        <td className="px-5 py-2">{d.faixa}</td><td className="px-3 py-2 capitalize">{d.genero}</td>
                        <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="h-2 rounded-full bg-[#0E8A78]" style={{ width: `${(d.leads / maxDemo) * 100}%`, minWidth: d.leads ? 4 : 0 }} /><span>{d.leads}</span></div></td>
                        <td className="px-3 py-2 text-right">{brl(d.invest)}</td><td className="px-5 py-2 text-right">{c(d.invest, d.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>
        </div>
      )}
    </>
  )
}
