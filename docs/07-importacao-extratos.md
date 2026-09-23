# Importação de Extratos e Memória de Categorização

> Feature pós-MVP. Depende dos módulos `accounts`, `categories` e
> `transactions` já existentes — reaproveita a lógica de atualização de
> saldo e não introduz um caminho paralelo para criação de transações.

## 1. Objetivo

Permitir que o usuário importe um extrato bancário (OFX ou CSV) e que cada
lançamento do arquivo vire uma `Transaction` real na conta correspondente,
sem duplicar lançamentos já existentes e com sugestão automática de
categoria sempre que possível.

## 2. Decisões de escopo

- **Formatos suportados:** OFX e CSV.
  - OFX é priorizado por já trazer um identificador único por transação
    (`FITID`), o que resolve a maior parte do problema de deduplicação sem
    esforço extra.
  - CSV entra como formato de apoio, para bancos/cartões que não exportam
    OFX.
- **PDF fica fora do escopo.** Parsing de extrato em PDF é instável (o
  layout varia por banco) e o custo de manutenção não compensa nesta fase.
- **Importação nunca grava direto no banco.** Todo arquivo importado passa
  por um fluxo de **preview → confirmação**. Um item importado chega sem
  categoria definida pelo banco, e o usuário pode reimportar o mesmo
  arquivo por engano — gravar direto tornaria esses dois problemas
  irreversíveis sem intervenção manual no banco de dados.

## 3. Modelagem de Dados

### 3.1 — Alterações em `Transaction`

```prisma
enum TransactionSource {
  MANUAL
  IMPORTED
}

// Campos adicionados ao model Transaction existente:
//   source        TransactionSource @default(MANUAL)
//   externalId    String?            // FITID do OFX, ou hash sintético no CSV
//   importBatchId String?
//   importBatch   ImportBatch?       @relation(fields: [importBatchId], references: [id])
//
//   @@unique([accountId, externalId])  // trava reimportação duplicada a nível de banco
```

O `externalId` é a peça-chave da deduplicação:

- **OFX** → usa o `FITID` fornecido pelo próprio banco, garantidamente
  único por conta.
- **CSV** → não tem ID nenhum, então é gerado um hash sintético a partir de
  `data + valor + descrição`. Não é infalível (duas compras idênticas no
  mesmo dia colidem), mas cobre o caso comum.

### 3.2 — `ImportBatch`

```prisma
enum ImportFormat {
  OFX
  CSV
}

enum ImportStatus {
  PENDING     // aguardando confirmação do usuário
  CONFIRMED
  DISCARDED
}

model ImportBatch {
  id            String       @id @default(uuid())
  fileName      String
  format        ImportFormat
  status        ImportStatus @default(PENDING)
  totalRows     Int
  importedRows  Int          @default(0)
  duplicateRows Int          @default(0)
  createdAt     DateTime     @default(now())
  confirmedAt   DateTime?

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  accountId String
  account   Account @relation(fields: [accountId], references: [id])

  transactions Transaction[]

  @@index([userId])
  @@map("import_batches")
}
```

### 3.3 — `CategoryMemory`

```prisma
model CategoryMemory {
  id          String   @id @default(uuid())
  pattern     String   // descrição normalizada (assinatura do estabelecimento)
  occurrences Int      @default(1)
  lastUsedAt  DateTime @default(now())

  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([userId, pattern, categoryId])
  @@index([userId, pattern])
  @@map("category_memory")
}
```

**Por que a chave única inclui `categoryId`** (`[userId, pattern, categoryId]`,
não apenas `[userId, pattern]`): o mesmo padrão pode já ter sido
categorizado de formas diferentes ao longo do tempo (ex: "IFOOD" às vezes é
*Alimentação*, às vezes *Presente*). Guardar a contagem de cada combinação,
em vez de sobrescrever, permite sempre sugerir a categoria **mais
frequente** — não apenas a mais recente.

## 4. Memória de Categorização

### 4.1 — Normalização da descrição

A descrição bruta do banco tem ruído (datas, códigos, número de parcela)
que impediria duas ocorrências do mesmo estabelecimento baterem entre si.
Uma função de normalização resolve isso:

```ts
function normalizeDescription(raw: string): string {
  return raw
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\d+/g, '')                                // remove números (datas, códigos, parcelas)
    .replace(/[^A-Z\s]/g, ' ')                           // remove pontuação
    .replace(/\s+/g, ' ')
    .trim();
}
```

Exemplo: `"COMPRA IFOOD *IFD 123456 12/09"` e
`"COMPRA IFOOD*IFD 987654 25/09"` viram ambos `"COMPRA IFOOD IFD"` — mesmo
padrão, mesmo aprendizado.

### 4.2 — Quando a memória é alimentada

Em **um único ponto** da aplicação, reaproveitado por todos os fluxos que
gravam uma transação categorizada (evita duplicar a lógica): o service de
`transactions`, no momento em que uma transação `INCOME`/`EXPENSE` é salva
com categoria — seja criada manualmente, seja confirmada via importação.

```ts
async function upsertCategoryMemory(userId: string, description: string, categoryId: string) {
  const pattern = normalizeDescription(description);
  if (!pattern) return; // descrição vazia após normalização, não vale memorizar

  await prisma.categoryMemory.upsert({
    where: { userId_pattern_categoryId: { userId, pattern, categoryId } },
    update: { occurrences: { increment: 1 }, lastUsedAt: new Date() },
    create: { userId, pattern, categoryId, occurrences: 1 },
  });
}
```

Como esse ponto é compartilhado com o fluxo de criação manual de
transações, a memória começa a aprender **antes mesmo da primeira
importação**, só com o uso normal do app.

### 4.3 — Como a sugestão é buscada

Duas camadas, da mais para a menos confiável:

1. **Match exato no padrão memorizado** — consulta rápida (índice em
   `[userId, pattern]`), resultado determinístico.
2. **Fallback por similaridade textual**, usado apenas quando não há
   memória exata — via extensão `pg_trgm` do Postgres, mais eficiente e
   indexável do que uma heurística de comparação em nível de aplicação:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX transactions_description_trgm_idx ON transactions USING gin (description gin_trgm_ops);
```

```ts
async function suggestCategory(userId: string, rawDescription: string) {
  const pattern = normalizeDescription(rawDescription);

  const exact = await prisma.categoryMemory.findFirst({
    where: { userId, pattern },
    orderBy: [{ occurrences: 'desc' }, { lastUsedAt: 'desc' }],
  });
  if (exact) {
    return { categoryId: exact.categoryId, confidence: 'high', source: 'memory' };
  }

  const similar = await prisma.$queryRaw<{ categoryId: string }[]>`
    SELECT "categoryId", similarity(description, ${rawDescription}) AS score
    FROM transactions
    WHERE "userId" = ${userId} AND "categoryId" IS NOT NULL
    ORDER BY score DESC
    LIMIT 1
  `;
  if (similar[0]) {
    return { categoryId: similar[0].categoryId, confidence: 'low', source: 'similarity' };
  }

  return null; // nenhuma sugestão — usuário categoriza do zero
}
```

### 4.4 — Uso do `confidence` na interface

| `confidence` | Origem | Comportamento sugerido na UI |
|---|---|---|
| `high` | Padrão já visto exatamente antes (`memory`) | Categoria vem **pré-selecionada** no dropdown |
| `low` | Apenas descrição parecida (`similarity`) | Categoria aparece como **sugestão fraca**, exigindo confirmação deliberada do usuário |
| *(ausente)* | Nenhum histórico encontrado | Usuário categoriza do zero |

Essa distinção evita que o usuário confie automaticamente em uma sugestão
que é só "parecida", não "igual".

## 5. Fluxo da API

| Etapa | Endpoint | O que faz |
|---|---|---|
| 1. Upload | `POST /imports` (multipart) | Recebe o arquivo, identifica o formato, faz o parsing, cria um `ImportBatch` com status `PENDING` |
| 2. Preview | `GET /imports/:batchId` | Retorna as linhas parseadas, cada uma já com `suggestedCategoryId` e `confidence` calculados por `suggestCategory()`, e marcando possíveis duplicatas via `externalId` |
| 3. Ajuste | *(client-side)* | Usuário confirma ou troca a categoria sugerida de cada linha, desmarca duplicatas |
| 4. Confirmação | `POST /imports/:batchId/confirm` | Recebe a lista final (com categorias escolhidas), cria as `Transaction` dentro de `prisma.$transaction`, atualizando `balance` da conta e alimentando `CategoryMemory` — reaproveitando a mesma lógica de saldo e memória do módulo `transactions` |
| 5. Descarte | `DELETE /imports/:batchId` | Cancela um batch ainda `PENDING` |

**Nota de implementação — persistência do preview:** para não gravar linhas
"fantasma" no banco antes da confirmação, o endpoint de upload não deve
persistir as transações em si. Ele processa o arquivo e guarda o resultado
parseado associado ao `batchId` (cache em memória, arquivo temporário, ou
Redis se o projeto já tiver esse serviço), gravando no Postgres apenas na
confirmação. Isso evita rotina de limpeza de batches abandonados no banco.

## 6. Frontend

Tela nova em `/imports`:

1. Seletor de conta + input de arquivo (OFX ou CSV).
2. Tabela de preview: data, descrição, valor, dropdown de categoria (com a
   sugestão já aplicada conforme a tabela de `confidence` acima), badge
   "possível duplicata" com checkbox para incluir/excluir a linha.
3. Botão "Confirmar importação" → chama o endpoint de confirmação e
   redireciona para o extrato da conta.

## 7. Fases de Execução

A memória de categorização entra desde a Fase 1 — não como extra opcional
— porque precisa existir desde a primeira migration para já começar a
aprender com os lançamentos manuais feitos antes da primeira importação.

### Fase 1 — Modelagem e Parsing

- [ ] Migration com `ImportBatch`, `CategoryMemory` e os novos campos de
      `Transaction` (`source`, `externalId`, `importBatchId`).
- [ ] Habilitar extensão `pg_trgm` e criar o índice trigram em
      `transactions.description`.
- [ ] Serviço de parsing de OFX (ex: `node-ofx-parser`).
- [ ] Serviço de parsing de CSV (ex: `csv-parse`).
- [ ] Testes unitários com arquivos de exemplo reais de 2–3 bancos
      diferentes — formato de data e encoding variam bastante entre
      instituições, então vale testar com arquivos reais em vez de um
      único golden file.

### Fase 2 — API

- [ ] `POST /imports` — upload e parsing, sem persistência de transações.
- [ ] `GET /imports/:batchId` — preview com `suggestedCategoryId` e
      `confidence` por linha, via `suggestCategory()`.
- [ ] `POST /imports/:batchId/confirm` — criação das transações dentro de
      `prisma.$transaction`, atualizando saldo e `CategoryMemory`.
- [ ] `DELETE /imports/:batchId` — descarte de batch pendente.
- [ ] Função `upsertCategoryMemory()` chamada também no fluxo já existente
      de `POST /transactions` manual — ponto único de alimentação da
      memória.

### Fase 3 — Frontend

- [ ] Tela `/imports`: upload, tabela de preview, confirmação.
- [ ] Indicação visual clara da diferença entre sugestão `high` (pré-
      selecionada) e `low` (sugestão fraca).
- [ ] Fluxo de exclusão de duplicatas detectadas no preview.

## 8. Riscos e pontos de atenção

- **Deduplicação em CSV não é 100% confiável** — o hash sintético pode
  colidir em casos legítimos (duas compras idênticas no mesmo dia, no
  mesmo estabelecimento). O preview deve deixar claro que a marcação de
  duplicata é uma sugestão, revisável pelo usuário, não uma decisão
  automática irreversível.
- **Formato de data e encoding variam por banco**, mesmo dentro do mesmo
  padrão (OFX ou CSV). O parser precisa ser tolerante e testado com
  arquivos reais de mais de uma instituição antes de considerar a Fase 1
  concluída.
- **Falso positivo de alta confiança:** se o usuário categorizar um
  lançamento errado uma única vez, esse erro entra na memória com
  `occurrences: 1` e pode ser sugerido como `high` na próxima ocorrência
  idêntica. Vale considerar, numa iteração futura, um limiar mínimo de
  `occurrences` antes de tratar uma sugestão como `high` — não é bloqueante
  para o MVP desta feature, mas deve ficar registrado como melhoria
  conhecida.
