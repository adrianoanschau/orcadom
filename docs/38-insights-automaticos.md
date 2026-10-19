# Insights Automáticos

> Detalhamento do item 14 do [roadmap para a 1.0](./15-roadmap-v1.md). É a
> feature que mais se apoia em tudo que veio antes — dado categorizado
> fluindo (import + memória de categorização) e, idealmente, Open Finance
> (item 13) trazendo dado mais completo.

## 1. Objetivo

Gerar observações automáticas sobre o comportamento financeiro do
household (ex: "você gastou 23% a mais em Mercado este mês"), sem esforço
manual de análise.

## 2. Decisão central: estatística simples, não Machine Learning

A tentação natural seria começar com um modelo de ML para detectar
padrões. A decisão desta primeira versão é deliberadamente mais simples:
**variação percentual do mês corrente contra a média dos últimos meses**,
por categoria — totalmente explicável, sem caixa-preta, reaproveitando a
mesma agregação já usada pelo Orçamento (`09`) e pelo dashboard. ML fica
como evolução futura, só se a abordagem simples se mostrar insuficiente na
prática.

## 3. Modelagem de Dados

```prisma
enum InsightType {
  CATEGORY_INCREASE
  CATEGORY_DECREASE
}

model Insight {
  id         String      @id @default(uuid())
  type       InsightType
  payload    Json        // { categoryId, currentAmount, averageAmount, percentChange }
  month      DateTime
  dismissedByUserId String? // dispensa é por usuário, mesmo padrão de Onboarding (20)
  createdAt  DateTime    @default(now())

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@map("insights")
}
```

**Nota de consistência:** este é o terceiro mecanismo de "dispensa por
usuário" do sistema (depois de Onboarding, `20`, e implicitamente do
padrão de notificação lida/não lida). Vale considerar, quando esta feature
for implementada, extrair um mecanismo genérico de "item dispensável por
usuário" reaproveitável pelos três casos, em vez de manter três tabelas
quase idênticas — decisão de refatoração a avaliar no momento da
implementação, não bloqueante para o desenho aqui.

## 4. Geração

Job mensal, executado logo após o fechamento do mês (ex: dia 1, de
manhã), calculando por household e por categoria de despesa:

```
variação% = (gastoMêsAtual - médiaÚltimosNMeses) / médiaÚltimosNMeses
```

**Regra explícita para evitar insight enganoso:** só gera `Insight` para
uma categoria quando há pelo menos 3 meses de histórico anterior — sem
isso, o primeiro mês de uso do app geraria comparações sem base real
nenhuma.

Entrega via card no dashboard e, para variações grandes (ex: acima de
40%), também via notificação (reaproveitando `10-notificacoes.md`) — não
uma tela nova isolada.

## 5. Fases de Execução

1. Cálculo de variação mês a mês por categoria.
2. Job mensal agendado, com a regra de histórico mínimo (seção 4).
3. Entrega via card no dashboard + notificação para variações grandes.
4. Dispensa por usuário (avaliando a extração do mecanismo genérico
   mencionado na seção 3).

## 6. Riscos e pontos de atenção

- **Insight só de aumento de gasto soa sempre alarmante** — incluir
  também reduções de gasto como observação positiva (`CATEGORY_DECREASE`),
  não só aumentos, evita que a feature pareça uma fonte constante de má
  notícia.
- **Categoria com histórico irregular (ex: só usada esporadicamente) gera
  variação percentual enganosa** — uma categoria que teve R$ 10 em um mês
  e R$ 100 no seguinte "aumentou 900%", tecnicamente correto mas
  pouco útil. Vale um limiar mínimo de valor absoluto, além do percentual,
  antes de considerar uma variação relevante o suficiente para virar
  `Insight`.
- **Sem Open Finance (item 13), o insight depende inteiramente de o
  usuário lembrar de importar/lançar** — a qualidade do insight é só tão
  boa quanto a completude dos dados; isso é uma limitação conhecida
  enquanto a integração bancária direta não existir, não um defeito desta
  feature em si.
