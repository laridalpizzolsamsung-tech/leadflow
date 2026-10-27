import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Empresa, Membro } from './tipos'

interface Sessao {
  carregando: boolean
  sessao: Session | null
  membro: Membro | null
  empresa: Empresa | null
  recarregar: () => Promise<void>
  sair: () => Promise<void>
  podeGerenciar: boolean
}

const Ctx = createContext<Sessao>(null!)
export const useSessao = () => useContext(Ctx)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [sessao, setSessao] = useState<Session | null>(null)
  const [membro, setMembro] = useState<Membro | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)

  const carregarPerfil = useCallback(async (s: Session | null) => {
    if (!s) { setMembro(null); setEmpresa(null); return }
    let { data: m } = await supabase.from('membros').select('*').eq('user_id', s.user.id).eq('ativo', true).limit(1).maybeSingle()
    if (!m) {
      // Convidado por um administrador? Vira membro agora.
      const { data: n } = await supabase.rpc('aceitar_convites')
      if (n) ({ data: m } = await supabase.from('membros').select('*').eq('user_id', s.user.id).eq('ativo', true).limit(1).maybeSingle())
    }
    setMembro(m ?? null)
    if (m) {
      const { data: e } = await supabase.from('empresas').select('*').eq('id', m.empresa_id).single()
      setEmpresa(e ?? null)
    } else setEmpresa(null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session)
      await carregarPerfil(data.session)
      setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSessao(s)
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') carregarPerfil(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [carregarPerfil])

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await carregarPerfil(data.session)
  }, [carregarPerfil])

  const sair = useCallback(async () => { await supabase.auth.signOut() }, [])

  return (
    <Ctx.Provider value={{ carregando, sessao, membro, empresa, recarregar, sair, podeGerenciar: membro?.papel === 'admin' || membro?.papel === 'gestor' }}>
      {children}
    </Ctx.Provider>
  )
}
