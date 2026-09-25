# Orçamentos por Categoria

> Depende dos módulos `categories`, `transactions` e do endpoint de
> dashboard já existentes — reaproveita a mesma agregação por categoria
> que o dashboard mensal já calcula, só adicionando o limite definido pelo
> usuário como referência de comparação.

## 1. Objetivo

Permitir que o usuário defina um limite mensal de gasto por categoria de
despesa, e que o sistema mostre o quanto já foi gasto em relação a esse
limite — com um ponto de extensão pronto para virar alerta proativo quando
o módulo de Notificações (próximo da fila) existir.

## 2. Por que agora, e não no MVP original

Um orçamento só é útil se os dados que o alimentam entram sem esforço
manual constante. Antes das features de importação (manual e por email),
todo gasto categorizado dependia de o usuário lançar na hora — um
orçamento nesse cenário vira só um número que ninguém atualiza de verdade.
Agora que a importação por email já traz transações categorizadas (com a
memória de categorização sugerindo automaticamente), o orçamento passa a
refletir a realidade sem esforço extra do usuário.

## 3. Decisão de modelagem: orçamento recorrente e versionado

A abordagem mais simples — um valor de limite fixo por categoria, sem
histórico — quebra assim que o usuário muda o limite no meio do ano: o mês
passado passaria a ser recalculado com o valor novo, distorcendo o
histórico. A abordagem escolhida usa um registro **versionado por
vigência**, comum em apps de orçamento maduros:

```
Categoria "Mercado"
  ├─ R$ 600,00   vigente de jan/2026 até jun/2026 (effectiveTo = 01/07/2026)
  └─ R$ 750,00   vigente a partir de jul/2026 (effectiveTo = null → ainda ativo)
```

Quando o usuário edita o limite de uma categoria, o registro atual é
"fechado" (`effectiveTo` recebe o primeiro dia do mês seguinte) e um novo
registro é criado a partir dali. **A mudança nunca é retroativa** — meses
já fechados continuam sendo avaliados contra o limite que estava vigente
naquele momento.

## 4. Modelagem de Dados

```prisma
model Budget {
  id            String    @id @default(uuid())
  amount        Decimal   @db.Decimal(12, 2)
  effectiveFrom DateTime  // primeiro dia do mês em que passa a valer
  effectiveTo   DateTime? // null = vigente até ser alterado ou removido
  createdAt     DateTime  @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  categoryId String
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@index([userId, categoryId, effectiveFrom])
  @@map("budgets")
}
```

**Sobre a restrição de "só um orçamento ativo por categoria":** o ideal
seria um índice único parcial (`WHERE effectiveTo IS NULL`), mas isso exige
SQL de migration escrito à mão, já que o Prisma não gera índices parciais
a partir do schema de forma direta. Para o MVP desta feature, a
verificação de que não existe outro orçamento ativo para a mesma categoria
fica na camada de serviço, antes de criar um novo registro. Migrar para um
índice parcial no banco é uma melhoria de robustez que pode entrar depois,
sem mudar o schema.

**Por que o orçamento só se aplica a categorias de despesa:** categorias
`INCOME` não têm um "limite" que faça sentido no mesmo formato — uma meta
de receita é conceitualmente diferente (mínimo a atingir, não máximo a não
ultrapassar) e fica fora do escopo desta feature. A validação de que
`category.type === 'EXPENSE'` acontece no DTO de criação.

## 5. Cálculo de progresso

Para um dado mês, o progresso de uma categoria é calculado reaproveitando
a mesma agregação que já existe no `GET /dashboard/summary`:

```ts
async function getBudgetProgress(userId: string, categoryId: string, month: string) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const budget = await prisma.budget.findFirst({
    where: {
      userId,
      categoryId,
      effectiveFrom: { lte: monthStart },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: monthStart } }],
    },
  });
  if (!budget) return null; // categoria sem orçamento definido para este mês

  const { _sum } = await prisma.transaction.aggregate({
    where: {
      userId,
      categoryId,
      type: 'EXPENSE',
      date: { gte: monthStart, lte: monthEnd },
    },
    _sum: { amount: true },
  });

  const spent = _sum.amount ?? new Prisma.Decimal(0);
  const ratio = spent.dividedBy(budget.amount).toNumber();

  return {
    categoryId,
    limit: budget.amount,
    spent,
    ratio,
    status: ratio >= 1 ? 'exceeded' : ratio >= 0.8 ? 'warning' : 'on_track',
  };
}
```

Os limiares (`0.8` para aviso, `1.0` para estourado) ficam como constantes
de aplicação — não no schema — para poderem virar configuráveis por
usuário em uma iteração futura sem migration.

## 6. Mapeamento de status para o Design System

Reaproveitando os tokens semânticos já definidos em
[`06-design-system.md`](./06-design-system.md), sem introduzir cor nova:

| Status | Cor | Token |
|---|---|---|
| `on_track` | Verde | `income` |
| `warning` | Âmbar | `pending` |
| `exceeded` | Vermelho | `expense` |

A escolha é deliberada: são literalmente as mesmas cores já usadas para
receita, pendência e despesa — o usuário já aprendeu esse vocabulário de
cor na tela de transações, e a tela de orçamento herda o mesmo
significado sem exigir uma legenda nova.

## 7. Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /budgets` | Cria um orçamento para uma categoria. Se já existir um ativo, fecha o anterior (`effectiveTo`) e cria o novo a partir do mês corrente |
| `GET /budgets?month=YYYY-MM` | Lista os orçamentos vigentes naquele mês, cada um já com `spent`, `ratio` e `status` calculados |
| `PATCH /budgets/:id` | Atalho para "editar valor" — internamente segue a mesma lógica de versionamento do `POST` (fecha e cria novo) |
| `DELETE /budgets/:id` | Encerra o orçamento (define `effectiveTo` como o mês corrente); a categoria volta a não ter limite a partir daí |

## 8. Ponto de extensão para Notificações (próxima feature da fila)

Em vez de acoplar lógica de envio de notificação diretamente no cálculo de
orçamento — o que exigiria retrabalho quando o módulo de Notificações for
implementado — esta feature apenas **emite um evento de domínio** sempre
que o `status` de um orçamento muda para `warning` ou `exceeded` pela
primeira vez naquele mês:

```ts
// Disparado a cada transação de despesa criada/confirmada (manual, import
// manual ou import por email), depois de recalcular o orçamento afetado.
eventEmitter.emit('budget.threshold_crossed', {
  userId,
  categoryId,
  month,
  status, // 'warning' | 'exceeded'
});
```

Nenhum listener existe ainda para esse evento — ele só fica disponível
para o módulo de Notificações se inscrever quando for construído,
seguindo o padrão de `EventEmitterModule` do próprio NestJS. Isso evita
que a feature de orçamento precise saber como uma notificação é enviada
(email, push, in-app), e evita que o módulo futuro de notificações precise
alterar a lógica de cálculo de orçamento para se conectar a ela.

Para não disparar o mesmo evento repetidamente a cada transação (ex: 5
compras no mesmo dia mantendo o status em `exceeded`), a checagem
compara o status **antes e depois** da transação — só emite quando há
mudança de faixa (`on_track → warning`, `warning → exceeded`), não a cada
recálculo.

## 9. Frontend

### 9.1 — Tela `/budgets`

- Lista de categorias de despesa, cada uma com:
  - Campo de valor do limite mensal (editável inline).
  - Barra de progresso colorida conforme a tabela da seção 6.
  - Valor gasto / valor limite, em texto (`R$ 480,00 de R$ 600,00`).
- Categoria sem orçamento definido aparece com um estado "Definir limite",
  sem barra de progresso.

### 9.2 — Dashboard (`/dashboard`)

- Nova seção "Orçamentos do mês", abaixo dos cards de resumo já
  existentes — reaproveitando o mesmo seletor de mês/ano que o dashboard
  já tem.
- Mostra só as categorias com orçamento definido, ordenadas pelas mais
  próximas de estourar primeiro (`ratio` decrescente).

## 10. Fases de Execução

### Fase 1 — Modelagem e Cálculo

- [x] Migration com o model `Budget`.
- [x] Validação de serviço: só permite orçamento em categoria `EXPENSE`,
      e impede criar um novo orçamento ativo se já existir outro vigente
      para a mesma categoria (até a versão com índice parcial existir).
- [x] Função `getBudgetProgress()` e testes cobrindo os três status
      (`on_track`, `warning`, `exceeded`) e o caso de categoria sem
      orçamento.

### Fase 2 — API

- [x] `POST /budgets` com a lógica de versionamento (fechar atual, criar
      novo).
- [x] `GET /budgets?month=YYYY-MM` retornando progresso calculado.
- [x] `PATCH /budgets/:id` e `DELETE /budgets/:id`.
- [x] Emissão do evento `budget.threshold_crossed`, com a comparação de
      status antes/depois da transação para evitar disparo repetido.

### Fase 3 — Frontend

- [x] Tela `/budgets` com edição inline de limites.
- [x] Componente de barra de progresso, usando as cores semânticas já
      definidas no design system (nenhum token novo).
- [x] Seção "Orçamentos do mês" no dashboard.

### Fase 4 — Preparação para Notificações

- [x] Confirmar que o evento `budget.threshold_crossed` está sendo emitido
      corretamente nos três fluxos que criam despesa (manual, import
      manual, import por email) — ainda sem nenhum listener consumindo,
      só validando que o evento dispara e carrega os dados certos.

## 11. Riscos e pontos de atenção

- **Sem índice parcial no banco, a garantia de "um orçamento ativo por
  categoria" depende inteiramente da camada de aplicação.** Uma escrita
  concorrente (ex: duas requisições quase simultâneas editando o mesmo
  orçamento) pode, em teoria, criar dois registros ativos. Baixo risco
  prático para uso doméstico single-user, mas vale registrar como dívida
  técnica conhecida.
- **Mudança de limite no meio do mês corrente não é retroativa por
  design** — se o usuário aumentar o limite de Mercado no dia 15, o mês
  corrente já teria sido reavaliado com o efeito começando dali. Vale
  decidir explicitamente (e documentar na UI) se "editar limite" se aplica
  do mês corrente em diante ou só a partir do mês seguinte — o desenho
  acima assume mês corrente em diante para simplicidade, mas isso é uma
  escolha de produto revisável.
- **Categorias excluídas com orçamento ativo:** como `Category` já tem
  `onDelete: Cascade` na relação com `Transaction`, é preciso decidir se
  excluir uma categoria também encerra o orçamento associado (cascade,
  como já modelado acima) ou se deveria bloquear a exclusão enquanto há
  orçamento ativo — mantém consistência com a decisão já pendente sobre
  exclusão de categoria registrada no roadmap do MVP original.
