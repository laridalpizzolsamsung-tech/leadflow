import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProvedorSessao, useSessao } from '@/lib/sessao'
import { Layout } from '@/components/Layout'
import { Carregando } from '@/components/ui'
import { CriarEmpresa, Entrar, NovaSenha } from '@/pages/Entrar'
import { Onboarding } from '@/pages/Onboarding'
import { VisaoGeral } from '@/pages/VisaoGeral'
import { Campanhas } from '@/pages/Campanhas'
import { Leads } from '@/pages/Leads'
import { LeadDetalhe } from '@/pages/LeadDetalhe'
import { AgentePagina } from '@/pages/Agente'
import { Empreendimentos } from '@/pages/Empreendimentos'
import { Equipe } from '@/pages/Equipe'
import { Integracoes } from '@/pages/Integracoes'
import { PlanoPagina } from '@/pages/Plano'
import { Ajustes } from '@/pages/Ajustes'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } } })

function Rotas() {
  const { carregando, sessao, membro, empresa, podeGerenciar } = useSessao()
  if (carregando) return <Carregando />
  if (window.location.pathname === '/nova-senha') return <NovaSenha />
  if (!sessao) return <Entrar />
  if (!membro || !empresa) return <CriarEmpresa />
  if (membro.papel === 'admin' && !empresa.onboarding_concluido) return <Onboarding />
  const admin = membro.papel === 'admin'
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={podeGerenciar ? <VisaoGeral /> : <Navigate to="/leads" replace />} />
        {podeGerenciar && <Route path="campanhas" element={<Campanhas />} />}
        <Route path="leads" element={<Leads />} />
        <Route path="leads/:id" element={<LeadDetalhe />} />
        {podeGerenciar && <>
          <Route path="agente" element={<AgentePagina />} />
          <Route path="empreendimentos" element={<Empreendimentos />} />
          <Route path="equipe" element={<Equipe />} />
        </>}
        {admin && <>
          <Route path="integracoes" element={<Integracoes />} />
          <Route path="plano" element={<PlanoPagina />} />
          <Route path="ajustes" element={<Ajustes />} />
        </>}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ProvedorSessao>
        <BrowserRouter><Rotas /></BrowserRouter>
      </ProvedorSessao>
    </QueryClientProvider>
  )
}
