import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileUp, Pencil, Plus } from 'lucide-react'
import { supabase, funcao } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { useEmpreendimentos } from '@/lib/dados'
import { brl } from '@/lib/formato'
import type { Empreendimento } from '@/lib/tipos'
import { Alerta, Cabecalho, Carregando, Interruptor, Modal, Vazio } from '@/components/ui'

const VAZIO: Partial<Empreendimento> = { nome: '', cidade: '', bairro: '', tipo: 'Apartamento', status_obra: 'Lançamento', aceita_financiamento: true, ativo: true }

export function FormEmpreendimento({ inicial, aoSalvar, aoCancelar }: { inicial?: Partial<Empreendimento>; aoSalvar: () => void; aoCancelar?: () => void }) {
  const { empresa } = useSessao()
  const [f, setF] = useState<Partial<Empreendimento>>(inicial ?? VAZIO)
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const set = (k: keyof Empreendimento, v: unknown) => setF((x) => ({ ...x, [k]: v }))

  async function lerPdf(arquivo: File) {
    if (arquivo.size > 20 * 1024 * 1024) return setErro('O PDF precisa ter até 20 MB.')
    setLendo(true); setErro('')
    try {
      const base64 = await new Promise<string>((ok, falha) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result).split(',')[1])
        r.onerror = falha
        r.readAsDataURL(arquivo)
      })
      const dados = await funcao<Partial<Empreendimento>>('acoes-lead', { acao: 'extrair_material', pdf_base64: base64 })
      setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(dados).filter(([, v]) => v != null && v !== '')) }))
    } catch (e) { setErro((e as Error).message) } finally { setLendo(false) }
  }

  async function salvar() {
    if (!f.nome) return setErro('Dê um nome ao empreendimento.')
    setSalvando(true); setErro('')
    const { id, ...resto } = f as Empreendimento
    const { error } = id
      ? await supabase.from('empreendimentos').update(resto).eq('id', id)
      : await supabase.from('empreendimentos').insert({ ...resto, empresa_id: empresa!.id })
    setSalvando(false)
    if (error) return setErro(error.message)
    aoSalvar()
  }

  const campo = (k: keyof Empreendimento, rotulo: string, props: Record<string, unknown> = {}) => (
    <div>
      <label className="rotulo" htmlFor={`e-${k}`}>{rotulo}</label>
      <input id={`e-${k}`} className="campo" value={(f[k] as string | number | null) ?? ''} onChange={(e) => set(k, props.type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value)} {...props} />
    </div>
  )

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer items-center gap-3 rounded-medio border border-dashed border-petroleo-300 bg-petroleo-50 px-4 py-3.5 text-sm hover:bg-petroleo-100">
        <FileUp size={20} className="text-petroleo-600 shrink-0" />
        <span><span className="font-semibold text-petroleo-800">{lendo ? 'Lendo o material…' : 'Preencher a partir do PDF de vendas'}</span><br /><span className="text-concreto-600">A IA lê o book do empreendimento e preenche os campos. Você revisa antes de salvar.</span></span>
        <input type="file" accept="application/pdf" className="sr-only" disabled={lendo} onChange={(e) => e.target.files?.[0] && lerPdf(e.target.files[0])} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{campo('nome', 'Nome do empreendimento', { placeholder: 'Ex.: Residencial Vista Mar' })}</div>
        {campo('cidade', 'Cidade')}
        {campo('bairro', 'Bairro')}
        <div className="sm:col-span-2">{campo('endereco', 'Endereço do decorado ou da obra')}</div>
        <div>
          <label className="rotulo" htmlFor="e-tipo">Tipo</label>
          <select id="e-tipo" className="campo" value={f.tipo ?? ''} onChange={(e) => set('tipo', e.target.value)}>
            {['Apartamento', 'Casa', 'Sobrado', 'Lote', 'Sala comercial', 'Studio'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="e-status">Situação da obra</label>
          <select id="e-status" className="campo" value={f.status_obra ?? ''} onChange={(e) => set('status_obra', e.target.value)}>
            {['Lançamento', 'Em obras', 'Pronto para morar'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>
        {campo('preco_minimo', 'Preço a partir de (R$)', { type: 'number', min: 0 })}
        {campo('preco_maximo', 'Preço até (R$)', { type: 'number', min: 0 })}
        {campo('metragens', 'Metragens', { placeholder: 'Ex.: 52 a 78 m²' })}
        {campo('dormitorios', 'Dormitórios', { placeholder: 'Ex.: 2 e 3 (1 suíte)' })}
        {campo('previsao_entrega', 'Previsão de entrega', { placeholder: 'Ex.: dezembro de 2027' })}
        {campo('programa_habitacional', 'Programa habitacional', { placeholder: 'Ex.: Minha Casa Minha Vida' })}
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="e-dif">Diferenciais</label>
          <textarea id="e-dif" rows={2} className="campo" value={f.diferenciais ?? ''} onChange={(e) => set('diferenciais', e.target.value)} placeholder="Piscina, academia, vista para o mar, 2 vagas…" />
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="e-cond">Condições de pagamento</label>
          <textarea id="e-cond" rows={2} className="campo" value={f.condicoes_pagamento ?? ''} onChange={(e) => set('condicoes_pagamento', e.target.value)} placeholder="Entrada facilitada em 60x, aceita FGTS, financiamento pela Caixa…" />
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="e-mat">Informações extras para o agente</label>
          <textarea id="e-mat" rows={4} className="campo" value={f.material_texto ?? ''} onChange={(e) => set('material_texto', e.target.value)} placeholder="Tudo que a IA deve saber: plantas, unidades disponíveis, perguntas frequentes…" />
          <p className="ajuda">O agente só fala o que estiver escrito aqui e nos campos acima. Ele não inventa preços.</p>
        </div>
        <div className="sm:col-span-2">{campo('link_material', 'Link do material (book, vídeo ou tour)', { type: 'url', placeholder: 'https://' })}</div>
        <div className="flex items-center gap-3"><Interruptor ligado={f.aceita_financiamento ?? true} aoMudar={(v) => set('aceita_financiamento', v)} rotulo="Aceita financiamento" /><span className="text-sm">Aceita financiamento</span></div>
        <div className="flex items-center gap-3"><Interruptor ligado={f.ativo ?? true} aoMudar={(v) => set('ativo', v)} rotulo="Em vendas" /><span className="text-sm">Em vendas (o agente oferece)</span></div>
      </div>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <div className="flex justify-end gap-2">
        {aoCancelar && <button className="btn-secundario" onClick={aoCancelar}>Cancelar</button>}
        <button className="btn-primario" onClick={salvar} disabled={salvando || lendo}>Salvar empreendimento</button>
      </div>
    </div>
  )
}

export function Empreendimentos() {
  const { data, isLoading } = useEmpreendimentos()
  const qc = useQueryClient()
  const [editando, setEditando] = useState<Partial<Empreendimento> | null>(null)
  const fechar = () => { setEditando(null); qc.invalidateQueries({ queryKey: ['empreendimentos'] }) }

  return (
    <>
      <Cabecalho titulo="Empreendimentos" descricao="O que o agente de IA conhece e oferece aos leads. Mantenha preços e condições atualizados."
        acoes={<button className="btn-primario" onClick={() => setEditando(VAZIO)}><Plus size={17} />Novo empreendimento</button>} />
      {isLoading ? <Carregando /> : !data?.length ? (
        <Vazio titulo="Nenhum empreendimento cadastrado" texto="Cadastre pelo menos um para o agente conseguir apresentar opções. Você pode enviar o PDF de vendas e a IA preenche os dados."
          acao={<button className="btn-primario" onClick={() => setEditando(VAZIO)}>Cadastrar empreendimento</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((e) => (
            <article key={e.id} className="painel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold leading-snug">{e.nome}</h3>
                  <p className="text-sm text-concreto-500">{[e.bairro, e.cidade].filter(Boolean).join(', ') || 'Local não informado'}</p>
                </div>
                <button className="btn-fantasma h-8 w-8 px-0" onClick={() => setEditando(e)} aria-label={`Editar ${e.nome}`}><Pencil size={16} /></button>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-concreto-500">Tipo</dt><dd>{e.tipo ?? '—'}</dd>
                <dt className="text-concreto-500">Situação</dt><dd>{e.status_obra ?? '—'}</dd>
                <dt className="text-concreto-500">Preço</dt><dd>{e.preco_minimo ? `a partir de ${brl(e.preco_minimo)}` : '—'}</dd>
                <dt className="text-concreto-500">Dormitórios</dt><dd>{e.dormitorios ?? '—'}</dd>
              </dl>
              {!e.ativo && <p className="mt-3 text-xs text-concreto-500">Fora de vendas: o agente não oferece.</p>}
            </article>
          ))}
        </div>
      )}
      <Modal aberto={!!editando} aoFechar={() => setEditando(null)} titulo={editando?.id ? 'Editar empreendimento' : 'Novo empreendimento'} largura={720}>
        {editando && <FormEmpreendimento inicial={editando} aoSalvar={fechar} aoCancelar={() => setEditando(null)} />}
      </Modal>
    </>
  )
}
