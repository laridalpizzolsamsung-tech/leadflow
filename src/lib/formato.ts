import { formatDistanceToNowStrict, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const brl = (n?: number | null) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n >= 1000 ? 0 : 2 })
export const num = (n?: number | null) => n == null ? '—' : n.toLocaleString('pt-BR')
export const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
export const tempoAtras = (d?: string | null) => d ? formatDistanceToNowStrict(new Date(d), { locale: ptBR, addSuffix: true }) : '—'
export const dataHora = (d?: string | null) => d ? format(new Date(d), "dd/MM 'às' HH:mm", { locale: ptBR }) : '—'
export const data = (d?: string | null) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—'
export function telefoneBonito(t: string) {
  const d = t.replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t
}
export const iniciais = (nome?: string | null) => (nome ?? '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

export const ORIGENS: Record<string, string> = {
  meta_lead_ads: 'Formulário Meta', meta_ctwa: 'Anúncio para WhatsApp', google_ads: 'Google Ads', site: 'Site', whatsapp_direto: 'WhatsApp direto', manual: 'Cadastro manual', outro: 'Outro',
}
export const TEMPERATURAS = {
  quente: { nome: 'Quente', cor: '#C92A2A', fundo: '#FBE7E7' },
  morno: { nome: 'Morno', cor: '#946800', fundo: '#FBF1D6' },
  frio: { nome: 'Frio', cor: '#2F78C4', fundo: '#E3EEF9' },
  nao_classificado: { nome: 'Em análise', cor: '#6E7468', fundo: '#EDEFEA' },
} as const

/** Cores de gráfico validadas para daltonismo (ordem fixa). */
export const CORES_SERIE = ['#0E8A78', '#E8590C', '#2F78C4', '#B37E00', '#8B5CF6']
export const COR_TEMP_GRAFICO = { quente: '#C92A2A', morno: '#B98200', frio: '#2F78C4', nao_classificado: '#979D90' } as const
export function mesAtualIso() { const d = new Date(); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01` }
