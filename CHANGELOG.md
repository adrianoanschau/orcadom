# Changelog

Todas as mudanças relevantes do Orcadom são registradas neste arquivo.
O produto usa uma única versão SemVer (`MAJOR.MINOR.PATCH`) para o
monorepo inteiro. A partir de `0.9.0`, as entradas passam a ser geradas
pelos changesets.

## 0.21.3

### Patch Changes

- 82d9a36: Treat a positive Meu Pluggy credit card amount as an expense.
- d19edf2: Pair repeated transfers between the same controlled accounts during import and sync.
- Updated dependencies [82d9a36]
  - @orcadom/open-finance-meupluggy@0.21.3
  - @orcadom/database@0.21.3
  - @orcadom/open-finance-core@0.21.3
  - @orcadom/open-finance-testing@0.21.3
  - @orcadom/types@0.21.3

## 0.21.2

### Patch Changes

- 10b403c: Stop sending pageSize when listing Meu Pluggy transactions.
- Updated dependencies [10b403c]
  - @orcadom/open-finance-meupluggy@0.21.2
  - @orcadom/database@0.21.2
  - @orcadom/open-finance-core@0.21.2
  - @orcadom/open-finance-testing@0.21.2
  - @orcadom/types@0.21.2

## 0.21.1

### Patch Changes

- 25759e0: Read Meu Pluggy transactions from the cursor endpoint and return the provider status when that call fails.
- Updated dependencies [25759e0]
  - @orcadom/open-finance-meupluggy@0.21.1
  - @orcadom/database@0.21.1
  - @orcadom/open-finance-core@0.21.1
  - @orcadom/open-finance-testing@0.21.1
  - @orcadom/types@0.21.1

## 0.21.0

### Minor Changes

- 2bc1983: Add a personal Meu Pluggy adapter that stays off unless its feature flag is enabled.
- 989bcdb: Add an Open Finance provider port, a fake adapter, and API sync through the existing import matcher.

### Patch Changes

- 01c8110: Pass Meu Pluggy environment variables into preview and production deploys.
- 6cadd64: Link an Open Finance sync to statement rows already imported from a file.
- Updated dependencies [2bc1983]
- Updated dependencies [989bcdb]
  - @orcadom/database@0.21.0
  - @orcadom/types@0.21.0
  - @orcadom/open-finance-core@0.21.0
  - @orcadom/open-finance-testing@0.21.0
  - @orcadom/open-finance-meupluggy@0.21.0

## 0.20.2

### Patch Changes

- 9ea8245: O CSV do Sicredi, com valores no formato R$, passa a ser lido na importação.
- 9ea8245: Na importação do extrato do cartão, a entrada do pagamento pode ser vinculada à transferência que já pagou a fatura.
- Updated dependencies [9ea8245]
- Updated dependencies [9ea8245]
  - @orcadom/database@0.20.2
  - @orcadom/types@0.20.2

## 0.20.1

### Patch Changes

- 12850ee: Na importação, a classificação aceita transferência para outra conta, e uma linha que casa com o lançamento da outra conta já vem marcada.
- Updated dependencies [12850ee]
  - @orcadom/database@0.20.1
  - @orcadom/types@0.20.1

## 0.20.0

### Minor Changes

- c0409cf: Checklist de contas a pagar: marcar como paga cria o lançamento. Na importação, o extrato oferece pagar a conta ou vincular o lançamento em vez de duplicar.

### Patch Changes

- Updated dependencies [c0409cf]
  - @orcadom/database@0.20.0
  - @orcadom/types@0.20.0

## 0.19.0

### Patch Changes

- @orcadom/database@0.19.0
  - @orcadom/types@0.19.0

## 0.18.0

### Patch Changes

- @orcadom/database@0.18.0
  - @orcadom/types@0.18.0

## 0.17.0

### Patch Changes

- @orcadom/database@0.17.0
  - @orcadom/types@0.17.0

## 0.16.0

### Minor Changes

- 0d454cf: Categorias podem ter subcategorias e todo espaço novo recebe categorias de sistema. Mover uma categoria altera orçamentos e relatórios de meses passados, porque o cálculo usa a árvore atual.

### Patch Changes

- a0f6083: O limite de login e o IP da sessão passam a usar o endereço real do cliente atrás do proxy, em vez do IP do container web.
- eb907c0: A API aceita várias origens em WEB_ORIGIN, separadas por vírgula. A imagem migrate leva o CLI do Prisma para aplicar migrations dentro do VPS.
- Updated dependencies [0d454cf]
- Updated dependencies [eb907c0]
  - @orcadom/database@0.16.0
  - @orcadom/types@0.16.0

## 0.15.1

### Patch Changes

- Logs estruturados, métricas de cron/HTTP e rastreamento de erros.
- Backup automático do Postgres com teste de restore.
- CI com gate de PR, imagens no GHCR e deploy por ambiente.
- Perfil de deploy de staging, seed e runbook.
- Suíte E2E dos fluxos financeiros críticos.
- Rate limiting no login e na automação.

## 0.15.0

### Minor Changes

- Contas do espaço restritas a um subconjunto de membros, sem vazamento nas outras leituras.

## 0.14.0

### Minor Changes

- App web instalável como PWA, com cache versionado do shell e Web Push.

## 0.13.0

### Minor Changes

- Exportação de relatórios de transações em PDF ou Excel, com os mesmos filtros da listagem.

## 0.12.0

### Minor Changes

- Onboarding: checklist no painel, com progresso derivado dos dados do espaço e dispensa por usuário.
- Sessões com “lembrar neste dispositivo”, rotação de refresh token e detecção de reuso.
- Perfil do usuário: nome, senha, formato de datas e menu da conta.

### Patch Changes

- Corrige o primeiro carregamento do painel após o login.

## 0.11.0

### Minor Changes

- Metas de economia vinculadas a uma conta, com progresso automático pelas transferências.

## 0.10.0

### Minor Changes

- Revisão de design, navegação mobile e contraste WCAG AA em todas as telas existentes.

## 0.9.0

### Minor Changes

- Auditoria e rastreabilidade: registro de quem fez o quê, quando e a
  partir de onde, nas mudanças financeiras do household.

## 0.8.0

### Minor Changes

- Multiusuário/Família: contas, categorias e histórico passam a
  pertencer a um `Household` compartilhado, em vez de um único usuário.

## 0.7.0

### Minor Changes

- Transações recorrentes: cadastro único de lançamentos que se repetem
  (aluguel, assinatura, salário), com geração automática das ocorrências.

## 0.6.0

### Minor Changes

- Parcelamento de compras: um lançamento gera as N parcelas futuras, cada
  uma impactando o saldo apenas no mês em que vence.

## 0.5.0

### Minor Changes

- Notificações in-app e por email: orçamento estourado, extrato pendente
  de revisão e falha na identificação automática da conta.

## 0.4.0

### Minor Changes

- Orçamentos por categoria: limite mensal de gasto e acompanhamento do
  quanto já foi usado em relação a esse limite.

## 0.3.0

### Minor Changes

- Integração com email via n8n: encaminhar o extrato para um endereço
  fixo cria um lote pendente de revisão, sem upload manual.

## 0.2.0

### Minor Changes

- Importação de extratos OFX/CSV com preview, deduplicação e memória de
  categorização.

## 0.1.0

### Minor Changes

- MVP: autenticação, contas, categorias, transações e dashboard mensal.
