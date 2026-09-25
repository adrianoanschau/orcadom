# Contribuindo com o Orcadom

## Antes de abrir um PR

Toda mudança que altera comportamento do produto precisa de um changeset:

    pnpm changeset

Escolha o tipo de mudança (patch/minor/major) e descreva em uma frase o
que muda — essa descrição vira uma entrada do CHANGELOG.

PRs que não mudam comportamento do produto (documentação, comentários,
configuração interna sem efeito observável) podem receber a label
`no-changeset` em vez de um changeset.

### Qual tipo escolher

| Tipo | Quando usar |
|---|---|
| `major` | Mudança incompatível — a partir de `1.0.0`. Antes disso, a fase `0.x` permite breaking changes como `minor`. |
| `minor` | Nova funcionalidade visível para o usuário |
| `patch` | Correção de bug ou ajuste interno sem comportamento novo |

Infraestrutura sem efeito observável (CI, observabilidade, backup) também
é `patch` — ou dispensa changeset com a label `no-changeset`.

O CI (`changeset-check`) falha se o PR alterar um pacote do workspace e
não trouxer um arquivo novo em `.changeset/`, a menos que a label
`no-changeset` esteja presente.

### Versão única do produto

O Orcadom versiona o monorepo inteiro com um único número SemVer. Os
pacotes entram juntos no grupo `fixed` de `.changeset/config.json`. Se um
pacote novo for criado (por exemplo `packages/ui`), adicione o `name` do
`package.json` a essa lista — senão ele fica de fora do versionamento.

A versão canônica vive no `package.json` da raiz e é o que vira tag Git
(`v0.9.0`) e entrada do `CHANGELOG.md`.

### Fluxo de release

1. PRs de feature/fix entram em `main` com o respectivo changeset.
2. O workflow `Release` abre ou atualiza o PR **chore: release**, com a
   próxima versão e o changelog.
3. O merge desse PR cria a tag `vX.Y.Z` e a GitHub Release.

Detalhes do processo: [`docs/16-versionamento.md`](./docs/16-versionamento.md).
