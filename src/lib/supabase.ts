import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const supabaseConfigurado = Boolean(url && anon)
export const supabase = createClient(url ?? 'http://localhost:54321', anon ?? 'chave-ausente')

/** Chama uma Edge Function e devolve o JSON (lança erro com a mensagem do servidor). */
export async function funcao<T = any>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo })
  if (error) {
    let msg = error.message
    try { msg = (await (error as any).context?.json())?.erro ?? msg } catch { /* sem corpo */ }
    throw new Error(msg)
  }
  if (data?.erro) throw new Error(data.erro)
  return data as T
}
