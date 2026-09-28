# Backup Automatizado do Postgres

> Detalhamento do item 8 do [roadmap para a 1.0](./15-roadmap-v1.md). Item
> de infraestrutura — não incrementa `MINOR`. Crítico especialmente depois
> de Auditoria (`14`): perder o banco sem backup apaga também todo o
> histórico de rastreabilidade já construído.

## 1. Objetivo

Rotina de backup recorrente do Postgres, com armazenamento fora do
container, e teste periódico (não só teórico) de restauração.

## 2. Escopo técnico

- **Job de dump periódico:** `pg_dump` diário, comprimido, via um serviço
  dedicado no `docker-compose.yml` (ex: imagem baseada em
  `postgres:16-alpine` com um script de cron, ou uma imagem pronta como
  `prodrigestivill/postgres-backup-local` adaptada para enviar a um
  destino externo).
- **Armazenamento externo ao container:** upload para armazenamento
  compatível com S3 (AWS S3, Backblaze B2, ou MinIO auto-hospedado) —
  nunca no mesmo volume Docker do Postgres, que pode ser perdido junto em
  um incidente de host.
- **Retenção em rotação avô-pai-filho:** 7 dumps diários, 4 semanais, 6
  mensais — suficiente para cobrir tanto "desfazer um erro de ontem" quanto
  "recuperar de um problema notado só meses depois".
- **Criptografia em repouso** no armazenamento externo — dado financeiro
  sensível não deveria depender só da segurança do provedor de storage.

## 3. Teste de restauração — não é opcional

Um backup nunca testado é uma suposição, não uma garantia. Rotina mensal
automatizada: sobe um Postgres descartável, restaura o dump mais recente
nele, roda uma verificação simples (contagem de linhas nas tabelas
principais bate com o esperado, sem erro de restauração) — e falha
visivelmente (via Observabilidade, `07`) se algo não bater.

## 4. Fases de Execução

1. **Script de dump + upload**, com o serviço adicionado ao
   `docker-compose.yml`.
2. **Rotação de retenção** — remoção de dumps além da política definida.
3. **Procedimento documentado de restauração** — passo a passo manual,
   testado ao menos uma vez por uma pessoa real antes de considerar
   pronto.
4. **Teste automatizado periódico de restauração** (seção 3), com alerta
   via Observabilidade em caso de falha.

## 5. Riscos e pontos de atenção

- **Backup que falha silenciosamente é o pior cenário possível** — pior
  do que não ter backup, porque dá falsa sensação de segurança. A
  integração com Observabilidade (`07`) para alertar falha de backup não
  é um "nice to have", é o que evita esse cenário.
- **Retenção mal calibrada tem dois riscos opostos:** retenção curta
  demais perde a chance de recuperar um problema notado tardiamente;
  retenção longa demais acumula custo de armazenamento sem benefício
  proporcional. A régua avô-pai-filho da seção 2 é um ponto de partida
  razoável, não uma decisão definitiva — revisar depois de observar custo
  real.
- **Dados de teste de restauração não devem contaminar produção** — o
  Postgres descartável do teste (seção 3) precisa ser genuinamente
  isolado, nunca apontar para o mesmo banco de produção por engano.

## 6. Implementação

O profile Docker `backup` sobe MinIO (S3 local; imagem `pgsty/minio`,
fork mantido — a imagem oficial `minio/minio` deixou de ser publicada),
e um serviço `postgres-backup` baseado em `postgres:16-alpine`. O dump é
`pg_dump -Fc` (custom, comprimido), cifrado com [age](https://age-encryption.org/)
antes do upload. A chave privada **não** vai para o bucket — só o
ciphertext. O volume `orcadom_pgdata` nunca recebe dump.

`pnpm docker:up` continua só com Postgres e n8n. Backup é opcional no
dia a dia, como a observabilidade:

```bash
pnpm backup:up            # MinIO + job de dump (faz um dump na subida)
pnpm backup:down          # para o job e o MinIO; não derruba o Postgres
pnpm backup:now           # dump imediato
pnpm backup:restore-test  # sobe Postgres descartável, restaura, confere
pnpm test:backup          # testes unitários da retenção GFS
```

Console do MinIO: http://localhost:9001 (usuário/senha =
`BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY`). Métricas do job:
http://localhost:9105/metrics.

### 6.1 — Variáveis de ambiente

| Variável | Padrão | Função |
| --- | --- | --- |
| `BACKUP_S3_ENDPOINT` | `http://minio:9000` | Endpoint S3. Vazio = API da AWS |
| `BACKUP_S3_BUCKET` | `orcadom-backups` | Bucket (criado no primeiro dump) |
| `BACKUP_S3_ACCESS_KEY` / `BACKUP_S3_SECRET_KEY` | `orcadom_backup` / `orcadom_backup_dev` | Credencial S3 / MinIO |
| `BACKUP_S3_REGION` | `us-east-1` | Região (B2 e MinIO também exigem uma) |
| `BACKUP_AGE_PUBLIC_KEY` | gerada no volume `orcadom_backup_keys` | Destinatário age do dump |
| `BACKUP_AGE_SECRET_KEY` | o par da chave acima | Só restoração / teste de restore |
| `BACKUP_RETENTION_DAILY` / `_WEEKLY` / `_MONTHLY` | `7` / `4` / `6` | Régua GFS |
| `BACKUP_CRON` | `0 3 * * *` | Dump diário (timezone `America/Sao_Paulo`) |
| `BACKUP_RESTORE_TEST_CRON` | `0 4 1 * *` | Restore test no dia 1, 04:00 |
| `BACKUP_RUN_ON_START` | `true` | Dump na subida do container (evita janela sem backup) |
| `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` | `9000` / `9001` | Portas publicadas do MinIO |
| `BACKUP_METRICS_PORT` | `9105` | Exporter Prometheus do job |

Em produção este `docker-compose.yml` não entra (`05-infraestrutura-docker.md`).
A mesma imagem `infra/backup` aponta para S3/B2 de verdade: preencha as
credenciais, deixe `BACKUP_S3_ENDPOINT` vazio (AWS) ou com o endpoint
S3-compatível (B2, MinIO remoto), e **gere um par age fora do container**:

```bash
age-keygen -o backup-age.key
# a linha "public key: age1..." vai em BACKUP_AGE_PUBLIC_KEY
# o arquivo inteiro (AGE-SECRET-KEY-1...) vai em BACKUP_AGE_SECRET_KEY,
# guardado no secret manager — sem ele o dump é inútil
```

### 6.2 — Objetos no bucket e retenção GFS

Layout (`pg_dump` custom + manifest JSON em claro, só com metadados e
contagens):

```
s3://orcadom-backups/
  daily/orcadom_db-YYYY-MM-DD.dump.fc.age
  daily/orcadom_db-YYYY-MM-DD.manifest.json
  weekly/orcadom_db-YYYY-Www.dump.fc.age      # só domingo
  monthly/orcadom_db-YYYY-MM.dump.fc.age      # só dia 1
```

Todo dump é diário. Domingo também copia para `weekly/`; dia 1, para
`monthly/`. A rotação apaga o que passar de 7/4/6 objetos em cada slot.

O manifest guarda `rowCounts` de **todas** as tabelas de usuário (schema
`public` e `n8n`). É isso que o restore test compara — não uma amostragem.

### 6.3 — Observabilidade da falha

Backup que falha **não derruba** o container: o exporter continua no ar
com a falha visível. Três canais, de propósito redundantes:

- Logs JSON em `docker compose logs postgres-backup`.
- Métricas `orcadom_backup_*` em `:9105/metrics`, scrape
  `orcadom-backup` no Prometheus, dashboard Grafana `Orcadom Backup`,
  alertas em `infra/prometheus/alerts.yml` (dump velho > 36 h, dump
  falhou, restore test falhou, restore test > 40 dias).
- Evento no GlitchTip/Sentry se `SENTRY_DSN` estiver preenchido (o
  `localhost` do DSN é reescrito para `host.docker.internal` de dentro
  do container).

`pnpm obs:up` + `pnpm backup:up` juntos ligam o scrape. Com só
observabilidade no ar, o target `postgres-backup:9105` aparece *down* —
é esperado.

### 6.4 — Procedimento manual de restauração

O teste automático **não** substitui este procedimento. Faça uma vez à
mão, num banco **novo**, antes de confiar no backup em um incidente
real.

1. Suba a stack de backup (`pnpm backup:up`) e confirme que existe um
   dump recente no MinIO (`daily/…dump.fc.age`).
2. Restaure para um database **novo** no mesmo Postgres de desenvolvimento
   (o script recusa restaurar em cima de `POSTGRES_DB` sem
   `ORCADOM_RESTORE_OVERWRITE=I_UNDERSTAND`):

```bash
docker compose --profile backup run --rm postgres-backup \
  /backup/restore.sh --target-db orcadom_db_restored
```

3. Confira o log `restore verified`. Se as contagens não baterem, o
   comando sai com status ≠ 0 — não use esse dump.
4. Inspecione o database restaurado (DBeaver em `orcadom_db_restored`,
   mesmo host/porta/usuário).
5. Quando terminar a inspeção: `DROP DATABASE orcadom_db_restored;`

Para um dump específico: `--slot weekly --date 2026-09-27` (a data é a
do dump original; o objeto semanal usa a semana ISO).

**Incidente real (produção, Postgres gerenciado):** baixe o objeto
`.dump.fc.age`, decifre com a chave privada (`age -d -i backup-age.key`),
crie um database novo no provedor, `pg_restore --no-owner --exit-on-error`,
confira as contagens do manifest, **só então** faça o cut-over (renomear
ou apontar `DATABASE_URL`). Nunca restaure em cima do database ao vivo
como primeiro passo.

Override explícito, só com o dump já validado num database paralelo:

```bash
ORCADOM_RESTORE_OVERWRITE=I_UNDERSTAND \
  docker compose --profile backup run --rm postgres-backup \
  /backup/restore.sh --target-db orcadom_db
```

### 6.5 — Isolamento do restore test

`restore-test.sh` **não** usa `PGHOST=postgres`. Sobe um `initdb` no
próprio container, escuta só `127.0.0.1:55432`, restaura, compara
`rowCounts` com o manifest, destroi o datadir. Outros serviços da rede
Compose não alcançam essa instância. O dump de origem continua sendo
lido do S3; a única conversa com o Postgres de verdade é a que o dump
diário já fez, horas ou dias antes.

### 6.6 — Scripts

| Arquivo | Função |
| --- | --- |
| `infra/backup/backup.sh` | dump, cifra, upload, promoção GFS, rotação |
| `infra/backup/restore.sh` | restore manual para `--target-db` |
| `infra/backup/restore-test.sh` | restore test isolado (cron mensal) |
| `infra/backup/gfs.py` | classificação e retenção (coberto por `pnpm test:backup`) |
