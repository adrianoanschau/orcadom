# Arquitetura do Monorepo

## Ferramentas

- **pnpm workspaces** — resolução de dependências e linkagem entre pacotes locais.
- **Turborepo** — orquestração e cache de tarefas (`build`, `dev`, `lint`, `test`) entre os pacotes.

## Estrutura de Pastas

```
orcadom/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── accounts/
│   │   │   │   ├── categories/
│   │   │   │   └── transactions/
│   │   │   ├── common/           # guards, interceptors, pipes, decorators
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                      # Next.js App Router
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/login/
│       │   │   ├── (dashboard)/
│       │   │   │   ├── dashboard/
│       │   │   │   ├── accounts/
│       │   │   │   ├── categories/
│       │   │   │   └── transactions/
│       │   │   └── layout.tsx
│       │   ├── components/
│       │   ├── lib/              # api client, auth helpers
│       │   └── hooks/
│       └── package.json
│
├── packages/
│   ├── database/                 # Prisma
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   └── index.ts          # exporta PrismaClient singleton
│   │   └── package.json
│   │
│   ├── types/                    # DTOs e Zod schemas compartilhados
│   │   ├── src/
│   │   │   ├── account.types.ts
│   │   │   ├── transaction.types.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ui/                       # componentes React compartilháveis (pós-MVP)
│   │   └── src/
│   │
│   └── config/                   # eslint-config, tsconfig base, etc.
│
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Por que cada pacote existe

### `apps/api` e `apps/web`
Aplicações finais, deployáveis de forma independente. Não compartilham
código diretamente entre si — tudo que é comum passa pelos `packages/`.

### `packages/database`
O Prisma fica em um pacote próprio, e não dentro de `apps/api`, por dois
motivos:

1. O `PrismaClient` gerado é um artefato compartilhável — se no futuro
   surgir um worker, script de seed ou CLI de importação de extrato que
   precise acessar o banco sem subir a API inteira, ele importa esse pacote
   diretamente.
2. Mantém a fronteira clara: "banco de dados" é uma responsabilidade
   separada de "API HTTP".

### `packages/types`
Contém os schemas **Zod** (e os tipos TS inferidos a partir deles) que
descrevem os DTOs de entrada/saída da API. Tanto o NestJS quanto o Next.js
importam desse pacote — é o que garante que front e back nunca divirjam
sobre o formato de um payload. Detalhes de uso em
[`03-decisoes-arquiteturais.md`](./03-decisoes-arquiteturais.md).

### `packages/ui`
Não é necessário no MVP (o Next.js tem uma única aplicação consumindo os
componentes). Fica reservado para quando/se surgir uma segunda superfície
(ex: app mobile ou landing page separada) que precise reaproveitar
componentes visuais.

### `packages/config`
Configurações compartilhadas de `eslint`, `tsconfig` e `prettier`, para que
`apps/api` e `apps/web` estendam a mesma base em vez de duplicar regras.

## Convenção de nomes dos pacotes internos

Recomenda-se prefixar os pacotes internos com um escopo, ex: `@orcadom/database`,
`@orcadom/types`, `@orcadom/ui`. Isso deixa explícito nos imports que aquele
código vem do monorepo e não de uma dependência externa do npm.
