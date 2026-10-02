# Contribuindo com o Orcadom

## Conventional Commits

Toda mensagem de commit precisa seguir
[Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

    tipo(escopo)?: descrição

O Husky roda o commitlint no hook `commit-msg`. A mensagem nova é
rejeitada se sair do padrão, e o commit nem é criado se algum commit já
na branch, desde `origin/main`, tiver uma linha com mais de 100
caracteres. O hook `pre-push` repete essa checagem do intervalo, a mesma
do CI (`commitlint.yml`), e barra o `git push` se alguma mensagem falhar.

| Tipo       | Quando usar                              |
| ---------- | ---------------------------------------- |
| `feat`     | Nova funcionalidade visível              |
| `fix`      | Correção de bug                          |
| `docs`     | Só documentação                          |
| `style`    | Formatação, sem mudança de comportamento |
| `refactor` | Reestruturação sem feat nem fix          |
| `perf`     | Melhoria de performance                  |
| `test`     | Testes                                   |
| `build`    | Build, dependências, monorepo            |
| `ci`       | Workflows e automação de CI              |
| `chore`    | Manutenção que não se encaixa acima      |
| `revert`   | Reverte um commit anterior               |

A descrição é em **inglês**, minúsculas, imperativo, sem ponto final.
Escopo é opcional (`api`, `web`, `database`, `types`…).

O header e cada linha do corpo e do rodapé têm no máximo 100 caracteres.
O commitlint rejeita a mensagem inteira se uma linha passar disso. Quebre
o corpo: uma frase por linha, sem parágrafo corrido.

```
feat(web): show transaction audit history
fix(api): correct balance calculation on transfers
chore: update prisma dependencies
```

Breaking change: `feat!:` no header, ou o rodapé `BREAKING CHANGE:`.

## Antes de abrir um PR

Toda mudança que altera comportamento do produto precisa de um changeset:

    pnpm changeset

Escolha o tipo de mudança (patch/minor/major) e descreva em uma frase o
que muda — essa descrição vira uma entrada do CHANGELOG.

PRs que não mudam comportamento do produto (documentação, comentários,
configuração interna sem efeito observável) podem receber a label
`no-changeset` em vez de um changeset.

### Qual tipo escolher

| Tipo    | Quando usar                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| `major` | Mudança incompatível — a partir de `1.0.0`. Antes disso, a fase `0.x` permite breaking changes como `minor`. |
| `minor` | Nova funcionalidade visível para o usuário                                                                   |
| `patch` | Correção de bug ou ajuste interno sem comportamento novo                                                     |

Infraestrutura sem efeito observável (CI, observabilidade, backup) também
é `patch` — ou dispensa changeset com a label `no-changeset`.

O CI (`changeset-check`) falha se o PR alterar um pacote do workspace e
não trouxer um arquivo novo em `.changeset/`, a menos que a label
`no-changeset` esteja presente. O PR **chore: release** (aberto pelo
workflow `Release`) também dispensa changeset — os arquivos em
`.changeset/` já foram consumidos nesse PR.

### CI obrigatório

Todo PR contra `main` roda `ci.yml`: generate do Prisma, `turbo run lint
build test` e os testes do job de backup. O merge deve exigir o check
`build-test` na proteção da branch.

### Migrations (expand/contract)

`prisma migrate deploy` roda sozinho no job de deploy, sem revisão
manual no meio. Mudança estrutural (renomear/remover coluna, trocar tipo)
precisa de etapas: **expand** (adicionar o novo) → migrar o dado →
**contract** (remover o antigo numa migration posterior). Não juntar
drop/rename destrutivo numa única migration.

### Versão única do produto

O Orcadom versiona o monorepo inteiro com um único número SemVer. Os
pacotes entram juntos no grupo `fixed` de `.changeset/config.json`. Se um
pacote novo for criado (por exemplo `packages/ui`), adicione o `name` do
`package.json` a essa lista — senão ele fica de fora do versionamento.

A versão canônica vive no `package.json` da raiz e é o que vira tag Git
(`v0.9.0`) e entrada do `CHANGELOG.md`.

### Fluxo de release

1. PRs de feature/fix entram em `main` com o respectivo changeset.
   Esse merge não faz deploy de produção.
2. O workflow `Release` abre ou atualiza o PR **chore: release**, com a
   próxima versão e o changelog. O push do branch
   `changeset-release/main` usa um GitHub App, então o CI (`build-test`)
   roda nesse PR.
3. O merge desse PR — merge commit, squash ou rebase — muda a versão do
   `package.json` da raiz. O workflow `Tag Release` cria a tag `vX.Y.Z`,
   publica `api`, `web` e `migrate` no GHCR com essa versão, abre a
   GitHub Release e faz o deploy de produção dessa mesma tag, quando
   `DEPLOY_ENABLED` estiver ligado.
4. Redeploy ou rollback de uma tag já publicada: Actions → **Deploy
   produção** → Run workflow, input `version` (ex.: `v0.16.0`), a
   partir da branch `main`.

Detalhe da pipeline: [`docs/28-cicd.md`](./docs/28-cicd.md) e
[`docs/32-deploy-vps-previews.md`](./docs/32-deploy-vps-previews.md).
O processo de changeset: [`docs/16-versionamento.md`](./docs/16-versionamento.md).
