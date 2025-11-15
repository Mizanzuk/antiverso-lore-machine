
# AntiVerso Lore Machine (v1)

Este projeto é um protótipo da sua máquina de lore com:

- Next.js 14 (App Router)
- Chat minimalista no estilo ChatGPT
- Or como assistente central
- RAG com Supabase + embeddings da OpenAI
- Seed automático usando `AntiVerso_DB_v2.json`

## Passo 1 — Criar projeto no Supabase

1. Acesse o painel do Supabase e crie um novo projeto.
2. Vá em **SQL Editor**.
3. Copie TODO o conteúdo do arquivo `schema.sql`.
4. Cole no editor e execute.
5. Confirme que a tabela `lore_chunks` foi criada.

## Passo 2 — Configurar variáveis na Vercel

1. Crie um novo projeto na Vercel e importe este repositório.
2. No projeto da Vercel, vá em **Settings → Environment Variables** e crie:

- `OPENAI_API_KEY` → sua chave da OpenAI
- `NEXT_PUBLIC_SUPABASE_URL` → URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` → Service role key do Supabase

3. Faça o deploy.

## Passo 3 — Rodar o seed

Com o projeto publicado:

1. Acesse: `https://SEU_PROJETO.vercel.app/api/seed` usando algum cliente de HTTP (ou abra no navegador e faça um POST usando algo como o plugin RESTer, ou crie um script simples depois).
2. A rota vai ler `data/AntiVerso_DB_v2.json`, gerar embeddings e preencher a tabela `lore_chunks`.

## Passo 4 — Usar o chat

Acesse a raiz do site:

- `https://SEU_PROJETO.vercel.app`

E comece a conversar com Or. Sempre que você fizer perguntas, o backend:

1. Gera embedding da pergunta.
2. Busca trechos relevantes em `lore_chunks`.
3. Envia tudo como contexto para o modelo da OpenAI.
4. Or responde misturando consulta e criação (conforme seu pedido).

---
