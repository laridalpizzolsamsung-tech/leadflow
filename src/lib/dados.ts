import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useSessao } from './sessao'
import type { Campanha, Criativo, Empreendimento, Etapa, Lead, Membro } from './tipos'

export interface Periodo { de: string; ate: string } // ISO yyyy-mm-dd

function useEid() { return useSessao().empresa?.id }

export function useEtapas() {
  const eid = useEid()
  return useQuery({
    queryKey: ['etapas', eid], enabled: !!eid,
    queryFn: async () => (await supabase.from('etapas_funil').select('*').eq('empresa_id', eid!).order('ordem')).data as Etapa[],
  })
}

export function useMembros() {
  const eid = useEid()
  return useQuery({
    queryKey: ['membros', eid], enabled: !!eid,
    queryFn: async () => (await supabase.from('membros').select('*').eq('empresa_id', eid!).order('nome')).data as Membro[],
  })
}

export function useEmpreendimentos() {
  const eid = useEid()
  return useQuery({
    queryKey: ['empreendimentos', eid], enabled: !!eid,
    queryFn: async () => (await supabase.from('empreendimentos').select('*').eq('empresa_id', eid!).order('criado_em')).data as Empreendimento[],
  })
}

export function useCampanhas() {
  const eid = useEid()
  return useQuery({
    queryKey: ['campanhas', eid], enabled: !!eid,
    queryFn: async () => {
      const [c, a] = await Promise.all([
        supabase.from('campanhas').select('*').eq('empresa_id', eid!).order('nome'),
        supabase.from('criativos').select('*').eq('empresa_id', eid!).order('nome'),
      ])
      return { campanhas: (c.data ?? []) as Campanha[], criativos: (a.data ?? []) as Criativo[] }
    },
  })
}

export interface FiltroLeads extends Partial<Periodo> { campanha_id?: string; criativo_id?: string; corretor_id?: string; temperatura?: string; busca?: string }

export function useLeads(f: FiltroLeads = {}) {
  const eid = useEid()
  return useQuery({
    queryKey: ['leads', eid, f], enabled: !!eid,
    queryFn: async () => {
      let q = supabase.from('leads').select('*').eq('empresa_id', eid!).order('criado_em', { ascending: false }).limit(5000)
      if (f.de) q = q.gte('criado_em', `${f.de}T00:00:00`)
      if (f.ate) q = q.lte('criado_em', `${f.ate}T23:59:59`)
      if (f.campanha_id) q = q.eq('campanha_id', f.campanha_id)
      if (f.criativo_id) q = q.eq('criativo_id', f.criativo_id)
      if (f.corretor_id) q = q.eq('corretor_id', f.corretor_id)
      if (f.temperatura) q = q.eq('temperatura', f.temperatura)
      if (f.busca) q = q.or(`nome.ilike.%${f.busca}%,telefone.ilike.%${f.busca.replace(/\D/g, '') || f.busca}%`)
      const { data, error } = await q
      if (error) throw error
      return data as Lead[]
    },
  })
}

export interface MetricaDia { data: string; campanha_id: string; criativo_id: string; investimento: number; impressoes: number; cliques: number }
export interface MetricaDemo { faixa_etaria: string; genero: string; investimento: number; leads: number; campanha_id: string }

export function useMetricas(p: Periodo, campanha_id?: string) {
  const eid = useEid()
  return useQuery({
    queryKey: ['metricas', eid, p, campanha_id], enabled: !!eid,
    queryFn: async () => {
      let a = supabase.from('metricas_diarias').select('data,campanha_id,criativo_id,investimento,impressoes,cliques').eq('empresa_id', eid!).gte('data', p.de).lte('data', p.ate)
      let b = supabase.from('metricas_demograficas').select('faixa_etaria,genero,investimento,leads,campanha_id').eq('empresa_id', eid!).gte('data', p.de).lte('data', p.ate)
      if (campanha_id) { a = a.eq('campanha_id', campanha_id); b = b.eq('campanha_id', campanha_id) }
      const [r1, r2] = await Promise.all([a, b])
      return { diarias: (r1.data ?? []) as MetricaDia[], demograficas: (r2.data ?? []) as MetricaDemo[] }
    },
  })
}
