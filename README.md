# LeadFlow

Sistema de atendimento de leads para construtoras: agente de IA no WhatsApp que qualifica e classifica cada lead (quente, morno, frio), CRM com funil e rodízio de corretores, e painel com o resultado real das campanhas de anúncio (custo por lead quente, por visita e por venda, por campanha e por criativo).

Feito para ser vendido por assinatura: multiempresa desde o início, com cadastro, configuração, conexões e cobrança feitos pelo próprio cliente.

## Como funciona

1. O lead chega por formulário do Meta, anúncio de clique para WhatsApp, site ou Google.
2. O agente responde no WhatsApp em segundos, conversa, descobre o que a pessoa procura e classifica.
3. Quando o lead aceita a visita, o sistema entrega ao próximo corretor do rodízio e avisa no WhatsApp dele.
4. Se o corretor não responder no prazo, o gestor é avisado e o lead passa para outro corretor.
5. Visitas e vendas voltam para o Meta (API de Conversões), e os anúncios passam a buscar mais gente parecida com quem compra.
6. Todo dia o sistema puxa investimento, criativos e perfil (idade e gênero) do Meta Ads.

## Tecnologia

- **Front-end:** React + TypeScript + Vite + Tailwind (mesma base da Lovable)
- **Banco, login e tempo real:** Supabase (Postgres com segurança por empresa em todas as tabelas)
- **Servidor:** Supabase Edge Functions (Deno), em `supabase/functions`
- **IA:** API do Claude (Anthropic)
- **WhatsApp:** WhatsApp Cloud API oficial da Meta, com cadastro incorporado
- **Cobrança:** Asaas (Pix, boleto e cartão)

## Estrutura

```
src/                      telas do sistema
  pages/                  Visão geral, Campanhas, Leads, Lead, Agente, Empreendimentos, Equipe, Conexões, Plano, Ajustes, Onboarding
  lib/                    cliente Supabase, sessão, consultas, login do Facebook
supabase/
  migrations/             banco de dados (tabelas, segurança, agendamentos)
  functions/              servidor
    whatsapp-webhook/     recebe mensagens do WhatsApp e aciona o agente
    meta-leads-webhook/   recebe leads dos formulários do Meta
    lead-entrada/         recebe leads de site, landing page e Google
    acoes-lead/           ações do CRM (responder, visita, venda, testar agente, ler PDF)
    meta-conectar/        conexão do WhatsApp e da conta de anúncios
    meta-sincronizar/     importa campanhas, criativos, investimento e perfil
    rotinas/              SLA dos corretores, retomada de leads, relatório mensal
    assinatura/           cobrança recorrente (Asaas)
  seed_demo.sql           dados de demonstração (opcional)
```

O passo a passo para colocar no ar está em [INSTALACAO.md](INSTALACAO.md).
