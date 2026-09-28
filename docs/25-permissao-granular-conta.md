# Permissão Granular por Conta

> Detalhamento do item 6 do [roadmap para a 1.0](./15-roadmap-v1.md).
> Depende de Multiusuário (`13`) já em uso. **Revisa uma afirmação feita
> naquele documento** — seção 5 abaixo.

## 1. Objetivo

Permitir que uma conta específica dentro de um household seja restrita a
um subconjunto de membros — o caso real registrado desde `13`: "cartão
pessoal invisível para o resto da família".

## 2. Modelagem de Dados

```prisma
// Campo adicionado a Account:
//   isRestricted Boolean @default(false)

model AccountAccess {
  id        String   @id @default(uuid())
  grantedAt DateTime @default(now())

  accountId String
  account   Account @relation(fields: [accountId], references: [id], onDelete: Cascade)

  householdMemberId String
  householdMember   HouseholdMember @relation(fields: [householdMemberId], references: [id], onDelete: Cascade)

  @@unique([accountId, householdMemberId])
  @@map("account_access")
}
```

Uma conta com `isRestricted = false` (padrão) continua visível para todo
o household, exatamente como hoje — **nenhuma migração de dados é
necessária**, o comportamento atual é preservado automaticamente. Só
contas explicitamente marcadas como restritas passam a filtrar por
`AccountAccess`.

## 3. Ponto central: acesso é resolvido em um único lugar

Em vez de espalhar `WHERE isRestricted = false OR EXISTS (...)` em cada
service que hoje lista contas (accounts, transactions, installments,
recurring, dashboard), um único helper centraliza a resolução:

```ts
async function getAccessibleAccountIds(householdId: string, householdMemberId: string): Promise<string[]> {
  return prisma.account.findMany({
    where: {
      householdId,
      OR: [
        { isRestricted: false },
        { accountAccess: { some: { householdMemberId } } },
      ],
    },
    select: { id: true },
  }).then((rows) => rows.map((r) => r.id));
}
```

Todo service que hoje filtra só por `householdId` passa a filtrar também
por `accountId IN getAccessibleAccountIds(...)` — mesma disciplina de
centralização já usada pelo `HouseholdGuard` (`13`) e pela extension de
auditoria (`14`), para não depender de cada desenvolvedor lembrar de
aplicar o filtro certo em cada endpoint novo.

## 4. Endpoints

| Endpoint | O que faz |
|---|---|
| `PATCH /accounts/:id/restrict` | Define `isRestricted = true` + lista de `householdMemberId` com acesso (precisa incluir pelo menos quem está restringindo, para não se autoexcluir por engano) |
| `PATCH /accounts/:id/unrestrict` | Remove a restrição — volta a ser visível para todos |
| `GET /accounts/:id/access` | Lista quem tem acesso (só visível para quem já tem acesso à conta) |

## 5. Revisão necessária de `13-multiusuario.md`

A tabela de papéis registrada no relatório de produto afirmava
`OWNER: tudo do dinheiro`. Essa afirmação **deixa de ser
verdadeira** com esta feature: uma conta restrita é invisível até para o
`OWNER`, a menos que ele esteja explicitamente na lista de
`AccountAccess` — é o que faz a restrição valer como privacidade real
dentro da casa, não só entre "membro comum e dono". `13-multiusuario.md`
precisa de uma nota de atualização quando esta feature for implementada,
para não deixar essa afirmação desatualizada e enganosa.

## 6. Fases de Execução

1. **Modelagem e helper central** — migration, `getAccessibleAccountIds()`.
2. **Migração dos pontos de leitura** — todo service que lista
   contas/transações/parcelas/recorrências passa a usar o helper, não o
   filtro antigo por `householdId` isolado.
3. **Endpoints de restrição** — `restrict`/`unrestrict`/`access`.
4. **Frontend** — ação "Restringir conta" no detalhe da conta, seleção de
   membros; indicação visual de conta restrita na listagem.
5. **Atualização de `13-multiusuario.md`** — nota explícita sobre a
   mudança na seção 6.

## 7. Riscos e pontos de atenção

- **Retrofitting do filtro em todos os pontos de leitura é a parte de
  maior risco** — esquecer um endpoint (ex: um relatório exportado, item
  4) vazaria dado de uma conta restrita. Vale um teste de regressão
  específico enumerando todo endpoint que retorna dado escopado por
  conta, confirmando que nenhum ignora a restrição.
- **Conflito não resolvido com Orçamento:** `Budget` agrega gasto por
  **categoria**, não por conta — uma transação em uma conta restrita ainda
  entra no total de uma categoria compartilhada, o que pode indiretamente
  revelar que "algo" foi gasto ali, mesmo sem mostrar qual conta ou
  transação. Este é um limite real da privacidade oferecida por esta
  feature, não um bug — vale deixar isso claro para o usuário na UI de
  restrição ("o valor pode ainda influenciar orçamentos compartilhados"),
  em vez de prometer privacidade total que o sistema não entrega.
- **Saldo consolidado do dashboard passa a ser por usuário, não fixo por
  household** — quem não tem acesso a uma conta restrita vê um total
  diferente de quem tem. Isso é intencional, mas é uma mudança de
  comportamento perceptível que vale comunicar na interface (ex: "saldo
  das contas que você pode ver"), não deixar implícito.
