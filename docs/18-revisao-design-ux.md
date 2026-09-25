# Revisão de Design de Interface, UX e Responsividade

> Detalhamento do item 1 do [roadmap para a 1.0](./15-roadmap-v1.md).
> Depende de todas as telas construídas entre `06-design-system.md` e
> `14-auditoria.md` já existirem — esta é uma revisão do que foi
> construído, não uma feature nova. Inclui, por pedido explícito,
> **revisão de responsividade** como parte formal do escopo — não estava
> detalhada no resumo original do roadmap.

## 1. Objetivo

Revisar, de forma holística, tudo que foi construído desde o MVP —
consistência visual, arquitetura de navegação, usabilidade dos fluxos
críticos e **comportamento em diferentes tamanhos de tela** — antes de
continuar adicionando superfície nova de produto (Metas, Relatórios, PWA).

## 2. Por que a responsividade entra aqui, e não como item separado

Cada feature de `07` a `14` foi construída e validada isoladamente,
tipicamente olhando para desktop — nenhum dos documentos anteriores
tratou responsividade como critério de aceite explícito por tela. Isso
significa que hoje existe uma lacuna desconhecida (não necessariamente
grande, mas não medida) entre "a tela funciona" e "a tela funciona bem em
uma largura de celular". Revisar isso **antes** do item 4 do roadmap
(App Mobile como PWA) é a ordem correta: PWA torna o app instalável e
usado como app mobile de verdade — não faz sentido investir nisso antes
de confirmar que as telas já aguentam essa largura de tela.

## 3. Escopo

1. **Auditoria de consistência visual** — conferir se todas as telas
   existentes usam de fato os tokens de `06-design-system.md` (cor,
   tipografia, espaçamento, raio), ou se alguma feature introduziu
   variação ad-hoc sob pressão de prazo.
2. **Revisão de arquitetura de informação e navegação** — com todas as
   seções acumuladas (contas, categorias, transações, importação,
   orçamentos, parcelamento, recorrência, notificações, household,
   auditoria), avaliar se a navegação principal ainda faz sentido como
   está ou se precisa de reagrupamento.
3. **Revisão de usabilidade dos fluxos críticos** — onboarding, criar
   primeira transação, revisar importação pendente, definir orçamento.
4. **Revisão de responsividade** (escopo acrescentado nesta rodada,
   seção 5).
5. **Consolidação de componentes** dispersos em componentes reais do
   design system (badge de status, barra de progresso).
6. **Validação de contraste de cor (WCAG AA)**, pendência já registrada
   desde `06-design-system.md`.

## 4. Inventário de telas a revisar

Toda tela construída até aqui entra na revisão — usado como checklist de
cobertura, não como lista exaustiva de UI (algumas features têm mais de
uma tela):

| Origem | Telas |
|---|---|
| MVP (`00`–`06`) | Login/registro, listagem e formulário de contas, listagem e formulário de categorias, listagem e formulário de transações, dashboard |
| Importação (`07`) | `/imports` — upload e preview |
| Email (`08`) | `/settings/import-alias`, mapeamento de contas |
| Orçamentos (`09`) | `/budgets`, seção de orçamentos no dashboard |
| Notificações (`10`) | Sino de notificação e lista suspensa |
| Parcelamento (`11`) | Alternador no formulário de transação, `/installments` |
| Recorrência (`12`) | `/recurring` |
| Multiusuário (`13`) | Seletor de household, `/settings/household` (membros e convites) |
| Auditoria (`14`) | Seção "Histórico" nas telas de detalhe, `/settings/activity` |

## 5. Revisão de Responsividade

### 5.1 — Breakpoints adotados

Alinhados ao padrão do Tailwind (já em uso no `apps/web`), sem introduzir
uma escala própria:

| Breakpoint | Largura | Uso principal |
|---|---|---|
| Base (sem prefixo) | < 640px | Celular — layout padrão a partir daqui |
| `sm` | ≥ 640px | Celular grande / tablet retrato |
| `md` | ≥ 768px | Tablet |
| `lg` | ≥ 1024px | Desktop — navegação lateral completa passa a caber |
| `xl` | ≥ 1280px | Desktop largo |

### 5.2 — Padrões a decidir e aplicar consistentemente

- **Navegação:** hoje (implicitamente) desktop-first. Definir o padrão
  mobile — navegação inferior fixa (bottom tab bar) para as seções mais
  usadas (Dashboard, Transações, Importar) + menu "mais" para o resto, ou
  drawer lateral acionado por ícone de menu. Escolher **um** padrão e
  aplicar em todas as telas, não decidir tela a tela.
- **Tabelas e listas densas** (transações, preview de importação,
  parcelas de um plano, feed de auditoria): em telas estreitas, decidir
  entre (a) rolagem horizontal contida (`overflow-x: auto` no container,
  nunca a página inteira rolando de lado) ou (b) transformação em lista de
  cartões empilhados, uma linha por cartão. Para tabelas com muitas
  colunas (ex: preview de importação: data, descrição, valor, categoria,
  duplicata), cartão empilhado tende a ser mais usável do que rolagem
  horizontal — decidir caso a caso, mas registrar a decisão por tipo de
  tabela, não deixar implícito.
- **Grids de cards** (resumo do dashboard, cartões de orçamento): já
  documentado como reflow para coluna única abaixo de 640px no
  `orcadom-design-system.html` — confirmar que a implementação real em
  `apps/web` replica esse comportamento, não só o style guide.
- **Formulários:** campos empilham verticalmente abaixo de `md`; campos
  que hoje ficam lado a lado (ex: valor + data) precisam de teste
  específico de toque (área de toque mínima, teclado numérico correto
  para campos de valor).
- **Modais e formulários de criação:** avaliar se, em telas de celular,
  modais centralizados devem virar folhas de tela cheia (bottom sheet /
  full-screen), padrão mais comum e mais usável em telas pequenas do que
  um modal centralizado reduzido.
- **Sino de notificação e seletor de household:** ambos são elementos de
  cabeçalho pensados para desktop — revisar se cabem e funcionam bem num
  cabeçalho mobile mais estreito, especialmente se os dois coexistirem
  com um ícone de menu de navegação.

### 5.3 — Método de verificação

- Teste manual nos três breakpoints da tabela 5.1 (não só "encolher a
  janela do navegador até parecer razoável") — usar as ferramentas de
  device emulation do navegador com larguras reais de dispositivos
  comuns.
- Cada tela do inventário (seção 4) recebe uma checagem explícita nos três
  breakpoints, registrada como aprovada ou com problema encontrado — não
  uma passada geral sem registro por tela.
- Atenção especial às telas com tabela/lista densa (transações, preview de
  importação, parcelas, auditoria) — são as que mais provavelmente têm
  problema real, por serem as mais "desktop-first" por natureza do
  conteúdo.

## 6. Metodologia geral (além da responsividade)

- **Auditoria de tokens:** varrer o código de `apps/web` procurando cores,
  espaçamentos ou tamanhos de fonte hardcoded fora das variáveis/classes
  do design system — cada ocorrência vira um item de correção ou uma
  decisão consciente de exceção (documentada, não deixada solta).
- **Card sorting leve de navegação:** listar todas as seções existentes
  (tabela da seção 4) e agrupar em categorias que façam sentido, antes de
  decidir a estrutura de navegação final.
- **Revisão dos fluxos críticos:** percorrer cada fluxo como um usuário
  novo faria, anotando pontos de fricção — não uma revisão só visual, mas
  de sequência de passos e clareza de cada tela dentro do fluxo.

## 7. Entregáveis

- `06-design-system.md` e `orcadom-design-system.html` atualizados com:
  - Os padrões de responsividade decididos na seção 5.2, formalizados
    como parte do design system (não só desta revisão pontual).
  - Componentes novos consolidados (badge de status, barra de progresso)
    documentados como componentes reais, com variantes.
- Lista de correções encontradas na auditoria de tokens, priorizada.
- Estrutura de navegação revisada (se houver mudança), documentada antes
  da implementação.
- Checklist de responsividade por tela (seção 4), com status de cada uma.

## 8. Fases de Execução

### Fase 1 — Auditoria e diagnóstico

- [ ] Varredura de tokens hardcoded no código de `apps/web`.
- [ ] Checklist de responsividade preenchido para todas as telas do
      inventário (seção 4), nos três breakpoints da seção 5.1.
- [ ] Validação de contraste WCAG AA nas combinações de cor já usadas
      (texto sobre `brand`, `income`, `expense`, `transfer`, `pending`).
- [ ] Percurso dos fluxos críticos, com pontos de fricção anotados.

### Fase 2 — Decisões de padrão

- [ ] Decidir e documentar o padrão de navegação mobile (bottom tab bar
      vs. drawer).
- [ ] Decidir, por tipo de tabela/lista, entre rolagem horizontal e
      cartão empilhado (seção 5.2).
- [ ] Decidir o padrão de modal em mobile (full-screen sheet vs. modal
      reduzido).
- [ ] Consolidar componentes dispersos em componentes documentados do
      design system.

### Fase 3 — Implementação das correções

- [ ] Aplicar os padrões decididos na Fase 2 em todas as telas do
      inventário — não só nas que motivaram a decisão.
- [ ] Corrigir os itens da varredura de tokens hardcoded.
- [ ] Corrigir problemas de contraste encontrados.
- [ ] Reestruturar navegação, se a Fase 2 decidiu por mudança.

### Fase 4 — Validação final

- [ ] Reexecutar o checklist de responsividade (Fase 1) em todas as
      telas, confirmando que os itens marcados com problema foram
      resolvidos.
- [ ] Revisão cruzada dos fluxos críticos (Fase 1) confirmando que os
      pontos de fricção anotados foram endereçados ou conscientemente
      aceitos como não-bloqueantes.

## 9. Riscos e pontos de atenção

- **Escopo de "revisão" pode se expandir indefinidamente** se não houver
  um checklist fechado por tela — por isso a seção 4 (inventário) e a
  seção 5.3 (método) existem como limite explícito: a revisão termina
  quando todo item do inventário foi checado nos três breakpoints, não
  quando "parecer suficiente".
- **Mudança de padrão de navegação é a decisão de maior impacto desta
  revisão** — se a Fase 2 decidir reestruturar a navegação principal,
  isso tem efeito cascata em praticamente toda tela, e vale tratar como
  uma mudança maior dentro da revisão, não um ajuste pontual.
- **Responsividade "boa o suficiente para revisão" não é o mesmo que
  "testado em dispositivo real"** — emulação de largura no navegador
  cobre boa parte dos casos, mas comportamento de teclado virtual,
  gestos e área de toque real só se confirma em dispositivo físico ou
  emulador completo; vale pelo menos um teste em dispositivo real antes
  de considerar a Fase 4 concluída, especialmente para os formulários.
