# Infraestrutura Local (Docker)

## Serviços

| Serviço      | Imagem                | Porta padrão | Função                                         |
| ------------ | --------------------- | ------------ | ---------------------------------------------- |
| `postgres`   | `postgres:16-alpine`  | 5432         | Banco de dados principal                       |
| `n8n`        | `n8nio/n8n`           | 5678         | Workflows de email (importação e notificações) |
| `redis`      | `redis:7-alpine`      | (interno)    | Fila do GlitchTip — profile `observability`    |
| `glitchtip`  | `glitchtip/glitchtip` | 8000         | Rastreamento de erro — profile `observability` |
| `prometheus` | `prom/prometheus`     | 9090         | Scrape de `/metrics` — profile `observability` |
| `grafana`    | `grafana/grafana`     | 3001         | Painel das métricas — profile `observability`  |

`pnpm docker:up` sobe só Postgres e n8n. Redis, GlitchTip, Prometheus e
Grafana entram com `pnpm obs:up` (profile `observability`). Detalhes de
DSN, portas e primeiro uso estão em [`26-observabilidade.md`](./26-observabilidade.md).

Redis no compose existe **somente** para o GlitchTip. Não há cache de
aplicação nem fila de importação neste estágio.

## Arquivo `docker-compose.yml`

O arquivo na raiz do repositório é a fonte de verdade. Postgres e n8n
ficam sempre disponíveis; os serviços de observabilidade usam
`profiles: [observability]`.

## Variáveis de ambiente (`.env`)

Copie `.env.example`. Além de Postgres, auth, n8n e VAPID, a
observabilidade usa `LOG_LEVEL`, `SENTRY_DSN`, `GLITCHTIP_*`,
`PROMETHEUS_PORT` e `GRAFANA_*`.

## Comandos úteis

| Comando                                        | Efeito                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `pnpm db:up` / `docker compose up -d postgres` | Sobe só o Postgres                                         |
| `pnpm docker:up`                               | Sobe Postgres e n8n                                        |
| `pnpm obs:up`                                  | Inclui Redis, GlitchTip, Prometheus e Grafana              |
| `pnpm obs:down`                                | Para só a stack de observabilidade (mantém Postgres/n8n)   |
| `docker compose down`                          | Para os containers (mantém os volumes)                     |
| `docker compose down -v`                       | Para os containers **e apaga os volumes** (perde os dados) |
| `docker compose logs -f postgres`              | Acompanha os logs do banco                                 |

## Acessando pelo DBeaver

Com o container no ar, crie uma conexão PostgreSQL:

- **Host:** `localhost`
- **Porta:** valor de `POSTGRES_PORT` (5432)
- **Database:** valor de `POSTGRES_DB`
- **Usuário/Senha:** os mesmos definidos no `.env`

O GlitchTip usa um database separado (`glitchtip`) na mesma instância.

## Nota sobre produção

Este `docker-compose.yml` é para **ambiente local de desenvolvimento**
apenas. Em produção, a expectativa é usar um Postgres gerenciado (ex: RDS,
Supabase, Neon, Railway) — o `DATABASE_URL` muda, mas o schema e as
migrations do Prisma permanecem os mesmos. Logs JSON, `/metrics` e o SDK
Sentry (DSN do GlitchTip ou Sentry SaaS) seguem na API, independentemente
do compose local.
