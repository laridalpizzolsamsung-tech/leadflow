-- Chave para receber leads de site/landing page/Google
alter table empresas add column chave_webhook text unique default encode(gen_random_bytes(16), 'hex');

-- Cobrança recorrente (Asaas)
alter table empresas add column asaas_cliente_id text;
alter table empresas add column asaas_assinatura_id text;
alter table empresas add column proximo_vencimento date;

-- Planos (tabela pública para a página de preços)
create table planos (
  id text primary key,
  nome text not null,
  preco_mensal numeric not null,
  limite_leads_mes int not null,
  limite_corretores int not null,
  recursos jsonb not null default '[]'::jsonb,
  ordem int not null default 0
);
alter table planos enable row level security;
create policy planos_publico on planos for select using (true);

insert into planos (id, nome, preco_mensal, limite_leads_mes, limite_corretores, recursos, ordem) values
('essencial', 'Essencial', 497, 500, 3, '["Agente de IA no WhatsApp 24h","CRM com funil","Rodízio de corretores","Dashboard de leads"]', 1),
('profissional', 'Profissional', 897, 1500, 10, '["Tudo do Essencial","Dashboard de campanhas e criativos","Custo por lead quente, visita e venda","Envio de conversões ao Meta","Monitor de SLA dos corretores"]', 2),
('premium', 'Premium', 1497, 5000, 999, '["Tudo do Profissional","Corretores ilimitados","Relatório mensal automático","Públicos semelhantes","Suporte prioritário"]', 3);

-- Convites para membros (o admin convida corretores pelo e-mail)
create table convites (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  email text not null,
  nome text not null,
  telefone text,
  papel papel_usuario not null default 'corretor',
  aceito boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (empresa_id, email)
);
alter table convites enable row level security;
create policy convites_admin on convites for all using (meu_papel(empresa_id) = 'admin') with check (meu_papel(empresa_id) = 'admin');

-- Ao entrar, o usuário convidado vira membro automaticamente
create or replace function aceitar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c record; mail text;
begin
  select email into mail from auth.users where id = auth.uid();
  for c in select * from convites where lower(email) = lower(mail) and not aceito loop
    insert into membros (empresa_id, user_id, nome, email, telefone, papel)
      values (c.empresa_id, auth.uid(), c.nome, mail, c.telefone, c.papel)
      on conflict (empresa_id, user_id) do nothing;
    update convites set aceito = true where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Gera nova chave de webhook
create or replace function gerar_nova_chave(eid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare k text := encode(gen_random_bytes(16), 'hex');
begin
  if meu_papel(eid) <> 'admin' then raise exception 'apenas admin'; end if;
  update empresas set chave_webhook = k where id = eid;
  return k;
end $$;

-- =====================================================================
-- Agendamentos (pg_cron + pg_net). Substitua <PROJETO> e <SERVICE_ROLE_KEY>
-- pelo seu projeto, ou rode o bloco pelo SQL Editor após configurar os segredos.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda URL e chave no Vault do Supabase para não expor no código:
--   select vault.create_secret('https://<PROJETO>.supabase.co', 'projeto_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');

create or replace function chamar_funcao(nome text, corpo jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare url text; chave text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'projeto_url';
  select decrypted_secret into chave from vault.decrypted_secrets where name = 'service_role_key';
  if url is null or chave is null then return; end if;
  perform net.http_post(
    url := url || '/functions/v1/' || nome,
    headers := jsonb_build_object('Authorization', 'Bearer ' || chave, 'Content-Type', 'application/json'),
    body := corpo
  );
end $$;

select cron.schedule('sla-corretores', '*/5 * * * *', $$ select chamar_funcao('rotinas', '{"tipo":"sla"}') $$);
select cron.schedule('retomada-leads', '17 * * * *', $$ select chamar_funcao('rotinas', '{"tipo":"retomada"}') $$);
select cron.schedule('sincronizar-meta', '40 5 * * *', $$ select chamar_funcao('meta-sincronizar', '{"dias":3}') $$);
select cron.schedule('relatorio-mensal', '0 12 1 * *', $$ select chamar_funcao('rotinas', '{"tipo":"relatorio"}') $$);
