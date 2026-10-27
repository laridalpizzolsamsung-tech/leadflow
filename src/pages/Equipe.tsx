import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { useLeads, useMembros } from '@/lib/dados'
import { tempoAtras } from '@/lib/formato'
import type { Papel } from '@/lib/tipos'
import { Alerta, Avatar, Cabecalho, Carregando, Interruptor, Modal } from '@/components/ui'

export function FormConvite({ aoEnviar }: { aoEnviar: () => void }) {
  const { empresa } = useSessao()
  const [f, setF] = useState({ nome: '', email: '', telefone: '', papel: 'corretor' as Papel })
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); setErro(''); setOk(''); setEnviando(true)
      const tel = f.telefone.replace(/\D/g, '')
      const { error } = await supabase.from('convites').upsert({ empresa_id: empresa!.id, nome: f.nome, email: f.email.trim().toLowerCase(), telefone: tel ? (tel.length <= 11 ? '55' + tel : tel) : null, papel: f.papel }, { onConflict: 'empresa_id,email' })
      if (error) { setErro(error.message); setEnviando(false); return }
      // Envia um link de acesso para o e-mail do convidado
      await supabase.auth.signInWithOtp({ email: f.email.trim(), options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } })
      setOk(`Convite enviado para ${f.email}. A pessoa entra pelo link que chegou no e-mail.`)
      setF({ nome: '', email: '', telefone: '', papel: 'corretor' }); setEnviando(false); aoEnviar()
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="rotulo" htmlFor="c-nome">Nome</label><input id="c-nome" required className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
        <div><label className="rotulo" htmlFor="c-email">E-mail</label><input id="c-email" type="email" required className="campo" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><label className="rotulo" htmlFor="c-tel">WhatsApp</label><input id="c-tel" className="campo" placeholder="(47) 99999-0000" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /><p className="ajuda">Para avisar quando chegar um lead para ele.</p></div>
        <div>
          <label className="rotulo" htmlFor="c-papel">Função</label>
          <select id="c-papel" className="campo" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}>
            <option value="corretor">Corretor: vê só os próprios leads</option>
            <option value="gestor">Gestor: vê tudo e configura</option>
            <option value="admin">Administrador: acesso total</option>
          </select>
        </div>
      </div>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {ok && <Alerta tipo="ok">{ok}</Alerta>}
      <button className="btn-primario" disabled={enviando}><UserPlus size={17} />Enviar convite</button>
    </form>
  )
}

export function Equipe() {
  const { empresa, membro: eu } = useSessao()
  const { data: membros, isLoading } = useMembros()
  const { data: leads } = useLeads({ de: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) })
  const { data: convites } = useQuery({
    queryKey: ['convites', empresa?.id], enabled: eu?.papel === 'admin',
    queryFn: async () => (await supabase.from('convites').select('*').eq('empresa_id', empresa!.id).eq('aceito', false)).data ?? [],
  })
  const qc = useQueryClient()
  const [convidar, setConvidar] = useState(false)
  const atualizar = async (id: string, patch: Record<string, unknown>) => {
    await supabase.from('membros').update(patch).eq('id', id)
    qc.invalidateQueries({ queryKey: ['membros'] })
  }

  const stats = (id: string) => {
    const meus = leads?.filter((l) => l.corretor_id === id) ?? []
    const respondidos = meus.filter((l) => l.primeira_resposta_corretor_em && l.atribuido_em)
    const tempoMedio = respondidos.length ? respondidos.reduce((s, l) => s + (new Date(l.primeira_resposta_corretor_em!).getTime() - new Date(l.atribuido_em!).getTime()), 0) / respondidos.length / 60000 : null
    return { total: meus.length, tempoMedio, vendas: meus.filter((l) => l.valor_venda).length }
  }

  return (
    <>
      <Cabecalho titulo="Equipe" descricao="Quem recebe os leads no rodízio, e como cada corretor está respondendo nos últimos 30 dias."
        acoes={eu?.papel === 'admin' && <button className="btn-primario" onClick={() => setConvidar(true)}><UserPlus size={17} />Convidar corretor</button>} />
      {isLoading ? <Carregando /> : (
        <div className="painel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-concreto-500 border-b border-concreto-200">
              <tr><th className="px-5 py-3 font-medium">Pessoa</th><th className="px-3 py-3 font-medium">Função</th><th className="px-3 py-3 font-medium">Leads (30 dias)</th><th className="px-3 py-3 font-medium">Tempo médio de resposta</th><th className="px-3 py-3 font-medium">Vendas</th><th className="px-3 py-3 font-medium">Último lead</th><th className="px-5 py-3 font-medium">No rodízio</th></tr>
            </thead>
            <tbody>
              {membros?.map((m) => {
                const s = stats(m.id)
                const lento = s.tempoMedio != null && s.tempoMedio > (empresa?.sla_minutos ?? 15)
                return (
                  <tr key={m.id} className="border-b border-concreto-100 last:border-0">
                    <td className="px-5 py-3"><div className="flex items-center gap-3"><Avatar nome={m.nome} /><div><div className="font-medium">{m.nome}</div><div className="text-xs text-concreto-500">{m.email}</div></div></div></td>
                    <td className="px-3 py-3">
                      {eu?.papel === 'admin' && m.id !== eu.id ? (
                        <select className="campo h-8 w-auto" value={m.papel} onChange={(e) => atualizar(m.id, { papel: e.target.value })} aria-label={`Função de ${m.nome}`}>
                          <option value="corretor">Corretor</option><option value="gestor">Gestor</option><option value="admin">Administrador</option>
                        </select>
                      ) : <span className="capitalize">{m.papel}</span>}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{s.total}</td>
                    <td className={`px-3 py-3 tabular-nums ${lento ? 'text-quente font-semibold' : ''}`}>{s.tempoMedio == null ? '—' : s.tempoMedio < 60 ? `${Math.round(s.tempoMedio)} min` : `${(s.tempoMedio / 60).toFixed(1)} h`}</td>
                    <td className="px-3 py-3 tabular-nums">{s.vendas}</td>
                    <td className="px-3 py-3 text-concreto-500">{tempoAtras(m.ultimo_lead_em)}</td>
                    <td className="px-5 py-3"><Interruptor ligado={m.recebe_leads && m.ativo} aoMudar={(v) => atualizar(m.id, { recebe_leads: v })} rotulo={`${m.nome} recebe leads`} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!!convites?.length && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Convites aguardando</h2>
          <ul className="painel divide-y divide-concreto-100">
            {convites.map((c: any) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span><span className="font-medium">{c.nome}</span> <span className="text-concreto-500">{c.email}</span></span>
                <button className="btn-fantasma h-8 text-quente" onClick={async () => { await supabase.from('convites').delete().eq('id', c.id); qc.invalidateQueries({ queryKey: ['convites'] }) }}>Cancelar convite</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Modal aberto={convidar} aoFechar={() => setConvidar(false)} titulo="Convidar para a equipe">
        <FormConvite aoEnviar={() => qc.invalidateQueries({ queryKey: ['convites'] })} />
      </Modal>
    </>
  )
}
