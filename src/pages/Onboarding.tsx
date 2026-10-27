import { useState } from 'react'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { useEmpreendimentos } from '@/lib/dados'
import { FormEmpreendimento } from './Empreendimentos'
import { FormAgente, TesteAgente } from './Agente'
import { ConexaoAnuncios, ConexaoWhatsApp } from './Integracoes'
import { FormConvite } from './Equipe'
import { Alerta } from '@/components/ui'

const ETAPAS = ['Sua construtora', 'Empreendimento', 'Agente de IA', 'WhatsApp e anúncios', 'Corretores']

export function Onboarding() {
  const { empresa, membro, recarregar, sair } = useSessao()
  const [etapa, setEtapa] = useState(Math.min(empresa?.onboarding_etapa ?? 0, 4))
  const { data: emps, refetch } = useEmpreendimentos()
  const [dados, setDados] = useState({ cidade: empresa?.cidade ?? '', cnpj: empresa?.cnpj ?? '', telefone: membro?.telefone ?? '' })
  const [erro, setErro] = useState('')

  async function avancar(proxima = etapa + 1) {
    setErro('')
    if (etapa === 0) {
      const tel = dados.telefone.replace(/\D/g, '')
      if (tel.length < 10) return setErro('Informe seu WhatsApp com DDD. É por ele que você recebe os avisos de leads.')
      await supabase.from('empresas').update({ cidade: dados.cidade, cnpj: dados.cnpj || null }).eq('id', empresa!.id)
      await supabase.from('membros').update({ telefone: tel.length <= 11 ? '55' + tel : tel }).eq('id', membro!.id)
    }
    if (proxima >= ETAPAS.length) {
      await supabase.from('empresas').update({ onboarding_concluido: true, onboarding_etapa: ETAPAS.length }).eq('id', empresa!.id)
      await recarregar()
      return
    }
    await supabase.from('empresas').update({ onboarding_etapa: proxima }).eq('id', empresa!.id)
    setEtapa(proxima)
  }

  return (
    <div className="min-h-screen bg-concreto-50">
      <header className="border-b border-concreto-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 h-16">
          <span className="font-display text-lg font-bold">LeadFlow</span>
          <button className="btn-fantasma h-9 text-sm" onClick={sair}>Sair</button>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <ol className="flex gap-2 overflow-x-auto lg:block lg:space-y-1" aria-label="Etapas da configuração">
          {ETAPAS.map((nome, i) => (
            <li key={nome} className={clsx('flex shrink-0 items-center gap-3 rounded-pequeno px-3 py-2 text-sm', i === etapa ? 'bg-white border border-concreto-200 font-semibold' : 'text-concreto-500')} aria-current={i === etapa ? 'step' : undefined}>
              <span className={clsx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold', i < etapa ? 'bg-petroleo-600 text-white' : i === etapa ? 'bg-sinal text-white' : 'bg-concreto-200 text-concreto-600')}>
                {i < etapa ? <Check size={14} /> : i + 1}
              </span>
              {nome}
            </li>
          ))}
        </ol>

        <div>
          {etapa === 0 && (
            <Bloco titulo={`Bem-vinda, ${membro?.nome?.split(' ')[0]}`} texto="Em cinco passos o sistema fica pronto para atender os leads da sua construtora. Leva uns 15 minutos e você pode parar e continuar depois.">
              <div className="painel p-6 grid gap-4 sm:grid-cols-2">
                <div><label className="rotulo" htmlFor="o-cid">Cidade principal</label><input id="o-cid" className="campo" value={dados.cidade} onChange={(e) => setDados({ ...dados, cidade: e.target.value })} placeholder="Ex.: Itajaí" /></div>
                <div><label className="rotulo" htmlFor="o-cnpj">CNPJ (opcional)</label><input id="o-cnpj" className="campo" value={dados.cnpj} onChange={(e) => setDados({ ...dados, cnpj: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="rotulo" htmlFor="o-tel">Seu WhatsApp</label><input id="o-tel" className="campo" value={dados.telefone} onChange={(e) => setDados({ ...dados, telefone: e.target.value })} placeholder="(47) 99999-0000" /><p className="ajuda">Para receber os avisos de lead quente e o resumo do mês.</p></div>
              </div>
              {erro && <div className="mt-4"><Alerta tipo="erro">{erro}</Alerta></div>}
              <Rodape><button className="btn-primario" onClick={() => avancar()}>Continuar</button></Rodape>
            </Bloco>
          )}

          {etapa === 1 && (
            <Bloco titulo="Qual empreendimento você está vendendo?" texto="É daqui que o agente tira as informações para conversar com os leads. Se tiver o PDF de vendas, envie e a IA preenche para você.">
              {emps?.length ? (
                <>
                  <Alerta tipo="ok">{emps.length === 1 ? `${emps[0].nome} cadastrado.` : `${emps.length} empreendimentos cadastrados.`} Você pode adicionar outros depois em Empreendimentos.</Alerta>
                  <Rodape><button className="btn-fantasma" onClick={() => setEtapa(0)}>Voltar</button><button className="btn-primario" onClick={() => avancar()}>Continuar</button></Rodape>
                </>
              ) : (
                <div className="painel p-6"><FormEmpreendimento aoSalvar={() => refetch()} /></div>
              )}
            </Bloco>
          )}

          {etapa === 2 && (
            <Bloco titulo="Conheça seu agente" texto="Ajuste o nome e as perguntas, e converse com ele ao lado como se fosse um cliente. Quando gostar do jeito dele, continue.">
              <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
                <div className="painel p-6"><FormAgente compacto /></div>
                <TesteAgente />
              </div>
              <Rodape><button className="btn-fantasma" onClick={() => setEtapa(1)}>Voltar</button><button className="btn-primario" onClick={() => avancar()}>Continuar</button></Rodape>
            </Bloco>
          )}

          {etapa === 3 && (
            <Bloco titulo="Ligue o WhatsApp e os anúncios" texto="Com o WhatsApp conectado, o agente começa a responder. Com os anúncios, o painel mostra quanto custa cada lead quente, visita e venda.">
              <div className="space-y-4"><ConexaoWhatsApp /><ConexaoAnuncios /></div>
              <Rodape><button className="btn-fantasma" onClick={() => setEtapa(2)}>Voltar</button><button className="btn-secundario" onClick={() => avancar()}>Fazer depois</button><button className="btn-primario" onClick={() => avancar()}>Continuar</button></Rodape>
            </Bloco>
          )}

          {etapa === 4 && (
            <Bloco titulo="Quem atende os leads quentes?" texto="Convide os corretores. Quando um lead aceitar a visita, o sistema entrega ao próximo do rodízio e avisa no WhatsApp dele. Se só você atende, pode pular.">
              <div className="painel p-6"><FormConvite aoEnviar={() => {}} /></div>
              <Rodape><button className="btn-fantasma" onClick={() => setEtapa(3)}>Voltar</button><button className="btn-primario" onClick={() => avancar(ETAPAS.length)}>Concluir e abrir o painel</button></Rodape>
            </Bloco>
          )}
        </div>
      </div>
    </div>
  )
}

function Bloco({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return <section><h1 className="text-[30px] font-bold leading-tight">{titulo}</h1><p className="text-concreto-500 mt-1.5 mb-6 max-w-[64ch]">{texto}</p>{children}</section>
}
function Rodape({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>
}
