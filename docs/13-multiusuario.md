# Multiusuário / Família

> Esta é a mudança estrutural mais profunda do backlog — toca praticamente
> todo o schema construído até aqui, porque tudo que hoje pertence a um
> `User` (contas, categorias, orçamentos, parcelamentos, recorrências,
> importações) passa a pertencer a um **espaço compartilhado**. Por isso
> ficou deliberadamente por último: as features anteriores já validaram o
> modelo de domínio (saldo, categorização, orçamento, agendamento) em
> cima de um dono único — reestruturar isso agora, com o domínio já
> maduro, é mais seguro do que teria sido no início.

## 1. Objetivo

Permitir que duas ou mais pessoas de uma mesma casa compartilhem as
mesmas contas, categorias, orçamentos e histórico de transações — em vez
de cada uma ter sua própria instância isolada do Orcadom.

## 2. Conceito central: `Household`

Hoje, `userId` é a fronteira de isolamento de dados em todo o sistema — é
o que o `JwtAuthGuard` extrai do token e o que toda query usa para
garantir que um usuário nunca veja dado de outro. Essa fronteira muda de
lugar: passa a ser o **`Household`** (o "espaço" compartilhado), e o
`User` deixa de ser dono direto de contas/categorias/etc. — ele só
**pertence** a um ou mais households.

```
Antes:  User ──dono direto──▶ Account, Category, Budget, Transaction...

Depois: User ──membro de──▶ Household ──dono──▶ Account, Category,
                                                 Budget, Transaction...
```

Um usuário pode pertencer a mais de um household (ex: gerencia as próprias
finanças e também ajuda a acompanhar as dos pais, em espaços separados),
mas cada requisição opera dentro de **um** household por vez — nunca
mistura dados de dois espaços na mesma consulta.

## 3. Modelagem de Dados

### 3.1 — Novos models

```prisma
enum HouseholdRole {
  OWNER   // pode convidar/remover membros, renomear o household
  MEMBER  // acesso completo aos dados financeiros, sem gerenciar membros
}

model Household {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())

  members HouseholdMember[]

  @@map("households")
}

model HouseholdMember {
  id       String        @id @default(uuid())
  role     HouseholdRole @default(MEMBER)
  joinedAt DateTime      @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@unique([userId, householdId])
  @@map("household_members")
}

enum InviteStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}

model HouseholdInvite {
  id        String       @id @default(uuid())
  email     String
  token     String       @unique
  role      HouseholdRole @default(MEMBER)
  status    InviteStatus @default(PENDING)
  expiresAt DateTime
  createdAt DateTime     @default(now())

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  invitedByUserId String

  @@map("household_invites")
}
```

### 3.2 — Alteração de escopo nas tabelas existentes

Toda tabela que hoje tem `userId` como dono direto passa a ter
`householdId` no lugar (ou além, quando faz sentido manter rastreabilidade
de quem agiu):

| Tabela | Mudança |
|---|---|
| `Account` | `userId` → `householdId` |
| `Category` | `userId` → `householdId` |
| `Budget` | `userId` → `householdId` (chave de vigência da seção 3 de `09-orcamentos.md` passa a ser `[householdId, categoryId, effectiveFrom]`) |
| `InstallmentPlan` | `userId` → `householdId` |
| `RecurringTransaction` | `userId` → `householdId` |
| `ImportBatch` | `userId` → `householdId` |
| `BankAccountMapping` | `userId` → `householdId` |
| `CategoryMemory` | `userId` → `householdId` — a memória de categorização passa a ser aprendida e compartilhada por todo o household (seção 8) |
| `UserImportAlias` → `HouseholdImportAlias` | Passa a existir **um alias por household**, não por usuário — qualquer membro pode encaminhar extratos para o mesmo endereço |
| `Transaction` | Ganha `householdId` (denormalizado, para evitar join em toda consulta), **mantém** `userId` — agora com o significado de "quem lançou/importou esta transação", útil para o household ver quem registrou o quê |
| `Notification` | Permanece por `userId` — cada membro recebe seu próprio aviso in-app, mesmo quando o evento é do household inteiro (seção 8) |

## 4. Autenticação: household ativo por requisição

O JWT continua carregando só a identidade do usuário (`sub: userId`) —
deliberadamente **sem** o household ativo dentro do token. Se o household
ativo fosse embutido no JWT, remover um membro não teria efeito até o
token expirar (até 15 minutos de acesso indevido, no pior caso). Em vez
disso, o household ativo é resolvido **a cada requisição**, por um header:

```
X-Household-Id: <uuid>
```

```ts
@Injectable()
export class HouseholdGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const householdId = req.headers['x-household-id'];
    if (!householdId) throw new BadRequestException('X-Household-Id ausente');

    const membership = await this.prisma.householdMember.findUnique({
      where: { userId_householdId: { userId: req.user.id, householdId } },
    });
    if (!membership) throw new ForbiddenException();

    req.household = { id: householdId, role: membership.role };
    return true;
  }
}
```

Esse guard roda **depois** do `JwtAuthGuard` (que já resolve `req.user`) e
**antes** de qualquer service — nenhum service volta a aceitar `userId`
ou `householdId` vindo de body/query, exatamente pela mesma razão de
segurança já registrada desde o MVP original (IDOR): a diferença é que
agora a verificação é de **pertencimento ao household**, checada em cada
requisição, não só de identidade.

### 4.1 — No frontend

O household ativo fica guardado no client (ex: `localStorage` +
contexto React), e o wrapper de `fetch` já existente (`lib/api-client`)
passa a anexar o header `X-Household-Id` automaticamente em toda chamada
— centralizado em um único lugar, para não depender de cada tela lembrar
de enviá-lo.

## 5. Endpoints novos

| Endpoint | O que faz |
|---|---|
| `POST /households` | Cria um novo household (o criador vira `OWNER`) |
| `GET /households` | Lista os households que o usuário logado integra |
| `PATCH /households/:id` | Renomeia (só `OWNER`) |
| `POST /households/:id/invites` | Convida por email (só `OWNER`) — gera `HouseholdInvite` com token e expiração |
| `POST /households/invites/:token/accept` | Usuário convidado aceita e vira `HouseholdMember` |
| `GET /households/:id/members` | Lista membros e papéis |
| `DELETE /households/:id/members/:userId` | Remove um membro (só `OWNER`; um `OWNER` não pode se auto-remover se for o único) |

## 6. Endpoints existentes — o que muda

Nenhuma rota existente muda de formato (`/accounts`, `/transactions`,
`/budgets` etc. continuam iguais). A mudança é interna: todo service que
hoje filtra por `where: { userId }` passa a filtrar por
`where: { householdId: req.household.id }`, resolvido pelo `HouseholdGuard`
— não pelo corpo da requisição.

## 7. Migração dos dados existentes

Como o MVP e todas as features anteriores já rodam em produção (ou em uso
pessoal) sob o modelo de dono único, a migração precisa ser feita em
passos, sem downtime destrutivo:

1. Adicionar as colunas `householdId` como **opcionais** em todas as
   tabelas afetadas (migration aditiva, sem quebrar nada em produção).
2. Rodar um script de backfill, uma vez, para cada `User` existente:
   - Criar um `Household` (ex: `"Família de {nome}"`, editável depois).
   - Criar um `HouseholdMember` com papel `OWNER` para esse usuário.
   - Atualizar todas as linhas de `Account`, `Category`, `Budget`,
     `InstallmentPlan`, `RecurringTransaction`, `ImportBatch`,
     `BankAccountMapping`, `CategoryMemory` e `Transaction` que pertenciam
     a esse `userId`, setando o `householdId` recém-criado.
   - Migrar `UserImportAlias` para `HouseholdImportAlias`, preservando o
     mesmo token (o endereço de encaminhamento que o usuário já configurou
     no banco continua funcionando sem ele precisar reconfigurar nada).
3. Só depois do backfill confirmado (contagem de linhas sem
   `householdId` = zero), promover a coluna para `NOT NULL` em uma
   segunda migration.
4. Deploy do código que passa a exigir `X-Household-Id` só acontece
   **depois** do passo 3 — nunca antes, para não quebrar requisições em
   trânsito durante a janela de migração.

## 8. Impacto em features já existentes

- **Orçamentos:** o evento `budget.threshold_crossed` passa a carregar
  `householdId` em vez de `userId`. O `NotificationsService` precisa fazer
  **fan-out**: buscar todos os `HouseholdMember` daquele household e criar
  uma `Notification` para cada um — cada membro é avisado individualmente,
  mesmo sendo o mesmo evento de orçamento compartilhado.
- **Memória de categorização:** passa a ser aprendida por household, não
  por indivíduo. Ganho real (um membro categoriza, todos se beneficiam da
  sugestão depois), mas com uma contrapartida — ver riscos, seção 9.
- **Importação por email:** o alias de importação passa a ser um por
  household. Qualquer membro pode encaminhar extratos para o mesmo
  endereço; o `Transaction.userId` de cada lançamento importado registra
  qual membro estava logado quando confirmou o batch (não quem encaminhou
  o email, que a API não tem como saber).
- **Parcelamento e Recorrência:** nenhuma mudança de lógica — só de
  escopo (`householdId` no lugar de `userId` na consulta).

## 9. Fases de Execução

### Fase 1 — Modelagem e migração de dados

- [ ] Migration aditiva com `Household`, `HouseholdMember`,
      `HouseholdInvite` e as colunas `householdId` opcionais nas tabelas
      da seção 3.2.
- [ ] Script de backfill (seção 7, passos 1–2), testado primeiro em
      ambiente de staging com uma cópia dos dados reais.
- [ ] Migration final tornando `householdId` obrigatório, só após
      validação de que o backfill rodou sem linhas órfãs.

### Fase 2 — Autenticação e guard de household

- [ ] `HouseholdGuard`, aplicado a todas as rotas que hoje dependem de
      `userId` para escopo de dado.
- [ ] Decorator `@CurrentHousehold()`, equivalente ao `@CurrentUser()` já
      existente.
- [ ] Endpoints de `households` (criação, listagem, convite, aceite,
      remoção de membro).

### Fase 3 — Adaptação dos módulos existentes

- [ ] Trocar todo filtro de `userId` por `householdId` nos services de
      `accounts`, `categories`, `transactions`, `budgets`,
      `installment-plans`, `recurring-transactions`, `imports`.
- [ ] Ajustar `CategoryMemory` e o fluxo de sugestão de categoria
      (`suggestCategory()`) para escopo de household.
- [ ] Migrar `UserImportAlias` para `HouseholdImportAlias`.

### Fase 4 — Notificações e frontend

- [ ] Fan-out de notificação por membro do household (seção 8).
- [ ] Frontend: contexto de household ativo + seletor (quando o usuário
      pertence a mais de um), header `X-Household-Id` centralizado no
      client HTTP.
- [ ] Tela de membros e convites (`/settings/household`).

## 10. Riscos e pontos de atenção

- **Esta é a migração de maior risco do projeto até aqui** — toca quase
  todas as tabelas de domínio simultaneamente. Vale rodar o backfill
  (Fase 1) em um ambiente de staging com uma cópia real dos dados antes de
  considerar essa fase concluída, não só testar com dados sintéticos.
- **Modelo de permissão é intencionalmente simples** (`OWNER`/`MEMBER`,
  sem granularidade por conta). Um cenário real e provável — "quero
  compartilhar a conta corrente do casal, mas manter meu cartão pessoal
  privado" — não é suportado nesta versão. Registrado como limitação
  conhecida, não como esquecimento; suportar isso exigiria permissão por
  conta, não por household inteiro, e é uma mudança de escopo maior.
- **Memória de categorização compartilhada pode propagar erro:** se um
  membro categoriza um lançamento errado, a sugestão errada passa a
  aparecer para todos os membros do household, não só para quem errou.
  Aceitável como trade-off do compartilhamento, mas vale deixar
  documentado — não é um bug se acontecer.
- **Disciplina do header no frontend:** como o `X-Household-Id` precisa
  estar em toda chamada autenticada, um esquecimento pontual (ex: uma
  chamada feita fora do client HTTP centralizado) gera um 403 confuso em
  vez de um erro claro de "esqueceu o header". Vale um teste automatizado
  específico garantindo que nenhuma chamada da aplicação escape do client
  centralizado.
- **Usuário que sai de um household mantém sua conta de login intacta**
  (o `User` não é deletado, só a `HouseholdMember` correspondente) — mas o
  que acontece com transações que ele registrou (`Transaction.userId`)
  permanece em aberto: ficam atribuídas a um usuário que não tem mais
  acesso ao household. Comportamento aceitável (preserva histórico), mas
  vale confirmar que a UI não quebra ao exibir um "lançado por" que não
  consegue mais resolver para um membro atual.
