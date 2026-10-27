import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { useEtapas } from '@/lib/dados'
import { Alerta, Cabecalho } from '@/components/ui'

export function Ajustes() {
  const { empresa, membro, recarregar } = useSessao()
  const { data: etapas } = useEtapas()
  const qc = useQueryClient()
  const [f, setF] = useState({ nome: empresa?.nome ?? '', cidade: empresa?.cidade ?? '', sla: empresa?.sla_minutos ?? 15, telefone: membro?.telefone ?? '' })
  const [ok, setOk] = useState('')

  async function salvar() {
    const tel = f.telefone.replace(/\D/g, '')
    await supabase.from('empresas').update({ nome: f.nome, cidade: f.cidade, sla_minutos: Number(f.sla) }).eq('id', empresa!.id)
    await supabase.from('membros').update({ telefone: tel ? (tel.length <= 11 ? '55' + tel : tel) : null }).eq('id', membro!.id)
    await recarregar(); setOk('Ajustes salvos.'); setTimeout(() => setOk(''), 2500)
  }

  return (
    <>
      <Cabecalho titulo="Ajustes" />
      <div className="grid gap-6 xl:grid-cols-2 max-w-5xl">
        <section className="painel p-6 space-y-4">
          <h2 className="text-lg font-semibold">Construtora</h2>
          <div><label className="rotulo" htmlFor="aj-n">Nome</label><input id="aj-n" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
          <div><label className="rotulo" htmlFor="aj-c">Cidade</label><input id="aj-c" className="campo" value={f.cidade} onChange={(e) => setF({ ...f, cidade: e.target.value })} /></div>
          <div><label className="rotulo" htmlFor="aj-s">Prazo para o corretor responder (minutos)</label><input id="aj-s" type="number" min={1} max={1440} className="campo" value={f.sla} onChange={(e) => setF({ ...f, sla: Number(e.target.value) })} />
            <p className="ajuda">Passou desse prazo sem resposta, o sistema avisa o gestor e passa o lead para o próximo corretor.</p></div>
          <div><label className="rotulo" htmlFor="aj-t">Seu WhatsApp para avisos</label><input id="aj-t" className="campo" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></div>
          {ok && <Alerta tipo="ok">{ok}</Alerta>}
          <button className="btn-primario" onClick={salvar}>Salvar ajustes</button>
        </section>
        <section className="painel p-6">
          <h2 className="text-lg font-semibold">Etapas do funil</h2>
          <p className="text-sm text-concreto-500 mb-4">Renomeie as etapas para o jeito que sua equipe fala. A ordem e o papel de cada uma (visita, venda, perdido) ficam fixos.</p>
          <ul className="space-y-2">
            {etapas?.map((e) => (
              <li key={e.id} className="flex items-center gap-3">
                <input type="color" value={e.cor} aria-label={`Cor de ${e.nome}`} className="h-9 w-9 rounded-pequeno border border-concreto-200 p-0.5" onChange={async (ev) => { await supabase.from('etapas_funil').update({ cor: ev.target.value }).eq('id', e.id); qc.invalidateQueries({ queryKey: ['etapas'] }) }} />
                <input className="campo" defaultValue={e.nome} aria-label={`Nome da etapa ${e.ordem}`} onBlur={async (ev) => { if (ev.target.value && ev.target.value !== e.nome) { await supabase.from('etapas_funil').update({ nome: ev.target.value }).eq('id', e.id); qc.invalidateQueries({ queryKey: ['etapas'] }) } }} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
