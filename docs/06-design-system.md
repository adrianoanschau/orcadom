# Design System — Orcadom

Referência visual completa em: [`orcadom-design-system.html`](./orcadom-design-system.html)
(abra no navegador para ver os tokens e componentes renderizados).

## Direção de design

A maioria dos apps financeiros modernos (Mercury, Copilot Money, e outros)
convergiu para o mesmo padrão: canvas escuro com um acento elétrico único —
isso já é o clichê do setor. Como o Orcadom é uso **doméstico e diário**, e
não uma fintech corporativa, a direção escolhida foi diferente:

- **Canvas claro e calmo**, não um dashboard escuro genérico.
- **Fraunces** (serifada, editorial) para títulos + **Manrope** (sans) para
  interface e valores monetários — uma dupla tipográfica com identidade
  própria.
- **Um único acento de marca** (verde-petróleo), com receita, despesa,
  transferência e pendência em cores semânticas fixas, nunca reaproveitadas
  para outro fim — o usuário aprende a reconhecê-las de forma consistente.
- **Um motivo visual de assinatura**: linha tracejada sob valores
  monetários de destaque, referência ao registro de um talão/caderno de
  contas. Usado com moderação — só nos números que mais importam (o valor
  em destaque no dashboard, o saldo da conta).

## Tokens — Cor

| Token            | Hex       | Uso                                    |
| ---------------- | --------- | -------------------------------------- |
| `canvas`         | `#EFF2EF` | Fundo da página                        |
| `surface`        | `#FFFFFF` | Cartões, listas                        |
| `surface-sunken` | `#E4E9E4` | Campos de formulário, áreas rebaixadas |
| `ink`            | `#1C2420` | Texto primário                         |
| `ink-soft`       | `#5C645F` | Texto secundário                       |
| `ink-faint`      | `#6B7169` | Texto terciário, placeholders          |
| `hairline`       | `#D7DED6` | Bordas, divisores                      |
| `brand`          | `#0D6E63` | Ações primárias, links, marca          |
| `brand-hover`    | `#0A574F` | Estado hover do `brand`                |
| `brand-tint`     | `#DCEBE7` | Fundos suaves de elementos de marca    |
| `income`         | `#2F7D5A` | Valores de receita (sempre)            |
| `expense`        | `#C4462F` | Valores de despesa (sempre)            |
| `transfer`       | `#3B6E91` | Transferências entre contas (sempre)   |
| `pending`        | `#8A6424` | Lançamentos pendentes/a confirmar      |

### Variáveis CSS

```css
:root {
  --canvas: #eff2ef;
  --surface: #ffffff;
  --surface-sunken: #e4e9e4;
  --ink: #1c2420;
  --ink-soft: #5c645f;
  --ink-faint: #6b7169;
  --hairline: #d7ded6;
  --brand: #0d6e63;
  --brand-hover: #0a574f;
  --brand-tint: #dcebe7;
  --income: #2f7d5a;
  --expense: #c4462f;
  --transfer: #3b6e91;
  --pending: #8a6424;

  --r-sm: 8px;
  --r-md: 14px;
  --r-lg: 22px;
  --r-pill: 999px;

  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;
  --sp-8: 64px;
}
```

### Tokens no Tailwind

Em `apps/web` (Tailwind v4) os tokens vivem em `@theme` de
`apps/web/src/app/globals.css`. O bloco abaixo é o mapa equivalente
(classes `bg-brand`, `text-income`, `rounded-lg`, etc.).

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#EFF2EF',
        surface: '#FFFFFF',
        'surface-sunken': '#E4E9E4',
        ink: {
          DEFAULT: '#1C2420',
          soft: '#5C645F',
          faint: '#6B7169',
        },
        hairline: '#D7DED6',
        brand: {
          DEFAULT: '#0D6E63',
          hover: '#0A574F',
          tint: '#DCEBE7',
        },
        income: '#2F7D5A',
        expense: '#C4462F',
        transfer: '#3B6E91',
        pending: '#8A6424',
      },
      borderRadius: {
        sm: '8px',
        md: '14px',
        lg: '22px',
        pill: '999px',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
} satisfies Config;
```

> **Regra de uso das cores semânticas:** `income`, `expense`, `transfer` e
> `pending` nunca devem ser reaproveitadas para outro propósito na
> interface (ex: não usar `expense` como cor de erro genérico de
> formulário). Isso preserva a associação imediata que o usuário constrói
> entre cor e tipo de lançamento.

## Tokens — Tipografia

Fontes carregadas via Google Fonts: `Fraunces` (títulos) e `Manrope`
(interface e valores).

| Estilo    | Fonte    | Peso | Tamanho | Uso                                 |
| --------- | -------- | ---- | ------- | ----------------------------------- |
| `display` | Fraunces | 600  | 40px    | Título principal, telas de destaque |
| `h1`      | Fraunces | 600  | 28px    | Título de página/seção              |
| `h2`      | Fraunces | 500  | 21px    | Subtítulo de seção                  |
| `body`    | Manrope  | 400  | 16px    | Texto padrão de interface           |
| `small`   | Manrope  | 400  | 14px    | Legendas, datas, textos auxiliares  |
| `amount`  | Manrope  | 700  | 20px    | Valores monetários                  |

**Regra importante:** todo valor monetário usa
`font-variant-numeric: tabular-nums` (ou a classe `tabular-nums` do
Tailwind), para que os números fiquem alinhados verticalmente em listas e
extratos — detalhe que faz diferença perceptível em uma tela de
transações.

## Tokens — Espaçamento e Forma

Escala de espaçamento em base 4px: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.

Raio de borda cresce conforme o destaque do elemento:

| Token    | Valor | Uso                                   |
| -------- | ----- | ------------------------------------- |
| `r-sm`   | 8px   | Campos de formulário                  |
| `r-md`   | 14px  | Cartões de resumo, ícones             |
| `r-lg`   | 22px  | Cartões de conta, listas de transação |
| `r-pill` | 999px | Botões, chips de categoria            |

## Componentes definidos

Todos com exemplo visual no HTML de referência. Implementação em
`apps/web/src/components/ui.tsx`.

- **Botão** — primário (preenchido, pílula), secundário (contorno),
  ghost (texto). Área de toque mínima de 44px (`min-h-11`).
- **Campo de formulário** — label + input sobre `surface-sunken`.
- **Chip de categoria** — ponto colorido + nome da categoria.
- **Cartão de conta** — tipo, nome do banco/carteira, saldo em destaque
  com a linha tracejada de assinatura.
- **Linha de transação** — ícone circular colorido por tipo, descrição,
  categoria, valor alinhado à direita com cor semântica. Em telas
  estreitas, as ações empilham abaixo da linha.
- **Cartão de resumo (dashboard)** — label + valor, usado nos cards de
  receita/despesa/saldo do mês.
- **Badge de status** — `StatusBadge` com tons `neutral`, `brand`,
  `income`, `expense`, `transfer`, `pending`. Usado para orçamento
  (No ritmo / Atenção / Estourado), importação (duplicata, conhecida,
  conta não mapeada), recorrência (Ativa / Pausada), papel no espaço e
  histórico de email. Não criar badges ad-hoc por feature.
- **Barra de progresso** — `ProgressBar` com tons `brand`, `income`,
  `expense`, `pending`. `BudgetProgressBar` é composição (barra + badge).
  Parcelamento usa o mesmo `ProgressBar` com tom `brand`.
- **Modal** — abaixo de `md`, folha de tela cheia; a partir de `md`,
  diálogo centralizado. Sempre com botão de fechar.

## Responsividade

Breakpoints alinhados ao Tailwind, sem escala própria:

| Prefixo | Largura  | Uso                             |
| ------- | -------- | ------------------------------- |
| (base)  | < 640px  | Celular — layout padrão         |
| `sm`    | ≥ 640px  | Celular grande / tablet retrato |
| `md`    | ≥ 768px  | Tablet                          |
| `lg`    | ≥ 1024px | Desktop — sidebar completa      |
| `xl`    | ≥ 1280px | Desktop largo                   |

Padrões obrigatórios (decididos na revisão de `18-revisao-design-ux.md`):

- **Navegação:** mobile usa barra inferior fixa (Painel, Lançamentos,
  Importar, Mais). Desktop `lg+` usa sidebar agrupada (Dia a dia,
  Organização, Compromissos, Espaço). Cabeçalho mobile: marca, seletor
  de espaço, sino — sem os 11 links de antes.
- **Tabelas densas:** prévia de importação vira **cartão empilhado**
  abaixo de `md` e permanece tabela a partir de `md`. Lançamentos,
  parcelas, auditoria e histórico de email já são listas/cartões — não
  introduzir tabela nesses fluxos.
- **Grids de cards:** uma coluna abaixo de 640px; duas a partir de `sm`.
- **Formulários:** campos empilham abaixo de `md`. Pares (valor + data,
  frequência + dia) só ficam lado a lado a partir de `md`. Campos de
  valor usam `inputMode="decimal"`; contagens usam `inputMode="numeric"`.
- **Modais:** tela cheia abaixo de `md`; diálogo centralizado no restante.

## Contraste WCAG AA

Texto branco sobre `brand`, `income`, `expense` e `transfer` passa
(≥ 4,5:1). `pending` foi escurecido de `#B8873A` (~3,2:1 sobre branco)
para `#8A6424` (~5,4:1). `ink-faint` foi escurecido de `#93998F` (~2,9:1)
para `#6B7169` (~5,0:1), porque timestamps e texto terciário não são
placeholder. Badge de notificação usa `brand` + branco — `expense` não
pode ser reaproveitado como “alerta genérico”.

## Próximos passos de implementação

- [x] Componentes React do design system em `apps/web/src/components/ui.tsx`
      (`Button`, `Field`, `CategoryChip`, `AccountCard`, `TransactionRow`,
      `StatCard`, `StatusBadge`, `ProgressBar`).
- [x] Tokens no `@theme` de `apps/web/src/app/globals.css` (Tailwind v4).
- [x] Fontes Fraunces e Manrope no layout raiz do Next.js.
- [x] Contraste WCAG AA nas combinações de texto sobre `brand`, `income`,
      `expense`, `transfer` e `pending`.
