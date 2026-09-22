# Orcadom — Visão Geral do Projeto

## O que é

Orcadom é um sistema de controle financeiro doméstico. Permite ao usuário
cadastrar suas contas (carteira, conta corrente, cartão de crédito), registrar
receitas, despesas e transferências entre contas, organizar tudo por
categorias e visualizar um dashboard de consolidação mensal.

## Objetivo do MVP

Entregar um fluxo completo e funcional — do cadastro do usuário até a
visualização do saldo consolidado — antes de adicionar qualquer
funcionalidade avançada (metas, orçamentos, relatórios exportáveis,
múltiplos usuários por família, etc.). O critério de sucesso do MVP é:

> Um usuário consegue se cadastrar, criar suas contas, lançar suas
> transações do mês e ver, no dashboard, quanto entrou, quanto saiu e qual o
> saldo por conta — sem inconsistência nos números.

## Escopo do MVP

| # | Módulo | Descrição |
|---|--------|-----------|
| 1 | Autenticação | Cadastro e login de usuário (JWT) |
| 2 | Contas | CRUD de contas: Carteira, Conta Corrente, Cartão de Crédito |
| 3 | Categorias | CRUD de categorias de receita e despesa |
| 4 | Transações | Lançamento de receitas, despesas e transferências entre contas |
| 5 | Dashboard | Consolidação mensal: total de receitas, despesas, saldo e breakdown por categoria |

## Fora do escopo do MVP (backlog futuro)

Registrado aqui para não ser esquecido, mas explicitamente **não** faz parte
da primeira entrega:

- Orçamentos por categoria (definir limite de gasto mensal)
- Metas de economia
- Transações recorrentes/parceladas automáticas
- Múltiplos usuários compartilhando as mesmas contas (uso "familiar")
- Importação de extrato bancário (OFX/CSV)
- Exportação de relatórios (PDF/Excel)
- App mobile nativo

## Stack Tecnológica

| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Monorepo | pnpm workspaces + Turborepo | Compartilhar tipos entre front e back, cache de build |
| Backend | NestJS | Arquitetura modular, DI nativa, escala bem para regras de negócio financeiras |
| Banco de Dados | PostgreSQL | Transações ACID, essencial para consistência de saldo |
| ORM | Prisma | Tipagem gerada automaticamente, migrations versionadas |
| Frontend | Next.js (App Router) + Tailwind CSS | Server Components reduzem waterfall de dados no dashboard |
| Infra local | Docker Compose | Ambiente de banco reproduzível para qualquer dev |

## Documentos relacionados

- [`01-arquitetura-monorepo.md`](./01-arquitetura-monorepo.md) — estrutura de pastas
- [`02-modelagem-dados.md`](./02-modelagem-dados.md) — schema Prisma e relações
- [`03-decisoes-arquiteturais.md`](./03-decisoes-arquiteturais.md) — estado, DTOs, autenticação
- [`04-roadmap.md`](./04-roadmap.md) — fases de execução
- [`05-infraestrutura-docker.md`](./05-infraestrutura-docker.md) — ambiente local
