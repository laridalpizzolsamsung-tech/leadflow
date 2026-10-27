// Utilitários compartilhados pelas Edge Functions (Deno)
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Cliente com service role: ignora RLS. Use só no servidor. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
}

/** Cliente do usuário que chamou (respeita RLS). */
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
}

export const GRAPH = 'https://graph.facebook.com/v21.0'

export function normalizarTelefone(t: string): string {
  let d = (t || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d
}

export async function sha256(valor: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor.trim().toLowerCase()))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Valida a assinatura X-Hub-Signature-256 enviada pela Meta. */
export async function assinaturaMetaValida(req: Request, corpo: string): Promise<boolean> {
  const segredo = Deno.env.get('META_APP_SECRET')
  if (!segredo) return true // em desenvolvimento, sem segredo configurado
  const header = req.headers.get('x-hub-signature-256') ?? ''
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(corpo))
  const hex = 'sha256=' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === header
}

export function mesAtual(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
