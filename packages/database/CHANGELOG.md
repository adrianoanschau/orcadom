# @orcadom/database

## 0.21.2

No changes in this release.

## 0.21.1

No changes in this release.

## 0.21.0

### Minor Changes

- 2bc1983: Add a personal Meu Pluggy adapter that stays off unless its feature flag is enabled.
- 989bcdb: Add an Open Finance provider port, a fake adapter, and API sync through the existing import matcher.

## 0.20.2

### Patch Changes

- 9ea8245: O CSV do Sicredi, com valores no formato R$, passa a ser lido na importação.
- 9ea8245: Na importação do extrato do cartão, a entrada do pagamento pode ser vinculada à transferência que já pagou a fatura.

## 0.20.1

### Patch Changes

- 12850ee: Na importação, a classificação aceita transferência para outra conta, e uma linha que casa com o lançamento da outra conta já vem marcada.

## 0.20.0

### Minor Changes

- c0409cf: Checklist de contas a pagar: marcar como paga cria o lançamento. Na importação, o extrato oferece pagar a conta ou vincular o lançamento em vez de duplicar.

## 0.19.0

No changes in this release.

## 0.18.0

No changes in this release.

## 0.17.0

No changes in this release.

## 0.16.0

### Minor Changes

- 0d454cf: Categorias podem ter subcategorias e todo espaço novo recebe categorias de sistema. Mover uma categoria altera orçamentos e relatórios de meses passados, porque o cálculo usa a árvore atual.

### Patch Changes

- eb907c0: A API aceita várias origens em WEB_ORIGIN, separadas por vírgula. A imagem migrate leva o CLI do Prisma para aplicar migrations dentro do VPS.

## 0.15.1

### Patch Changes

- db9b530: Logs estruturados, métricas de cron/HTTP e rastreamento de erros.

## 0.15.0

### Minor Changes

- 6274f6f: Contas do espaço restritas a um subconjunto de membros, sem vazamento nas outras leituras.

## 0.14.0

### Minor Changes

- 05e8198: App web instalável como PWA, com cache versionado do shell e Web Push.

## 0.13.0

### Minor Changes

- 76489ee: Exportação de relatórios de transações em PDF ou Excel, com os mesmos filtros da listagem.

## 0.12.0

### Minor Changes

- 709f1c5: Sessão com rotação de refresh token, perfil em endpoints próprios e preferência de formato de data.
- d9141ab: Localidade configurável para datas e calendários, independente do idioma do sistema.
- 2b0756f: Checklist de onboarding no painel, com progresso derivado dos dados do espaço e dispensa por usuário.
- 1bec5e9: Sessões com tempo limite, opção de lembrar login e refresh token rotacionado no banco.

## 0.11.0

### Minor Changes

- fb8abd7: Metas de economia vinculadas a uma conta, com progresso automático pelas transferências.

## 0.10.0

### Minor Changes

- cfbe18c: Revisão de design, navegação mobile e contraste WCAG AA em todas as telas existentes.
