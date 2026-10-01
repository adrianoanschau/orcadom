# Onboarding para Novos Usuários

> Detalhamento do item 3 do [roadmap para a 1.0](./15-roadmap-v1.md).
> Depende da Revisão de Design/UX (`18`) já concluída — o roteiro aponta
> para telas e fluxos específicos, então precisa de uma interface
> estável. Também já nasce incorporando Metas de Economia (`19`) como um
> dos passos de aprofundamento, por já estar implementada quando este
> plano foi desenhado.

## 1. Objetivo

Orientar quem acabou de criar conta (ou foi convidado para um household
existente) pelos primeiros passos reais de uso do Orcadom — sem deixar a
pessoa sozinha diante de um dashboard vazio, e sem impor um assistente
bloqueante que precise ser concluído antes de liberar o app.

## 2. Decisão central: checklist dispensável, não wizard bloqueante

Duas abordagens de onboarding foram consideradas:

| Abordagem | Como funciona | Por que não |
|---|---|---|
| Wizard bloqueante em tela cheia | Uma sequência de telas obrigatórias antes de liberar o dashboard | Contradiz a direção de design já estabelecida em `06-design-system.md` — "canvas claro e calmo", não um funil que força passos antes de deixar a pessoa explorar. Também não faz sentido para quem é convidado para um household que já tem dados |
| **Checklist de progresso, dispensável a qualquer momento** | Um card no próprio dashboard, mostrando passos com status (feito/pendente), que o usuário pode ignorar, fechar ou completar na ordem que quiser | Não bloqueia nada, respeita quem já sabe o que está fazendo, e se encaixa como mais um card do dashboard — nenhuma tela nova isolada |

A segunda abordagem foi adotada.

## 3. Decisão de modelagem: progresso é derivado, não armazenado

Assim como orçamento (`09`) e metas (`19`) calculam progresso a partir de
dados que já existem (transações, transferências) em vez de manter uma
segunda contabilidade paralela, o onboarding segue o mesmo princípio: cada
passo do checklist é considerado "concluído" checando se o dado
correspondente já existe no household — **não** por uma tabela de "passo
X foi marcado como feito".

```ts
async function getOnboardingSteps(householdId: string) {
  const [hasAccount, hasTransaction, hasBudget, hasSavingsGoal, hasImportAlias, hasInvitedMember] =
    await Promise.all([
      prisma.account.count({ where: { householdId } }).then((n) => n > 0),
      prisma.transaction.count({ where: { householdId } }).then((n) => n > 0),
      prisma.budget.count({ where: { householdId } }).then((n) => n > 0),
      prisma.savingsGoal.count({ where: { householdId } }).then((n) => n > 0),
      prisma.householdImportAlias.count({ where: { householdId } }).then((n) => n > 0),
      prisma.householdMember.count({ where: { householdId } }).then((n) => n > 1),
    ]);

  return { hasAccount, hasTransaction, hasBudget, hasSavingsGoal, hasImportAlias, hasInvitedMember };
}
```

A única coisa que **precisa** ser armazenada é a preferência de "dispensar
o checklist" — isso não é derivável de nenhum dado de domínio, é uma
escolha explícita da pessoa:

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

**Por que a dispensa é por usuário, não por household:** cada membro
decide por si se quer ver o checklist — se uma pessoa do household já
dispensou, isso não deveria esconder o checklist para outro membro que
ainda está se familiarizando com o app (situação real do onboarding
diferenciado, seção 5).

## 4. Passos do checklist

### 4.1 — Essenciais (aparecem primeiro, sempre)

1. **Criar a primeira conta financeira** → `hasAccount`
2. **Lançar a primeira transação** → `hasTransaction`

Deliberadamente **não existe** um passo "criar uma categoria" — todo
household novo já recebe as categorias de sistema (Moradia, Mercado,
Salário e as demais) na mesma transação do cadastro. O usuário pode
criar subcategorias, mas o checklist não pede isso: o passo estaria
sempre concluído sem ação dele.

### 4.2 — Aprofundamento (aparecem depois dos essenciais, todos opcionais)

3. **Definir o primeiro orçamento** → `hasBudget`
4. **Criar a primeira meta de economia** → `hasSavingsGoal`
5. **Configurar o alias de importação por email** → `hasImportAlias`
6. **Convidar alguém para o household** → `hasInvitedMember`

Esta lista é o ponto de extensão natural para as próximas features do
roadmap: quando Exportar Relatórios (item 4) ou Permissão Granular (item
6) forem implementadas, um passo correspondente pode entrar aqui sem
mudar a estrutura do checklist — é exatamente o motivo de ter esperado a
Revisão de Design (item 1) e ter Metas (item 2) já pronta antes de
desenhar isto: o roteiro nasce sabendo incorporar o que já existe, em vez
de precisar de retrabalho a cada feature nova.

## 5. Roteiro diferente por tipo de usuário

| Quem chega | O que vê |
|---|---|
| Criou um household novo | Checklist completo (seção 4), começando pelos essenciais |
| Foi convidado para um household existente | Checklist reduzido — pula "criar a primeira conta" e "lançar a primeira transação" se `hasAccount`/`hasTransaction` já forem verdadeiros (o household já tem dados); mostra só os passos de aprofundamento ainda não feitos, mais um item de orientação simples ("explore o dashboard", "veja o histórico de atividade do household" — este último apontando para a tela de auditoria, `14`) |

Essa distinção já cai naturalmente da lógica de "progresso derivado"
(seção 3): se o household convidante já tem conta e transação, esses dois
passos aparecem como concluídos automaticamente para o novo membro, sem
lógica condicional adicional — só o item de "convite" e a orientação extra
para quem chegou depois precisam de tratamento explícito.

## 6. Endpoints

| Endpoint | O que faz |
|---|---|
| `GET /onboarding/status` | Retorna os passos calculados (seção 3) para o household ativo, mais `dismissedAt` do usuário logado |
| `PATCH /onboarding/dismiss` | Marca o checklist como dispensado para o usuário logado |
| `PATCH /onboarding/resume` | Reverte a dispensa (caso o usuário queira ver o checklist de novo, mesmo já tendo escondido antes) |

Nenhum endpoint de "marcar passo como concluído" — completar um passo
acontece organicamente ao usar as features já existentes (criar conta,
lançar transação, etc.), nunca por uma ação dedicada de onboarding.

## 7. Frontend

### 7.1 — Boas-vindas pontual (uma vez)

Um modal simples, mostrado uma única vez, logo após o primeiro login —
duas ou três frases de boas-vindas e um botão de ação direta ("Criar
minha primeira conta"), não uma sequência de telas. Fecha e não volta a
aparecer (controlado pela própria existência de qualquer atividade —
depois do primeiro acesso, o checklist da seção 7.2 assume esse papel).

### 7.2 — Card de checklist no dashboard

- Mostra `N de M passos essenciais concluídos`, com os passos da seção 4.1
  primeiro; passos de aprofundamento (4.2) aparecem abaixo, em uma seção
  recolhida por padrão depois que os essenciais forem concluídos.
- Cada item do checklist é um link direto para a ação correspondente (ex:
  "Criar a primeira conta" → `/accounts/new`).
- Botão de dispensar sempre visível, sem exigir completar nada antes.
- Depois de dispensado, some do dashboard até o usuário decidir trazer de
  volta (ex: em `/settings`, uma opção "mostrar checklist de novo").

## 8. Fases de Execução

### Fase 1 — Modelagem e cálculo

- [x] Migration com `UserOnboardingState`.
- [x] Função `getOnboardingSteps()`, testada para household novo (tudo
      pendente), household com dados parciais, e household de membro
      convidado (passos essenciais já concluídos por outra pessoa).

### Fase 2 — API

- [x] `GET /onboarding/status`, `PATCH /onboarding/dismiss`,
      `PATCH /onboarding/resume`.

### Fase 3 — Frontend

- [x] Modal de boas-vindas (exibido uma vez).
- [x] Card de checklist no dashboard, com estado essencial/aprofundamento
      e ação de dispensar.
- [x] Roteiro diferenciado por tipo de usuário (seção 5).
- [x] Opção em `/settings` para trazer o checklist de volta depois de
      dispensado.

## 9. Riscos e pontos de atenção

- **Passos derivados de dados reais podem parecer "concluídos" por
  motivos não relacionados ao onboarding em si** — ex: um household que
  importa um extrato antigo com transações de meses atrás teria
  `hasTransaction: true` mesmo que ninguém tenha "aprendido" o fluxo de
  lançamento manual pela interface. Aceitável: o objetivo do checklist é
  sinalizar uso real do sistema, não certificar que a pessoa passou por
  cada tela manualmente.
- **Checklist não deve reaparecer de forma insistente depois de
  dispensado** — a dispensa é uma decisão explícita do usuário e precisa
  ser respeitada até ele mesmo pedir para trazer de volta (seção 7.2);
  reintroduzir o card automaticamente (ex: a cada nova feature lançada)
  quebraria essa confiança.
- **Lista de passos de aprofundamento (seção 4.2) tende a crescer a cada
  feature nova do roadmap** — sem um limite prático, o checklist pode
  virar uma lista longa e menos útil do que um resumo rápido. Vale revisar
  periodicamente (ex: a cada 3-4 itens novos do roadmap concluídos) se
  algum passo antigo já perdeu relevância e pode ser removido, em vez de
  só acumular.
