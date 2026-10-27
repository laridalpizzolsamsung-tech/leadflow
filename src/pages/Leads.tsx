import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Bot, Columns3, List, Plus, Search, UserRound } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { useCampanhas, useEtapas, useLeads, useMembros, type FiltroLeads } from '@/lib/dados'
import { ORIGENS, telefoneBonito, tempoAtras } from '@/lib/formato'
import type { Lead, Membro } from '@/lib/tipos'
import { Alerta, Avatar, Cabecalho, Carregando, ChipTemperatura, Modal, Termometro } from '@/components/ui'

export function Leads() {
  const { podeGerenciar, empresa } = useSessao()
  const [modo, setModo] = useState<'quadro' | 'lista'>(() => { try { return (localStorage.getItem('leads-modo') as 'quadro' | 'lista') ?? 'quadro' } catch { return 'quadro' } })
  const [filtro, setFiltro] = useState<FiltroLeads>({})
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const { data: etapas } = useEtapas()
  const { data: leads, isLoading } = useLeads({ ...filtro, busca: busca || undefined })
  const { data: membros } = useMembros()
  const { data: camp } = useCampanhas()
  const qc = useQueryClient()

  useEffect(() => { try { localStorage.setItem('leads-modo', modo) } catch { /* sem armazenamento */ } }, [modo])

  // Atualização em tempo real: lead novo ou alterado aparece sem recarregar
  useEffect(() => {
    if (!empresa) return
    const canal = supabase.channel('leads-' + empresa.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `empresa_id=eq.${empresa.id}` }, () => qc.invalidateQueries({ queryKey: ['leads'] }))
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [empresa, qc])

  const porMembro = useMemo(() => new Map((membros ?? []).map((m) => [m.id, m])), [membros])

  async function mover(leadId: string, etapaId: string) {
    qc.setQueryData<Lead[]>(['leads', empresa?.id, { ...filtro, busca: busca || undefined }], (ls) => ls?.map((l) => (l.id === leadId ? { ...l, etapa_id: etapaId } : l)))
    const etapa = etapas?.find((e) => e.id === etapaId)
    await supabase.from('leads').update({ etapa_id: etapaId }).eq('id', leadId)
    await supabase.from('eventos_lead').insert({ empresa_id: empresa!.id, lead_id: leadId, tipo: 'etapa', descricao: `Movido para ${etapa?.nome}` })
    qc.invalidateQueries({ queryKey: ['leads'] })
  }

  return (
    <>
      <Cabecalho titulo="Leads" descricao={podeGerenciar ? 'Todos os leads da construtora, do primeiro contato à venda.' : 'Os leads entregues para você.'}
        acoes={<>
          <div className="inline-flex rounded-pequeno border border-concreto-200 bg-white p-0.5" role="group" aria-label="Modo de visualização">
            <button className={clsx('btn h-9 px-3', modo === 'quadro' ? 'bg-concreto-100' : 'text-concreto-500')} onClick={() => setModo('quadro')} aria-pressed={modo === 'quadro'}><Columns3 size={16} />Funil</button>
            <button className={clsx('btn h-9 px-3', modo === 'lista' ? 'bg-concreto-100' : 'text-concreto-500')} onClick={() => setModo('lista')} aria-pressed={modo === 'lista'}><List size={16} />Lista</button>
          </div>
          <button className="btn-primario" onClick={() => setNovo(true)}><Plus size={17} />Novo lead</button>
        </>} />

      <div className="mb-5 flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-concreto-400" />
          <input className="campo pl-9" placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar lead" />
        </div>
        <select className="campo w-auto" value={filtro.temperatura ?? ''} onChange={(e) => setFiltro({ ...filtro, temperatura: e.target.value || undefined })} aria-label="Temperatura">
          <option value="">Todas as temperaturas</option><option value="quente">Quentes</option><option value="morno">Mornos</option><option value="frio">Frios</option><option value="nao_classificado">Em análise</option>
        </select>
        {podeGerenciar && (
          <select className="campo w-auto" value={filtro.corretor_id ?? ''} onChange={(e) => setFiltro({ ...filtro, corretor_id: e.target.value || undefined })} aria-label="Corretor">
            <option value="">Todos os corretores</option>{membros?.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}
        {!!camp?.campanhas.length && (
          <select className="campo w-auto max-w-[240px]" value={filtro.campanha_id ?? ''} onChange={(e) => setFiltro({ ...filtro, campanha_id: e.target.value || undefined })} aria-label="Campanha">
            <option value="">Todas as campanhas</option>{camp.campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
      </div>

      {isLoading || !etapas ? <Carregando /> : modo === 'quadro'
        ? <Quadro leads={leads ?? []} etapas={etapas} porMembro={porMembro} aoMover={mover} />
        : <Lista leads={leads ?? []} etapas={etapas} porMembro={porMembro} />}

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Cadastrar lead">
        <NovoLead aoCriar={() => { setNovo(false); qc.invalidateQueries({ queryKey: ['leads'] }) }} />
      </Modal>
    </>
  )
}

function Quadro({ leads, etapas, porMembro, aoMover }: { leads: Lead[]; etapas: { id: string; nome: string; cor: string }[]; porMembro: Map<string, Membro>; aoMover: (l: string, e: string) => void }) {
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const fim = (e: DragEndEvent) => { if (e.over && e.active.data.current?.etapa !== e.over.id) aoMover(String(e.active.id), String(e.over.id)) }
  return (
    <DndContext sensors={sensores} onDragEnd={fim}>
      <div className="-mx-4 sm:-mx-8 overflow-x-auto px-4 sm:px-8 pb-4">
        <div className="flex gap-4 min-w-max">
          {etapas.map((et, i) => {
            const doEstagio = leads.filter((l) => l.etapa_id === et.id || (!l.etapa_id && i === 0))
            return <Coluna key={et.id} etapa={et} leads={doEstagio} porMembro={porMembro} />
          })}
        </div>
      </div>
    </DndContext>
  )
}

function Coluna({ etapa, leads, porMembro }: { etapa: { id: string; nome: string; cor: string }; leads: Lead[]; porMembro: Map<string, Membro> }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  const quentes = leads.filter((l) => l.temperatura === 'quente').length
  return (
    <section ref={setNodeRef} className={clsx('w-[290px] shrink-0 rounded-medio bg-concreto-100/80 p-2 transition-colors', isOver && 'bg-petroleo-50 ring-2 ring-petroleo-200')} aria-label={etapa.nome}>
      <header className="flex items-center gap-2 px-2 pt-1 pb-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: etapa.cor }} />
        <h2 className="font-sans text-sm font-semibold">{etapa.nome}</h2>
        <span className="text-sm text-concreto-500 tabular-nums">{leads.length}</span>
        {quentes > 0 && <span className="ml-auto text-xs font-medium text-quente">{quentes} quente{quentes > 1 ? 's' : ''}</span>}
      </header>
      <div className="space-y-2 min-h-[120px] max-h-[calc(100vh-260px)] overflow-y-auto">
        {leads.map((l) => <CartaoLead key={l.id} lead={l} corretor={l.corretor_id ? porMembro.get(l.corretor_id) : undefined} />)}
      </div>
    </section>
  )
}

function CartaoLead({ lead, corretor }: { lead: Lead; corretor?: Membro }) {
  const nav = useNavigate()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, data: { etapa: lead.etapa_id } })
  const semResposta = lead.atribuido_em && !lead.primeira_resposta_corretor_em
  return (
    <article ref={setNodeRef} {...listeners} {...attributes}
      onClick={() => nav(`/leads/${lead.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/leads/${lead.id}`)}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={clsx('cursor-pointer rounded-pequeno border border-concreto-200 bg-white p-3 text-sm hover:border-concreto-300', isDragging && 'relative z-10 shadow-lg rotate-1')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{lead.nome ?? telefoneBonito(lead.telefone)}</div>
          <div className="text-xs text-concreto-500 truncate">{ORIGENS[lead.origem] ?? lead.origem} · {tempoAtras(lead.criado_em)}</div>
        </div>
        <ChipTemperatura t={lead.temperatura} pequeno />
      </div>
      {lead.resumo_ia && <p className="mt-2 text-xs text-concreto-600 line-clamp-2">{lead.resumo_ia}</p>}
      <div className="mt-2.5"><Termometro valor={lead.pontuacao} t={lead.temperatura} /></div>
      <div className="mt-2.5 flex items-center justify-between text-xs text-concreto-500">
        {lead.atendimento_humano
          ? <span className="inline-flex items-center gap-1"><UserRound size={13} />{corretor ? corretor.nome.split(' ')[0] : 'Aguardando corretor'}</span>
          : <span className="inline-flex items-center gap-1 text-petroleo-600"><Bot size={13} />IA atendendo</span>}
        {semResposta && <span className="font-medium text-quente">sem resposta</span>}
      </div>
    </article>
  )
}

function Lista({ leads, etapas, porMembro }: { leads: Lead[]; etapas: { id: string; nome: string; cor: string }[]; porMembro: Map<string, Membro> }) {
  const porEtapa = new Map(etapas.map((e) => [e.id, e]))
  if (!leads.length) return <div className="painel px-6 py-12 text-center text-concreto-500">Nenhum lead encontrado com esses filtros.</div>
  return (
    <div className="painel overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-concreto-500 border-b border-concreto-200"><tr>
          <th className="px-5 py-3 font-medium">Lead</th><th className="px-3 py-3 font-medium">Temperatura</th><th className="px-3 py-3 font-medium">Etapa</th><th className="px-3 py-3 font-medium">Origem</th><th className="px-3 py-3 font-medium">Corretor</th><th className="px-3 py-3 font-medium">Chegou</th>
        </tr></thead>
        <tbody>
          {leads.map((l) => {
            const et = l.etapa_id ? porEtapa.get(l.etapa_id) : undefined
            return (
              <tr key={l.id} className="border-b border-concreto-100 last:border-0 hover:bg-concreto-50">
                <td className="px-5 py-3"><Link to={`/leads/${l.id}`} className="font-medium hover:underline">{l.nome ?? 'Sem nome'}</Link><div className="text-xs text-concreto-500">{telefoneBonito(l.telefone)}</div></td>
                <td className="px-3 py-3"><ChipTemperatura t={l.temperatura} pequeno /></td>
                <td className="px-3 py-3">{et && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: et.cor }} />{et.nome}</span>}</td>
                <td className="px-3 py-3 text-concreto-600">{ORIGENS[l.origem]}</td>
                <td className="px-3 py-3">{l.corretor_id ? porMembro.get(l.corretor_id)?.nome : <span className="text-concreto-400">—</span>}</td>
                <td className="px-3 py-3 text-concreto-500 whitespace-nowrap">{tempoAtras(l.criado_em)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function NovoLead({ aoCriar }: { aoCriar: () => void }) {
  const { empresa, membro } = useSessao()
  const { data: etapas } = useEtapas()
  const [f, setF] = useState({ nome: '', telefone: '', email: '' })
  const [erro, setErro] = useState('')
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setErro('')
      let tel = f.telefone.replace(/\D/g, '')
      if (tel.length < 10) return setErro('Informe o telefone com DDD.')
      if (tel.length <= 11) tel = '55' + tel
      const { error } = await supabase.from('leads').insert({
        empresa_id: empresa!.id, nome: f.nome || null, telefone: tel, email: f.email || null, origem: 'manual',
        etapa_id: etapas?.[0]?.id, corretor_id: membro?.papel === 'corretor' ? membro.id : null, atendimento_humano: true,
      })
      if (error) return setErro(error.code === '23505' ? 'Já existe um lead com esse telefone.' : error.message)
      aoCriar()
    }}>
      <div><label className="rotulo" htmlFor="n-nome">Nome</label><input id="n-nome" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
      <div><label className="rotulo" htmlFor="n-tel">WhatsApp</label><input id="n-tel" required className="campo" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} placeholder="(47) 99999-0000" /></div>
      <div><label className="rotulo" htmlFor="n-email">E-mail (opcional)</label><input id="n-email" type="email" className="campo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <p className="text-xs text-concreto-500">Leads cadastrados à mão ficam com atendimento humano. Para a IA atender, abra o lead e clique em “Devolver para a IA”.</p>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <div className="flex justify-end"><button className="btn-primario">Cadastrar lead</button></div>
    </form>
  )
}
