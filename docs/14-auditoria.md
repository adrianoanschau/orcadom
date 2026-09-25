# Auditoria e Rastreabilidade

> Feature transversal — não pertence a um módulo de domínio específico
> (como orçamento ou parcelamento), e sim a uma camada que observa
> mudanças em vários módulos ao mesmo tempo. Desenhada para já operar sob
> o modelo de [Multiusuário/Família](./13-multiusuario.md) (`householdId`
> como escopo), mas funciona igualmente bem antes dessa feature existir —
> o campo de household fica opcional justamente por isso.

## 1. Objetivo

Registrar **quem fez o quê, quando, e a partir de onde** — para toda
mudança relevante nos dados financeiros do usuário/household. Duas
motivações práticas, não só "boa prática de auditoria":

- **Multiusuário:** em um household compartilhado, "quem editou essa
  transação?" ou "quem removeu esse membro?" deixam de ser perguntas
  retóricas — viram algo que o próprio sistema precisa responder.
- **Depuração de automações:** com email, cron de parcelamento e cron de
  recorrência todos escrevendo dados sozinhos, um registro que distingue
  "isso foi um humano que editou" de "isso foi o job de recorrência que
  gerou" é o que torna um comportamento inesperado investigável, em vez de
  um mistério.

## 2. Decisão de modelagem: snapshot completo, não apenas diff

Duas formas de registrar uma mudança foram consideradas: guardar só os
campos que mudaram (`{ amount: { before: 50, after: 80 } }`) ou guardar o
estado completo do registro antes e depois. Optou-se por **snapshot
completo** (`before`/`after` como objetos JSON inteiros, não só os campos
alterados):

- É mais simples de implementar de forma genérica — não exige calcular
  diff campo a campo para cada tipo de entidade.
- Permite reconstruir o estado exato de um registro em qualquer ponto do
  tempo, sem depender de reprocessar uma cadeia de diffs em ordem.
- O custo extra de armazenamento é aceitável na escala de um app
  financeiro doméstico (não é um sistema de altíssimo volume de escrita).

## 3. Modelagem de Dados

```prisma
enum AuditAction {
  CREATE
  UPDATE
  DELETE
}

enum AuditSource {
  USER              // ação direta de um usuário autenticado, via frontend
  AUTOMATION_EMAIL  // originado pelo workflow de importação por email (n8n)
  CRON_INSTALLMENT  // job de postagem de parcelas
  CRON_RECURRING    // job de geração/postagem de recorrências
  SYSTEM            // qualquer outra rotina interna sem ator humano
}

model AuditLog {
  id         String      @id @default(uuid())
  entityType String      // nome do model afetado: "Transaction", "Account", "Budget", "HouseholdMember"...
  entityId   String
  action     AuditAction
  source     AuditSource
  before     Json?       // estado completo antes da mudança (ausente em CREATE)
  after      Json?       // estado completo depois da mudança (ausente em DELETE)
  metadata   Json?       // contexto extra: ex. importBatchId, recurringTransactionId
  createdAt  DateTime    @default(now())

  actorUserId String?
  actorUser   User?   @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  householdId String? // opcional: nulo se a entidade ainda não pertence a um household
  household   Household? @relation(fields: [householdId], references: [id], onDelete: SetNull)

  @@index([householdId, entityType, entityId])
  @@index([householdId, createdAt])
  @@map("audit_logs")
}
```

`entityType` é uma `String`, não um enum do Prisma — de propósito. Um enum
exigiria migration toda vez que um novo model entrasse na lista de
auditados; uma string validada contra uma lista de modelos permitidos em
código (seção 4) dá a mesma segurança sem esse custo de manutenção.

**Nenhuma operação de edição ou exclusão é exposta para `AuditLog`.** O
registro é criado apenas internamente (seção 4) e nunca alterado depois —
é o próprio propósito de um log de auditoria: se pudesse ser editado, não
seria confiável como rastro.

## 4. Onde a auditoria é capturada: Prisma Client Extension

Espalhar `prisma.auditLog.create(...)` manualmente em cada service (criar
transação, editar conta, remover categoria, etc.) seria fácil de esquecer
em algum lugar — e um log de auditoria que "às vezes" registra é pior do
que não ter nenhum, porque passa confiança falsa. Em vez disso, a captura
acontece em um único ponto central, via **Prisma Client Extension**, que
intercepta escritas nos models da lista auditada:

```ts
const AUDITED_MODELS = [
  'Transaction', 'Account', 'Category', 'Budget',
  'InstallmentPlan', 'RecurringTransaction', 'ImportBatch', 'HouseholdMember',
] as const;

export function auditExtension(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!AUDITED_MODELS.includes(model as any)) return query(args);
          if (!['create', 'update', 'delete'].includes(operation)) return query(args);

          const ctx = actorContext.get(); // ver seção 4.1
          const before = ['update', 'delete'].includes(operation)
            ? await prisma[model].findUnique({ where: args.where })
            : null;

          const result = await query(args);

          await prisma.auditLog.create({
            data: {
              entityType: model,
              entityId: result.id,
              action: operation.toUpperCase() as AuditAction,
              source: ctx?.source ?? 'SYSTEM',
              actorUserId: ctx?.userId ?? null,
              householdId: ctx?.householdId ?? result.householdId ?? null,
              before: before ? sanitize(before) : undefined,
              after: operation !== 'delete' ? sanitize(result) : undefined,
            },
          });

          return result;
        },
      },
    },
  });
}
```

`sanitize()` remove campos sensíveis antes de gravar (ex: nunca captura
`passwordHash`, mesmo que `User` um dia entre na lista auditada) — uma
lista de exclusão por model, mantida junto da lista de models auditados.

### 4.1 — Como o "ator" chega até a extension

A extension roda dentro do Prisma Client, sem acesso direto à requisição
HTTP. A ponte é feita por **contexto assíncrono** (`AsyncLocalStorage`),
populado uma vez por requisição:

```ts
// Middleware/interceptor global, logo após o HouseholdGuard
export const actorContext = new AsyncLocalStorage<{
  userId: string | null;
  householdId: string | null;
  source: AuditSource;
}>();

@Injectable()
export class ActorContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    return new Observable((subscriber) => {
      actorContext.run(
        {
          userId: req.user?.id ?? null,
          householdId: req.household?.id ?? null,
          source: req.headers['x-orcadom-api-key'] ? 'AUTOMATION_EMAIL' : 'USER',
        },
        () => next.handle().subscribe(subscriber),
      );
    });
  }
}
```

Para os jobs agendados (parcelamento, recorrência), o próprio job define o
contexto manualmente antes de rodar sua lógica, já que não existe
requisição HTTP nesse caso:

```ts
actorContext.run({ userId: null, householdId: recurring.householdId, source: 'CRON_RECURRING' }, async () => {
  await generateOccurrence(recurring);
});
```

## 5. Endpoints

| Endpoint | O que faz |
|---|---|
| `GET /audit-logs?entityType=Transaction&entityId=:id` | Histórico completo de mudanças de um registro específico — usado na tela de detalhe (ex: "ver histórico" de uma transação) |
| `GET /audit-logs?householdId=:id&from=&to=&limit=` | Feed de atividade do household inteiro, mais recente primeiro |

Ambos sempre escopados pelo `householdId` resolvido pelo `HouseholdGuard`
(ou pelo `userId`, em instalações que ainda não têm a feature de
multiusuário) — nunca por parâmetro aberto na URL sem validação de
pertencimento, mesma lógica de proteção já aplicada a todo o resto da
API.

## 6. Frontend

### 6.1 — Histórico por entidade

Nas telas de detalhe já existentes (transação, conta, orçamento), uma
seção ou aba "Histórico", mostrando as entradas de `AuditLog` daquele
registro em ordem cronológica, formatadas de forma legível — não o JSON
bruto:

```
Editado por Ana — 12/09 às 14:32
  valor: R$ 50,00 → R$ 80,00

Criado por Ana — 10/09 às 09:15
  via importação de extrato (Banco do Brasil)
```

A formatação de `before`/`after` em texto legível é feita por um
`auditMessageFormatter`, com um mapeamento por `entityType` — não tenta
ser genérico ao ponto de virar ilegível (`{"amount":{"before":50...}}` cru
não serve para ninguém).

### 6.2 — Feed de atividade do household

Tela `/settings/activity`: lista cronológica de todas as ações do
household — útil especialmente no contexto multiusuário, para qualquer
membro acompanhar o que os outros têm feito sem precisar abrir cada
entidade individualmente.

## 7. Fases de Execução

### Fase 1 — Modelagem e mecanismo de captura

- [ ] Migration com `AuditLog`, `AuditAction`, `AuditSource`.
- [ ] `AsyncLocalStorage` de contexto de ator + `ActorContextInterceptor`.
- [ ] Prisma Client Extension cobrindo a lista inicial de models
      auditados, com `sanitize()` removendo campos sensíveis.
- [ ] Testes confirmando que uma escrita dentro de `prisma.$transaction`
      (ex: criação de transação com atualização de saldo) também é
      capturada corretamente — a extension precisa funcionar tanto no
      client normal quanto no client transacional.

### Fase 2 — Jobs agendados

- [ ] `CRON_INSTALLMENT` e `CRON_RECURRING` definindo o contexto de ator
      manualmente antes de cada execução (seção 4.1).
- [ ] Confirmar que entradas geradas por job aparecem com `actorUserId`
      nulo e o `source` correto — nunca atribuídas a um usuário por
      engano.

### Fase 3 — API e formatação

- [ ] `GET /audit-logs` (por entidade e por household).
- [ ] `auditMessageFormatter`, com mapeamento inicial para os models mais
      usados (`Transaction`, `Budget`, `HouseholdMember`).

### Fase 4 — Frontend

- [ ] Seção "Histórico" nas telas de detalhe já existentes.
- [ ] Tela `/settings/activity` (feed do household).

## 8. Riscos e pontos de atenção

- **Crescimento de armazenamento ao longo do tempo.** Snapshot completo em
  cada escrita, em um app de uso diário, acumula volume real depois de
  alguns anos. Não é bloqueante para o MVP desta feature, mas vale
  registrar como ponto para revisão futura — ex: política de retenção
  (arquivar ou agregar entradas com mais de N anos), decidida depois de
  observar o volume real.
- **Correção do contexto de ator é crítica e fácil de quebrar
  silenciosamente.** Se algum caminho de código escrever no banco fora do
  `ActorContextInterceptor` (ex: um script de manutenção rodado
  manualmente, sem passar pelo fluxo de requisição), a entrada de auditoria
  cai em `source: SYSTEM` com ator nulo, mesmo tendo sido uma ação
  deliberada de alguém. Vale um teste específico garantindo que os
  principais fluxos (criação manual, import, automação de email, os dois
  crons) preenchem o contexto corretamente — não só confiar que "deveria
  funcionar".
- **A extension roda em toda escrita, adicionando uma consulta extra
  (`findUnique` para capturar o `before`) em updates e deletes.** Overhead
  aceitável na escala deste projeto, mas é um custo real de performance
  que cresce com o número de models auditados — não adicionar a lista
  models de baixo valor de auditoria (ex: `CategoryMemory`, que muda a
  cada transação categorizada e teria altíssimo volume de log para baixo
  retorno de rastreabilidade).
- **Dados sensíveis exigem revisão contínua da lista de exclusão em
  `sanitize()`**, não só na criação inicial — qualquer campo novo
  adicionado a um model já auditado (ex: um futuro campo de token ou
  segredo em `Account`) precisa ser avaliado antes de entrar em produção,
  para não vazar para dentro de um `before`/`after` do log.
