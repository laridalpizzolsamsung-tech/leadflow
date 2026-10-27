import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { eachDayOfInterval, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useEtapas, useLeads, useMembros, useMetricas, type Periodo } from '@/lib/dados'
import { brl, COR_TEMP_GRAFICO, ORIGENS, pct } from '@/lib/formato'
import { useSessao } from '@/lib/sessao'
import { BarrasH, Bloco, DicaGrafico, Filtros, Legenda, Numero, periodoPadrao } from '@/components/graficos'
import { Cabecalho, Carregando, Vazio } from '@/components/ui'
import { Link } from 'react-router-dom'

const contar = <T,>(xs: T[], f: (x: T) => string | null | undefined) => {
  const m = new Map<string, number>()
  for (const x of xs) { const k = f(x); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor)
}

export function VisaoGeral() {
  const { membro } = useSessao()
  const [periodo, setPeriodo] = useState<Periodo>(periodoPadrao(30))
  const [campanha, setCampanha] = useState<string>()
  const { data: leads, isLoading } = useLeads({ ...periodo, campanha_id: campanha })
  const { data: met } = useMetricas(periodo, campanha)
  const { data: etapas } = useEtapas()
  const { data: membros } = useMembros()

  const r = useMemo(() => {
    const ls = leads ?? []
    const tipoEtapa = new Map((etapas ?? []).map((e) => [e.id, e]))
    const quentes = ls.filter((l) => l.temperatura === 'quente').length
    const mornos = ls.filter((l) => l.temperatura === 'morno').length
    const visitas = ls.filter((l) => l.visita_realizada || l.visita_agendada_para || tipoEtapa.get(l.etapa_id ?? '')?.tipo === 'visita').length
    const vendas = ls.filter((l) => tipoEtapa.get(l.etapa_id ?? '')?.tipo === 'ganho' || l.valor_venda).length
    const vgv = ls.reduce((s, l) => s + (Number(l.valor_venda) || 0), 0)
    const invest = (met?.diarias ?? []).reduce((s, d) => s + Number(d.investimento), 0)

    const dias = eachDayOfInterval({ start: parseISO(periodo.de), end: parseISO(periodo.ate) }).map((d) => {
      const k = format(d, 'yyyy-MM-dd')
      const doDia = ls.filter((l) => l.criado_em.slice(0, 10) === k)
      return { dia: format(d, 'dd/MM', { locale: ptBR }), quente: doDia.filter((l) => l.temperatura === 'quente').length, morno: doDia.filter((l) => l.temperatura === 'morno').length, frio: doDia.filter((l) => l.temperatura === 'frio').length, nao_classificado: doDia.filter((l) => l.temperatura === 'nao_classificado').length }
    })

    const funil = (etapas ?? []).filter((e) => e.tipo !== 'perdido').map((e) => ({
      nome: e.nome,
      // acumulado: quantos chegaram a essa etapa ou além
      valor: ls.filter((l) => (tipoEtapa.get(l.etapa_id ?? '')?.ordem ?? 1) >= e.ordem && tipoEtapa.get(l.etapa_id ?? '')?.tipo !== 'perdido').length,
    }))

    const respondidos = ls.filter((l) => l.atribuido_em && l.primeira_resposta_corretor_em)
    const tempoResp = respondidos.length ? respondidos.reduce((s, l) => s + (new Date(l.primeira_resposta_corretor_em!).getTime() - new Date(l.atribuido_em!).getTime()), 0) / respondidos.length / 60000 : null
    const semResposta = ls.filter((l) => l.atribuido_em && !l.primeira_resposta_corretor_em && tipoEtapa.get(l.etapa_id ?? '')?.tipo !== 'perdido').length

    return {
      total: ls.length, quentes, mornos, visitas, vendas, vgv, invest, dias, funil, tempoResp, semResposta,
      origem: contar(ls, (l) => ORIGENS[l.origem]),
      genero: contar(ls, (l) => l.genero),
      idade: contar(ls, (l) => l.faixa_etaria ?? (l.idade ? (l.idade < 25 ? '18-24' : l.idade < 35 ? '25-34' : l.idade < 45 ? '35-44' : l.idade < 55 ? '45-54' : l.idade < 65 ? '55-64' : '65+') : null)).sort((a, b) => a.nome.localeCompare(b.nome)),
      finalidade: contar(ls, (l) => l.finalidade === 'morar' ? 'Para morar' : l.finalidade === 'investir' ? 'Para investir' : null),
      financ: contar(ls, (l) => l.usa_financiamento == null ? null : l.usa_financiamento ? (l.usa_fgts ? 'Financiamento + FGTS' : 'Financiamento') : 'À vista ou direto'),
      bairros: contar(ls, (l) => l.bairro_interesse).slice(0, 6),
      objecoes: contar(ls, (l) => l.objecao_principal).slice(0, 6),
      perdas: contar(ls, (l) => l.motivo_perda).slice(0, 6),
      porCorretor: (membros ?? []).map((m) => ({ nome: m.nome, valor: ls.filter((l) => l.corretor_id === m.id).length, extra: `${ls.filter((l) => l.corretor_id === m.id && l.valor_venda).length} vendas` })).filter((x) => x.valor).sort((a, b) => b.valor - a.valor),
      comPerfil: ls.filter((l) => l.genero || l.faixa_etaria || l.idade).length,
    }
  }, [leads, met, etapas, membros, periodo])

  const cp = (n: number) => (n && r.invest ? brl(r.invest / n) : '—')

  return (
    <>
      <Cabecalho titulo={`Olá, ${membro?.nome.split(' ')[0]}`} descricao="Como os leads estão chegando, esquentando e virando visita." />
      <Filtros periodo={periodo} aoMudar={setPeriodo} campanha={campanha} aoMudarCampanha={setCampanha} />
      {isLoading ? <Carregando /> : !r.total ? (
        <Vazio titulo="Nenhum lead neste período" texto="Assim que os anúncios trouxerem leads, eles aparecem aqui. Confira se o WhatsApp e os anúncios estão conectados." acao={<Link to="/integracoes" className="btn-primario">Ver conexões</Link>} />
      ) : (
        <div className="space-y-6">
          <div className="painel grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 divide-concreto-100 xl:divide-x">
            <Numero rotulo="Leads" valor={r.total.toLocaleString('pt-BR')} detalhe={r.invest ? `${cp(r.total)} por lead` : undefined} />
            <Numero rotulo="Quentes" valor={r.quentes.toLocaleString('pt-BR')} detalhe={`${pct(r.quentes / r.total)} dos leads · ${r.mornos} mornos`} />
            <Numero rotulo="Visitas" valor={r.visitas.toLocaleString('pt-BR')} detalhe={`${pct(r.visitas / r.total)} dos leads`} />
            <Numero rotulo="Vendas" valor={r.vendas.toLocaleString('pt-BR')} detalhe={r.vgv ? brl(r.vgv) : undefined} />
            <Numero rotulo="Investido" valor={r.invest ? brl(r.invest) : '—'} detalhe={r.invest ? 'Meta Ads no período' : 'Conecte os anúncios'} />
            <Numero rotulo="Custo por lead quente" valor={cp(r.quentes)} detalhe={r.visitas && r.invest ? `${cp(r.visitas)} por visita` : undefined} destaque />
          </div>

          <Bloco titulo="Leads por dia" descricao="Cada barra mostra a classificação que a IA deu na conversa." acoes={<Legenda itens={[{ nome: 'Quente', cor: COR_TEMP_GRAFICO.quente }, { nome: 'Morno', cor: COR_TEMP_GRAFICO.morno }, { nome: 'Frio', cor: COR_TEMP_GRAFICO.frio }, { nome: 'Em análise', cor: COR_TEMP_GRAFICO.nao_classificado }]} />}>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={r.dias} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#EDEFEA" />
                  <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7468' }} interval="preserveStartEnd" minTickGap={16} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6E7468' }} />
                  <Tooltip content={<DicaGrafico />} cursor={{ fill: '#EDEFEA' }} />
                  {(['nao_classificado', 'frio', 'morno', 'quente'] as const).map((t, i, a) => (
                    <Bar key={t} dataKey={t} name={{ quente: 'Quente', morno: 'Morno', frio: 'Frio', nao_classificado: 'Em análise' }[t]} stackId="a" fill={COR_TEMP_GRAFICO[t]} stroke="#FFFFFF" strokeWidth={1} radius={i === a.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Bloco>

          <div className="grid gap-6 lg:grid-cols-2">
            <Bloco titulo="Funil" descricao="Quantos leads chegaram até cada etapa.">
              <BarrasH itens={r.funil.map((f) => ({ ...f, extra: r.total ? pct(f.valor / r.total) : undefined }))} cor="#0E8A78" max={r.total} />
            </Bloco>
            <Bloco titulo="Corretores" descricao={r.tempoResp != null ? `Tempo médio até a primeira resposta: ${r.tempoResp < 60 ? `${Math.round(r.tempoResp)} min` : `${(r.tempoResp / 60).toFixed(1)} h`}${r.semResposta ? `. ${r.semResposta} lead${r.semResposta > 1 ? 's' : ''} ainda sem resposta.` : '.'}` : 'Leads entregues a cada corretor.'}>
              <BarrasH itens={r.porCorretor} cor="#2F78C4" />
            </Bloco>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-1">Perfil dos leads</h2>
            <p className="text-sm text-concreto-500 mb-4">Dados que a IA descobriu nas conversas ({r.comPerfil} de {r.total} leads informaram idade ou gênero). Use para ajustar o público das campanhas.</p>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Bloco titulo="Gênero"><BarrasH itens={r.genero.map((g) => ({ ...g, nome: g.nome[0].toUpperCase() + g.nome.slice(1), extra: pct(g.valor / Math.max(1, r.genero.reduce((s, x) => s + x.valor, 0))) }))} cor="#0E8A78" /></Bloco>
              <Bloco titulo="Faixa etária"><BarrasH itens={r.idade.map((g) => ({ ...g, nome: `${g.nome} anos` }))} cor="#0E8A78" /></Bloco>
              <Bloco titulo="Finalidade"><BarrasH itens={r.finalidade} cor="#0E8A78" /></Bloco>
              <Bloco titulo="Como pretende pagar"><BarrasH itens={r.financ} cor="#0E8A78" /></Bloco>
              <Bloco titulo="Bairros mais procurados"><BarrasH itens={r.bairros} cor="#0E8A78" /></Bloco>
              <Bloco titulo="De onde vieram"><BarrasH itens={r.origem} cor="#0E8A78" /></Bloco>
              <Bloco titulo="Principais dúvidas e objeções"><BarrasH itens={r.objecoes} cor="#E8590C" /></Bloco>
              <Bloco titulo="Por que perdemos"><BarrasH itens={r.perdas} cor="#E8590C" /></Bloco>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
