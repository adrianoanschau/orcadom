# Folha inferior e seletores de mês e categoria

> Três ajustes de interface no `apps/web`, em cima do mesmo componente.
> A folha do menu Mais deixa de ser um `<dialog>` com botão de fechar e
> passa a ser a base do seletor de mês (Painel) e do seletor de categoria
> (Lançamentos). Não muda API, schema nem regra de negócio.
> Depende do que já está em [`06-design-system.md`](./06-design-system.md),
> [`18-revisao-design-ux.md`](./18-revisao-design-ux.md) e
> [`33-arvore-categorias.md`](./33-arvore-categorias.md).

## 1. Objetivo

No celular, o menu Mais, o mês do Painel e a categoria do lançamento
abrem uma folha inferior coerente com o tema do app: alça no lugar do
x, gesto para fechar, animação e área segura. No desktop, o menu Mais
não existe (a sidebar continua); o mês e a categoria ganham um popover
que não sai da tela e se navega pelo teclado.

## 2. O que o código faz hoje

Não há shadcn/ui, Radix, `cmdk` nem `vaul` em `apps/web/package.json`.
O kit é próprio, em `apps/web/src/components/ui.tsx`, com Tailwind v4.
Os tokens vivem no `@theme` de `apps/web/src/app/globals.css` (`surface`,
`ink`, `brand`, `hairline`, raios `sm`/`md`/`lg`/`pill`). Não existe
variante escura: sem classe `dark:`, sem `prefers-color-scheme`. O app
é claro o tempo todo. `color-scheme` não está definido no `body`.

Breakpoints são os do Tailwind, já fixados em `06` e `18`:

| Prefixo | Largura  | Onde a casca usa                         |
| ------- | -------- | ---------------------------------------- |
| (base)  | < 640px  | Celular                                  |
| `sm`    | ≥ 640px  | Celular grande                           |
| `md`    | ≥ 768px  | `Modal` deixa de ser tela cheia          |
| `lg`    | ≥ 1024px | Sidebar; tab bar e menu Mais somem       |

### 2.1 — Menu Mais

`MoreSheet` em `apps/web/src/components/app-shell.tsx` é um
`<dialog>` nativo aberto com `showModal()`. A classe é
`fixed inset-x-0 bottom-0 … max-h-[85dvh] … rounded-t-lg bg-surface p-5
backdrop:bg-ink/40 lg:hidden`. O cabeçalho tem o título "Mais" e um
botão com `CloseIcon` (`aria-label="Fechar"`). Esc fecha, porque o
dialog faz isso. Toque no fundo não fecha. Não há alça, nem arrastar,
nem animação de entrada/saída. O conteúdo (grupos de `moreNav` em
`apps/web/src/components/nav.ts`, mais `UserMenu variant="sheet"`) rola
dentro da folha. Falta `pb-[env(safe-area-inset-bottom)]`: a tab bar
tem esse recuo, a folha não. Com a folha aberta ela cobre a tab bar
(`z-40` contra `z-20`) e o último item encosta no indicador do iPhone.

`showModal()` já prende o foco, trava a rolagem da página na maior
parte dos browsers e fecha no Esc. Não segue o dedo.

Abaixo de `lg` a navegação é a tab bar (Painel, Lançamentos, Importar,
Mais). De `lg` para cima a sidebar fica, com `AppVersion` no rodapé.
Isso não muda.

### 2.2 — Mês

`MonthInput` em `apps/web/src/components/date-fields.tsx` é o controle
do Painel (`apps/web/src/app/(dashboard)/dashboard/page.tsx`) e também
de Orçamentos (`apps/web/src/app/(dashboard)/budgets/page.tsx`). Os dois
passam `value` no formato `YYYY-MM` (`currentMonth()` em
`apps/web/src/lib/format.ts`).

O painel do mês é `absolute right-0 z-50 mt-1 w-72`: a borda direita
cola no botão e o painel cresce para a esquerda. No cabeçalho do Painel
o título quebra a linha no celular, o controle de `min-w-52` (13rem)
vai para a esquerda e os 18rem do painel atravessam a borda da tela.
Não há detecção de colisão. O painel já é o que se quer no desktop: ano
com ‹ › e grade `grid-cols-3` de meses abreviados via `Intl`
(`month: 'short'`, locale de `useLocale()`, padrão `pt-BR`). O mês
selecionado usa `bg-brand text-white`. Não há atalho "Mês atual", nem
setas ao lado do gatilho, nem setas do teclado entre os meses. Os ‹ ›
do ano são `NavButton` com `size-9` (36px), abaixo do alvo de 44px
(`min-h-11`) do design system.

A API não limita o ano. `dashboardQuerySchema` em
`packages/types/src/query.types.ts` (e o mês de orçamento) só exige
`/^\d{4}-(0[1-9]|1[0-2])$/`. Não existe consulta de "primeiro
lançamento". O `MonthInput` deixa o ano correr sem teto.

`DateInput`, no mesmo arquivo, é o calendário de dia. Fica fora desta
entrega.

### 2.3 — Categoria

`CategorySelect` em `apps/web/src/components/category-select.tsx` não é
um `<select>`. O botão mostra o caminho (`categoryPath`, "Mercado ›
Hortifruti") com o truque de `[direction:rtl]` para cortar o começo e
preservar a folha — o cuidado da seção 11 de `33`. Aberto, o painel
entra no fluxo (`mt-1`, empurra o formulário), com busca e `role="listbox"`.
A indentação é `12 + (depth - 1) * 12`. A lista vem de `GET /categories`,
plana, com `parentId` e `depth` (`apps/web/src/lib/models.ts`). A API
ordena por `type` e `name` (`categories.service.ts`); o componente
reordena pelo caminho em `pt-BR`. `aria-selected` existe e não muda a
cor. Não há Esc, nem setas, nem `aria-haspopup`. Clique fora fecha.

Quem usa o mesmo componente:

| Tela | Onde o campo está |
| --- | --- |
| Lançamentos, filtro | Página, fora de modal |
| Lançamentos, formulário | `Modal` em `transactions/page.tsx` |
| Recorrentes | `Modal` em `recurring/page.tsx` |
| Categorias, "Categoria pai" | `Modal` em `categories/page.tsx` |
| Importação, prévia | Cartões / tabela, fora de modal |

`buildCategoryTree()` está em `packages/types` (`category.types.ts`).
`MAX_CATEGORY_DEPTH` é 3.

## 3. Decisões

| Decisão | Escolha | Por quê |
| --- | --- | --- |
| Folha | `vaul`, embrulhado como `BottomSheet` em `ui.tsx` | Gesto com limiar e velocidade, briga de rolagem no iOS e foco já estão resolvidos. O Drawer do shadcn é esse wrapper; trazer o CLI, `cva` e `cmdk` criaria um segundo kit. O `<dialog>` atual não segue o dedo |
| Onde o `vaul` entra | Só a folha. `Modal` continua `<dialog>` | Formulário longo no celular segue tela cheia, como `06` e `18` já fixaram |
| Menu Mais no desktop | Igual ao de hoje | A sidebar de `lg` cobre os mesmos destinos. A folha segue `lg:hidden` |
| Mês no desktop | O mesmo `MonthInput`, com colisão, teclado, "Mês atual" e ‹ › no gatilho | A grade 3×4 já existe. O buraco é o `right-0`, não a metáfora |
| Mês no celular | Folha com duas colunas (mês, ano), snap no item central, "Confirmar" | A grade de 18rem é o que sai da tela. A roleta cabe na folha |
| Troca de layout | `useMediaQuery('(min-width: 768px)')` | O corte do `Modal` já é `md`. O menu Mais continua no corte `lg`, porque segue a tab bar |
| Categoria | Um `CategorySelect`, dois invólucros, o mesmo miolo | `33` já pediu um seletor só. Bifurcar por tela duplica a árvore |
| Categoria dentro de `Modal` | Painel dentro do `<dialog>`, sem segundo portal | `showModal()` deixa o resto da página inerte. Um portal no `body` não recebe clique nem foco |
| Recentes | `localStorage`, no máximo 5, por espaço | Não há contagem de uso na API. "Mais usadas" exigiria endpoint. Recente é barato |
| Ano mínimo e máximo | 2000 até o ano corrente + 1, só na UI | A API aceita qualquer ano de 4 dígitos e não há dado de "primeiro mês". A janela cobre histórico e o mês que vem de orçamento |
| Tema | Claro, tokens atuais | Não há tema escuro para respeitar |
| Release | Uma versão, `0.18.0`, depois das três fases | Ver seção 7 |

## 4. Fase 1 — `BottomSheet` e menu Mais

A fase 1 entrega o componente e troca o `MoreSheet`. As fases 2 e 3
importam esse componente. Sem a fase 1 mergeada, as outras não abrem.

### 4.1 — Dependência

Adicionar `vaul` em `@orcadom/web`. Ele puxa `@radix-ui/react-dialog`.
Não adicionar `cmdk`, `class-variance-authority`, `tailwind-merge` nem
`components.json`.

`BottomSheet` em `apps/web/src/components/ui.tsx`:

```tsx
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
})
```

Por dentro, o root do `vaul` com direção de baixo, overlay e conteúdo.
O título visível é o `Drawer.Title` (`aria-labelledby`, `role="dialog"`,
`aria-modal="true"`). Classes nossas: `bg-surface text-ink rounded-t-lg`,
overlay `bg-ink/40`, `z-50` (acima da tab bar `z-20` e do banner PWA
`z-30`). `max-h-[85dvh]`, como a folha de hoje.

### 4.2 — Alça, gesto e fechamento

O x sai do menu Mais. No topo, centralizada, uma barra (`h-1 w-9
rounded-pill bg-hairline`) dentro de um botão com área de 44px
(`min-h-11`) e `aria-label="Fechar"`. Enter ou Espaço nesse botão fecha.
Arrastar para baixo fecha ao passar o limiar ou com velocidade
suficiente — o padrão do `vaul`, sem número mágico calibrado no escuro.
Arrastar uma lista que não está no topo rola a lista; no topo, fecha a
folha. Toque no overlay fecha. Esc fecha.

Botão voltar do Android: ao abrir, `history.pushState` com uma marca
desta folha. `popstate` dessa marca chama `onClose` e não navega. Se o
fechamento veio da alça, do gesto, do overlay ou do Esc, `history.back()`
só quando o estado do topo é o que a folha empurrou. Um flag impede o
laço `back` → `popstate` → `back`. Não usar `router.back()` do Next. O
segundo voltar, com a folha já fechada, sai da página como hoje.

### 4.3 — Movimento, área segura, foco, rolagem

- Entrada sobe, saída desce, por volta de 200ms. Com
  `prefers-reduced-motion: reduce`, sem `transform`: a folha aparece e
  some. Se o `vaul` animar mesmo assim, cortar a transição no
  `[data-vaul-drawer]` dentro desse media query.
- `padding-bottom: env(safe-area-inset-bottom)` no conteúdo. O topo da
  folha fica abaixo de `env(safe-area-inset-top)` quando ela encosta na
  status bar.
- Foco entra na folha ao abrir e volta ao botão Mais ao fechar. Tab não
  escapa.
- A página atrás não rola (`body` travado pelo `vaul`,
  `overscroll-behavior: contain` no miolo).

### 4.4 — Menu Mais

`MoreSheet` passa a renderizar `BottomSheet` com título "Mais" e o mesmo
miolo de hoje (`moreNav` + `UserMenu variant="sheet"`). Link continua
fechando a folha. A classe `lg:hidden` permanece: em desktop não há
gatilho e a folha não aparece. `Modal` não muda e segue com o x.

### 4.5 — Tema claro num aparelho escuro

Os tokens são claros. Com o sistema operacional em modo escuro, a folha
e os controles dela continuam claros. Se o campo nativo (fase 3) ou a
barra do sistema escurecerem a folha, `color-scheme: light` no
`BottomSheet`. Não criar tema escuro do produto.

### 4.6 — Tarefas

- [ ] `vaul` em `@orcadom/web` e `BottomSheet` em `ui.tsx`.
- [ ] `MoreSheet` usa `BottomSheet`; o x sai; a alça entra.
- [ ] Overlay, Esc, voltar do Android, gesto, foco, rolagem, área segura,
      reduced motion.
- [ ] Desktop `lg` sem folha e sem regressão da sidebar.

## 5. Fase 2 — Seletor de mês

Um `MonthInput` só. Abaixo de `md`, folha. De `md` para cima, popover.
Vale para o Painel e para Orçamentos, porque os dois já usam o mesmo
componente. `DateInput` não entra.

### 5.1 — Hook

`apps/web/src/hooks/use-media-query.ts`, com `useSyncExternalStore` e
`matchMedia`. A fase 3 reutiliza. O painel só monta depois do clique, no
cliente, então não há HTML de popover no servidor para divergir.

### 5.2 — Janela de anos

Constante no `date-fields.tsx`: de 2000 até o ano corrente + 1,
inclusive. ‹ ›, roleta e grade param na borda (`disabled` +
`aria-disabled`). Não mudar o Zod. Se um valor já aberto estiver fora
da janela, o gatilho ainda o mostra; as setas só caminham para dentro.

Não buscar o menor mês dos lançamentos. Isso seria endpoint novo para
um limite que a tela não precisa.

### 5.3 — Celular: roleta

`BottomSheet` com título "Mês". Duas colunas, mês e ano, cada item com
altura fixa de pelo menos 44px. `scroll-snap-type: y mandatory` e o item
ativo no centro. Uma faixa atrás do item central
(`bg-brand-tint`, `pointer-events-none`). Fade em cima e embaixo com
`mask-image`. Nomes longos via `Intl` (`month: 'long'`), no locale do
app — em `pt-BR`, "janeiro", não uma lista hardcoded.

O mês do Painel não muda enquanto a roleta gira. "Confirmar" (`Button`
primário, largura cheia) grava `YYYY-MM` e fecha. Fechar pela alça, pelo
gesto, pelo fundo ou pelo Esc descarta o rascunho. "Mês atual" leva as
duas colunas a `currentMonth()` e deixa a folha aberta, para a pessoa
ver onde caiu antes de confirmar.

Cada coluna é `role="listbox"` (`aria-label` "Mês" e "Ano"), opção com
`role="option"` e `aria-selected` no item central. Setas movem a
seleção e a rolagem acompanha. Não depender só do gesto para quem usa
leitor de tela.

### 5.4 — Desktop: a grade que já existe, sem sair da tela

O popover deixa de ser `absolute right-0`. Um `AnchoredPanel` (no
próprio `date-fields.tsx`, exportado para a fase 3) posiciona o painel
como filho do gatilho, para continuar dentro de um `<dialog>` se um dia
precisar:

1. Alinha pela esquerda do gatilho e cresce à direita.
2. Se estourar a direita da viewport, alinha pela direita do gatilho e
   cresce à esquerda.
3. Se ainda estourar, encosta com 8px de margem e limita a largura a
   `calc(100vw - 16px)`.
4. Se não couber para baixo, abre para cima.

Medir com `getBoundingClientRect` e atualizar em resize e scroll. Sem
Floating UI.

O miolo continua: ano com ‹ › (`min-h-11`, não `size-9`) e grade 3×4.
Nome abreviado por `Intl` (`month: 'short'`), com `capitalize`, no
locale do perfil. Selecionado: `bg-brand text-white`. O mês corrente,
quando não é o selecionado: `bg-brand-tint text-brand`. Clique grava e
fecha, como hoje.

"Mês atual" no rodapé do popover grava `currentMonth()` e fecha.

Teclado, com o popover aberto e o foco na grade:

| Tecla | Efeito |
| --- | --- |
| Seta ← → | Mês anterior / próximo, atravessando o ano |
| Seta ↑ ↓ | Três meses (a coluna da grade), atravessando o ano |
| Enter | Grava o mês focado e fecha |
| Esc | Fecha sem gravar |

Ao abrir, o foco vai para o mês já selecionado.

Ao lado do gatilho, nos dois breakpoints, ‹ e › com `min-h-11` e
`aria-label` "Mês anterior" / "Próximo mês". Eles gravam na hora, sem
abrir a folha nem o popover, e param na janela da seção 5.2. O grupo não
pode criar rolagem horizontal da página; no cabeçalho do Painel ele pode
quebrar a linha, como o `PageHeader` já quebra.

### 5.5 — Tarefas

- [ ] `useMediaQuery`.
- [ ] `AnchoredPanel` e a grade com colisão, teclado e "Mês atual".
- [ ] Roleta na folha, com rascunho e "Confirmar".
- [ ] ‹ › no gatilho, janela 2000…ano+1.
- [ ] Painel e Orçamentos, sem edição de página além do que o componente
      já recebe.
- [ ] Teste de unidade da janela e do passo de mês (vitest em
      `apps/web`). O gesto fica no checklist manual.

## 6. Fase 3 — Seletor de categoria

O miolo sai de `CategorySelect` para um `CategoryOptions` no mesmo
arquivo: busca, recentes, árvore. O invólucro escolhe a casca pelo hook
da fase 2. Os cinco call sites da seção 2.3 mudam juntos, porque o
componente é um só. Lançamentos é o fluxo que o checklist percorre por
inteiro; Recorrentes, Categorias e Importação não podem regredir.

### 6.1 — Árvore e busca

Ordem pelo pré-ordem de `buildCategoryTree()` (irmãs na ordem em que a
API já manda, nome). Cada linha mostra o caminho de `categoryPath`,
indentada pela `depth`, com o corte pelo fim preservado
(`[direction:rtl]` / `[direction:ltr]`). Busca como hoje:
`toLocaleLowerCase('pt-BR')` no caminho. Sem resultado: "Nenhuma
categoria encontrada." `allowEmpty` continua, com o `emptyLabel` do
call site ("Todas", "Selecione", "Nenhuma (raiz)").

Selecionada: `bg-brand-tint text-brand` e `aria-selected="true"`.

### 6.2 — Recentes

Chave `orcadom.recent-categories.<householdId>` no `localStorage`, no
máximo 5 ids, o mais novo primeiro. `CategorySelect` lê o espaço por
`useHousehold()` (o provider já envolve o dashboard). Sem espaço, sem
bloco de recentes. Ao escolher uma categoria, o id entra na lista. Ids
que não existem mais somem. O bloco "Recentes" aparece só com a busca
vazia, acima da árvore. A árvore inteira continua abaixo. Não criar
endpoint de "mais usadas".

### 6.3 — Celular, fora de um dialog

Filtro de Lançamentos e prévia de Importação: `BottomSheet` título
"Categoria", busca com `aria-label="Buscar categoria"` e placeholder
"Buscar categoria", árvore, recentes. Toque numa opção grava e fecha.
Não há "Confirmar": categoria não é roleta. Foco na busca ao abrir. Se
o Safari não levantar o teclado nesse foco, o campo segue focado para o
toque seguinte — não inventar hack de teclado.

### 6.4 — Celular, dentro de `Modal`

Formulário de lançamento, recorrente e categoria pai. O gatilho está
dentro de um `<dialog>` aberto com `showModal()`. O miolo abre como
painel no rodapé **desse** dialog (alça, busca, árvore, a mesma cara da
folha), sem `vaul` e sem portal no `body`. Toque na área do formulário
que continuar visível fecha só o seletor. Esc fecha o seletor e não o
modal; o segundo Esc fecha o modal, como hoje. Detectar o dialog
ancestral aberto. Não empilhar dois estados de `history` se a folha da
fase 1 não está na pilha: este painel interno não dá `pushState`.

### 6.5 — Desktop

De `md` para cima, dentro ou fora do modal: popover com `AnchoredPanel`
(filho do gatilho, regras da seção 5.4). Substitui o bloco que hoje
empurra o formulário.

Padrão de combobox, sem `cmdk`:

- O gatilho fechado continua botão, com o caminho selecionado,
  `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`.
- Aberto, o foco vai para a busca (`role="combobox"`,
  `aria-autocomplete="list"`, `aria-activedescendant`).
- A lista é `role="listbox"`. Seta ↑ ↓ move a opção ativa. Enter grava
  e fecha. Esc fecha e devolve o foco ao gatilho.
- A opção ativa tem o mesmo destaque da selecionada, com anel de foco
  visível (`ring-2 ring-brand`).

### 6.6 — Tarefas

- [ ] `CategoryOptions` com árvore, busca, selecionada visível e recentes.
- [ ] Folha abaixo de `md` quando o gatilho não está num dialog.
- [ ] Painel interno quando está num `Modal`.
- [ ] Popover de `md` para cima, com teclado.
- [ ] Teste de unidade da ordem da árvore, do filtro e dos recentes
      (lista pura, sem `localStorage` de browser se der para injetar o
      armazenamento).
- [ ] Lançamentos (filtro e formulário), Recorrentes, Categorias e
      Importação.

## 7. Plano de entrega e a release `0.18.0`

Três pull requests, nesta ordem, cada um contra `main`. A fase 2 importa
`BottomSheet`. A fase 3 importa `BottomSheet`, `useMediaQuery` e
`AnchoredPanel`. Não juntar as três no mesmo PR.

O produto em `main` está em `0.17.0`. Cada fase leva um changeset
`minor` só de `@orcadom/web`. O grupo `fixed` de `.changeset/config.json`
faz o Release PR alinhar os outros pacotes na mesma versão; não criar
changeset para `@orcadom/api` nem para os packages. O Changesets aplica
o **maior** bump, não soma três minors. As três entradas, consumidas
juntas, produzem **uma** versão: `0.18.0`, com três itens no changelog.

O workflow `release.yml` abre ou atualiza o PR `chore: release` (branch
`changeset-release/main`) assim que a primeira fase entra em `main`.
Esse PR acumula sozinho. Ele fica aberto até a fase 3 também estar em
`main`. Mergear no meio publica uma `0.18.0` com uma ou duas entradas, e
a fase que faltou vira `0.19.0`. Não editar `package.json` nem
`CHANGELOG.md` na mão para forçar o número. Não fazer push na branch
`changeset-release/main`. Não comentar, aprovar nem mergear esse PR nas
fases 1 e 2. Só depois da fase 3 mergeada é que alguém mergeia o Release
PR, e aí a tag `v0.18.0` segue o fluxo de
[`16-versionamento.md`](./16-versionamento.md).

Há no máximo dois previews ao mesmo tempo
([`32-deploy-vps-previews.md`](./32-deploy-vps-previews.md)). As fases
são em série: a label `preview` da fase seguinte só entra quando a
anterior já foi mergeada (o preview cai no merge). Não deixar as três
com `preview` juntas.

| Fase | Commit | Changeset (`@orcadom/web`, minor) | Preview |
| --- | --- | --- | --- |
| 1 | `feat(web): open the more menu as a draggable bottom sheet` | O menu Mais no celular fecha pela alça, arrastando, no fundo ou no Esc. | `pr-<N>.orcadom.aanschau.tech` |
| 2 | `feat(web): keep the month picker on screen` | O mês do painel e dos orçamentos não sai da tela: roleta no celular e grade com teclado no desktop. | o PR da fase 2, depois da 1 mergeada |
| 3 | `feat(web): pick a category from a sheet or popover` | A categoria abre em folha no celular e em popover com busca no desktop. | o PR da fase 3, depois da 2 mergeada |

Label `preview` em cada um desses três PRs, para testar no telefone
antes do merge. Este documento não leva essa label nem changeset: não
muda comportamento.

Antes de cada push, `pnpm turbo run lint build test` verde, como o CI.

## 8. Critérios de aceite

### Fase 1

- [ ] No celular, Mais abre folha com alça e sem o x.
- [ ] Arrastar para baixo, toque no fundo, Esc e o botão voltar fecham.
- [ ] A folha sobe ao abrir e desce ao fechar; com reduced motion, não
      desliza.
- [ ] O último item não fica atrás do indicador de início. A página atrás
      não rola. O foco não escapa, e volta ao botão Mais.
- [ ] Leitor de tela anuncia um diálogo com o nome "Mais".
- [ ] Em `lg` a sidebar segue igual, incluindo a versão no rodapé, e a
      folha não abre.
- [ ] Com o sistema em modo escuro, a folha continua clara.

### Fase 2

- [ ] No celular, o mês do Painel abre a roleta dentro da folha, inteira
      na tela. "Confirmar" troca o mês do resumo. Fechar sem confirmar
      não troca.
- [ ] "Mês atual" e os ‹ › do gatilho levam ao mês certo, inclusive na
      virada de ano, e não passam de 2000 nem do ano que vem.
- [ ] No desktop, a grade não é cortada com a janela estreita nem com o
      gatilho na direita. Setas, Enter e Esc funcionam como a seção 5.4.
- [ ] Orçamentos usa o mesmo controle, com o mesmo comportamento.
- [ ] O calendário de dia (`DateInput`) segue como está.

### Fase 3

- [ ] No filtro de Lançamentos, no celular, a categoria abre a folha, com
      busca, pais e filhas indentadas, caminho visível até a folha da
      árvore, e a linha escolhida destacada.
- [ ] No formulário de novo lançamento (modal de tela cheia), dá para
      buscar e escolher sem perder o foco e sem fechar o lançamento no
      primeiro Esc.
- [ ] No desktop, o popover substitui o bloco que empurrava a página, com
      busca e setas, e não sai da tela.
- [ ] Recentes aparecem com a busca vazia, somem com texto na busca, e
      não exigem endpoint novo.
- [ ] Recorrentes, mover categoria e prévia de importação continuam
      gravando o `categoryId` certo.
- [ ] Transferência segue sem categoria, como hoje.

### Release

- [ ] Com as três fases em `main` e o Release PR ainda aberto, a versão
      proposta é `0.18.0` e o changelog dessa versão lista as três
      frases.
- [ ] O Release PR não foi mergeado entre uma fase e outra.

## 9. Checklist manual

O app não tem tema escuro. A coluna "sistema escuro" só confere se a
folha permanece clara. Largura de desktop: janela ≥ 1024px. Celular:
abaixo de 768px, além do preview no aparelho.

### Fase 1

- [ ] iPhone Safari: abrir Mais, ver a alça, arrastar até a metade e
      soltar (não fecha), arrastar com força (fecha), tocar no fundo,
      abrir de novo e conferir o recuo do indicador.
- [ ] iPhone Safari, reduced motion ligado: a folha não desliza.
- [ ] iPhone Safari, modo escuro do sistema: folha clara, texto `ink`.
- [ ] Android Chrome: os mesmos gestos, e o voltar do sistema fecha a
      folha antes de sair da página.
- [ ] Desktop: encolher até 1023px e ver a tab bar; a partir de 1024px,
      sidebar, sem folha. Tab, Shift+Tab e Esc num teclado externo no
      celular, se houver, não deixam o foco na página de trás.

### Fase 2

- [ ] iPhone Safari, Painel: o popover antigo não aparece. Roleta com
      snap, faixa no centro, fade, "Confirmar", "Mês atual", ‹ › no
      gatilho. Girar e fechar sem confirmar deixa o mês do resumo quieto.
- [ ] Android Chrome: o mesmo, mais o voltar fechando a folha sem trocar
      o mês.
- [ ] Desktop largo e janela ~800px: a grade inteira visível, mês
      selecionado em `brand`, mês corrente em `brand-tint` quando for
      outro, setas do teclado atravessando dezembro/janeiro, Enter, Esc.
- [ ] Orçamentos: repetir o atalho ‹ › e um mês da grade.
- [ ] Sistema escuro: roleta e grade claras.
- [ ] Borda da janela: ‹ em janeiro de 2000 e › em dezembro do ano que
      vem não passam.

### Fase 3

- [ ] iPhone Safari, filtro de Lançamentos: folha, busca, subcategoria
      indentada, caminho cortado pelo início, toque grava e fecha o
      filtro. Busca sem match mostra o texto vazio.
- [ ] iPhone Safari, Novo lançamento: o modal continua aberto, o seletor
      sobe por cima do formulário, Esc uma vez volta ao formulário, Esc
      de novo fecha o lançamento. Salvar grava a categoria.
- [ ] Android Chrome: voltar fecha o seletor do filtro; no formulário,
      voltar não descarta o lançamento inteiro sem passar pelo seletor
      se ele estiver aberto.
- [ ] Desktop: popover no filtro e no formulário, setas e Enter, clique
      fora fecha, nada cortado na direita da janela.
- [ ] Recorrente, categoria pai e uma linha da importação: escolher uma
      filha e ver o caminho no gatilho.
- [ ] Segunda escolha da mesma categoria: ela aparece em Recentes na
      abertura seguinte, com a busca vazia.
- [ ] Sistema escuro: folha, painel do modal e popover claros.

## 10. Fora de escopo

- Trocar o `Modal` de formulário pela folha arrastável.
- `DateInput` (calendário de dia) e o seletor nativo de espaço no
  cabeçalho.
- Tema escuro do produto.
- Endpoint de categorias mais usadas, ou limite de ano vindo do banco.
- Qualquer mudança em `apps/api`, Prisma ou `packages/types`.
- Mergear, editar ou comentar o PR `chore: release` durante as fases.

## 11. Riscos

- **Portal contra `showModal()`.** Um `BottomSheet` ou popover no
  `document.body`, com o modal de lançamento aberto, não recebe foco. A
  seção 6.4 existe por isso. Testar o formulário, não só o filtro.
- **`history.pushState` e o App Router.** O flag da seção 4.2 tem que
  ser testado no Android de verdade. Um `back` a mais tira a pessoa da
  página; um a menos deixa a folha zumbi na pilha.
- **Gesto versus rolagem no iOS.** Listas longas (Mais, árvore de
  categoria) são o caso que o `vaul` precisa acertar. Se a lista rolar e
  a folha fechar junto, o ajuste é no `vaul`, não um listener de toque
  paralelo.
- **Dois previews.** Abrir a fase 2 com `preview` enquanto a fase 1 ainda
  ocupa vaga pode ser recusado pelo workflow. Esperar o merge.
- **Release no meio do caminho.** Mergear `chore: release` depois da
  fase 1 ou 2 quebra a `0.18.0` única. O PR vai aparecer sozinho; deixar
  aberto é parte da entrega, não um esquecimento.
- **Profundidade 3 no celular.** O corte do caminho continua a mostrar a
  folha, como `33` já pede. Não trocar por corte no fim do texto.

## 12. Prompts para o Cursor

Um prompt por fase. Colar o bloco inteiro. Cada fase é um PR próprio,
com changeset `minor` de `@orcadom/web`, commit na mensagem indicada e
label `preview`. Não implementar as outras fases no mesmo PR.

### Fase 1

```text
Implemente a fase 1 de docs/36-folha-inferior-seletores.md
(seções 3, 4, 8 "Fase 1", 9 "Fase 1" e 11).

Crie BottomSheet em apps/web/src/components/ui.tsx com vaul, nos tokens
de apps/web/src/app/globals.css. Troque o MoreSheet de
apps/web/src/components/app-shell.tsx: alça no lugar do x, arrastar para
fechar, overlay, Esc, voltar do Android, animação, reduced motion, área
segura, foco preso e rolagem da página travada. Desktop (lg) permanece
com a sidebar. Não mexa em Modal, MonthInput nem CategorySelect.

Changeset minor só de @orcadom/web, com a frase da seção 7.
Commit: feat(web): open the more menu as a draggable bottom sheet
Rode pnpm turbo run lint build test antes do push. Abra o PR contra
main com a label preview.

Não edite, comente nem mergeie o PR chore: release
(branch changeset-release/main). Não altere package.json de versão nem
CHANGELOG.md na mão. A release 0.18.0 só sai depois das três fases, e
não faz parte deste PR.
```

### Fase 2

```text
Implemente a fase 2 de docs/36-folha-inferior-seletores.md
(seções 5, 8 "Fase 2", 9 "Fase 2" e 11). A fase 1 já está em main:
use o BottomSheet de apps/web/src/components/ui.tsx.

MonthInput (apps/web/src/components/date-fields.tsx) abaixo de md abre
a roleta na folha; de md para cima, a grade 3×4 que já existe, num
AnchoredPanel que não sai da tela, com teclado, "Mês atual" e ‹ › no
gatilho. Janela de ano 2000 até o ano corrente + 1, só na UI. O mesmo
componente vale para o Painel e para Orçamentos. Crie useMediaQuery
como a seção 5.1. Não mexa em DateInput nem em CategorySelect. Inclua
o teste de unidade da seção 5.5.

Changeset minor só de @orcadom/web, com a frase da seção 7.
Commit: feat(web): keep the month picker on screen
Rode pnpm turbo run lint build test antes do push. Abra o PR contra
main com a label preview só se o preview da fase 1 já tiver caído.

Não edite, comente nem mergeie o PR chore: release
(branch changeset-release/main). Esse PR acumula os changesets sozinho
e tem de continuar aberto até a fase 3 também estar em main, para sair
uma única 0.18.0. Não altere a versão na mão.
```

### Fase 3

```text
Implemente a fase 3 de docs/36-folha-inferior-seletores.md
(seções 6, 8 "Fase 3", 9 "Fase 3", 10 e 11). As fases 1 e 2 já estão
em main: reutilize BottomSheet, useMediaQuery e AnchoredPanel.

CategorySelect (apps/web/src/components/category-select.tsx) ganha um
miolo só, CategoryOptions: busca, árvore com buildCategoryTree e
categoryPath, estado selecionado visível, recentes no localStorage
(seção 6.2). Abaixo de md, folha; dentro de um Modal aberto, painel no
próprio dialog, sem portal no body (seção 6.4). De md para cima,
popover combobox com teclado (seção 6.5), no lugar do bloco que empurra
o formulário. Vale para Lançamentos, Recorrentes, Categorias e
Importação. Inclua o teste de unidade da seção 6.6. Sem endpoint novo.

Changeset minor só de @orcadom/web, com a frase da seção 7.
Commit: feat(web): pick a category from a sheet or popover
Rode pnpm turbo run lint build test antes do push. Abra o PR contra
main com a label preview.

Não edite, comente nem mergeie o PR chore: release
(branch changeset-release/main). Quando este PR entrar em main, o
Release PR deve mostrar 0.18.0 com as três entradas. Mergear esse
Release PR não é tarefa desta fase: deixe-o aberto para uma pessoa
fazer isso depois.
```
