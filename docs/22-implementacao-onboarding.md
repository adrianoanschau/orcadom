# Implementação do Onboarding (`0.12.0`)

> Guia de execução para implementar o que foi definido em
> [`20-onboarding.md`](./20-onboarding.md). Escrito como checklist
> acionável, no mesmo espírito de
> [`17-implementacao-versionamento.md`](./17-implementacao-versionamento.md)
> — a decisão de produto e o porquê já estão no documento de spec; aqui é
> só o que precisa ser construído, em que ordem, e como validar.

## 0. Estado assumido do repositório

- Produto em `0.11.0` (Metas de Economia entregue).
- Revisão de Autenticação/Sessão/Perfil já implementada, mas ainda sem
  changeset registrado (`21-autenticacao-sessao.md`, seção 8).
- Multiusuário (`13`), Auditoria (`14`) e Metas (`19`) já implementados —
  o cálculo de progresso do onboarding depende de `Account`,
  `Transaction`, `Budget`, `SavingsGoal`, `HouseholdImportAlias` e
  `HouseholdMember` já existirem exatamente como documentado.

## 1. Passo a passo

### 1.1 — Migration

```prisma
model UserOnboardingState {
  id          String    @id @default(uuid())
  dismissedAt DateTime?
  createdAt   DateTime  @default(now())

  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_onboarding_states")
}
```

```bash
pnpm --filter @orcadom/database exec prisma migrate dev --name add_onboarding_state
```

### 1.2 — Serviço de cálculo de passos (`apps/api`)

Criar `OnboardingModule` com um `OnboardingService` expondo
`getSteps(householdId: string)`, combinando as seis contagens em
**uma única consulta** por `Promise.all`, não seis chamadas sequenciais:

```ts
async getSteps(householdId: string) {
  const [hasAccount, hasTransaction, hasBudget, hasSavingsGoal, hasImportAlias, memberCount] =
    await Promise.all([
      this.prisma.account.count({ where: { householdId } }),
      this.prisma.transaction.count({ where: { householdId } }),
      this.prisma.budget.count({ where: { householdId } }),
      this.prisma.savingsGoal.count({ where: { householdId } }),
      this.prisma.householdImportAlias.count({ where: { householdId } }),
      this.prisma.householdMember.count({ where: { householdId } }),
    ]);

  return {
    hasAccount: hasAccount > 0,
    hasTransaction: hasTransaction > 0,
    hasBudget: hasBudget > 0,
    hasSavingsGoal: hasSavingsGoal > 0,
    hasImportAlias: hasImportAlias > 0,
    hasInvitedMember: memberCount > 1,
  };
}
```

### 1.3 — Endpoints

```ts
@Controller('onboarding')
export class OnboardingController {
  @Get('status')
  // retorna getSteps(household.id) + dismissedAt do usuário logado

  @Patch('dismiss')
  // upsert UserOnboardingState com dismissedAt = now()

  @Patch('resume')
  // upsert UserOnboardingState com dismissedAt = null
}
```

Usar `upsert` nos dois endpoints de PATCH — o registro pode não existir
ainda na primeira dispensa de cada usuário.

### 1.4 — Frontend: hook de dados

```ts
// apps/web/src/hooks/useOnboardingStatus.ts
export function useOnboardingStatus() {
  return useQuery({
    queryKey: ['onboarding', 'status'],
    queryFn: () => apiClient.get('/onboarding/status'),
  });
}
```

Invalidar essa query (`queryClient.invalidateQueries(['onboarding'])`)
nos pontos onde um passo pode ser concluído — mutações de
criar conta, criar transação, criar orçamento, criar meta, configurar
alias de email e convidar membro já existem; cada uma dessas mutações
passa a invalidar `['onboarding']` também, além do que já invalidava.

### 1.5 — Frontend: modal de boas-vindas

Componente exibido uma única vez após o primeiro login — condição de
exibição: `!hasAccount && !hasTransaction && !dismissedAt` (ainda não fez
nada e nunca dispensou o checklist). Fecha ao clicar em qualquer lugar ou
na ação principal; não persiste estado próprio — uma vez que `hasAccount`
vira verdadeiro, a condição de exibição já deixa de ser satisfeita
naturalmente.

### 1.6 — Frontend: card de checklist no dashboard

- Passos essenciais (seção 4.1 de `20-onboarding.md`) sempre visíveis
  primeiro.
- Passos de aprofundamento (4.2) em uma seção recolhida, aberta
  automaticamente só depois que os essenciais estiverem `true`.
- Cada item linkado à rota correspondente (tabela abaixo).
- Botão de dispensar chamando `PATCH /onboarding/dismiss`.

| Passo | Rota de destino |
|---|---|
| Criar a primeira conta | `/accounts/new` |
| Lançar a primeira transação | `/transactions/new` |
| Definir o primeiro orçamento | `/budgets` |
| Criar a primeira meta | `/savings-goals/new` |
| Configurar alias de email | `/settings/import-alias` |
| Convidar alguém | `/settings/household` |

### 1.7 — Frontend: variante para membro convidado

Na mesma renderização do card (não um componente separado): se
`hasAccount && hasTransaction` já vierem `true` na primeira carga de um
usuário que acabou de aceitar um convite, omitir esses dois itens da lista
e mostrar, no lugar, um texto fixo de orientação ("Explore o painel da
família", com link para `/dashboard`, e "Veja quem fez o quê", com link
para `/settings/activity`).

### 1.8 — Frontend: opção de retomar em Configurações

Em `/settings`, adicionar uma ação "Mostrar checklist de novo" que chama
`PATCH /onboarding/resume` e redireciona para `/dashboard`.

## 2. Ordem de execução recomendada

1. Migration (1.1).
2. Serviço + endpoints no backend (1.2, 1.3) — validar via
   Swagger/Postman antes de tocar no frontend.
3. Hook de dados (1.4).
4. Card de checklist (1.6) — construir antes do modal, porque o modal
   depende da mesma condição de "nada feito ainda" que o card já calcula.
5. Modal de boas-vindas (1.5).
6. Variante de convidado (1.7).
7. Opção de retomar em Configurações (1.8).
8. Validação (seção 3).
9. Changeset (`pnpm changeset`, tipo `minor`) cobrindo esta entrega — e,
   se ainda não tiver sido feito, um changeset separado para a revisão de
   Autenticação/Sessão/Perfil pendente (`21-autenticacao-sessao.md`,
   seção 8), já que as duas entregas competem pela mesma próxima release.

## 3. Critérios de validação

- [ ] Household recém-criado (sem conta, sem transação): checklist mostra
      os dois passos essenciais como pendentes, aprofundamento oculto.
- [ ] Após criar a primeira conta: passo correspondente muda para
      concluído **sem precisar recarregar a página** (confirma que a
      invalidação de query da seção 1.4 está correta).
- [ ] Após lançar a primeira transação: os dois essenciais ficam
      concluídos e a seção de aprofundamento se expande automaticamente.
- [ ] Dispensar o checklist (`PATCH /onboarding/dismiss`) esconde o card
      e o modal não reaparece em um novo login.
- [ ] `PATCH /onboarding/resume` via Configurações traz o card de volta,
      já refletindo o progresso real (não reseta nada).
- [ ] Usuário convidado que aceita convite para household com dados
      existentes vê a variante da seção 1.7, não os passos essenciais já
      concluídos por outra pessoa.
- [ ] Um segundo membro do mesmo household, que nunca dispensou o
      checklist, continua vendo o card mesmo depois que o primeiro membro
      dispensou o dele (confirma escopo por usuário, não por household).

## 4. Riscos específicos desta implementação

- **A invalidação de query espalhada em várias mutações (seção 1.4) é
  fácil de esquecer em uma delas** — se uma nova forma de criar conta ou
  transação for adicionada no futuro (ex: uma mutação em massa) sem
  invalidar `['onboarding']`, o card fica com informação desatualizada até
  a próxima navegação. Vale um teste automatizado que cubra isso, não só
  revisão manual.
- **`getSteps()` roda em toda visita ao dashboard** — com seis `count()`
  em paralelo, o custo é baixo, mas se mais passos de aprofundamento forem
  adicionados no futuro (conforme já previsto em `20-onboarding.md`,
  seção 4.2), vale reavaliar se ainda compensa calcular tudo a cada
  carregamento ou se algum cache curto se torna necessário.
- **Condição do modal de boas-vindas (seção 1.5) depende de
  `dismissedAt` já estar carregado antes de decidir se mostra** — uma
  race condition onde o modal pisca na tela antes da resposta de
  `/onboarding/status` chegar é um bug de UX plausível; garantir estado de
  carregamento explícito antes de decidir renderizar o modal.
