// Login do Facebook no navegador: cadastro incorporado do WhatsApp e acesso às contas de anúncios.
declare global { interface Window { FB?: any; fbAsyncInit?: () => void } }

const APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined
const CONFIG_WHATSAPP = import.meta.env.VITE_META_CONFIG_ID_WHATSAPP as string | undefined
export const metaConfigurado = Boolean(APP_ID)

let carregando: Promise<any> | null = null
function carregarSdk(): Promise<any> {
  if (window.FB) return Promise.resolve(window.FB)
  if (carregando) return carregando
  carregando = new Promise((ok, falha) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId: APP_ID, autoLogAppEvents: true, xfbml: false, version: 'v21.0' })
      ok(window.FB)
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous'
    s.onerror = () => falha(new Error('Não foi possível carregar o login do Facebook. Desative bloqueadores de anúncio e tente de novo.'))
    document.body.appendChild(s)
  })
  return carregando
}

/** Abre o fluxo oficial da Meta para conectar um número de WhatsApp Business. */
export async function conectarWhatsApp(): Promise<{ code: string; waba_id: string; phone_number_id: string }> {
  if (!APP_ID || !CONFIG_WHATSAPP) throw new Error('Conexão com a Meta ainda não configurada no sistema.')
  const FB = await carregarSdk()
  return new Promise((ok, falha) => {
    let dados: { waba_id?: string; phone_number_id?: string } = {}
    const ouvir = (ev: MessageEvent) => {
      if (!String(ev.origin).endsWith('facebook.com')) return
      try {
        const d = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
        if (d?.type === 'WA_EMBEDDED_SIGNUP' && d.event?.startsWith('FINISH')) dados = d.data
        if (d?.type === 'WA_EMBEDDED_SIGNUP' && d.event === 'CANCEL') falha(new Error('Conexão cancelada antes de terminar.'))
      } catch { /* mensagens de outros scripts */ }
    }
    window.addEventListener('message', ouvir)
    FB.login((resp: any) => {
      window.removeEventListener('message', ouvir)
      const code = resp?.authResponse?.code
      if (!code) return falha(new Error('Conexão não autorizada.'))
      setTimeout(() => {
        if (!dados.waba_id || !dados.phone_number_id) return falha(new Error('A Meta não informou o número escolhido. Tente novamente.'))
        ok({ code, waba_id: dados.waba_id, phone_number_id: dados.phone_number_id })
      }, 400)
    }, { config_id: CONFIG_WHATSAPP, response_type: 'code', override_default_response_type: true, extras: { setup: {}, featureType: '', sessionInfoVersion: '3' } })
  })
}

/** Login do Facebook com permissões de anúncios, páginas e formulários. */
export async function entrarFacebookAnuncios(): Promise<string> {
  if (!APP_ID) throw new Error('Conexão com a Meta ainda não configurada no sistema.')
  const FB = await carregarSdk()
  return new Promise((ok, falha) => {
    FB.login((resp: any) => {
      const t = resp?.authResponse?.accessToken
      t ? ok(t) : falha(new Error('Login não autorizado.'))
    }, { scope: 'ads_read,ads_management,business_management,pages_show_list,pages_read_engagement,pages_manage_metadata,leads_retrieval' })
  })
}
