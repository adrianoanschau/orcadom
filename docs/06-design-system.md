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
| `ink-faint`      | `#93998F` | Texto terciário, placeholders          |
| `hairline`       | `#D7DED6` | Bordas, divisores                      |
| `brand`          | `#0D6E63` | Ações primárias, links, marca          |
| `brand-hover`    | `#0A574F` | Estado hover do `brand`                |
| `brand-tint`     | `#DCEBE7` | Fundos suaves de elementos de marca    |
| `income`         | `#2F7D5A` | Valores de receita (sempre)            |
| `expense`        | `#C4462F` | Valores de despesa (sempre)            |
| `transfer`       | `#3B6E91` | Transferências entre contas (sempre)   |
| `pending`        | `#B8873A` | Lançamentos pendentes/a confirmar      |

### Variáveis CSS

```css
:root {
  --canvas: #eff2ef;
  --surface: #ffffff;
  --surface-sunken: #e4e9e4;
  --ink: #1c2420;
  --ink-soft: #5c645f;
  --ink-faint: #93998f;
  --hairline: #d7ded6;
  --brand: #0d6e63;
  --brand-hover: #0a574f;
  --brand-tint: #dcebe7;
  --income: #2f7d5a;
  --expense: #c4462f;
  --transfer: #3b6e91;
  --pending: #b8873a;

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

### Extensão do Tailwind (`apps/web/tailwind.config.ts`)

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
          faint: '#93998F',
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
        pending: '#B8873A',
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

Todos com exemplo visual no HTML de referência:

- **Botão** — primário (preenchido, pílula), secundário (contorno),
  ghost (texto).
- **Campo de formulário** — label + input sobre `surface-sunken`.
- **Chip de categoria** — ponto colorido + nome da categoria.
- **Cartão de conta** — tipo, nome do banco/carteira, saldo em destaque
  com a linha tracejada de assinatura.
- **Linha de transação** — ícone circular colorido por tipo, descrição,
  categoria, valor alinhado à direita com cor semântica.
- **Cartão de resumo (dashboard)** — label + valor, usado nos 3 cards de
  receita/despesa/saldo do mês.

## Próximos passos de implementação

- [ ] Criar `packages/ui` (ou seção equivalente em `apps/web`) com os
      componentes React que implementam este design system (`Button`,
      `Input`, `CategoryChip`, `AccountCard`, `TransactionRow`,
      `StatCard`).
- [ ] Aplicar a extensão do Tailwind acima em `apps/web/tailwind.config.ts`.
- [ ] Importar as fontes Fraunces e Manrope no layout raiz do Next.js.
- [ ] Validar contraste de cor (WCAG AA) nas combinações de texto sobre
      `brand`, `income`, `expense` e `transfer` antes de finalizar.
