import { useState, type FormEvent } from 'react'
import { supabase, supabaseConfigurado } from '@/lib/supabase'
import { useSessao } from '@/lib/sessao'
import { Alerta } from '@/components/ui'

type Modo = 'entrar' | 'cadastrar' | 'recuperar'

export function Entrar() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setAviso(''); setEnviando(true)
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
      } else if (modo === 'cadastrar') {
        const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error
        if (!data.session) setAviso('Enviamos um link de confirmação para o seu e-mail. Abra o link para continuar.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/nova-senha` })
        if (error) throw error
        setAviso('Se este e-mail tiver conta, você vai receber um link para criar uma nova senha.')
      }
    } catch (err) {
      setErro((err as Error).message)
    } finally { setEnviando(false) }
  }

  const titulos = { entrar: 'Entrar na sua conta', cadastrar: 'Teste grátis por 14 dias', recuperar: 'Recuperar senha' }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_520px]">
      <section className="hidden lg:flex flex-col justify-between bg-petroleo-800 p-12 text-petroleo-50">
        <div className="flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#F6F7F4" /><path d="M8 22V10h3v9h6v3H8z" fill="#13453F" /><circle cx="22" cy="12" r="3" fill="#E8590C" /></svg>
          <span className="font-display text-xl font-bold text-white">LeadFlow</span>
        </div>
        <div className="max-w-[30ch]">
          <p className="font-display text-[44px] font-bold leading-[1.05] text-white">Cada lead atendido em segundos. Cada visita com custo conhecido.</p>
          <p className="mt-5 text-petroleo-200 max-w-[44ch]">Atendimento com IA no WhatsApp, funil dos corretores e o resultado real das suas campanhas, num lugar só.</p>
        </div>
        <TermometroDemo />
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <h1 className="text-[28px] font-bold">{titulos[modo]}</h1>
          {modo === 'cadastrar' && <p className="text-concreto-500 mt-1">Sem cartão de crédito. Você configura tudo sozinho em poucos minutos.</p>}
          {!supabaseConfigurado && <div className="mt-4"><Alerta tipo="aviso">O banco de dados ainda não foi configurado. Preencha o arquivo .env com os dados do Supabase.</Alerta></div>}
          <form onSubmit={enviar} className="mt-6 space-y-4">
            <div>
              <label className="rotulo" htmlFor="email">E-mail</label>
              <input id="email" type="email" required autoComplete="email" className="campo" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {modo !== 'recuperar' && (
              <div>
                <label className="rotulo" htmlFor="senha">Senha</label>
                <input id="senha" type="password" required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} />
                {modo === 'cadastrar' && <p className="ajuda">Pelo menos 8 caracteres.</p>}
              </div>
            )}
            {erro && <Alerta tipo="erro">{erro}</Alerta>}
            {aviso && <Alerta tipo="ok">{aviso}</Alerta>}
            <button className="btn-primario w-full h-11" disabled={enviando}>
              {modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Enviar link'}
            </button>
          </form>
          <div className="mt-6 space-y-2 text-sm text-concreto-600">
            {modo === 'entrar' && <>
              <p>Ainda não tem conta? <button className="font-semibold text-petroleo-700 hover:underline" onClick={() => setModo('cadastrar')}>Começar teste grátis</button></p>
              <p><button className="text-concreto-500 hover:underline" onClick={() => setModo('recuperar')}>Esqueci minha senha</button></p>
            </>}
            {modo !== 'entrar' && <p>Já tem conta? <button className="font-semibold text-petroleo-700 hover:underline" onClick={() => setModo('entrar')}>Entrar</button></p>}
          </div>
        </div>
      </section>
    </div>
  )
}

function TermometroDemo() {
  const linhas = [
    { nome: 'Juliana M.', texto: 'Quer 2 dormitórios no Centro, usa FGTS', v: 88, cor: '#E8590C', t: 'Quente' },
    { nome: 'Rafael S.', texto: 'Investidor, compara com outro lançamento', v: 61, cor: '#E5A100', t: 'Morno' },
    { nome: 'Carla T.', texto: 'Só pesquisando, sem prazo definido', v: 22, cor: '#4C7DA8', t: 'Frio' },
  ]
  return (
    <div className="max-w-md space-y-3" aria-hidden>
      {linhas.map((l) => (
        <div key={l.nome} className="rounded-medio bg-petroleo-700/70 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-white">{l.nome}</span>
            <span className="text-xs" style={{ color: l.cor === '#4C7DA8' ? '#9CC0E0' : l.cor }}>{l.t}</span>
          </div>
          <div className="text-xs text-petroleo-200 mt-0.5">{l.texto}</div>
          <div className="mt-2 h-1 rounded-full bg-petroleo-900/60"><div className="h-full rounded-full" style={{ width: `${l.v}%`, background: l.cor }} /></div>
        </div>
      ))}
    </div>
  )
}

export function NovaSenha() {
  const [senha, setSenha] = useState('')
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState('')
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form className="w-full max-w-sm space-y-4" onSubmit={async (e) => {
        e.preventDefault()
        const { error } = await supabase.auth.updateUser({ password: senha })
        if (error) setErro(error.message); else { setOk(true); setTimeout(() => (window.location.href = '/'), 1200) }
      }}>
        <h1 className="text-[28px] font-bold">Criar nova senha</h1>
        <input type="password" minLength={8} required className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} aria-label="Nova senha" />
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        {ok && <Alerta tipo="ok">Senha alterada. Entrando…</Alerta>}
        <button className="btn-primario w-full">Salvar nova senha</button>
      </form>
    </div>
  )
}

export function CriarEmpresa() {
  const { recarregar, sair, sessao } = useSessao()
  const [empresa, setEmpresa] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form className="w-full max-w-md space-y-5" onSubmit={async (e) => {
        e.preventDefault(); setEnviando(true); setErro('')
        const { error } = await supabase.rpc('criar_empresa', { p_nome: empresa, p_nome_usuario: nome })
        if (error) { setErro(error.message); setEnviando(false); return }
        await recarregar()
      }}>
        <div>
          <h1 className="text-[28px] font-bold">Vamos criar sua conta</h1>
          <p className="text-concreto-500 mt-1">Entrou como {sessao?.user.email}. Se você foi convidado por uma construtora, peça ao administrador para enviar o convite para este e-mail.</p>
        </div>
        <div><label className="rotulo" htmlFor="emp">Nome da construtora</label><input id="emp" required className="campo" value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Ex.: Construtora Horizonte" /></div>
        <div><label className="rotulo" htmlFor="nome">Seu nome</label><input id="nome" required className="campo" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <div className="flex gap-3">
          <button className="btn-primario flex-1" disabled={enviando}>Criar conta da construtora</button>
          <button type="button" className="btn-fantasma" onClick={sair}>Sair</button>
        </div>
      </form>
    </div>
  )
}
