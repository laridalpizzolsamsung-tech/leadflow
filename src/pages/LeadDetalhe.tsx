import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Bot, CalendarCheck, CircleDollarSign, Send, UserRound, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { supabase, funcao } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { useCampanhas, useEmpreendimentos, useEtapas, useMembros } from '@/lib/dados'
import { brl, dataHora, ORIGENS, telefoneBonito, tempoAtras } from '@/lib/formato'
import type { Lead, Mensagem } from '@/lib/tipos'
import { Alerta, Carregando, ChipTemperatura, Modal, Termometro } from '@/components/ui'

export function LeadDetalhe() {
  const { id } = useParams()
  const { empresa, podeGerenciar } = useSessao()
  const qc = useQueryClient()
  const { data: lead, isLoading } = useQuery({ queryKey: ['lead', id], queryFn: async () => (await supabase.from('leads').select('*').eq('id', id!).single()).data as Lead })
  const { data: mensagens } = useQuery({ queryKey: ['mensagens', id], queryFn: async () => (await supabase.from('mensagens').select('*').eq('lead_id', id!).order('criado_em')).data as Mensagem[] })
  const { data: eventos } = useQuery({ queryKey: ['eventos', id], queryFn: async () => (await supabase.from('eventos_lead').select('*').eq('lead_id', id!).order('criado_em', { ascending: false })).data ?? [] })
  const { data: etapas } = useEtapas()
  const { data: membros } = useMembros()
  const { data: emps } = useEmpreendimentos()
  const { data: camp } = useCampanhas()
  const [modal, setModal] = useState<'venda' | 'perda' | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const canal = supabase.channel('lead-' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens', filter: `lead_id=eq.${id}` }, () => qc.invalidateQueries({ queryKey: ['mensagens', id] }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads', filter: `id=eq.${id}` }, () => { qc.invalidateQueries({ queryKey: ['lead', id] }); qc.invalidateQueries({ queryKey: ['eventos', id] }) })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [id, qc])

  if (isLoading) return <Carregando />
  if (!lead) return <Alerta tipo="erro">Lead não encontrado ou você não tem acesso a ele.</Alerta>

  const atualizar = async (patch: Partial<Lead>) => { await supabase.from('leads').update(patch).eq('id', lead.id); qc.invalidateQueries({ queryKey: ['lead', id] }) }
  const acao = async (a: string, extra: Record<string, unknown> = {}) => {
    setErro('')
    try { await funcao('acoes-lead', { acao: a, lead_id: lead.id, ...extra }); qc.invalidateQueries({ queryKey: ['lead', id] }); qc.invalidateQueries({ queryKey: ['eventos', id] }) }
    catch (e) { setErro((e as Error).message) }
  }
  const campanha = camp?.campanhas.find((c) => c.id === lead.campanha_id)
  const criativo = camp?.criativos.find((c) => c.id === lead.criativo_id)

  const linhas: [string, React.ReactNode][] = [
    ['Busca', [lead.tipo_imovel, lead.bairro_interesse].filter(Boolean).join(' em ') || null],
    ['Finalidade', lead.finalidade],
    ['Orçamento', lead.orcamento ? brl(lead.orcamento) : null],
    ['Renda familiar', lead.renda_familiar ? brl(lead.renda_familiar) : null],
    ['Financiamento', lead.usa_financiamento == null ? null : lead.usa_financiamento ? 'Sim' : 'Não'],
    ['FGTS', lead.usa_fgts == null ? null : lead.usa_fgts ? 'Sim' : 'Não'],
    ['Prazo', lead.prazo_compra],
    ['Primeiro imóvel', lead.primeiro_imovel == null ? null : lead.primeiro_imovel ? 'Sim' : 'Não'],
    ['Principal dúvida', lead.objecao_principal],
    ['Perfil', [lead.genero, lead.idade ? `${lead.idade} anos` : lead.faixa_etaria, lead.cidade].filter(Boolean).join(', ') || null],
  ]

  return (
    <>
      <Link to="/leads" className="inline-flex items-center gap-1.5 text-sm text-concreto-500 hover:text-concreto-800 mb-4"><ArrowLeft size={16} />Leads</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-[28px] font-bold">{lead.nome ?? 'Sem nome'}</h1><ChipTemperatura t={lead.temperatura} /></div>
          <p className="text-concreto-500 mt-0.5"><a href={`https://wa.me/${lead.telefone}`} target="_blank" rel="noreferrer" className="hover:underline">{telefoneBonito(lead.telefone)}</a>{lead.email && ` · ${lead.email}`} · chegou {tempoAtras(lead.criado_em)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!lead.visita_realizada && <button className="btn-secundario" onClick={() => acao('visita_realizada')}><CalendarCheck size={16} />Visita realizada</button>}
          <button className="btn-primario bg-emerald-700 hover:bg-emerald-800" onClick={() => setModal('venda')}><CircleDollarSign size={16} />Registrar venda</button>
          <button className="btn-perigo" onClick={() => setModal('perda')}><XCircle size={16} />Perdido</button>
        </div>
      </div>
      {erro && <div className="mb-4"><Alerta tipo="erro">{erro}</Alerta></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Conversa lead={lead} mensagens={mensagens ?? []} membros={membros ?? []} aoAcao={acao} />

        <aside className="space-y-4">
          {lead.resumo_ia && (
            <section className="painel p-5">
              <h2 className="font-sans text-sm font-semibold flex items-center gap-1.5"><Bot size={16} className="text-petroleo-600" />Resumo para o corretor</h2>
              <p className="text-sm mt-2 whitespace-pre-line leading-relaxed">{lead.resumo_ia}</p>
              <div className="mt-3"><Termometro valor={lead.pontuacao} t={lead.temperatura} /><div className="text-xs text-concreto-500 mt-1">Pontuação {lead.pontuacao} de 100</div></div>
            </section>
          )}

          <section className="painel p-5 space-y-3">
            <div><label className="rotulo" htmlFor="l-etapa">Etapa</label>
              <select id="l-etapa" className="campo" value={lead.etapa_id ?? ''} onChange={async (e) => { await atualizar({ etapa_id: e.target.value }); await supabase.from('eventos_lead').insert({ empresa_id: empresa!.id, lead_id: lead.id, tipo: 'etapa', descricao: `Movido para ${etapas?.find((x) => x.id === e.target.value)?.nome}` }) }}>
                {etapas?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select></div>
            <div><label className="rotulo" htmlFor="l-temp">Temperatura</label>
              <select id="l-temp" className="campo" value={lead.temperatura} onChange={(e) => atualizar({ temperatura: e.target.value as Lead['temperatura'] })}>
                <option value="quente">Quente</option><option value="morno">Morno</option><option value="frio">Frio</option><option value="nao_classificado">Em análise</option>
              </select></div>
            {podeGerenciar && <div><label className="rotulo" htmlFor="l-cor">Corretor</label>
              <select id="l-cor" className="campo" value={lead.corretor_id ?? ''} onChange={(e) => atualizar({ corretor_id: e.target.value || null, atribuido_em: new Date().toISOString(), primeira_resposta_corretor_em: null })}>
                <option value="">Ninguém</option>{membros?.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select></div>}
            <div><label className="rotulo" htmlFor="l-emp">Empreendimento</label>
              <select id="l-emp" className="campo" value={lead.empreendimento_id ?? ''} onChange={(e) => atualizar({ empreendimento_id: e.target.value || null })}>
                <option value="">Não definido</option>{emps?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select></div>
            <div><label className="rotulo" htmlFor="l-vis">Visita marcada para</label>
              <input id="l-vis" type="datetime-local" className="campo" value={lead.visita_agendada_para ? lead.visita_agendada_para.slice(0, 16) : ''} onChange={(e) => atualizar({ visita_agendada_para: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
          </section>

          <section className="painel p-5">
            <h2 className="font-sans text-sm font-semibold mb-2">O que a IA descobriu</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {linhas.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-concreto-500">{k}</dt><dd>{v}</dd></div>)}
            </dl>
            {!linhas.some(([, v]) => v) && <p className="text-sm text-concreto-500">Ainda nada. Os dados aparecem aqui conforme a conversa avança.</p>}
          </section>

          <section className="painel p-5 text-sm">
            <h2 className="font-sans text-sm font-semibold mb-2">De onde veio</h2>
            <p>{ORIGENS[lead.origem]}</p>
            {campanha && <p className="text-concreto-600 mt-1">Campanha: {campanha.nome}</p>}
            {criativo && <div className="mt-2 flex gap-3 items-center">{criativo.thumbnail_url && <img src={criativo.thumbnail_url} alt="" className="h-12 w-12 rounded-pequeno object-cover" />}<span className="text-concreto-600">Anúncio: {criativo.nome}</span></div>}
            {lead.utm_campaign && !campanha && <p className="text-concreto-600 mt-1">utm_campaign: {lead.utm_campaign}</p>}
          </section>

          <section className="painel p-5">
            <h2 className="font-sans text-sm font-semibold mb-3">Histórico</h2>
            <ol className="space-y-3 text-sm">
              {eventos?.map((ev: any) => (
                <li key={ev.id} className="relative pl-4 before:absolute before:left-0 before:top-2 before:h-1.5 before:w-1.5 before:rounded-full before:bg-concreto-300">
                  <div>{ev.descricao}</div><div className="text-xs text-concreto-500">{dataHora(ev.criado_em)}</div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      <Modal aberto={modal === 'venda'} aoFechar={() => setModal(null)} titulo="Registrar venda">
        <FormValor rotulo="Valor da venda (R$)" botao="Registrar venda" aoEnviar={async (v) => { await acao('venda', { valor: v ? Number(v) : null }); setModal(null) }} />
      </Modal>
      <Modal aberto={modal === 'perda'} aoFechar={() => setModal(null)} titulo="Marcar como perdido">
        <FormValor rotulo="Motivo" botao="Marcar como perdido" opcoes={['Sem condição financeira', 'Crédito reprovado', 'Comprou com concorrente', 'Desistiu da compra', 'Não respondeu mais', 'Localização não atende', 'Outro']} aoEnviar={async (v) => { await acao('perda', { motivo: v }); setModal(null) }} />
      </Modal>
    </>
  )
}

function FormValor({ rotulo, botao, opcoes, aoEnviar }: { rotulo: string; botao: string; opcoes?: string[]; aoEnviar: (v: string) => Promise<void> }) {
  const [v, setV] = useState(opcoes?.[0] ?? '')
  return (
    <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); await aoEnviar(v) }}>
      <div><label className="rotulo" htmlFor="fv">{rotulo}</label>
        {opcoes ? <select id="fv" className="campo" value={v} onChange={(e) => setV(e.target.value)}>{opcoes.map((o) => <option key={o}>{o}</option>)}</select>
          : <input id="fv" type="number" min={0} step="0.01" className="campo" value={v} onChange={(e) => setV(e.target.value)} />}
      </div>
      <div className="flex justify-end"><button className="btn-primario">{botao}</button></div>
    </form>
  )
}

function Conversa({ lead, mensagens, membros, aoAcao }: { lead: Lead; mensagens: Mensagem[]; membros: { id: string; nome: string }[]; aoAcao: (a: string, x?: Record<string, unknown>) => Promise<void> }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }) }, [mensagens.length])
  const janelaAberta = mensagens.some((m) => m.autor === 'lead' && Date.now() - new Date(m.criado_em).getTime() < 24 * 3600000)

  return (
    <section className="painel flex flex-col h-[calc(100vh-220px)] min-h-[520px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-concreto-200 px-4 py-3">
        {lead.atendimento_humano
          ? <span className="inline-flex items-center gap-1.5 text-sm font-medium"><UserRound size={16} />Atendimento humano: a IA está pausada</span>
          : <span className="inline-flex items-center gap-1.5 text-sm font-medium text-petroleo-700"><Bot size={16} />A IA está atendendo este lead</span>}
        {lead.atendimento_humano
          ? <button className="btn-secundario h-8 text-xs" onClick={() => aoAcao('devolver_ia')}>Devolver para a IA</button>
          : <button className="btn-secundario h-8 text-xs" onClick={() => aoAcao('assumir')}>Assumir conversa</button>}
      </div>
      <div className="flex-1 overflow-y-auto bg-[#EFEAE2] px-4 py-4 space-y-2">
        {!mensagens.length && <p className="text-center text-sm text-concreto-600 mt-10">Nenhuma mensagem ainda.</p>}
        {mensagens.map((m) => (
          <div key={m.id} className={clsx('max-w-[78%] rounded-medio px-3 py-2 text-sm shadow-sm', m.autor === 'lead' ? 'bg-white' : 'ml-auto', m.autor === 'agente' && 'bg-[#D9FDD3]', m.autor === 'corretor' && 'bg-[#CFE4E0]', m.autor === 'sistema' && 'mx-auto bg-concreto-100 text-xs')}>
            {m.autor !== 'lead' && <div className="text-[11px] font-semibold text-concreto-600 mb-0.5">{m.autor === 'agente' ? 'Agente IA' : membros.find((x) => x.id === m.membro_id)?.nome ?? 'Corretor'}</div>}
            <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
            <div className="text-[10px] text-concreto-500 text-right mt-0.5">{dataHora(m.criado_em)}{m.status_entrega === 'read' ? ' · lida' : m.status_entrega === 'failed' ? ' · falhou' : ''}</div>
          </div>
        ))}
        <div ref={fim} />
      </div>
      {!janelaAberta && mensagens.length > 0 && <div className="px-4 pt-2"><Alerta tipo="aviso">Faz mais de 24 horas que o lead não responde. Pelas regras do WhatsApp, só dá para enviar mensagem pelo seu celular ou com um modelo aprovado.</Alerta></div>}
      <form className="flex gap-2 border-t border-concreto-200 p-3" onSubmit={async (e) => {
        e.preventDefault(); if (!texto.trim()) return
        setEnviando(true); await aoAcao('enviar_mensagem', { texto: texto.trim() }); setTexto(''); setEnviando(false)
      }}>
        <textarea rows={1} className="campo resize-none min-h-10" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder pelo WhatsApp da construtora" aria-label="Mensagem"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit() } }} />
        <button className="btn-primario w-11 px-0" disabled={enviando || !janelaAberta} aria-label="Enviar"><Send size={17} /></button>
      </form>
    </section>
  )
}
