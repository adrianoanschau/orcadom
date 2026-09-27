# Autenticação, Sessão e Perfil (documentação retroativa)

> Diferente dos demais documentos numerados, este **não é um plano para
> implementar** — é um registro do que já está no código, escrito depois
> da implementação, para a suíte de documentação continuar refletindo o
> sistema real. Trabalho já entregue (conforme relatório do Cursor de
> 27/09/2026), mas ainda **sem changeset/versão associada** — pendência já
> sinalizada em [`16-versionamento.md`](./16-versionamento.md): a próxima
> release após `0.11.0` (Metas de Economia) precisa incluir esta entrega
> antes ou junto do Onboarding (`0.12.0`).

## 1. O que motivou a revisão

A autenticação original do MVP (`03-decisoes-arquiteturais.md`) definia
apenas JWT com access token curto e refresh token de 7 dias, sem
diferenciar "quero continuar logado neste computador" de "estou em um
dispositivo que não é meu". A revisão implementada resolve isso, além de
adicionar detecção de reuso de token roubado — uma lacuna de segurança que
o desenho original não cobria.

## 2. Modelagem de dados

### 2.1 — `RefreshToken`

Substitui a suposição implícita de "um refresh token por sessão" por uma
tabela que permite rotação e detecção de reuso:

```prisma
model RefreshToken {
  id                  String    @id @default(uuid())
  tokenHash           String    @unique // nunca o token em texto puro
  remember            Boolean   @default(false) // se nasceu de "lembrar neste dispositivo"
  expiresAt           DateTime
  revokedAt           DateTime?
  replacedByTokenHash String?   // aponta para o token que o substituiu na rotação
  userAgent           String?
  ipAddress           String?
  createdAt           DateTime  @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("refresh_tokens")
}
```

### 2.2 — Preferência de formato de data em `User`

```prisma
enum DateFormatPreference {
  PT_BR   // DD/MM/AAAA
  EN_US   // MM/DD/AAAA
  SYSTEM  // segue o idioma do navegador
}

// Campo adicionado a User:
//   dateFormatPreference DateFormatPreference @default(SYSTEM)
```

Importante: isso afeta **apenas a formatação de datas** exibidas — a
interface do Orcadom continua inteiramente em português. Não é
internacionalização de texto, é preferência de formato numérico de data.

## 3. Regras de sessão

| | Sem "lembrar" | Com "lembrar" |
|---|---|---|
| Tempo efetivo do refresh | Até fechar o navegador, no máximo 12h | 30 dias |
| Tipo de cookie | De sessão (expira ao fechar o navegador) | Persistente (`Max-Age` de 30 dias) |
| Access token | ~15 minutos nos dois casos; renovado em silêncio pelo client | ~15 minutos |

O checkbox **"Lembrar login neste dispositivo"** só aparece em `/login` —
o cadastro (`/register`) sempre inicia com sessão curta, por ser o
primeiro acesso em um dispositivo potencialmente não confiável ainda.

## 4. Segurança

- **Tokens em cookie `httpOnly`**, nunca expostos ao JavaScript da página
  — mesma decisão já registrada desde `03-decisoes-arquiteturais.md`,
  agora reafirmada na implementação real.
- **Rotação com detecção de reuso:** a cada renovação, o refresh token
  antigo é marcado como usado (`replacedByTokenHash` preenchido) e deixa
  de ser válido. Se alguém tentar reusar um token já substituído, o
  sistema interpreta isso como sinal de roubo e **revoga todas as sessões
  daquele usuário** (`revokedAt` em todos os `RefreshToken` ativos) — não
  só a sessão suspeita.
- **Comparação de email sem diferenciar maiúsculas:** o email é
  normalizado para minúsculas tanto na gravação (cadastro) quanto na
  consulta (login), em vez de depender de collation case-insensitive do
  Postgres — mais simples e portável, sem exigir extensão adicional no
  banco.
- **Mensagem de erro genérica no login:** "E-mail ou senha inválidos."
  é a mesma resposta tanto para email inexistente quanto para senha
  errada — evita que a mensagem de erro revele se uma conta existe
  (enumeração de usuários), mesmo princípio de cautela já aplicado em
  outras partes do sistema (ex: nunca aceitar `userId` vindo do corpo da
  requisição).
- **Logout revoga de verdade:** marca o `RefreshToken` como `revokedAt` no
  banco e limpa os cookies — não é só "esquecer o cookie no navegador",
  o token realmente para de funcionar caso alguém o tenha capturado antes.

## 5. Fluxos implementados

### 5.1 — Cadastro (`/register`)

Nome, email, senha (mínimo 8 caracteres) e confirmação. Ao concluir, cria
o usuário **e** um `Household` ("Família de {nome}") com o usuário como
`OWNER` — mesmo comportamento já previsto na migração de
`13-multiusuario.md` para instalação de usuário único. Sessão inicia
sempre curta (sem "lembrar").

### 5.2 — Login (`/login`)

Email, senha, checkbox de "lembrar". Define a duração do refresh token e
o tipo de cookie conforme a tabela da seção 3.

### 5.3 — Perfil (`/profile`)

- Avatar com iniciais (derivado do nome, sem upload de imagem).
- Email somente leitura (não editável — trocar email não foi
  implementado nesta revisão).
- Edição de nome e `dateFormatPreference`.
- Troca de senha, exigindo a senha atual antes de aceitar a nova.

### 5.4 — Logout

Revoga o `RefreshToken` corrente no banco e limpa os cookies.

## 6. Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /auth/register` | Cria usuário + household inicial, sessão curta |
| `POST /auth/login` | Autentica; `remember: boolean` no corpo define a duração da sessão |
| `POST /auth/refresh` | Renova o access token; rotaciona o refresh token; detecta reuso |
| `POST /auth/logout` | Revoga o refresh token corrente, limpa cookies |
| `GET /profile` | Retorna dados do usuário logado |
| `PATCH /profile` | Edita nome e `dateFormatPreference` |
| `PATCH /profile/password` | Troca senha, exigindo a senha atual |

## 7. O que esta revisão deliberadamente não cobriu

Registrado aqui para não ser confundido com esquecimento em uma leitura
futura:

- Recuperação de senha ("esqueci minha senha").
- Verificação de email no cadastro.
- Login social (Google/Microsoft, mesmo tema já cogitado em
  `08-integracao-email.md` para OAuth de leitura de email, sem relação
  direta com login).
- Autenticação em dois fatores.
- Exclusão de conta pelo próprio usuário.
- Tela de "dispositivos conectados" para o usuário encerrar sessões
  específicas sem precisar trocar a senha.

Nenhum desses está em nenhum documento do roadmap atual — se algum deles
se tornar prioridade, precisa entrar como novo item em
`15-roadmap-v1.md`, não assumido como parte implícita desta revisão.

## 8. Pendência de processo

Changesets desta entrega já estão no repositório (`session-remember-refresh`,
`user-profile-menu`, `configurable-locale`, `auth-session-profile`). Entram
na próxima release junto do Onboarding (`0.12.0`).
