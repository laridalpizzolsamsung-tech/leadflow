import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw, Send, Trash2 } from 'lucide-react'
import { supabase, funcao } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { Alerta, Cabecalho, Carregando, ChipTemperatura, Interruptor } from '@/components/ui'
import type { Temperatura } from '@/lib/tipos'

interface Agente { nome_agente: string; tom_de_voz: string; perguntas_qualificacao: string[]; instrucoes_extras: string | null; ativo: boolean }

export function useAgente() {
  const { empresa } = useSessao()
  return useQuery({
    queryKey: ['agente', empresa?.id], enabled: !!empresa,
    queryFn: async () => (await supabase.from('agentes').select('*').eq('empresa_id', empresa!.id).single()).data as Agente,
  })
}

export function FormAgente({ aoSalvar, compacto }: { aoSalvar?: () => void; compacto?: boolean }) {
  const { empresa } = useSessao()
  const { data } = useAgente()
  const qc = useQueryClient()
  const [f, setF] = useState<Agente | null>(null)
  const [salvo, setSalvo] = useState(false)
  useEffect(() => { if (data && !f) setF(data) }, [data, f])
  if (!f) return <Carregando />

  const salvar = async () => {
    await supabase.from('agentes').update({ ...f, perguntas_qualificacao: f.perguntas_qualificacao.filter(Boolean), atualizado_em: new Date().toISOString() }).eq('empresa_id', empresa!.id)
    qc.invalidateQueries({ queryKey: ['agente'] }); setSalvo(true); setTimeout(() => setSalvo(false), 2500); aoSalvar?.()
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="rotulo" htmlFor="a-nome">Nome do agente</label><input id="a-nome" className="campo" value={f.nome_agente} onChange={(e) => setF({ ...f, nome_agente: e.target.value })} /><p className="ajuda">Como ele se apresenta no WhatsApp.</p></div>
        <div>
          <label className="rotulo" htmlFor="a-tom">Jeito de falar</label>
          <select id="a-tom" className="campo" value={f.tom_de_voz} onChange={(e) => setF({ ...f, tom_de_voz: e.target.value })}>
            <option value="cordial, próximo e objetivo">Cordial e objetivo</option>
            <option value="descontraído, animado e acolhedor">Descontraído e animado</option>
            <option value="formal, elegante e consultivo">Formal e consultivo (alto padrão)</option>
          </select>
        </div>
      </div>
      <div>
        <span className="rotulo">Perguntas para qualificar o lead</span>
        <p className="ajuda -mt-1 mb-2">O agente faz uma de cada vez, no meio da conversa, sem parecer formulário.</p>
        <div className="space-y-2">
          {f.perguntas_qualificacao.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input className="campo" value={p} aria-label={`Pergunta ${i + 1}`} onChange={(e) => { const n = [...f.perguntas_qualificacao]; n[i] = e.target.value; setF({ ...f, perguntas_qualificacao: n }) }} />
              <button className="btn-fantasma h-10 w-10 px-0 shrink-0" aria-label="Remover pergunta" onClick={() => setF({ ...f, perguntas_qualificacao: f.perguntas_qualificacao.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
            </div>
          ))}
          <button className="btn-fantasma h-9 text-petroleo-700" onClick={() => setF({ ...f, perguntas_qualificacao: [...f.perguntas_qualificacao, ''] })}><Plus size={16} />Adicionar pergunta</button>
        </div>
      </div>
      {!compacto && (
        <div>
          <label className="rotulo" htmlFor="a-extra">Regras da construtora</label>
          <textarea id="a-extra" rows={4} className="campo" value={f.instrucoes_extras ?? ''} onChange={(e) => setF({ ...f, instrucoes_extras: e.target.value })} placeholder="Ex.: o decorado abre de terça a domingo das 9h às 18h. Não falar de desconto. Sempre oferecer o tour virtual." />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm"><Interruptor ligado={f.ativo} aoMudar={(v) => setF({ ...f, ativo: v })} rotulo="Agente ligado" />{f.ativo ? 'Agente atendendo os leads' : 'Agente desligado: os leads esperam um corretor'}</label>
        <div className="flex items-center gap-3">{salvo && <span className="text-sm text-emerald-700">Alterações salvas</span>}<button className="btn-primario" onClick={salvar}>Salvar agente</button></div>
      </div>
    </div>
  )
}

interface Fala { autor: 'lead' | 'agente'; conteudo: string }
interface Analise { temperatura: Temperatura; pontuacao: number; resumo: string; pronto_para_visita: boolean; pedir_humano: boolean }

export function TesteAgente() {
  const [falas, setFalas] = useState<Fala[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [erro, setErro] = useState('')
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => { fim.current?.scrollIntoView({ block: 'nearest' }) }, [falas, pensando])

  async function enviar() {
    if (!texto.trim() || pensando) return
    const novas: Fala[] = [...falas, { autor: 'lead', conteudo: texto.trim() }]
    setFalas(novas); setTexto(''); setPensando(true); setErro('')
    try {
      const r = await funcao<Analise & { resposta: string }>('acoes-lead', { acao: 'testar_agente', historico: novas })
      setFalas([...novas, { autor: 'agente', conteudo: r.resposta }])
      setAnalise(r)
    } catch (e) { setErro((e as Error).message) } finally { setPensando(false) }
  }

  return (
    <div className="painel flex flex-col h-[560px]">
      <div className="flex items-center justify-between border-b border-concreto-200 px-4 py-3">
        <div><div className="font-semibold">Testar o agente</div><div className="text-xs text-concreto-500">Converse como se fosse um cliente. Nada é enviado no WhatsApp.</div></div>
        <button className="btn-fantasma h-8 text-xs" onClick={() => { setFalas([]); setAnalise(null) }}><RotateCcw size={14} />Recomeçar</button>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#EFEAE2] px-4 py-4 space-y-2">
        {!falas.length && <p className="text-center text-sm text-concreto-600 mt-10 max-w-[34ch] mx-auto">Escreva algo como “Oi, vi o anúncio do apartamento, ainda tem?”</p>}
        {falas.map((f, i) => (
          <div key={i} className={`max-w-[80%] rounded-medio px-3 py-2 text-sm shadow-sm whitespace-pre-wrap ${f.autor === 'lead' ? 'ml-auto bg-[#D9FDD3]' : 'bg-white'}`}>{f.conteudo}</div>
        ))}
        {pensando && <div className="w-16 rounded-medio bg-white px-3 py-2 text-sm text-concreto-500">…</div>}
        <div ref={fim} />
      </div>
      {analise && (
        <div className="border-t border-concreto-200 px-4 py-3 text-sm space-y-1.5">
          <div className="flex items-center gap-2"><ChipTemperatura t={analise.temperatura} pequeno /><span className="text-concreto-500">pontuação {analise.pontuacao}</span>{analise.pronto_para_visita && <span className="text-emerald-700 font-medium">· seria entregue ao corretor</span>}{analise.pedir_humano && <span className="text-quente font-medium">· pediu atendimento humano</span>}</div>
          <p className="text-concreto-600 text-xs leading-relaxed">{analise.resumo}</p>
        </div>
      )}
      {erro && <div className="px-4 pb-2"><Alerta tipo="erro">{erro}</Alerta></div>}
      <form className="flex gap-2 border-t border-concreto-200 p-3" onSubmit={(e) => { e.preventDefault(); enviar() }}>
        <input className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem do cliente" aria-label="Mensagem do cliente" />
        <button className="btn-primario w-11 px-0" disabled={pensando} aria-label="Enviar"><Send size={17} /></button>
      </form>
    </div>
  )
}

export function AgentePagina() {
  return (
    <>
      <Cabecalho titulo="Agente de IA" descricao="Quem atende o lead assim que ele chega: conversa, entende o que a pessoa procura, classifica e entrega ao corretor na hora da visita." />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="painel p-6"><FormAgente /></div>
        <TesteAgente />
      </div>
    </>
  )
}
