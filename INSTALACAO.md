# Como colocar o LeadFlow no ar

Siga na ordem. Cada etapa diz onde clicar. Você faz isso uma vez só: depois, cada construtora cliente se cadastra e conecta tudo sozinha.

## 1. Supabase (banco de dados e servidor)

1. Crie um projeto em https://supabase.com (plano gratuito serve para começar). Região: São Paulo.
2. Em **Project Settings → API**, copie a **Project URL** e a **anon / publishable key**.
3. Em **SQL Editor**, rode, nesta ordem, o conteúdo dos arquivos:
   - `supabase/migrations/20261027000001_schema.sql`
   - `supabase/migrations/20261027000002_rotinas_e_assinatura.sql`
4. Ainda no SQL Editor, guarde o endereço e a chave de serviço para os agendamentos funcionarem (a chave de serviço fica em Project Settings → API → service_role):
   ```sql
   select vault.create_secret('https://SEU-PROJETO.supabase.co', 'projeto_url');
   select vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key');
   ```
5. Em **Authentication → URL Configuration**, coloque o endereço onde o sistema vai ficar (ex.: `https://leadflow.seudominio.com.br`) em Site URL e em Redirect URLs.

## 2. Servidor (Edge Functions)

No computador, com o [Supabase CLI](https://supabase.com/docs/guides/cli) instalado, na pasta do projeto:

```bash
supabase login
supabase link --project-ref SEU-PROJETO
supabase functions deploy
```

Depois, em **Edge Functions → Secrets** no painel do Supabase, cadastre:

| Nome | O que é |
|---|---|
| `ANTHROPIC_API_KEY` | chave da API do Claude (console.anthropic.com) |
| `AI_MODEL` | opcional; padrão `claude-sonnet-5-5` |
| `META_APP_ID` / `META_APP_SECRET` | do app criado na etapa 3 |
| `META_VERIFY_TOKEN` | uma senha qualquer que você inventa (usada nos webhooks) |
| `WA_MODELO_BOAS_VINDAS` | nome do modelo de mensagem aprovado (etapa 3.5); padrão `boas_vindas_lead` |
| `APP_URL` | endereço do sistema, para o link no aviso ao corretor |
| `ASAAS_API_KEY` / `ASAAS_WEBHOOK_TOKEN` | da etapa 5 |

## 3. Meta (WhatsApp e anúncios)

Um único app da Meta atende todas as construtoras clientes.

1. Em https://developers.facebook.com crie um app do tipo **Empresa** ligado ao seu Gerenciador de Negócios (que precisa estar verificado).
2. Adicione os produtos **WhatsApp**, **Login do Facebook para Empresas** e **Webhooks**.
3. **WhatsApp → Configuração → Webhook:**
   - URL: `https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook`
   - Token de verificação: o mesmo `META_VERIFY_TOKEN`
   - Assine o campo `messages`.
4. **Webhooks → Página:** URL `https://SEU-PROJETO.supabase.co/functions/v1/meta-leads-webhook`, mesmo token, assine `leadgen`.
5. **Modelo de mensagem:** no Gerenciador do WhatsApp, crie um modelo de categoria Marketing chamado `boas_vindas_lead`, em português, com o texto:
   `Olá {{1}}! Aqui é da construtora, recebemos seu interesse pelo anúncio. Posso te ajudar por aqui?`
   Ele é a primeira mensagem para quem preencheu formulário (a Meta exige modelo aprovado fora de uma conversa aberta).
6. **Login do Facebook para Empresas → Configurações:** crie uma configuração do tipo **WhatsApp Embedded Signup** e copie o **Configuration ID**.
7. Peça a revisão do app com as permissões: `whatsapp_business_management`, `whatsapp_business_messaging`, `ads_read`, `ads_management`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `leads_retrieval`. Enquanto a revisão não sai, funciona para contas em que você é administrador, o que já basta para a sua esposa usar.
8. Para os avisos ao corretor e o relatório mensal chegarem sempre, crie também modelos de categoria Utilidade (o WhatsApp só entrega texto livre para quem falou com o número nas últimas 24 horas).

## 4. Site (front-end)

Crie um arquivo `.env` a partir do `.env.example` e preencha. Para publicar:

- **Pela Lovable:** com o repositório conectado, a Lovable já recebe o código. Coloque as variáveis do `.env` nas configurações do projeto e clique em Publish.
- **Pela Vercel (gratuito):** importe o repositório em https://vercel.com, cadastre as mesmas variáveis e publique.

## 5. Cobrança (Asaas)

1. Crie a conta em https://www.asaas.com e gere a chave de API (Integrações → API).
2. Em Integrações → Webhooks, crie um webhook para `https://SEU-PROJETO.supabase.co/functions/v1/assinatura`, com um token que você inventa (vai em `ASAAS_WEBHOOK_TOKEN`), e marque os eventos de cobrança e assinatura.
3. Para testar sem cobrar de verdade, use a conta sandbox e a secret `ASAAS_URL=https://api-sandbox.asaas.com/v3`.
4. Os valores dos planos ficam na tabela `planos` (Table Editor do Supabase). Ajuste quando definir os preços.

## 6. Primeiro acesso

1. Abra o sistema e clique em **Começar teste grátis**.
2. O assistente de configuração pede: dados da construtora, primeiro empreendimento (dá para enviar o PDF), ajuste do agente com teste ao vivo, conexão do WhatsApp e dos anúncios, e convite aos corretores.
3. Para ver o painel cheio antes de ter leads reais, rode no SQL Editor o arquivo `supabase/seed_demo.sql` e depois:
   ```sql
   select popular_demo((select id from empresas limit 1));
   ```
   e depois `select limpar_demo(...)` para apagar.

Para deixar a sua própria conta sem cobrança, mude no Table Editor a coluna `status_assinatura` da sua empresa para `ativa`.
