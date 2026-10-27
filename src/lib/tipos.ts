export type Papel = 'admin' | 'gestor' | 'corretor'
export type Temperatura = 'quente' | 'morno' | 'frio' | 'nao_classificado'

export interface Empresa {
  id: string; nome: string; cidade: string | null; plano: string; status_assinatura: string
  teste_expira_em: string | null; limite_leads_mes: number; onboarding_etapa: number; onboarding_concluido: boolean
  sla_minutos: number; chave_webhook: string; logo_url: string | null; cnpj: string | null; proximo_vencimento: string | null
}
export interface Membro {
  id: string; empresa_id: string; user_id: string; nome: string; email: string; telefone: string | null
  papel: Papel; ativo: boolean; recebe_leads: boolean; ultimo_lead_em: string | null
}
export interface Etapa { id: string; nome: string; ordem: number; cor: string; tipo: string }
export interface Lead {
  id: string; empresa_id: string; nome: string | null; telefone: string; email: string | null; origem: string
  campanha_id: string | null; criativo_id: string | null; empreendimento_id: string | null; etapa_id: string | null; corretor_id: string | null
  temperatura: Temperatura; pontuacao: number; genero: string | null; faixa_etaria: string | null; idade: number | null; cidade: string | null
  bairro_interesse: string | null; tipo_imovel: string | null; finalidade: string | null; renda_familiar: number | null; orcamento: number | null
  usa_financiamento: boolean | null; usa_fgts: boolean | null; prazo_compra: string | null; primeiro_imovel: boolean | null
  objecao_principal: string | null; resumo_ia: string | null; atendimento_humano: boolean; ultima_mensagem_em: string | null
  atribuido_em: string | null; primeira_resposta_corretor_em: string | null; visita_agendada_para: string | null; visita_realizada: boolean
  valor_venda: number | null; motivo_perda: string | null; utm_source: string | null; utm_campaign: string | null; criado_em: string
}
export interface Mensagem { id: string; autor: 'lead' | 'agente' | 'corretor' | 'sistema'; conteudo: string; criado_em: string; status_entrega: string | null; membro_id: string | null }
export interface Empreendimento {
  id: string; nome: string; cidade: string | null; bairro: string | null; endereco: string | null; tipo: string | null; status_obra: string | null
  preco_minimo: number | null; preco_maximo: number | null; metragens: string | null; dormitorios: string | null; diferenciais: string | null
  condicoes_pagamento: string | null; aceita_financiamento: boolean | null; programa_habitacional: string | null; previsao_entrega: string | null
  material_texto: string | null; link_material: string | null; ativo: boolean
}
export interface Campanha { id: string; nome: string; status: string | null; plataforma: string }
export interface Criativo { id: string; nome: string; campanha_id: string | null; titulo: string | null; thumbnail_url: string | null }
