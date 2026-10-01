# @orcadom/api

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

- db9b530: Logs estruturados, métricas de cron/HTTP e rastreamento de erros.
- d083809: Rate limiting no login e na automação.

## 0.15.0

### Minor Changes

- 6274f6f: Contas do espaço restritas a um subconjunto de membros, sem vazamento nas outras leituras.

### Patch Changes

- Updated dependencies [6274f6f]
  - @orcadom/database@0.15.0
  - @orcadom/types@0.15.0

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
- c31d01a: Página de perfil e menu da conta na sidebar, com avatar, configurações e sair.

### Patch Changes

- Updated dependencies [709f1c5]
- Updated dependencies [d9141ab]
- Updated dependencies [2b0756f]
- Updated dependencies [1bec5e9]
- Updated dependencies [c31d01a]
  - @orcadom/database@0.12.0
  - @orcadom/types@0.12.0

## 0.11.0

### Minor Changes

- fb8abd7: Metas de economia vinculadas a uma conta, com progresso automático pelas transferências.

### Patch Changes

- Updated dependencies [fb8abd7]
  - @orcadom/database@0.11.0
  - @orcadom/types@0.11.0

## 0.10.0

### Minor Changes

- cfbe18c: Revisão de design, navegação mobile e contraste WCAG AA em todas as telas existentes.

### Patch Changes

- Updated dependencies [cfbe18c]
  - @orcadom/database@0.10.0
  - @orcadom/types@0.10.0
