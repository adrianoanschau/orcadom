# Árvore de Categorias

> Evolução do módulo `categories` (`02-modelagem-dados.md`). Toca
> orçamentos (`09`), importação com memória de categorização (`07`),
> dashboard e relatórios. Escopado por `householdId` (`13`). Como a base
> ainda está limpa, **não há migração de dados nem backfill**: a migration
> é direta e o desenho não precisa carregar compatibilidade com dados
> existentes.

## 1. Objetivo

Permitir que uma categoria tenha subcategorias (ex: Mercado › Hortifruti,
Mercado › Açougue), em vez da lista plana atual diferenciada só por `type`
(`INCOME`/`EXPENSE`).

## 2. Decisões centrais

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde lançamentos podem apontar | **Qualquer nó** da árvore, não só folhas | Regra simples e sem estado intermediário inválido: uma categoria que ganha filhas continua válida para lançamentos |
| Profundidade máxima | `MAX_CATEGORY_DEPTH = 3` (raiz = nível 1), constante de código | Mais que isso deixa seletores e gráfico ilegíveis; é fácil de aumentar depois |
| Tipo da filha | Sempre igual ao `type` do pai | Evita receita dentro de despesa, o que quebraria orçamento e dashboard |
| Exclusão na hierarquia | `onDelete: Restrict` | Nunca apagar uma subárvore em cascata por acidente |
| Orçamento pai x filha | Ambos permitidos, independentes | Pai mede a subárvore inteira; filha mede só a dela |
| Seed | Categorias de sistema, planas | Subcategorias são criadas pelo usuário. O sistema não nasce com filhas |

## 3. Modelagem de Dados

```prisma
model Category {
  id    String       @id @default(uuid())
  name  String
  type  CategoryType
  icon  String?
  color String?
  isSystem  Boolean  @default(false)
  systemKey String?

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  parentId String?
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id], onDelete: Restrict)
  children Category[] @relation("CategoryTree")

  transactions Transaction[]

  // Unicidade de nome entre IRMÃS (mesmo pai). Não cobre raízes: NULL não colide.
  @@unique([householdId, parentId, name, type])
  @@unique([householdId, systemKey])
  @@index([householdId, parentId])
  @@map("categories")
}
```

A unique antiga `[householdId, name, type]` é **removida** — ela impediria
o mesmo nome em pais diferentes (ex: "Outros" dentro de Moradia e de
Lazer).

**Unicidade entre raízes** exige SQL escrito à mão na migration, porque o
Prisma não gera índice parcial e, no Postgres, `NULL` não colide em unique:

```sql
CREATE UNIQUE INDEX categories_root_name_type_key
  ON categories ("householdId", name, type)
  WHERE "parentId" IS NULL;
```

`CategoryMemory` **não muda** — continua por `categoryId`. A memória
aprendida em uma filha sugere a filha, não o pai.

## 4. Regras de domínio (validadas no service)

1. Filha e pai têm o mesmo `type` e o mesmo `householdId`.
2. Profundidade da subárvore resultante nunca excede `MAX_CATEGORY_DEPTH`
   — na criação e na movimentação.
3. **Mover** (`parentId` alterado) valida: sem ciclo (não pode virar
   descendente de si mesma), destino com mesmo `type`, e a subárvore
   movida cabe na profundidade máxima.
4. **Excluir** é bloqueado se tiver filhas **ou** se estiver em uso
   (`Transaction`, `InstallmentPlan`, `RecurringTransaction`, `Budget`).
5. `householdId` nunca vem do body — sempre do `HouseholdGuard`, mesma
   regra de segurança transversal do MVP.
6. Categoria `isSystem` não pode ser renomeada, recolorida, ter ícone
   alterado, movida nem excluída (403). O usuário pode criar filhas sob
   ela e mover uma categoria própria para dentro dela. Filha do usuário
   nasce com `isSystem = false`. `isSystem` e `systemKey` não entram no
   schema Zod.
7. Todo household novo recebe, na mesma transação da criação, as 22
   categorias de sistema (16 despesa, 6 receita), raízes, via
   `seedSystemCategories`. Rodar de novo não duplica.

## 5. Agregações: o ponto mais delicado

Toda lógica de árvore passa por **um helper central**, no mesmo espírito
de `getAccessibleAccountIds` (`25`) e do `HouseholdGuard` (`13`) — para
não depender de cada service reimplementar a travessia:

```ts
async function getCategorySubtreeIds(householdId: string, categoryId: string): Promise<string[]>
// retorna a própria categoria + todas as descendentes
```

| Ponto | Comportamento |
|---|---|
| `getBudgetProgress()` (`09`) | Orçamento do pai soma gasto dele + descendentes; orçamento da filha soma só a subárvore dela |
| `GET /dashboard/summary` | Mantém `groupBy` por `categoryId`; o rollup até a raiz é feito em memória e a resposta traz `children` para o drill-down |
| `GET /transactions` e relatórios (`23`) | Filtrar por uma categoria inclui descendentes (`includeDescendants`, padrão `true`) |
| Evento `budget.threshold_crossed` | Uma despesa em categoria filha recalcula o orçamento de **todos os ancestrais**, não só o da própria categoria |
| Filtro por permissão de conta (`25`) | Sem mudança — a árvore de categorias é ortogonal ao acesso por conta |

## 6. API

| Endpoint | Mudança |
|---|---|
| `POST /categories` / `PATCH /categories/:id` | Aceitam `parentId` opcional (schema Zod em `packages/types`, fonte única de front e back). `PATCH` com `parentId` diferente é "mover" (regra 3) |
| `GET /categories?type=` | Lista **plana** com `parentId`, `depth` e `isSystem` |
| `DELETE /categories/:id` | Acrescenta o bloqueio "tem filhas" ao bloqueio "em uso" |

`buildCategoryTree()` vive em `packages/types`, para o front montar a
árvore a partir da lista plana sem duplicar a lógica. A Auditoria (`14`)
já cobre `Category`: mover gera `UPDATE` com `before`/`after` mostrando a
mudança de `parentId`.

## 7. Frontend

- **`/categories`:** mantém as duas colunas Receita/Despesa, agora como
  árvore indentada com expandir/recolher. Ação "Adicionar subcategoria" em
  cada nó (oculta no nível máximo). A filha herda a cor do pai por padrão,
  editável. Categoria do sistema mostra o selo "Sistema" e não oferece
  editar nem excluir.
- **Seletor de categoria:** **um único componente compartilhado**, que
  mostra o caminho ("Mercado › Hortifruti") e é pesquisável. Substitui os
  selects atuais de lançamento, orçamento, recorrente, parcelado e prévia
  de importação.
- **Orçamentos:** em categoria pai, rótulo "inclui subcategorias".
- **Dashboard:** gráfico no nível raiz, com drill-down ao clicar.
- **Design system (`06`):** nenhum token novo, `min-h-11` nos alvos de
  toque, modais em tela cheia abaixo de `md`, sem rolagem horizontal da
  página.

## 8. Fases de Execução

### Fase 1 — Modelagem e regras

- [ ] Migration com `parentId`, nova unique de irmãs, remoção da unique
      antiga e índice único parcial das raízes (SQL manual).
- [ ] `MAX_CATEGORY_DEPTH` e validações de criação/movimentação/exclusão
      no service.
- [ ] `getCategorySubtreeIds()` com testes.

### Fase 2 — Agregações

- [ ] `getBudgetProgress()` somando a subárvore.
- [ ] Rollup e `children` em `GET /dashboard/summary`.
- [ ] `includeDescendants` em `GET /transactions` e nos relatórios.
- [ ] `budget.threshold_crossed` recalculando todos os ancestrais.

### Fase 3 — API e tipos

- [ ] Schemas Zod com `parentId`; `buildCategoryTree()` em
      `packages/types`.
- [ ] `GET /categories` com `depth`.

### Fase 4 — Frontend

- [ ] Árvore em `/categories`.
- [ ] Seletor compartilhado substituindo os selects existentes.
- [ ] Rótulo "inclui subcategorias" em orçamentos e drill-down no
      dashboard.

## 9. Testes obrigatórios

- Filha com `type` diferente do pai → erro.
- Mover criando ciclo (A dentro de A › B) → erro.
- Estouro de profundidade ao criar e ao mover subárvore → erro.
- Excluir com filhas → bloqueado; em uso → bloqueado.
- Orçamento do pai soma a subárvore; orçamento da filha soma só a dela.
- Despesa em filha dispara `threshold_crossed` para o orçamento do pai.
- Mesmo nome em pais diferentes → permitido; entre irmãs → erro; entre
  raízes → erro.
- Pai de outro household → erro (isolamento).

## 10. Fora de escopo

- Reordenação manual por drag-and-drop.
- Mover lançamentos em massa de uma categoria para outra.
- Subcategorias no seed. As categorias de sistema nascem planas.

## 11. Riscos e pontos de atenção

- **Mover uma categoria muda o rollup retroativamente.** Orçamentos e
  relatórios são calculados na consulta, então mover "Hortifruti" de
  Mercado para Lazer altera também o resultado de meses passados. É
  aceitável (a estrutura da árvore é a visão atual do usuário), mas deve
  constar na UI de mover e no changelog.
- **O índice parcial das raízes é fácil de esquecer** — o Prisma não o
  gera, e um `migrate reset` ou uma migration regenerada pode perdê-lo.
  Vale um teste que cria duas raízes com mesmo nome e `type` e espera erro.
- **Memória de categorização mais granular dilui sugestões:** com
  subcategorias, o mesmo estabelecimento pode se dividir entre pai e filha
  (ex: "Mercado" e "Hortifruti"), reduzindo as ocorrências de cada uma.
  Aceitável, e reforça a recomendação de preferir poucas categorias bem
  distintas.
- **Orçamento no pai e na filha ao mesmo tempo** pode parecer contagem em
  dobro para o usuário. Não é bug (são medidas independentes), mas a UI
  deve deixar claro quando o orçamento do pai inclui subcategorias.
- **Profundidade em nível 3 já pressiona o seletor em telas estreitas** —
  validar o caminho "A › B › C" no mobile (truncar o início, não o fim).
