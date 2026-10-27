// Envio de mensagens pela WhatsApp Cloud API (oficial da Meta)
import { GRAPH } from './util.ts'

export interface ConfigWA {
  wa_phone_number_id: string
  wa_access_token: string
}

export async function enviarTexto(cfg: ConfigWA, para: string, texto: string) {
  const r = await fetch(`${GRAPH}/${cfg.wa_phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.wa_access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'text',
      text: { preview_url: true, body: texto },
    }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(`WhatsApp: ${JSON.stringify(data?.error ?? data)}`)
  return data?.messages?.[0]?.id as string | undefined
}

/** Mensagem de modelo aprovado (necessária fora da janela de 24h). */
export async function enviarModelo(cfg: ConfigWA, para: string, modelo: string, idioma = 'pt_BR', variaveis: string[] = []) {
  const r = await fetch(`${GRAPH}/${cfg.wa_phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.wa_access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'template',
      template: {
        name: modelo,
        language: { code: idioma },
        components: variaveis.length
          ? [{ type: 'body', parameters: variaveis.map((v) => ({ type: 'text', text: v })) }]
          : undefined,
      },
    }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(`WhatsApp modelo: ${JSON.stringify(data?.error ?? data)}`)
  return data?.messages?.[0]?.id as string | undefined
}

export async function marcarComoLida(cfg: ConfigWA, waMessageId: string) {
  await fetch(`${GRAPH}/${cfg.wa_phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.wa_access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: waMessageId }),
  }).catch(() => {})
}
