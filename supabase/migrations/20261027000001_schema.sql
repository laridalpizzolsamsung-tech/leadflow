-- =====================================================================
-- LeadFlow — esquema multiempresa (multi-tenant)
-- Toda tabela de negócio tem empresa_id e é protegida por RLS.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tipos ----------
create type papel_usuario as enum ('admin', 'gestor', 'corretor');
create type temperatura_lead as enum ('quente', 'morno', 'frio', 'nao_classificado');
create type origem_lead as enum ('meta_lead_ads', 'meta_ctwa', 'google_ads', 'site', 'whatsapp_direto', 'manual', 'outro');
create type autor_mensagem as enum ('lead', 'agente', 'corretor', 'sistema');
create type status_assinatura as enum ('teste', 'ativa', 'inadimplente', 'cancelada');

-- ---------- Empresas (tenants) ----------
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  cidade text,
  logo_url text,
  cor_primaria text default '#4F46E5',
  plano text not null default 'essencial',
  status_assinatura status_assinatura not null default 'teste',
  teste_expira_em timestamptz default (now() + interval '14 days'),
  limite_leads_mes int not null default 500,
  onboarding_etapa int not null default 0,      -- 0..5, assistente de configuração
  onboarding_concluido boolean not null default false,
  sla_minutos int not null default 15,          -- tempo máximo p/ corretor responder
  agencia_id uuid references empresas(id),      -- quando gerenciada por uma agência (white label)
  criado_em timestamptz not null default now()
);

-- ---------- Membros (usuário x empresa) ----------
create table membros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  telefone text,                 -- WhatsApp do corretor p/ notificações
  papel papel_usuario not null default 'corretor',
  ativo boolean not null default true,
  recebe_leads boolean not null default true,   -- participa do rodízio
  ordem_rodizio int not null default 0,
  ultimo_lead_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (empresa_id, user_id)
);
create index on membros (user_id);

-- ---------- Integrações (WhatsApp, Meta, IA) ----------
create table integracoes (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  wa_phone_number_id text,
  wa_business_account_id text,
  wa_numero_exibicao text,
  wa_access_token text,          -- token do cadastro incorporado (armazenado só no servidor)
  wa_conectado boolean not null default false,
  meta_ad_account_id text,
  meta_page_id text,
  meta_pixel_id text,            -- p/ API de Conversões
  meta_access_token text,
  meta_conectado boolean not null default false,
  atualizado_em timestamptz not null default now()
);

-- ---------- Empreendimentos (conhecimento do agente) ----------
create table empreendimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  cidade text,
  bairro text,
  endereco text,
  tipo text,                     -- apartamento, casa, lote, sala comercial
  status_obra text,              -- lançamento, em obras, pronto
  preco_minimo numeric,
  preco_maximo numeric,
  metragens text,
  dormitorios text,
  diferenciais text,
  condicoes_pagamento text,
  aceita_financiamento boolean default true,
  programa_habitacional text,    -- ex.: Minha Casa Minha Vida
  previsao_entrega text,
  material_texto text,           -- texto extraído do PDF de vendas
  link_material text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on empreendimentos (empresa_id);

-- ---------- Configuração do agente de IA ----------
create table agentes (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  nome_agente text not null default 'Ana',
  tom_de_voz text not null default 'cordial, próximo e objetivo',
  mensagem_boas_vindas text,
  perguntas_qualificacao jsonb not null default '[
    "Qual tipo de imóvel você procura?",
    "Em qual região ou bairro?",
    "É para morar ou investir?",
    "Qual faixa de valor você considera?",
    "Pretende usar financiamento ou FGTS?",
    "Para quando você pretende comprar?"
  ]'::jsonb,
  instrucoes_extras text,
  horario_atendimento text default '24h',
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

-- ---------- Campanhas e criativos (sincronizados do Meta/Google) ----------
create table campanhas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  plataforma text not null default 'meta',
  id_externo text not null,
  nome text not null,
  status text,
  objetivo text,
  criado_em timestamptz not null default now(),
  unique (empresa_id, plataforma, id_externo)
);

create table criativos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  campanha_id uuid references campanhas(id) on delete set null,
  id_externo text not null,
  nome text not null,
  titulo text,
  texto text,
  thumbnail_url text,
  criado_em timestamptz not null default now(),
  unique (empresa_id, id_externo)
);

-- Métricas diárias de investimento (Marketing API insights)
create table metricas_diarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  data date not null,
  campanha_id uuid references campanhas(id) on delete cascade,
  criativo_id uuid references criativos(id) on delete cascade,
  investimento numeric not null default 0,
  impressoes int not null default 0,
  cliques int not null default 0,
  alcance int not null default 0,
  unique (empresa_id, data, campanha_id, criativo_id)
);

-- Perfil demográfico agregado vindo do Meta (idade x gênero por campanha)
create table metricas_demograficas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  data date not null,
  campanha_id uuid references campanhas(id) on delete cascade,
  faixa_etaria text not null,
  genero text not null,
  investimento numeric not null default 0,
  leads int not null default 0,
  unique (empresa_id, data, campanha_id, faixa_etaria, genero)
);

-- ---------- Funil (etapas configuráveis por empresa) ----------
create table etapas_funil (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  ordem int not null,
  cor text not null default '#64748B',
  tipo text not null default 'normal',  -- normal | visita | ganho | perdido
  unique (empresa_id, ordem)
);

-- ---------- Leads ----------
create table leads (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text,
  telefone text not null,             -- formato E.164 sem +, ex.: 5547999999999
  email text,
  origem origem_lead not null default 'outro',
  campanha_id uuid references campanhas(id) on delete set null,
  criativo_id uuid references criativos(id) on delete set null,
  empreendimento_id uuid references empreendimentos(id) on delete set null,
  etapa_id uuid references etapas_funil(id) on delete set null,
  corretor_id uuid references membros(id) on delete set null,
  temperatura temperatura_lead not null default 'nao_classificado',
  pontuacao int not null default 0,   -- 0..100
  -- dados de qualificação extraídos pela IA
  genero text,
  faixa_etaria text,
  idade int,
  cidade text,
  bairro_interesse text,
  tipo_imovel text,
  finalidade text,                    -- morar | investir
  renda_familiar numeric,
  orcamento numeric,
  usa_financiamento boolean,
  usa_fgts boolean,
  prazo_compra text,
  primeiro_imovel boolean,
  objecao_principal text,
  resumo_ia text,                     -- resumo para o corretor
  -- rastreamento
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  ctwa_clid text,
  meta_lead_id text,
  -- controle de atendimento
  atendimento_humano boolean not null default false,  -- pausa o agente
  ultima_mensagem_em timestamptz,
  atribuido_em timestamptz,
  primeira_resposta_corretor_em timestamptz,
  sla_alertado boolean not null default false,
  visita_agendada_para timestamptz,
  visita_realizada boolean not null default false,
  valor_venda numeric,
  motivo_perda text,
  conversao_enviada jsonb not null default '{}'::jsonb,  -- eventos já enviados à API de Conversões
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, telefone)
);
create index on leads (empresa_id, criado_em desc);
create index on leads (empresa_id, etapa_id);
create index on leads (empresa_id, campanha_id);
create index on leads (corretor_id);

-- ---------- Mensagens ----------
create table mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  autor autor_mensagem not null,
  membro_id uuid references membros(id) on delete set null,
  conteudo text not null,
  tipo text not null default 'texto',
  wa_message_id text,
  status_entrega text,
  criado_em timestamptz not null default now()
);
create index on mensagens (lead_id, criado_em);

-- ---------- Histórico de eventos do lead ----------
create table eventos_lead (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  tipo text not null,      -- criado | etapa | temperatura | atribuido | sla | visita | venda | perda | nota
  descricao text,
  dados jsonb,
  membro_id uuid references membros(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index on eventos_lead (lead_id, criado_em desc);

-- ---------- Uso (franquia do plano) ----------
create table uso_mensal (
  empresa_id uuid not null references empresas(id) on delete cascade,
  mes date not null,
  leads int not null default 0,
  mensagens_ia int not null default 0,
  tokens_ia bigint not null default 0,
  primary key (empresa_id, mes)
);

-- =====================================================================
-- Funções auxiliares
-- =====================================================================

-- Empresas às quais o usuário logado pertence
create or replace function minhas_empresas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from membros where user_id = auth.uid() and ativo
$$;

create or replace function meu_papel(eid uuid) returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from membros where user_id = auth.uid() and empresa_id = eid and ativo limit 1
$$;

create or replace function meu_membro_id(eid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from membros where user_id = auth.uid() and empresa_id = eid and ativo limit 1
$$;

-- Atualiza "atualizado_em"
create or replace function tocar_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
create trigger leads_atualizado before update on leads for each row execute function tocar_atualizado();

-- Cria empresa + membro admin + funil e agente padrão (chamada no cadastro)
create or replace function criar_empresa(p_nome text, p_nome_usuario text)
returns uuid language plpgsql security definer set search_path = public as $$
declare eid uuid;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into empresas (nome) values (p_nome) returning id into eid;
  insert into membros (empresa_id, user_id, nome, email, papel)
    values (eid, auth.uid(), p_nome_usuario, (select email from auth.users where id = auth.uid()), 'admin');
  insert into etapas_funil (empresa_id, nome, ordem, cor, tipo) values
    (eid, 'Novo lead', 1, '#64748B', 'normal'),
    (eid, 'Em atendimento IA', 2, '#6366F1', 'normal'),
    (eid, 'Qualificado', 3, '#F59E0B', 'normal'),
    (eid, 'Visita agendada', 4, '#0EA5E9', 'visita'),
    (eid, 'Proposta', 5, '#8B5CF6', 'normal'),
    (eid, 'Venda', 6, '#10B981', 'ganho'),
    (eid, 'Perdido', 7, '#EF4444', 'perdido');
  insert into agentes (empresa_id) values (eid);
  insert into integracoes (empresa_id) values (eid);
  return eid;
end $$;

-- Rodízio: próximo corretor disponível (o que recebeu lead há mais tempo)
create or replace function proximo_corretor(eid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from membros
  where empresa_id = eid and ativo and recebe_leads
  order by ultimo_lead_em nulls first, ordem_rodizio
  limit 1
$$;

-- =====================================================================
-- Segurança por linha (RLS)
-- =====================================================================
alter table empresas enable row level security;
alter table membros enable row level security;
alter table integracoes enable row level security;
alter table empreendimentos enable row level security;
alter table agentes enable row level security;
alter table campanhas enable row level security;
alter table criativos enable row level security;
alter table metricas_diarias enable row level security;
alter table metricas_demograficas enable row level security;
alter table etapas_funil enable row level security;
alter table leads enable row level security;
alter table mensagens enable row level security;
alter table eventos_lead enable row level security;
alter table uso_mensal enable row level security;

-- Empresas: membro vê; admin edita
create policy empresas_ver on empresas for select using (id in (select minhas_empresas()));
create policy empresas_editar on empresas for update using (meu_papel(id) = 'admin');

-- Membros: colegas se veem; admin gerencia
create policy membros_ver on membros for select using (empresa_id in (select minhas_empresas()));
create policy membros_admin on membros for all using (meu_papel(empresa_id) = 'admin') with check (meu_papel(empresa_id) = 'admin');

-- Integrações: só admin enxerga (contém tokens)
create policy integracoes_admin on integracoes for all using (meu_papel(empresa_id) = 'admin') with check (meu_papel(empresa_id) = 'admin');

-- Tabelas de configuração: todos veem, admin/gestor editam
do $$ declare t text; begin
  foreach t in array array['empreendimentos','agentes','etapas_funil','campanhas','criativos','metricas_diarias','metricas_demograficas','uso_mensal'] loop
    execute format('create policy %1$s_ver on %1$s for select using (empresa_id in (select minhas_empresas()))', t);
    execute format('create policy %1$s_editar on %1$s for all using (meu_papel(empresa_id) in (''admin'',''gestor'')) with check (meu_papel(empresa_id) in (''admin'',''gestor''))', t);
  end loop;
end $$;

-- Leads: admin/gestor veem todos; corretor vê só os seus
create policy leads_ver on leads for select using (
  empresa_id in (select minhas_empresas())
  and (meu_papel(empresa_id) in ('admin','gestor') or corretor_id = meu_membro_id(empresa_id))
);
create policy leads_editar on leads for update using (
  meu_papel(empresa_id) in ('admin','gestor') or corretor_id = meu_membro_id(empresa_id)
);
create policy leads_criar on leads for insert with check (empresa_id in (select minhas_empresas()));
create policy leads_apagar on leads for delete using (meu_papel(empresa_id) = 'admin');

-- Mensagens e eventos seguem a visibilidade do lead
create policy mensagens_ver on mensagens for select using (lead_id in (select id from leads));
create policy mensagens_criar on mensagens for insert with check (lead_id in (select id from leads));
create policy eventos_ver on eventos_lead for select using (lead_id in (select id from leads));
create policy eventos_criar on eventos_lead for insert with check (lead_id in (select id from leads));

-- Tempo real para CRM e conversas
alter publication supabase_realtime add table leads, mensagens;
