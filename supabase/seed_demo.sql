-- =====================================================================
-- Dados de demonstração (opcional). Preenche uma empresa com campanhas,
-- criativos, investimento e ~180 leads dos últimos 45 dias para ver o painel funcionando.
-- Uso no SQL Editor do Supabase:  select popular_demo('<id da empresa>');
-- Para apagar depois:              select limpar_demo('<id da empresa>');
-- =====================================================================
create or replace function popular_demo(eid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c1 uuid; c2 uuid; c3 uuid; a uuid; e1 uuid; e2 uuid;
  criativos uuid[] := '{}'; campanha_de uuid[] := '{}';
  etapas uuid[]; corretores uuid[];
  i int; d date; t text; pont int; et int; cr int; nome text; tel text; fx text; gen text;
  nomes text[] := array['Juliana Martins','Rafael Souza','Carla Teixeira','Bruno Lima','Patrícia Alves','Diego Ramos','Fernanda Costa','Lucas Pereira','Aline Rocha','Marcos Vieira','Camila Duarte','Thiago Moreira','Renata Lopes','Gustavo Nunes','Bianca Freitas','André Barbosa','Larissa Cardoso','Felipe Araújo','Mariana Ribeiro','Eduardo Pinto'];
  bairros text[] := array['Centro','Fazenda','Cabeçudas','Praia Brava','São Vicente','Dom Bosco','Vila Operária'];
  objecoes text[] := array['Valor da entrada','Prazo de entrega','Aprovação do financiamento','Tamanho da planta','Localização','Comparando com outro lançamento'];
  perdas text[] := array['Sem condição financeira','Crédito reprovado','Comprou com concorrente','Não respondeu mais'];
  faixas text[] := array['18-24','25-34','25-34','35-44','35-44','45-54','55-64'];
begin
  -- Empreendimentos
  insert into empreendimentos (empresa_id, nome, cidade, bairro, tipo, status_obra, preco_minimo, preco_maximo, metragens, dormitorios, diferenciais, condicoes_pagamento, programa_habitacional, previsao_entrega)
  values (eid, 'Residencial Vista Mar', 'Itajaí', 'Fazenda', 'Apartamento', 'Em obras', 489000, 790000, '62 a 98 m²', '2 e 3 (1 suíte)', 'Vista para o mar, piscina aquecida, academia, 2 vagas', 'Entrada em 60x durante a obra, aceita FGTS', null, 'dezembro de 2027') returning id into e1;
  insert into empreendimentos (empresa_id, nome, cidade, bairro, tipo, status_obra, preco_minimo, preco_maximo, metragens, dormitorios, diferenciais, condicoes_pagamento, programa_habitacional, previsao_entrega)
  values (eid, 'Jardim das Flores', 'Itajaí', 'São Vicente', 'Apartamento', 'Lançamento', 229000, 289000, '42 a 51 m²', '2', 'Salão de festas, playground, bicicletário', 'Subsídio de até R$ 55 mil, entrada facilitada', 'Minha Casa Minha Vida', 'junho de 2028') returning id into e2;

  -- Campanhas e criativos
  insert into campanhas (empresa_id, plataforma, id_externo, nome, status) values (eid, 'meta', 'demo-c1', 'Vista Mar | Leads | Formulário', 'ACTIVE') returning id into c1;
  insert into campanhas (empresa_id, plataforma, id_externo, nome, status) values (eid, 'meta', 'demo-c2', 'Vista Mar | Mensagens WhatsApp', 'ACTIVE') returning id into c2;
  insert into campanhas (empresa_id, plataforma, id_externo, nome, status) values (eid, 'meta', 'demo-c3', 'Jardim das Flores | MCMV | WhatsApp', 'ACTIVE') returning id into c3;
  insert into criativos (empresa_id, campanha_id, id_externo, nome, titulo) values (eid, c1, 'demo-a1', 'Vídeo drone da vista', 'Acorde com o mar') returning id into a; criativos := criativos || a; campanha_de := campanha_de || c1;
  insert into criativos (empresa_id, campanha_id, id_externo, nome, titulo) values (eid, c1, 'demo-a2', 'Carrossel decorado', 'Conheça o decorado') returning id into a; criativos := criativos || a; campanha_de := campanha_de || c1;
  insert into criativos (empresa_id, campanha_id, id_externo, nome, titulo) values (eid, c2, 'demo-a3', 'Corretor explicando a entrada', 'Entrada em 60x') returning id into a; criativos := criativos || a; campanha_de := campanha_de || c2;
  insert into criativos (empresa_id, campanha_id, id_externo, nome, titulo) values (eid, c3, 'demo-a4', 'Saia do aluguel', 'Parcela menor que o aluguel') returning id into a; criativos := criativos || a; campanha_de := campanha_de || c3;
  insert into criativos (empresa_id, campanha_id, id_externo, nome, titulo) values (eid, c3, 'demo-a5', 'Família na chave', 'Sua casa própria com FGTS') returning id into a; criativos := criativos || a; campanha_de := campanha_de || c3;

  -- Investimento diário
  for d in select generate_series(current_date - 44, current_date, interval '1 day')::date loop
    for i in 1..array_length(criativos, 1) loop
      insert into metricas_diarias (empresa_id, data, campanha_id, criativo_id, investimento, impressoes, cliques, alcance)
      values (eid, d, campanha_de[i], criativos[i], round((25 + random() * 45)::numeric, 2), (1500 + random() * 3000)::int, (20 + random() * 80)::int, (1200 + random() * 2000)::int);
    end loop;
    foreach fx in array array['18-24','25-34','35-44','45-54','55-64'] loop
      foreach gen in array array['masculino','feminino'] loop
        insert into metricas_demograficas (empresa_id, data, campanha_id, faixa_etaria, genero, investimento, leads)
        values (eid, d, c1, fx, gen, round((4 + random() * 10)::numeric, 2), case when random() < 0.25 then 1 else 0 end)
        on conflict do nothing;
      end loop;
    end loop;
  end loop;

  select array_agg(id order by ordem) into etapas from etapas_funil where empresa_id = eid;
  select array_agg(id) into corretores from membros where empresa_id = eid;

  -- Leads
  for i in 1..180 loop
    cr := 1 + floor(random() * array_length(criativos, 1))::int;
    -- O criativo 3 (corretor explicando a entrada) traz mais leads quentes
    pont := least(98, greatest(5, (random() * 100)::int + case when cr = 3 then 25 when cr = 4 then -10 else 0 end));
    t := case when pont >= 72 then 'quente' when pont >= 45 then 'morno' when pont >= 15 then 'frio' else 'nao_classificado' end;
    et := case when t = 'quente' then 3 + floor(random() * 4)::int when t = 'morno' then 2 + floor(random() * 2)::int when t = 'frio' then case when random() < 0.4 then 7 else 2 end else 1 end;
    nome := nomes[1 + floor(random() * array_length(nomes, 1))::int];
    tel := '55479' || lpad((floor(random() * 99999999))::text, 8, '0');
    fx := faixas[1 + floor(random() * array_length(faixas, 1))::int];
    insert into leads (empresa_id, nome, telefone, origem, campanha_id, criativo_id, empreendimento_id, etapa_id, corretor_id, temperatura, pontuacao,
      genero, faixa_etaria, cidade, bairro_interesse, tipo_imovel, finalidade, renda_familiar, orcamento, usa_financiamento, usa_fgts, prazo_compra, primeiro_imovel, objecao_principal,
      resumo_ia, atendimento_humano, atribuido_em, primeira_resposta_corretor_em, visita_realizada, valor_venda, motivo_perda, criado_em, ultima_mensagem_em)
    values (eid, nome, tel, (case when campanha_de[cr] = c1 then 'meta_lead_ads' else 'meta_ctwa' end)::origem_lead, campanha_de[cr], criativos[cr],
      case when campanha_de[cr] = c3 then e2 else e1 end, etapas[et],
      case when et >= 4 and corretores is not null then corretores[1 + floor(random() * array_length(corretores, 1))::int] end,
      t::temperatura_lead, pont,
      case when random() < 0.55 then 'feminino' else 'masculino' end, fx, 'Itajaí', bairros[1 + floor(random() * array_length(bairros, 1))::int], 'Apartamento',
      case when random() < 0.75 then 'morar' else 'investir' end, (4000 + random() * 18000)::int, (220000 + random() * 500000)::int,
      random() < 0.8, random() < 0.5, (array['Até 3 meses','3 a 6 meses','6 a 12 meses','Sem prazo'])[1 + floor(random() * 4)::int], random() < 0.6,
      objecoes[1 + floor(random() * array_length(objecoes, 1))::int],
      'Procura apartamento de 2 dormitórios para morar com a família. Renda compatível e pretende usar FGTS na entrada. Principal dúvida é o valor da entrada. Abordagem: mostrar a simulação de entrada parcelada.',
      et >= 4, case when et >= 4 then now() - (random() * 40 || ' days')::interval end,
      case when et >= 4 and random() < 0.85 then now() - (random() * 40 || ' days')::interval + interval '12 minutes' end,
      et >= 5, case when et = 6 then (480000 + random() * 250000)::int end,
      case when et = 7 then perdas[1 + floor(random() * array_length(perdas, 1))::int] end,
      now() - (random() * 44 || ' days')::interval, now() - (random() * 3 || ' days')::interval)
    on conflict (empresa_id, telefone) do nothing;
  end loop;

  return 'Dados de demonstração criados.';
end $$;

create or replace function limpar_demo(eid uuid) returns text
language plpgsql security definer set search_path = public as $$
begin
  delete from leads where empresa_id = eid and criativo_id in (select id from criativos where empresa_id = eid and id_externo like 'demo-%');
  delete from campanhas where empresa_id = eid and id_externo like 'demo-%';
  delete from empreendimentos where empresa_id = eid and nome in ('Residencial Vista Mar', 'Jardim das Flores');
  return 'Dados de demonstração removidos.';
end $$;
