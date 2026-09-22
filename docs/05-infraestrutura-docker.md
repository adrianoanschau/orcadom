# Infraestrutura Local (Docker)

## Serviços

| Serviço | Imagem | Porta padrão | Função |
|---------|--------|---------------|--------|
| `postgres` | `postgres:16-alpine` | 5432 | Banco de dados principal |
| `adminer` | `adminer:latest` | 8080 | Interface web para inspecionar o banco (opcional) |

Nenhum outro serviço é necessário para o MVP. Redis, filas ou serviços de
cache não têm uso justificado no escopo atual — serão avaliados apenas se
surgir uma necessidade concreta (ex: cache do dashboard sob alta carga,
filas para importação de extrato bancário no backlog futuro).

## Arquivo `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: orcadom_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-orcadom}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-orcadom_dev_password}
      POSTGRES_DB: ${POSTGRES_DB:-orcadom_db}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - orcadom_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-orcadom} -d ${POSTGRES_DB:-orcadom_db}"]
      interval: 5s
      timeout: 5s
      retries: 10

  adminer:
    image: adminer:latest
    container_name: orcadom_adminer
    restart: unless-stopped
    ports:
      - "${ADMINER_PORT:-8080}:8080"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  orcadom_pgdata:
    name: orcadom_pgdata
```

## Variáveis de ambiente (`.env`)

```env
# Docker / Postgres
POSTGRES_USER=orcadom
POSTGRES_PASSWORD=orcadom_dev_password
POSTGRES_DB=orcadom_db
POSTGRES_PORT=5432
ADMINER_PORT=8080

# Usada pelo Prisma e pela API
DATABASE_URL="postgresql://orcadom:orcadom_dev_password@localhost:5432/orcadom_db?schema=public"

# Auth
JWT_ACCESS_SECRET=troque_este_valor_em_producao
JWT_REFRESH_SECRET=troque_este_outro_valor_em_producao
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Comandos úteis

| Comando | Efeito |
|---------|--------|
| `docker compose up -d` | Sobe Postgres + Adminer em background |
| `docker compose up -d postgres` | Sobe só o Postgres |
| `docker compose down` | Para e remove os containers (mantém o volume) |
| `docker compose down -v` | Para os containers **e apaga o volume** (perde os dados) |
| `docker compose logs -f postgres` | Acompanha os logs do banco |

## Acessando o Adminer

Com os containers no ar, acesse `http://localhost:8080` e preencha:

- **Sistema:** PostgreSQL
- **Servidor:** `postgres` (nome do serviço no compose, não `localhost`)
- **Usuário/Senha:** os mesmos definidos no `.env`
- **Base de dados:** valor de `POSTGRES_DB`

## Nota sobre produção

Este `docker-compose.yml` é para **ambiente local de desenvolvimento**
apenas. Em produção, a expectativa é usar um Postgres gerenciado (ex: RDS,
Supabase, Neon, Railway) — o `DATABASE_URL` muda, mas o schema e as
migrations do Prisma permanecem os mesmos.
