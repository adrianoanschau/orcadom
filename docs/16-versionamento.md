# Versionamento — SemVer e Rotina de Releases

> Documento de processo, não de feature — mas entra no mesmo backlog
> porque a rotina descrita aqui só faz sentido operar de verdade depois
> que **CI/CD** (item 7 do [roadmap para a 1.0](./15-roadmap-v1.md)) e
> **Ambiente de Staging** (item 8) existirem. Até lá, a numeração de
> versão pode ser adotada manualmente, sem toda a automação.

## 1. Objetivo

Adotar **Versionamento Semântico (SemVer)** para o Orcadom, com uma
rotina definida de quando e como a versão muda — para que o número da
versão comunique algo real (o que mudou, se é seguro atualizar, se algo
pode quebrar), em vez de ser incrementado de forma arbitrária.

## 2. Por que SemVer, e o que cada número significa aqui

Formato `MAJOR.MINOR.PATCH` (ex: `1.4.2`):

| Posição | Incrementa quando | Exemplo no contexto do Orcadom |
|---|---|---|
| `MAJOR` | Mudança que quebra compatibilidade — exige ação manual de quem está atualizando (migration não-automática, contrato de API removido/alterado de forma incompatível, mudança que um cliente externo da API precisaria se adaptar) | Remover um endpoint antigo, mudar o formato de um DTO de forma incompatível com o que o frontend/app mobile atual espera |
| `MINOR` | Nova funcionalidade, compatível com o que já existia | Qualquer uma das features do roadmap (Metas de Economia, Relatórios, Open Finance...) |
| `PATCH` | Correção de bug ou ajuste interno, sem mudança de comportamento visível nem nova funcionalidade | Corrigir cálculo errado de saldo, ajustar performance de uma query, atualizar dependência sem efeito colateral |

### 2.1 — A regra especial da versão `0.x.y`

O próprio SemVer define que, enquanto a versão principal for `0`
(ex: `0.8.0`), o projeto está em **desenvolvimento inicial** e qualquer
coisa pode mudar, inclusive de forma incompatível, sem exigir um `MAJOR`
— é exatamente a fase em que o Orcadom está agora. Isso importa na prática
para uma decisão concreta: a migração estrutural de
[`13-multiusuario.md`](./13-multiusuario.md), mesmo sendo a mudança de
schema mais profunda do projeto até aqui, **não precisa** forçar a versão
`1.0.0` por si só — ela pode (e deve) entrar como um `MINOR` normal,
seguindo a régua da seção 4.

`1.0.0` é reservado para o marco já definido em `15-roadmap-v1.md`: quando
os 12 itens do roadmap estiverem completos, o projeto sai do "em
desenvolvimento inicial" e passa a valer a disciplina completa de SemVer
(seção 2, sem a exceção da 2.1) — a partir daí, sim, uma mudança
incompatível exige `MAJOR`.

## 3. Escopo do versionamento: produto, não pacote

O Orcadom é um monorepo, mas não publica pacotes para consumo externo
(`packages/database`, `packages/types` etc. são internos, nunca
publicados em um registry). Por isso, **a versão é única para o produto
inteiro** — não uma versão por pacote do monorepo, como fariam
ferramentas como Changesets em um monorepo de bibliotecas públicas.

A versão vive em um único lugar, refletida em `package.json` da raiz, e é
o que aparece como tag Git (`v0.8.0`) e como referência no `CHANGELOG.md`.

## 4. Mapeamento das features já planejadas às versões

Retroativo (o que já foi documentado até aqui) e prospectivo (o roadmap de
`15-roadmap-v1.md`), como referência — a numeração exata pode ajustar
durante a implementação, mas a régua de incremento (feature = `MINOR`)
não muda:

| Versão | Conteúdo |
|---|---|
| `0.1.0` | MVP (`00` a `06`): auth, contas, categorias, transações, dashboard |
| `0.2.0` | Importação de Extratos + Memória de Categorização (`07`) |
| `0.3.0` | Integração com Email via n8n (`08`) |
| `0.4.0` | Orçamentos por Categoria (`09`) |
| `0.5.0` | Notificações (`10`) |
| `0.6.0` | Parcelamento de Compras (`11`) |
| `0.7.0` | Transações Recorrentes (`12`) |
| `0.8.0` | Multiusuário/Família (`13`) |
| `0.9.0` | Auditoria e Rastreabilidade (`14`) |
| `0.10.0` | Metas de Economia |
| `0.11.0` | Exportar Relatórios |
| `0.12.0` | App Mobile como PWA |
| `0.13.0` | Permissão Granular por Conta |
| — | Observabilidade, Backup, CI/CD, Staging, Testes E2E, Rate Limiting — ver seção 4.1 |
| `0.14.0` | Integração Open Finance |
| `0.15.0` | Insights Automáticos |
| **`1.0.0`** | **Marco de conclusão do roadmap — release estável** |

### 4.1 — Itens de infraestrutura não incrementam `MINOR`

Observabilidade, Backup, CI/CD, Ambiente de Staging, Cobertura de Testes
E2E e Rate Limiting não adicionam funcionalidade visível ao usuário — são
tratados como `PATCH` (ou, em alguns casos, nem geram uma tag de versão
pública própria, só passam a fazer parte do processo de release a partir
da sua implementação). A régua aqui é: **se o usuário final não percebe
nada de novo usando o app, não é `MINOR`.**

## 5. Rotina de release

### 5.1 — Ferramenta: Changesets

Mesmo o Orcadom não publicando pacotes, a ferramenta
[Changesets](https://github.com/changesets/changesets) é adotada pela
disciplina que ela impõe: toda mudança relevante é declarada
explicitamente no momento do Pull Request, em vez de alguém decidir "que
versão é essa" na hora do release, de memória.

```bash
pnpm changeset
# Pergunta: qual o tipo de mudança (patch/minor/major)?
# Pergunta: descrição em texto livre (vira entrada do CHANGELOG)
```

Isso gera um arquivo `.changeset/*.md` versionado junto do código, que
descreve a mudança — e é obrigatório em todo PR que altera comportamento
do produto (enforçado no CI, item 7 do roadmap: um PR sem changeset e sem
label `no-changeset` falha o pipeline).

### 5.2 — Fluxo completo

```
PR aberto com uma feature/fix
        │
        ▼
Inclui um changeset (pnpm changeset) descrevendo patch/minor/major
        │
        ▼
PR revisado e mergeado em main
        │
        ▼
CI detecta changesets pendentes → abre/atualiza automaticamente um
"Release PR" (branch de release), que:
  - agrupa todos os changesets pendentes
  - calcula a próxima versão (maior incremento entre os changesets)
  - atualiza package.json e CHANGELOG.md
        │
        ▼
Esse Release PR fica aberto, acumulando mais changesets conforme
outros PRs de feature são mergeados — até alguém decidir que é hora
de lançar
        │
        ▼
Merge do Release PR → CI:
  1. cria a tag Git (ex: v0.9.0)
  2. builda a imagem/artefato uma única vez
  3. publica a mesma imagem em staging
        │
        ▼
Validação manual em staging (ambiente do item 8 do roadmap)
        │
        ▼
Promoção da MESMA imagem (não rebuild) de staging para produção
```

**Por que promover a mesma imagem, em vez de rebuildar para produção:**
garante que o que foi validado em staging é byte-a-byte o que vai para
produção — elimina a categoria de bug "funcionava em staging porque a
build era outra".

## 6. Convenções complementares

- **Tags Git:** `vMAJOR.MINOR.PATCH` (ex: `v0.9.0`), criadas apenas pelo
  pipeline de release, nunca manualmente.
- **`CHANGELOG.md`:** gerado automaticamente a partir dos changesets — uma
  entrada por versão, com a descrição que cada changeset registrou.
- **Branch principal (`main`) é sempre deployável.** Nenhum PR é mergeado
  em estado quebrado — é o que o CI (item 7) existe para garantir antes
  de qualquer changeset ser processado.
- **Pré-lançamentos (opcional, a partir de `1.0.0`):** para mudanças de
  maior risco (ex: uma futura integração Open Finance), o fluxo pode
  incluir versões `-rc.N` (`1.4.0-rc.1`) publicadas primeiro em staging
  antes da promoção para produção definitiva.

## 7. Fases de Execução

### Fase 1 — Adoção manual (antes do CI/CD existir)

- [ ] Definir `0.1.0` retroativamente como a versão do MVP já concluído,
      criando a tag correspondente no histórico do Git.
- [ ] Adotar Changesets no monorepo (`pnpm add -D @changesets/cli`,
      `pnpm changeset init`).
- [ ] Criar `CHANGELOG.md` inicial, reconstruído a partir dos documentos
      de feature já existentes (`07` a `14`), como ponto de partida.

### Fase 2 — Automação (junto com CI/CD, item 7 do roadmap)

- [ ] Gate de CI exigindo changeset em todo PR de feature.
- [ ] Automação do Release PR (ação do GitHub, ex:
      `changesets/action`).
- [ ] Pipeline de build único + promoção de imagem entre staging e
      produção (depende do item 8 do roadmap já existir).

### Fase 3 — Disciplina pós-1.0

- [ ] Revisão do que conta como `MAJOR` passa a ser levada a sério de
      fato (antes de `1.0.0`, a exceção da seção 2.1 relaxa isso).
- [ ] Processo de comunicação de breaking change (ex: nota destacada no
      `CHANGELOG.md`, não só a entrada padrão).

## 8. Riscos e pontos de atenção

- **Antes do CI/CD existir, a rotina depende de disciplina manual** — o
  risco real é alguém esquecer de criar um changeset ou de atualizar a
  versão, e o número ficar defasado do que realmente está em produção.
  Vale tratar a Fase 1 como transitória, não como estado permanente
  aceitável.
- **A exceção da seção 2.1 é uma faca de dois gumes:** ela dá liberdade
  para reestruturar o schema sem a burocracia de um `MAJOR` enquanto o
  projeto está em `0.x`, mas também significa que, tecnicamente, nada
  garante retrocompatibilidade nessa fase. Isso é aceitável para um
  projeto de instância única/uso pessoal-familiar como o Orcadom é hoje —
  se um dia existir um app mobile nativo com ciclo de deploy
  **independente** do backend (fora do escopo atual, que optou por PWA no
  item 3 do roadmap justamente para evitar esse problema), a disciplina de
  `MAJOR` para mudança de contrato de API precisaria começar a valer bem
  antes de `1.0.0`.
