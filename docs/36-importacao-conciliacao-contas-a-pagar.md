# Importação resiliente a Contas a Pagar (conciliação)

> Complemento de [`07-importacao-extratos.md`](./07-importacao-extratos.md)
> e de [`35-contas-a-pagar.md`](./35-contas-a-pagar.md), parte do item 15
> de [`15-roadmap-v1.md`](./15-roadmap-v1.md). Corrige uma lacuna que
> Contas a Pagar transforma de rara em provável: a importação só reconhece
> duplicata por `externalId`. Vale para os dois canais que caem no mesmo
> preview — arquivo (`07`) e e-mail ([`08`](./08-integracao-email.md)) — e
> para a futura origem Open Finance
> ([`37`](./37-open-finance.md)).
>
> **Vai no mesmo Release PR de `35`.** Lançar Contas a Pagar sem este
> documento entrega a duplicação pronta.

## 1. Objetivo

Fazer o preview da importação reconhecer que uma linha do extrato é o
mesmo pagamento de um lançamento que já existe, ou de uma conta a pagar
pendente, e oferecer **vincular** em vez de criar um segundo lançamento —
sem nunca decidir sozinho.

## 2. O problema: quatro caminhos de duplicação

Causa comum: `07` (seção 3.1) deduplica por `@@unique([accountId, externalId])`,
e um lançamento digitado à mão — inclusive o que nasce de "marcar como
paga" — **nunca tem `externalId`**. A linha do extrato que cobre o mesmo
débito passa como se fosse nova.

| # | O que a pessoa faz | O que acontece hoje | Resolução |
|---|---|---|---|
| 1 | Marca a conta como paga no checklist; depois importa o extrato | A linha vira um **segundo** lançamento | O preview reconhece o lançamento da conta; **vincular** adota o `externalId` da linha (seção 7) |
| 2 | Importa o extrato; depois marca a conta como paga | O pagamento cria um segundo lançamento | O diálogo de pagamento oferece **vincular** ao lançamento importado (seção 8) |
| 3 | Importa o extrato com a conta ainda pendente | A linha entra como despesa avulsa e a conta continua pendente (e vira o caminho 2) | O preview sugere **pagar a conta** com a própria linha (seção 7) |
| 4 | Fatura: paga pelo checklist (transferência para o cartão); importa o extrato **do cartão** | A linha "pagamento recebido" vira uma `INCOME` no cartão e anula a transferência | A linha é reconhecida como espelho da transferência → **ignorar** (seção 7.4) |

## 3. Decisão central: o preview sugere, a pessoa escolhe, o backend revalida

| Abordagem | Como funciona | Por que não / por que sim |
|---|---|---|
| A — Heurística silenciosa | O backend descarta ou liga sozinho as linhas "parecidas" | Duas compras legítimas iguais no mesmo dia (dois cafés de R$ 12) somem sem aviso, e o erro só se desfaz mexendo no banco — o mesmo motivo pelo qual `07` proíbe gravar direto |
| **B — Matcher no preview, resolução explícita na confirmação** | O preview mostra "parece o pagamento de *X*"; a pessoa escolhe; o backend revalida tudo e executa | **Adotada.** Mantém a revisão humana obrigatória. A heurística só **sugere** (e pré-seleciona quando a confiança é alta) |

Princípios:

- `externalId` continua sendo o **único critério automático** de duplicata
  (igualdade exata). Tudo o mais é sugestão.
- Toda ligação é uma ação explícita na confirmação. O backend **recusa**
  qualquer ligação que o matcher não produziria — a UI não é confiável.
- Vincular **não altera** o lançamento existente (valor, data, categoria,
  descrição): só acrescenta o `externalId`.

## 4. Modelagem de Dados

Mudanças mínimas e aditivas. Nenhuma tabela nova, nenhum backfill.

```prisma
// Transaction ganha:
//   @@unique([fromAccountId, externalId])
//
// Por quê: transferência não usa `accountId` (só from/to), então o
// @@unique([accountId, externalId]) de 07 não protege uma TRANSFER
// importada contra reimportação — NULL não colide no Postgres. Pagar uma
// fatura pela importação (seção 7.4) cria exatamente isso. Linhas
// existentes não violam: externalId só existe em INCOME/EXPENSE
// importados, que têm fromAccountId nulo.

// ImportBatch ganha:
//   reconciledRows Int @default(0) // linhas vinculadas a lançamento existente
```

Contabilidade do lote: `importedRows` (criou lançamento — inclui
`PAY_BILL`), `duplicateRows` (ignoradas) e `reconciledRows` (vinculadas).

`35` já carrega `Bill.settlement` (`GENERATED` | `LINKED`), que é o que
permite desfazer um pagamento vinculado sem apagar o lançamento que veio
do extrato.

O selo **"Conciliado"** na lista de lançamentos é derivado: `source =
MANUAL` e `externalId` preenchido. Sem coluna.

## 5. O matcher

Função pura, testável sem banco: `matchImportRows(rows, candidates,
config)`. Roda em `GET /imports/:batchId` — recalculada a cada leitura e
não gravada, como `suggestCategory()` (`07`, seção 4.3).

### 5.1 — Candidatos (duas consultas por lote)

Sem N+1: uma consulta por tipo, cobrindo a janela de datas do arquivo.

- **Lançamentos existentes:** do household, `externalId IS NULL`,
  `postingStatus = POSTED`, que afetam a conta do lote `A` —
  `accountId = A` (INCOME/EXPENSE) ou `fromAccountId = A` /
  `toAccountId = A` (TRANSFER) —, com data em `[menor data da linha − 3d,
  maior + 3d]`. Já trazem `bill: { id, description }` para saber se
  vieram de uma conta.
- **Contas pendentes:** `PENDING`, visíveis ao membro (regra de `35`,
  seção 8), com `accountId` nulo ou igual a `A`, vencimento em `[menor
  data da linha − 45d, maior + 10d]`.

As duas consultas passam por `getAccessibleAccountIds` (`25`). Datas são
comparadas como **data pura em `America/Sao_Paulo`**, não como instante.

### 5.2 — Critérios

"Saída" = valor negativo na linha; "entrada" = positivo.

| Candidato | Condições | Confiança | Ação sugerida |
|---|---|---|---|
| **Lançamento vindo de conta** (`bill` vinculada), sem `externalId` | mesma conta; mesmo sentido; valor **exato**; data da linha a ≤ 3 dias da do lançamento; candidato único | `high` | `LINK_TRANSACTION` |
| **Lançamento manual comum**, sem `externalId` | as mesmas condições | **sempre `low`** | `IMPORT` (com a dica "parece já lançado") |
| **Conta pendente** | linha de saída; valor exato; data em `[venc − 5, venc + 15]`; candidato único | `high` | `PAY_BILL` |
| Conta pendente | valor dentro de ±15%, **ou** data só na janela larga `[venc − 10, venc + 45]`, **ou** vários candidatos | `low` | `IMPORT` |
| **Espelho de transferência**: `TRANSFER` com `toAccountId = A` | linha de entrada; valor exato; ≤ 3 dias; candidato único | `high` se a transferência veio de conta, senão `low` | `SKIP` / `IMPORT` |

**Por que lançamento manual comum nunca é `high`:** só o que nasceu de uma
conta a pagar carrega a intenção de que *aquele* débito do extrato é *este*
pagamento. Um lançamento digitado à mão pode coincidir em valor e data com
uma compra diferente. Para esses casos o preview só **avisa**; a decisão
fica com a pessoa, e o comportamento padrão continua sendo importar.

### 5.3 — Atribuição 1:1 e ambiguidade

- Cada candidato casa com **no máximo uma** linha. As linhas são
  percorridas por data e cada uma pega o candidato livre mais próximo; a
  semelhança da descrição normalizada (`normalizeDescription`, `07`
  seção 4.1) só **desempata** — nunca qualifica um candidato.
- Linha com **mais de um** candidato possível vira `low` e **nenhuma ação
  é pré-selecionada**: todos os candidatos aparecem e a pessoa escolhe.
  Exemplo: duas contas de R$ 100,00 pendentes e uma linha de R$ 100,00.

### 5.4 — Constantes (de aplicação, não schema; calibráveis na Fase 5)

```ts
export const RECONCILE_TX_DAYS = 3;                          // linha ↔ lançamento existente
export const BILL_MATCH_TIGHT = { before: 5, after: 15 };    // dias em torno do vencimento → high
export const BILL_MATCH_WIDE  = { before: 10, after: 45 };   // → low
export const BILL_AMOUNT_TOLERANCE = 0.15;                   // valor da conta é estimativa
```

### 5.5 — Saída

```ts
type RowMatch =
  | { kind: 'TRANSACTION'; transactionId: string; billId: string | null; matchConfidence: 'high' | 'low' }
  | { kind: 'BILL'; billId: string; matchConfidence: 'high' | 'low' }
  | { kind: 'TRANSFER_MIRROR'; transactionId: string; matchConfidence: 'high' | 'low' };

type RowReconciliation = {
  matches: RowMatch[];                                   // vazio = linha comum
  suggestedAction: 'IMPORT' | 'SKIP' | 'LINK_TRANSACTION' | 'PAY_BILL';
};
```

`suggestedAction` é `IMPORT` a menos que haja exatamente um match `high`
de um tipo pré-selecionável (tabela 5.2).

## 6. Preview (API)

`GET /imports/:batchId` — cada linha ganha `reconciliation`. O campo se
chama `matchConfidence` para não colidir com o `confidence` já existente,
que é o da **categoria** (`07`, seção 4.4):

```json
{
  "rowId": "r_14",
  "date": "2026-10-12",
  "description": "PGTO BOLETO COND EDIF AURORA",
  "amount": "-600.00",
  "suggestedCategoryId": "…",
  "confidence": "low",
  "reconciliation": {
    "suggestedAction": "PAY_BILL",
    "matches": [
      { "kind": "BILL", "billId": "…", "description": "Condomínio",
        "dueDate": "2026-10-10", "billAmount": "600.00", "matchConfidence": "high" }
    ]
  }
}
```

Precedência: linha cujo `externalId` já existe continua sendo "possível
duplicata" pelo mecanismo antigo e **não** entra no matcher.

## 7. Confirmação com resoluções

### 7.1 — Payload

`POST /imports/:batchId/confirm` recebe, por linha, uma ação (união
discriminada em `packages/types`, fonte única de front e back — `03`). Linha
sem `action` equivale a `IMPORT`, para não quebrar o cliente atual.

| Ação | Campos | Efeito | Contador |
|---|---|---|---|
| `IMPORT` | `categoryId?` | Como hoje (`07`): cria o lançamento, `source = IMPORTED`, `externalId`, alimenta a memória de categoria | `importedRows` |
| `SKIP` | — | Não grava | `duplicateRows` |
| `LINK_TRANSACTION` | `transactionId` | Acrescenta `externalId` e `importBatchId` ao lançamento existente. Exige valor **exato**. Não muda valor, data, categoria nem descrição | `reconciledRows` |
| `PAY_BILL` | `billId`, `categoryId?` | Cria o lançamento **a partir da linha** (valor e data da linha, `source = IMPORTED`, `externalId`) e quita a conta: `PAID` com `settlement = LINKED`. Com `targetAccountId` cria uma `TRANSFER` (7.4) | `importedRows` |

Em `PAY_BILL` o valor da linha vale, não o previsto na conta: a tolerância
de ±15% existe justamente porque `Bill.amount` é uma estimativa. Já
`LINK_TRANSACTION` exige valor exato porque o lançamento existente é a
fonte da verdade e não deve ser distorcido para bater com o extrato.

### 7.2 — Execução: validar tudo, depois gravar

```ts
async function confirmImport(householdId: string, batchId: string, actor: Actor, rows: ConfirmRow[]) {
  const parsed = await previewStore.get(batchId); // linhas do arquivo (07, seção 5)

  const result = await prisma.$transaction(async (trx) => {
    const batch = await getPendingBatch(trx, householdId, batchId);

    // Ordem de trava fixa — bills → transactions → accounts — a mesma de payBill (35),
    // para uma confirmação e um pagamento simultâneos não entrarem em deadlock.
    await lockByIds(trx, 'bills', idsOf(rows, 'PAY_BILL', 'billId').sort());
    await lockByIds(trx, 'transactions', idsOf(rows, 'LINK_TRANSACTION', 'transactionId').sort());

    // Fase 1 — valida TUDO antes de gravar qualquer coisa. O servidor re-deriva os
    // candidatos e só aceita ligação que o matcher produziria (seção 5, inclusive `low`).
    const valid = await findMatches(trx, householdId, actor, batch.accountId, parsed.rows);
    const conflicts = rows.filter((r) => !isStillValid(valid, r));
    if (conflicts.length) {
      throw new ConflictException({ code: 'RECONCILIATION_CONFLICT', rowIds: conflicts.map((c) => c.rowId) });
    }

    // Fase 2 — grava.
    const events: DomainEvent[] = [];
    for (const row of rows) { /* IMPORT | SKIP | LINK_TRANSACTION | PAY_BILL, abaixo */ }

    await trx.importBatch.update({ where: { id: batch.id }, data: { status: 'CONFIRMED', /* contadores */ } });
    return { events };
  });

  result.events.forEach((e) => eventEmitter.emit(e.name, e.payload)); // só depois do commit
}
```

`LINK_TRANSACTION`:

```ts
// `update` com filtro extra (e não `updateMany`): passa pela extension de auditoria (14).
// Se outra requisição já deu externalId ao lançamento, o filtro não casa, o Prisma lança
// P2025 e isso vira o 409 acima.
await trx.transaction.update({
  where: { id: row.transactionId, externalId: null },
  data: { externalId: line.externalId, importBatchId: batch.id },
});
```

`PAY_BILL`:

```ts
const { transaction, events: ev } = await transactionsService.createWithin(trx, householdId, actor.userId, {
  ...buildFromBill(bill, row),   // EXPENSE, ou TRANSFER se houver targetAccountId (7.4)
  amount: abs(line.amount),      // o valor real é o da linha, não o previsto
  date: line.date,
  source: 'IMPORTED',
  externalId: line.externalId,
  importBatchId: batch.id,
  memorySource: line.description, // 7.5
});
await trx.bill.update({
  where: { id: bill.id },
  data: { status: 'PAID', transactionId: transaction.id, settlement: 'LINKED' },
});
```

**Conflito nunca degrada para `IMPORT` em silêncio.** Se o estado mudou
entre o preview e a confirmação (a conta foi paga em outra aba, o
lançamento já foi vinculado), a confirmação inteira falha com `409` listando
as linhas, nada é gravado, e o front recarrega o preview. Degradar para
"importar como nova" é exatamente como a duplicata nasceria.

### 7.3 — Concorrência com o pagamento pelo checklist

Confirmar uma importação e `payBill` (`35`, seção 6.1) sobre a mesma conta
ao mesmo tempo é o cenário a testar. As duas usam `FOR UPDATE` na linha da
`Bill` e revalidam `status = PENDING` depois de travar: quem chega segundo
recebe `409` (na importação, `RECONCILIATION_CONFLICT`). O resultado é
sempre **um** lançamento para a conta.

### 7.4 — Fatura de cartão pela importação

`PAY_BILL` em uma conta com `targetAccountId` cria uma **`TRANSFER`** com
`fromAccountId` = conta do lote, `toAccountId` = `bill.targetAccountId`,
sem categoria e com o `externalId` da linha (protegido pelo novo
`@@unique([fromAccountId, externalId])`).

Isso corrige também um defeito antigo de `07`: sem esse caminho, a linha
"PAGAMENTO FATURA" do extrato da conta corrente entra como **despesa** e
dobra o gasto do cartão. E a linha-espelho no extrato do cartão (entrada
"pagamento recebido") casa com a `TRANSFER` pelo critério de espelho
(seção 5.2) e vem pré-selecionada como `SKIP`.

### 7.5 — A memória de categoria aprende o texto do banco

`createWithin` ganha um parâmetro opcional `memorySource` (padrão: a
`description` do lançamento). Em `PAY_BILL` o lançamento leva a descrição
amigável da conta ("Condomínio"), mas a memória de `07` indexa o texto
**do banco** — é ele que volta nas próximas importações. Por isso a memória
é alimentada com `line.description` normalizada. `LINK_TRANSACTION` faz o
mesmo, com a categoria do lançamento vinculado (quando houver).

## 8. Lado da conta: pagar quando a linha já foi importada (caminho 2)

Dois endpoints novos em `bills`:

| Endpoint | O que faz |
|---|---|
| `GET /bills/:id/match-candidates` | Lançamentos que poderiam ser o pagamento desta conta: visíveis (`25`), `POSTED`, **sem** conta vinculada, `EXPENSE` (ou `TRANSFER` para `targetAccountId`), valor exato (`high`) ou ±15% (`low`), data em `[venc − 10, venc + 45]`. Ordenados por proximidade, no máximo 5; inclui os importados e os manuais |
| `POST /bills/:id/link-transaction` | Corpo `{ transactionId }`. Trava a conta e o lançamento, valida que ele está entre os candidatos, e define `PAID` com `settlement = LINKED`. **Não cria lançamento.** Diferença de valor é aceita: a pessoa escolheu, e o lançamento é a verdade |

No diálogo "Confirmar pagamento" (`35`, seção 11.1): ao abrir, o front
chama `match-candidates`. Se houver **um** candidato `high`, aparece o
aviso "Já existe um lançamento parecido: *Condomínio · R$ 600,00 · 12/10
(importado)*", o botão primário passa a ser "Vincular a este lançamento" e
um link secundário oferece "Criar um novo lançamento mesmo assim". Sem
candidato, ou só `low`, o diálogo é o de sempre (os `low` aparecem como
lista recolhida).

## 9. Frontend

### 9.1 — Preview em `/imports`

- Linhas com `reconciliation.matches` ganham `StatusBadge`: **"Conta a
  pagar"** (`brand`), **"Já lançado"** (`pending`), **"Espelho de
  transferência"** (`transfer`). "Possível duplicata" continua só para
  `externalId` repetido. Nenhum token novo (`06`).
- Seletor de resolução por linha — o mesmo componente no cartão empilhado
  (abaixo de `md`) e na tabela (`md+`), com alvo de toque ≥ 44px. Opções,
  só as aplicáveis: *Importar como nova* · *Vincular a "Condomínio · 10/10 ·
  R$ 600,00"* · *Pagar "Condomínio"* · *Ignorar*. Começa na
  `suggestedAction`.
- Linha `low`: começa em *Importar como nova*, com o texto "Parece o
  pagamento de *X*. Escolha *Vincular* para conciliar."
- A barra de confirmação fixa (`18`, seção 12) ganha o resumo: `12 novas ·
  2 vinculadas · 1 conta paga · 1 ignorada`.
- `409 RECONCILIATION_CONFLICT`: recarrega o preview, destaca as linhas
  citadas ("Esta ligação mudou — revise") e **preserva as escolhas das
  outras linhas** no estado do cliente.

### 9.2 — Outras telas

- **`/transactions`:** `StatusBadge` `neutral` "Conciliado" em lançamento
  manual que recebeu `externalId`.
- **`/bills`:** conta paga por vínculo mostra "Pago via extrato"
  (`settlement = LINKED` e lançamento `IMPORTED`).
- **Diálogo de pagamento:** seção 8.

## 10. Impacto em outras partes

- **E-mail (`08`) e Open Finance (`37`):** nenhum código novo. Os dois
  criam `ImportBatch` pendente e caem no mesmo preview; herdam o matcher.
- **Auditoria (`14`):** `LINK_TRANSACTION` aparece como `Transaction`
  `UPDATE` (`before` sem `externalId`, `after` com). O
  `auditMessageFormatter` ganha "Conciliado com o extrato".
- **Observabilidade (`26`):** contadores
  `import_reconciliation_total{action,confidence}` e
  `import_reconciliation_conflict_total` — a base da calibração (Fase 5).
- **Permissão (`25`):** candidatos e os `billId`/`transactionId` do
  payload passam pelo mesmo filtro. Um id fora do que a pessoa enxerga cai
  no mesmo `RECONCILIATION_CONFLICT`, sem confirmar que existe.
- **Documento `07`:** ganha nota de atualização apontando para este.

## 11. Fases de Execução

### Fase 1 — Matcher e preview (somente leitura)

- [ ] Função pura `matchImportRows()` e constantes, com testes em tabela
      (seção 12).
- [ ] As duas consultas de candidatos, com filtro de permissão.
- [ ] `GET /imports/:batchId` devolvendo `reconciliation` por linha, com
      `matchConfidence` separado do `confidence` de categoria.

### Fase 2 — Confirmação com resoluções

- [ ] Migration: `@@unique([fromAccountId, externalId])` em `Transaction`
      e `ImportBatch.reconciledRows`.
- [ ] Schema Zod da união discriminada por `action`.
- [ ] `confirmImport()`: validação em duas passadas, travas em ordem
      fixa, as quatro ações, `409` estruturado, memória de categoria pelo
      texto do banco (`memorySource`).
- [ ] Testes da seção 12 que envolvem confirmação.

### Fase 3 — Lado da conta

- [ ] `GET /bills/:id/match-candidates` e
      `POST /bills/:id/link-transaction`.
- [ ] Teste do ramo `LINKED` do `unpay` (`35`, seção 6.3).

### Fase 4 — Frontend

- [ ] Seletor de resolução, selos e resumo na prévia de `/imports`.
- [ ] Tratamento do `409` preservando as escolhas.
- [ ] Aviso e botão "Vincular" no diálogo de pagamento; selos
      "Conciliado" e "Pago via extrato".

### Fase 5 — Calibração (depois de uso real)

- [ ] Ler as métricas por algumas semanas e ajustar janelas e tolerância.
      Avaliar a memória de padrões por conta (seção 14) se `low` for
      frequente demais para contas recorrentes.

Fases 1 a 4 entram no **mesmo Release PR** de `35` (padrão de acúmulo de
changesets descrito em `34`, seção 7). Fase 1 já depende de `Bill` e do
pagamento de `35` (Fases 1–2 de lá).

## 12. Testes obrigatórios

1. **Caminho 1:** conta paga pelo checklist + OFX com a linha → preview
   traz `TRANSACTION high`; confirmar `LINK_TRANSACTION` **não** cria
   lançamento, o saldo não muda e o `externalId` é preenchido. Reimportar
   o mesmo arquivo → a linha é duplicata pelo mecanismo antigo.
2. **Caminho 2:** lançamento importado, depois pagar a conta →
   `match-candidates` o traz; `link-transaction` não cria nada nem mexe no
   saldo.
3. **Caminho 3:** conta pendente + linha → `PAY_BILL` cria lançamento
   `IMPORTED` com `externalId`, conta `PAID` / `LINKED`; `unpay` só
   desvincula e o lançamento permanece.
4. **Caminho 4:** `PAY_BILL` em conta com `targetAccountId` cria `TRANSFER`
   com `externalId` (e reimportar não duplica, pelo novo unique); a linha
   do extrato do cartão vira `TRANSFER_MIRROR high` → `SKIP`; nenhuma
   `INCOME` criada.
5. **Ambiguidade:** duas contas de R$ 100 pendentes e uma linha → `low`,
   nenhuma ação pré-selecionada; escolha explícita funciona.
6. **1:1:** um candidato nunca casa com duas linhas iguais.
7. **Tolerância:** valor ±15% só como `low`; `PAY_BILL` grava o valor da
   linha, não o previsto.
8. **Lançamento manual comum** nunca vira `high` nem tem ação
   pré-selecionada.
9. **Estado mudou entre preview e confirmação:** conta paga por outra
   aba → `409` listando a linha; nada gravado (rollback total).
10. **Concorrência:** confirmação e `payBill` simultâneos sobre a mesma
    conta → exatamente um lançamento.
11. **Permissão:** candidatos de conta restrita não aparecem; `billId` ou
    `transactionId` invisíveis no payload → conflito, sem vazar existência.
12. **Ligação que o matcher não produziria** (id arbitrário, valor
    diferente em `LINK_TRANSACTION`, lançamento que já tem `externalId`) →
    recusada.
13. **`LINK_TRANSACTION` não altera** valor, data, categoria nem descrição.
14. **Eventos só depois do commit:** `PAY_BILL` em categoria com orçamento
    dispara `budget.threshold_crossed` como uma importação normal; rollback
    não emite.

## 13. Riscos e pontos de atenção

- **Falso positivo mescla dois pagamentos distintos.** Mitigado por: valor
  exato, candidato único, pré-seleção só para o que veio de uma conta
  (nunca para lançamento manual comum) e confirmação humana. Ainda assim,
  uma transferência de R$ 600,00 a um amigo na mesma janela do condomínio
  pode aparecer como "pagar *Condomínio*" — daí o seletor visível, não um
  efeito colateral escondido.
- **Janelas e tolerância são palpites iniciais.** Não há dado real que as
  justifique; a Fase 5 existe para calibrá-las pelas métricas, em vez de
  discutir números no escuro.
- **Preview obsoleto.** O estado muda entre o preview e a confirmação
  (outra aba, outro membro). O `409` com recarga é o preço de nunca
  degradar em silêncio.
- **Espelhos de transferência em geral ficam fora do `high`.** Só as
  transferências criadas por contas a pagar são pré-selecionadas como
  `SKIP`; uma transferência corrente → poupança digitada à mão aparece nos
  dois extratos e continua só com a dica (`low`).
- **A data do lançamento vinculado não muda.** Se o banco registra o
  débito 2 dias depois, o lançamento mantém a data da pessoa; numa virada
  de mês isso pode diferenciar relatórios do extrato. Aceito: reescrever a
  data de um lançamento existente é mais surpreendente que a diferença.
- **Hash sintético de CSV** (`07`, seção 8) continua podendo colidir; a
  adoção usa o hash da linha como qualquer outra importação.
- **Excluir um lançamento vinculado reabre a conta** (`35`, seção 6.3), e
  reimportar o arquivo traz a linha de volta sugerindo `PAY_BILL` de novo.
  É coerente, mas pode surpreender quem apagou "só para refazer".
- **Contas com `accountId` diferente da conta do extrato** não são
  candidatas no preview (seção 5.1). Quem pagou por outra conta cai no
  caminho 2: o diálogo de pagamento oferece vincular depois.

## 14. Fora de escopo

- **Memória de padrões por conta** (aprender que "PGTO BOLETO COND EDIF
  AURORA" é a conta "Condomínio" e vincular com `high` mesmo com valor
  variável). Evolução natural se a Fase 5 mostrar muitos `low` em contas
  recorrentes.
- Detecção geral de transferência entre contas próprias, com pré-seleção.
- Conciliação sem revisão humana (automática).
- `LINK_TRANSACTION` com diferença de valor (edite o lançamento antes).
- Casamento por descrição como critério qualificador.
- Ferramenta para limpar duplicatas **já criadas** antes desta feature.
- Mudar a data do lançamento para a do extrato ao vincular.
