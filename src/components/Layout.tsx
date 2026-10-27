import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BarChart3, Building2, Bot, Columns3, CreditCard, Menu, Megaphone, Plug, Settings, Users, LogOut, X } from 'lucide-react'
import clsx from 'clsx'
import { useSessao } from '@/lib/sessao'
import { Avatar } from './ui'

export function Layout() {
  const { membro, empresa, sair, podeGerenciar } = useSessao()
  const [aberto, setAberto] = useState(false)
  const admin = membro?.papel === 'admin'

  const grupos = [
    { itens: [
      ...(podeGerenciar ? [{ para: '/', icone: BarChart3, nome: 'Visão geral' }, { para: '/campanhas', icone: Megaphone, nome: 'Campanhas' }] : []),
      { para: '/leads', icone: Columns3, nome: 'Leads' },
    ] },
    ...(podeGerenciar ? [{ titulo: 'Configuração', itens: [
      { para: '/agente', icone: Bot, nome: 'Agente de IA' },
      { para: '/empreendimentos', icone: Building2, nome: 'Empreendimentos' },
      { para: '/equipe', icone: Users, nome: 'Equipe' },
      ...(admin ? [{ para: '/integracoes', icone: Plug, nome: 'Conexões' }, { para: '/plano', icone: CreditCard, nome: 'Plano' }, { para: '/ajustes', icone: Settings, nome: 'Ajustes' }] : []),
    ] }] : []),
  ]

  const testeDias = empresa?.status_assinatura === 'teste' && empresa.teste_expira_em
    ? Math.max(0, Math.ceil((new Date(empresa.teste_expira_em).getTime() - Date.now()) / 86400000)) : null

  const nav = (
    <nav className="flex h-full flex-col bg-petroleo-800 text-petroleo-50">
      <div className="flex items-center gap-2.5 px-5 h-16">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#F6F7F4" /><path d="M8 22V10h3v9h6v3H8z" fill="#13453F" /><circle cx="22" cy="12" r="3" fill="#E8590C" /></svg>
        <div className="min-w-0">
          <div className="font-display text-[17px] font-bold leading-none text-white">LeadFlow</div>
          <div className="truncate text-xs text-petroleo-200 mt-1">{empresa?.nome}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {grupos.map((g, i) => (
          <div key={i} className={clsx(i > 0 && 'mt-6')}>
            {'titulo' in g && g.titulo && <div className="px-3 pb-2 text-xs text-petroleo-300">{g.titulo}</div>}
            {g.itens.map((it) => (
              <NavLink key={it.para} to={it.para} end={it.para === '/'} onClick={() => setAberto(false)}
                className={({ isActive }) => clsx('flex items-center gap-3 rounded-pequeno px-3 h-10 text-sm font-medium transition-colors',
                  isActive ? 'bg-petroleo-600 text-white' : 'text-petroleo-100 hover:bg-petroleo-700')}>
                <it.icone size={18} strokeWidth={1.8} />{it.nome}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      {testeDias != null && (
        <NavLink to="/plano" className="mx-3 mb-3 rounded-medio bg-petroleo-700 px-4 py-3 text-sm hover:bg-petroleo-600">
          <div className="font-semibold text-white">{testeDias} dias de teste</div>
          <div className="text-petroleo-200 text-xs mt-0.5">Escolha um plano para continuar</div>
        </NavLink>
      )}
      <div className="flex items-center gap-3 border-t border-petroleo-700 px-4 py-3">
        <Avatar nome={membro?.nome} cor="#3D877C" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{membro?.nome}</div>
          <div className="text-xs text-petroleo-300 capitalize">{membro?.papel}</div>
        </div>
        <button onClick={sair} className="rounded-pequeno p-2 text-petroleo-200 hover:bg-petroleo-700 hover:text-white" aria-label="Sair"><LogOut size={17} /></button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden lg:block lg:w-60 lg:shrink-0 lg:fixed lg:inset-y-0">{nav}</aside>
      <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-concreto-200 bg-white px-4">
        <button onClick={() => setAberto(true)} className="btn-fantasma h-9 w-9 px-0" aria-label="Abrir menu"><Menu size={20} /></button>
        <span className="font-display font-bold">LeadFlow</span>
      </header>
      {aberto && (
        <div className="lg:hidden fixed inset-0 z-40 bg-concreto-900/40" onClick={() => setAberto(false)}>
          <div className="h-full w-64" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setAberto(false)} className="absolute left-[268px] top-3 rounded-full bg-white p-2" aria-label="Fechar menu"><X size={18} /></button>
            {nav}
          </div>
        </div>
      )}
      <main className="flex-1 lg:ml-60 min-w-0">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8"><Outlet /></div>
      </main>
    </div>
  )
}
