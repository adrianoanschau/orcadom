# Implementação do Versionamento Automatizado (GitHub)

> Guia de execução para implementar o que foi definido em
> [`16-versionamento.md`](./16-versionamento.md). Escrito como checklist
> acionável — pensado para orientar a implementação assistida (Cursor),
> não como justificativa de decisão (isso já está no documento de
> processo). Cobre **versionamento, changelog e criação de tag** de forma
> automatizada; a pipeline de build/deploy em si é o item 8 do
> [roadmap](./15-roadmap-v1.md) (CI/CD), ainda não implementado — este
> plano deixa o ponto de extensão pronto para quando ela existir, mas não
> a constrói.

## 0. Estado assumido do repositório

- Monorepo pnpm workspaces + Turborepo, conforme
  `01-arquitetura-monorepo.md`.
- Implementação já cobre até Auditoria (`14`), incluindo Multiusuário
  (`13`) — ou seja, o estado atual do produto corresponde a **`0.9.0`** na
  tabela de mapeamento de `16-versionamento.md`.
- Repositório hospedado no GitHub, com `main` como branch principal.
- Ainda **não** existe pipeline de CI/CD nem Changesets configurado.

## 1. Objetivo deste plano

Ao final da execução:

1. Toda mudança relevante em um PR precisa vir acompanhada de um
   changeset — PR sem changeset (e sem label de dispensa) falha o check.
2. Ao mergear PRs com changesets pendentes em `main`, um workflow abre/
   atualiza automaticamente um **Release PR** (branch de release) com a
   versão calculada e o `CHANGELOG.md` atualizado.
3. Ao mergear o Release PR, o GitHub cria automaticamente a **tag**
   `vX.Y.Z` e uma **GitHub Release** com as notas geradas.
4. O repositório atual é retroativamente marcado como `v0.9.0`, ponto de
   partida da automação daqui para frente.

## 2. Passo a passo

### 2.1 — Instalar e inicializar o Changesets

```bash
pnpm add -D -w @changesets/cli
pnpm changeset init
```

Isso cria `.changeset/config.json` e `.changeset/README.md` na raiz.

### 2.2 — Configurar `.changeset/config.json` para versão única do produto

Por padrão, o Changesets versiona cada pacote do workspace de forma
independente. Como definido na seção 3 de `16-versionamento.md`, o
Orcadom precisa de **uma única versão para o produto inteiro** — a
configuração usa o modo `fixed`, agrupando todos os pacotes do monorepo
para que sejam sempre incrementados juntos, para o mesmo número:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [
    ["orcadom", "@orcadom/api", "@orcadom/web", "@orcadom/database", "@orcadom/types", "@orcadom/ui", "@orcadom/config"]
  ],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

`"access": "restricted"` existe porque nenhum pacote é publicado no npm —
o Changesets é usado aqui só pelo mecanismo de changelog/versão, nunca
pelo passo de `publish` para um registry público (seção 2.5 trata disso
explicitamente).

**Pré-requisito para o `fixed` funcionar:** todo `package.json` listado
precisa existir com o `name` correspondente. Confirmar que:
- O `package.json` da raiz tem `"name": "orcadom"` e `"private": true`
  (já deve existir desde a Fase 1 do setup do monorepo).
- `apps/api/package.json` tem `"name": "@orcadom/api"`.
- `apps/web/package.json` tem `"name": "@orcadom/web"`.
- Cada pacote em `packages/*` segue a convenção `@orcadom/<nome>` já
  estabelecida em `01-arquitetura-monorepo.md`.

Se algum desses nomes ainda não seguir essa convenção, ajustar antes de
prosseguir — o `fixed` do Changesets referencia pacotes pelo `name` do
`package.json`, não pelo caminho.

### 2.3 — Definir a versão inicial retroativa

Editar manualmente `package.json` da raiz (e, por causa do `fixed`, de
todos os pacotes listados) para `"version": "0.9.0"`.

```bash
git add -A
git commit -m "chore: fixa versão inicial retroativa em 0.9.0"
git tag v0.9.0
git push origin main --tags
```

Esse é o único passo manual de versionamento — daqui para frente, todo
incremento acontece pela automação dos passos seguintes.

### 2.4 — Workflow de verificação de changeset em PRs

Cria-se `.github/workflows/changeset-check.yml`, rodando em todo PR
contra `main`:

```yaml
name: Changeset Check

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Verifica changeset pendente
        if: ${{ !contains(github.event.pull_request.labels.*.name, 'no-changeset') }}
        run: |
          pnpm changeset status --since=origin/main
```

`pnpm changeset status --since=origin/main` falha (exit code diferente de
zero) se o PR não incluir nenhum arquivo `.changeset/*.md` novo — é o que
faz o job falhar e bloquear o merge. A label `no-changeset` é a válvula de
escape documentada em `16-versionamento.md` (seção 5.1), para PRs que
realmente não mudam comportamento do produto (ex: ajuste de comentário,
correção de typo em documentação).

### 2.5 — Workflow de Release PR automático

Cria-se `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Cria/atualiza Release PR ou publica release
        uses: changesets/action@v1
        with:
          title: "chore: release"
          commit: "chore: release"
          version: pnpm changeset version
          # Sem "publish" apontando para npm — este monorepo não publica
          # pacotes públicos. O passo de tag é feito pela própria action
          # ao detectar que não há mais changesets pendentes (ver nota).
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Como a `changesets/action` se comporta neste fluxo:**

- Quando existem changesets pendentes em `main`, a action roda
  `pnpm changeset version` (atualiza `package.json` dos pacotes no grupo
  `fixed`, gera/atualiza `CHANGELOG.md`) e abre ou atualiza um Pull
  Request chamado **"chore: release"**, com esse resultado.
- Esse PR fica acumulando novos changesets automaticamente a cada push em
  `main`, até alguém decidir mergeá-lo — exatamente o fluxo descrito na
  seção 5.2 de `16-versionamento.md`.
- Quando o Release PR é mergeado, o workflow roda de novo (é um push em
  `main`), mas desta vez **não há changesets pendentes** — nesse caso, sem
  um comando de `publish` configurado, a action não tenta publicar em
  lugar nenhum. É o workflow seguinte (2.6) que reage a esse merge para
  criar a tag.

### 2.6 — Workflow de tag e GitHub Release no merge do Release PR

Cria-se `.github/workflows/tag-release.yml`, que detecta especificamente o
merge do PR de release (pelo commit de versão) e cria a tag + a Release do
GitHub:

```yaml
name: Tag Release

on:
  push:
    branches: [main]

jobs:
  tag:
    if: startsWith(github.event.head_commit.message, 'chore: release')
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Lê a versão atual
        id: version
        run: echo "version=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Cria a tag
        run: |
          git tag "v${{ steps.version.outputs.version }}"
          git push origin "v${{ steps.version.outputs.version }}"

      - name: Cria a GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: "v${{ steps.version.outputs.version }}"
          body_path: CHANGELOG.md
          generate_release_notes: false
```

**Ponto de extensão para quando o CI/CD (item 8 do roadmap) existir:** o
job `tag` acima é o lugar natural para, no futuro, disparar o build de
imagem e a publicação em staging descritos na seção 5.2 de
`16-versionamento.md` ("builda a imagem/artefato uma única vez" →
"publica a mesma imagem em staging"). Por ora, este plano só cria a tag e
a Release — o deploy continua manual até o item 8 ser implementado.

### 2.7 — Atualizar o guia de contribuição

Adicionar (ou criar) `CONTRIBUTING.md` na raiz, documentando o fluxo para
qualquer pessoa (ou agente) abrindo um PR:

```md
## Antes de abrir um PR

Toda mudança que altera comportamento do produto precisa de um changeset:

    pnpm changeset

Escolha o tipo de mudança (patch/minor/major) e descreva em uma frase o
que muda — essa descrição vira uma entrada do CHANGELOG.

PRs que não mudam comportamento do produto (documentação, comentários,
configuração interna sem efeito observável) podem receber a label
`no-changeset` em vez de um changeset.
```

## 3. Ordem de execução recomendada

1. Passo 2.1 e 2.2 — instalar e configurar o Changesets.
2. Passo 2.3 — fixar `0.9.0` e criar a tag retroativa. **Fazer isso antes
   de mergear qualquer workflow novo**, para a primeira tag não nascer já
   através da automação (evita um Release PR "vazio" na primeira
   execução).
3. Passo 2.4 — workflow de check em PR.
4. Passo 2.5 — workflow de Release PR.
5. Passo 2.6 — workflow de tag/release.
6. Passo 2.7 — documentar em `CONTRIBUTING.md`.
7. Validação (seção 4) — abrir um PR de teste real para confirmar o fluxo
   de ponta a ponta antes de considerar concluído.

## 4. Critérios de validação

- [ ] Um PR sem changeset falha o check de `changeset-check.yml`.
- [ ] O mesmo PR, com a label `no-changeset`, passa no check sem exigir
      changeset.
- [ ] Um PR com `pnpm changeset` executado e mergeado em `main` faz
      aparecer (ou atualizar) o Release PR "chore: release" automaticamente.
- [ ] O Release PR mostra o `CHANGELOG.md` corretamente atualizado e a
      versão correta calculada (conferir se bateu com o tipo de changeset
      escolhido — patch/minor/major).
- [ ] Ao mergear o Release PR, a tag `vX.Y.Z` é criada no repositório e
      uma GitHub Release aparece com o changelog daquela versão.
- [ ] Repetir o ciclo uma segunda vez (novo PR com changeset → merge →
      Release PR → merge) para confirmar que o fluxo é repetível, não só
      funcionou uma vez.

## 5. Riscos e pontos de atenção específicos desta implementação

- **`GITHUB_TOKEN` padrão pode não ter permissão suficiente** para a
  `changesets/action` abrir Pull Requests, dependendo da configuração de
  permissões do repositório (Settings → Actions → General → Workflow
  permissions). Se o Release PR não for criado mesmo com changesets
  pendentes, o primeiro ponto a checar é essa configuração — garantir
  "Read and write permissions" habilitado, ou usar um PAT dedicado como
  secret alternativo caso a política da organização não permita elevar o
  `GITHUB_TOKEN` padrão.
- **O modo `fixed` exige que os nomes dos pacotes batam exatamente** com
  o que está em `.changeset/config.json` — um pacote renomeado ou um novo
  pacote adicionado ao monorepo no futuro (ex: se `packages/ui` só for
  criado quando a Revisão de Design/UX, item 1 do roadmap, chegar) precisa
  ser adicionado manualmente a essa lista, ou ele ficará de fora do
  versionamento único e divergirá dos demais.
- **A condição `startsWith(...'chore: release')`** no workflow de tag
  (2.6) depende do título de commit que a própria `changesets/action` usa
  por padrão — se o `title`/`commit` configurados no passo 2.5 forem
  alterados no futuro, essa condição precisa ser atualizada junto, ou o
  workflow de tag para de disparar silenciosamente.
- **Testar em um repositório/branch de teste antes de rodar contra `main`
  de verdade**, especialmente o passo 2.3 (tag retroativa) — criar uma tag
  errada é reversível, mas confunde histórico se descoberto tarde.
