# Decisões Arquiteturais

## Gerenciamento de Estado no Frontend

Estado é dividido em duas categorias, cada uma tratada de forma diferente:

### Server State → TanStack Query (React Query)

Qualquer dado que vem da API (contas, categorias, transações, resumo do
dashboard) é gerenciado pelo React Query. Ele resolve:

- Cache automático entre navegações.
- Invalidação de cache após mutações — ex: ao criar uma transação, a query
  do dashboard e a do extrato da conta são invalidadas e recarregadas
  automaticamente.
- Estados de `loading`/`error` prontos, sem precisar de `useEffect` manual.

Isso evita o bug mais comum em telas financeiras: usuário cria um
lançamento e o saldo exibido na tela não reflete a mudança até um refresh
manual.

### UI State local → `useState` / `useReducer`

Estado que não vem do servidor e não precisa ser compartilhado entre telas
(modal aberto, filtro de formulário, step de um wizard) fica no componente,
sem biblioteca externa.

### Por que não Redux/Zustand no MVP

Não há, no escopo atual, estado verdadeiramente global de client (ex:
preferências de tema, sidebar colapsada) que justifique a dependência. Se
isso surgir, Zustand é a escolha natural — mas adicionar agora seria
complexidade prematura.

## DTOs Compartilhados entre Frontend e Backend

O maior risco em um monorepo full-TypeScript sem essa prática é o front e o
back divergirem silenciosamente sobre o formato de um payload (ex: back
espera `amount: number`, front manda `amount: string`).

### Estratégia

1. **Fonte única de verdade**: schemas **Zod** no pacote `packages/types`.

   ```ts
   // packages/types/src/transaction.types.ts
   import { z } from 'zod';

   export const createTransactionSchema = z.object({
     description: z.string().min(1).max(120),
     amount: z.number().positive(),
     type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
     date: z.coerce.date(),
     accountId: z.string().uuid().optional(),
     categoryId: z.string().uuid().optional(),
     fromAccountId: z.string().uuid().optional(),
     toAccountId: z.string().uuid().optional(),
   });

   export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
   ```

2. **Backend (NestJS)**: usar [`nestjs-zod`](https://github.com/BenLorantfy/nestjs-zod)
   para transformar o schema em um `ZodDto`. Isso dá validação automática
   via pipe **e** geração de documentação Swagger a partir do mesmo schema.

3. **Frontend (Next.js)**: usar o mesmo schema com `react-hook-form` +
   `@hookform/resolvers/zod` para validar formulários antes de enviar.

### Resultado

A regra de validação de um campo (ex: "valor deve ser positivo") é escrita
uma única vez e vale simultaneamente para: formulário do front, pipe de
validação do back, e tipo TypeScript em ambos os lados.

## Estratégia de Autenticação

**JWT com Access Token + Refresh Token, via cookies `httpOnly`.**

### Fluxo

1. Login bem-sucedido → API gera dois tokens:
   - `accessToken`: curta duração (~15 minutos).
   - `refreshToken`: duração maior (~7 dias).
2. Ambos são setados como cookies `httpOnly`, `secure`, `sameSite=lax` —
   nunca em `localStorage`.
3. Rotas protegidas do Nest validam o `accessToken` via `JwtStrategy`
   (Passport).
4. Quando o `accessToken` expira, o front chama `POST /auth/refresh`
   (usando o `refreshToken` do cookie) para obter um novo `accessToken`.

### Por que não `localStorage`

`localStorage` é acessível via JavaScript, o que o torna vulnerável a
ataques XSS — qualquer script malicioso injetado na página pode roubar o
token. Cookies `httpOnly` não são acessíveis via JS, reduzindo essa
superfície de ataque. Para um app que lida com dados financeiros, essa
escolha pesa mais que a conveniência.

### Integração com Next.js App Router

Como o Next.js roda no App Router, Server Components e Route Handlers têm
acesso nativo aos cookies da requisição. Isso permite:

- Validar a sessão **antes** de renderizar uma página protegida, direto no
  servidor (sem "flash" de conteúdo não autorizado).
- Um `middleware.ts` fazendo o guard de rota para todo o grupo
  `(dashboard)`, redirecionando para `/login` se não houver sessão válida.

## Regra de segurança transversal

Em nenhum endpoint o `userId` deve ser aceito vindo do corpo da requisição
ou de query params. Ele é **sempre** extraído do JWT validado pelo guard.
Isso evita que um usuário autenticado manipule o payload para acessar ou
alterar dados de outro usuário (IDOR — Insecure Direct Object Reference).
