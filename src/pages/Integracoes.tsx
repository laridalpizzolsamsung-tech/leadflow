import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, MessageCircle, Megaphone, Globe } from 'lucide-react'
import { supabase, funcao } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { conectarWhatsApp, entrarFacebookAnuncios, metaConfigurado } from '@/lib/facebook'
import { Alerta, Cabecalho, Carregando } from '@/components/ui'

interface Integ { wa_conectado: boolean; wa_numero_exibicao: string | null; meta_conectado: boolean; meta_ad_account_id: string | null; meta_page_id: string | null; meta_pixel_id: string | null }

function useIntegracoes() {
  const { empresa } = useSessao()
  return useQuery({
    queryKey: ['integracoes', empresa?.id], enabled: !!empresa,
    queryFn: async () => (await supabase.from('integracoes').select('wa_conectado,wa_numero_exibicao,meta_conectado,meta_ad_account_id,meta_page_id,meta_pixel_id').eq('empresa_id', empresa!.id).single()).data as Integ,
  })
}

function Cartao({ icone: Icone, titulo, texto, conectado, detalhe, children }: { icone: typeof Globe; titulo: string; texto: string; conectado?: boolean; detalhe?: string | null; children: React.ReactNode }) {
  return (
    <section className="painel p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-medio bg-petroleo-50 p-2.5 text-petroleo-700"><Icone size={22} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{titulo}</h2>
            {conectado && <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700"><CheckCircle2 size={16} />Conectado{detalhe ? `: ${detalhe}` : ''}</span>}
          </div>
          <p className="text-concreto-500 text-sm mt-0.5 max-w-[60ch]">{texto}</p>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </section>
  )
}

export function ConexaoWhatsApp() {
  const { data } = useIntegracoes()
  const qc = useQueryClient()
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  async function conectar() {
    setErro(''); setOcupado(true)
    try {
      const r = await conectarWhatsApp()
      await funcao('meta-conectar', { acao: 'whatsapp', ...r })
      qc.invalidateQueries({ queryKey: ['integracoes'] })
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  return (
    <Cartao icone={MessageCircle} titulo="WhatsApp" conectado={data?.wa_conectado} detalhe={data?.wa_numero_exibicao}
      texto="O número da construtora que o agente usa para conversar com os leads. A conexão é oficial da Meta: o número fica no nome da sua empresa e não corre risco de bloqueio.">
      {!metaConfigurado && <div className="mb-3"><Alerta tipo="aviso">A conexão com a Meta ainda não foi ativada neste sistema.</Alerta></div>}
      {data?.wa_conectado ? (
        <button className="btn-secundario" onClick={async () => { await funcao('meta-conectar', { acao: 'desconectar', qual: 'whatsapp' }); qc.invalidateQueries({ queryKey: ['integracoes'] }) }}>Desconectar número</button>
      ) : (
        <button className="btn-primario" onClick={conectar} disabled={ocupado || !metaConfigurado}>{ocupado ? 'Conectando…' : 'Conectar WhatsApp'}</button>
      )}
      <p className="ajuda mt-2">Você entra com o Facebook da empresa e escolhe o número. Use um número que não esteja ativo no aplicativo WhatsApp do celular, ou ative o modo coexistência quando a Meta oferecer.</p>
      {erro && <div className="mt-3"><Alerta tipo="erro">{erro}</Alerta></div>}
    </Cartao>
  )
}

export function ConexaoAnuncios() {
  const { data } = useIntegracoes()
  const qc = useQueryClient()
  const [opcoes, setOpcoes] = useState<{ contas: any[]; paginas: any[]; pixels: any[] } | null>(null)
  const [sel, setSel] = useState({ ad_account_id: '', page_id: '', pixel_id: '' })
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function entrar() {
    setErro(''); setOcupado(true)
    try {
      const token = await entrarFacebookAnuncios()
      const r = await funcao('meta-conectar', { acao: 'anuncios_token', access_token: token })
      setOpcoes(r)
      setSel({ ad_account_id: r.contas?.[0]?.id ?? '', page_id: r.paginas?.[0]?.id ?? '', pixel_id: r.pixels?.[0]?.id ?? '' })
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  async function salvar() {
    setOcupado(true); setErro('')
    try { await funcao('meta-conectar', { acao: 'anuncios_salvar', ...sel }); setOpcoes(null); qc.invalidateQueries({ queryKey: ['integracoes'] }) }
    catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }

  return (
    <Cartao icone={Megaphone} titulo="Anúncios do Meta (Facebook e Instagram)" conectado={data?.meta_conectado}
      texto="Traz os leads dos formulários na hora, puxa investimento por campanha e criativo para calcular o custo por lead quente e por visita, e devolve ao Meta quais leads viraram visita e venda.">
      {opcoes ? (
        <div className="space-y-3 max-w-md">
          <div><label className="rotulo" htmlFor="m-conta">Conta de anúncios</label><select id="m-conta" className="campo" value={sel.ad_account_id} onChange={(e) => setSel({ ...sel, ad_account_id: e.target.value })}>{opcoes.contas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="rotulo" htmlFor="m-pag">Página que recebe os formulários</label><select id="m-pag" className="campo" value={sel.page_id} onChange={(e) => setSel({ ...sel, page_id: e.target.value })}>{opcoes.paginas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="rotulo" htmlFor="m-px">Pixel (para devolver visitas e vendas)</label><select id="m-px" className="campo" value={sel.pixel_id} onChange={(e) => setSel({ ...sel, pixel_id: e.target.value })}><option value="">Não usar</option>{opcoes.pixels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <button className="btn-primario" onClick={salvar} disabled={ocupado || !sel.ad_account_id}>Salvar e importar campanhas</button>
        </div>
      ) : (
        <button className={data?.meta_conectado ? 'btn-secundario' : 'btn-primario'} onClick={entrar} disabled={ocupado || !metaConfigurado}>{data?.meta_conectado ? 'Trocar conta' : ocupado ? 'Abrindo…' : 'Conectar com Facebook'}</button>
      )}
      {erro && <div className="mt-3"><Alerta tipo="erro">{erro}</Alerta></div>}
    </Cartao>
  )
}

function ConexaoSite() {
  const { empresa } = useSessao()
  const [copiado, setCopiado] = useState('')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-entrada?chave=${empresa?.chave_webhook}`
  const exemplo = `fetch('${url}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nome, telefone, email, empreendimento,
    utm_source, utm_campaign, utm_content })
})`
  const copiar = (t: string, k: string) => { navigator.clipboard.writeText(t); setCopiado(k); setTimeout(() => setCopiado(''), 2000) }
  return (
    <Cartao icone={Globe} titulo="Site, landing page e Google Ads" texto="Cole este endereço no formulário do seu site, na landing page ou numa automação (Zapier, Make, RD). O lead entra no sistema e recebe a mensagem do agente no WhatsApp.">
      <div className="flex gap-2">
        <input readOnly className="campo font-mono text-xs" value={url} aria-label="Endereço para receber leads" />
        <button className="btn-secundario shrink-0" onClick={() => copiar(url, 'url')}><Copy size={16} />{copiado === 'url' ? 'Copiado' : 'Copiar'}</button>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-petroleo-700 font-medium">Exemplo para desenvolvedores</summary>
        <pre className="mt-2 overflow-x-auto rounded-pequeno bg-concreto-900 p-3 text-xs text-concreto-100">{exemplo}</pre>
        <button className="btn-fantasma h-8 text-xs mt-1" onClick={() => copiar(exemplo, 'ex')}>{copiado === 'ex' ? 'Copiado' : 'Copiar exemplo'}</button>
      </details>
    </Cartao>
  )
}

export function Integracoes() {
  const { isLoading } = useIntegracoes()
  return (
    <>
      <Cabecalho titulo="Conexões" descricao="Ligue o WhatsApp e os anúncios uma vez. Depois disso, tudo funciona sozinho." />
      {isLoading ? <Carregando /> : <div className="space-y-4 max-w-4xl"><ConexaoWhatsApp /><ConexaoAnuncios /><ConexaoSite /></div>}
    </>
  )
}
