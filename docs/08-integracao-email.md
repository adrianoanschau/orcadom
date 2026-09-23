# Integração com Email — Importação Automática via n8n

> Feature pós-MVP. Depende da feature de
> [Importação de Extratos e Memória de Categorização](./07-importacao-extratos.md) —
> reaproveita o parser de OFX, o fluxo de `ImportBatch` e o preview de
> confirmação já existentes. Esta feature apenas automatiza a **entrada**
> do arquivo no sistema; a etapa de revisão humana continua a mesma.

## 1. Objetivo

Permitir que o usuário encaminhe o extrato bancário recebido por email para
um endereço fixo do Orcadom, e que o sistema baixe o anexo OFX
automaticamente, identifique de qual usuário e conta se trata, e crie um
`ImportBatch` pendente de revisão — sem exigir upload manual.

## 2. Decisão de arquitetura: caixa única, não uma por usuário

A alternativa considerada inicialmente — uma caixa de email e um workflow
n8n por usuário, provisionados dinamicamente via API do n8n — foi
descartada. O node de trigger IMAP do n8n é atrelado a uma credencial fixa
por node, então "uma caixa por usuário" exigiria a API do Orcadom
orquestrar criação de credencial e clonagem de workflow programaticamente
a cada nova conexão — complexidade desproporcional ao ganho.

A decisão adotada: **uma única caixa de email** (ex:
`importacoes@orcadom.app`) e **um único workflow**, configurados uma vez,
manualmente, na UI do n8n. A API do Orcadom nunca precisa falar com a API
de gerenciamento do n8n — só recebe chamadas HTTP do workflow.

Consequência direta: como a caixa é compartilhada entre todos os usuários,
é preciso um mecanismo para identificar **de quem** é cada email recebido.

## 3. Como o roteamento por usuário funciona

Cada usuário recebe um **alias de importação** único, gerado uma vez:

```
importacoes+ab12cd34@orcadom.app
```

O usuário configura, no próprio banco ou cliente de email, o
**encaminhamento** do extrato recebido para esse endereço. A maioria dos
provedores (Gmail incluso) preserva o endereço completo — incluindo o
`+ab12cd34` — no cabeçalho `To`, porque é o próprio ato de encaminhar que
define o novo destinatário. O n8n lê esse cabeçalho, extrai o token, e
repassa para a API resolver o `userId`.

A conta específica dentro do usuário (ex: qual cartão, qual conta
corrente) é resolvida separadamente, pelo `BANKID`/`ACCTID` presente no
próprio OFX — mesmo mecanismo já usado na importação manual.

### Fluxo completo

```
Caixa única (importacoes@orcadom.app)
        │
        ▼
n8n: IMAP Trigger (1 credencial só) → filtra anexo *.ofx → para cada email:
        │  extrai token do header "To" (importacoes+<token>@...)
        ▼
   HTTP Request → POST /automation/email-imports
                  body: { token, attachment }
                  header: x-orcadom-api-key (chave única, fixa, compartilhada)
        │
        ▼
API Orcadom:
  1. resolve userId a partir do token (UserImportAlias)
  2. parseia OFX → extrai BANKID/ACCTID
  3. resolve accountId via BankAccountMapping (escopado por userId)
  4. cria ImportBatch (source=EMAIL, status=PENDING)
        │
        ▼
n8n marca o email como lido/move para pasta "Processados"
        │
        ▼
Usuário é notificado → revisa o preview no fluxo já existente
```

**Importante:** esta feature não pula a etapa de preview/confirmação. O
email só chega até criar um `ImportBatch` pendente — a revisão humana
continua obrigatória, pelos mesmos motivos já documentados na importação
manual (categoria pode estar errada, layout de OFX pode mudar sem aviso).

## 4. Modelagem de Dados

```prisma
model UserImportAlias {
  id        String   @id @default(uuid())
  token     String   @unique // ex: 8 chars alfanuméricos, gerado na criação do usuário
  createdAt DateTime @default(now())

  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_import_aliases")
}

// BANKID/ACCTID do OFX → conta do Orcadom, escopado por usuário.
model BankAccountMapping {
  id     String @id @default(uuid())
  bankId String // <BANKID> do OFX
  acctId String // <ACCTID> do OFX

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  accountId String
  account   Account @relation(fields: [accountId], references: [id])

  @@unique([userId, bankId, acctId])
  @@map("bank_account_mappings")
}

enum EmailImportStatus {
  PROCESSED
  SKIPPED_DUPLICATE
  UNRECOGNIZED_TOKEN   // token no email não bate com nenhum usuário
  UNMAPPED_ACCOUNT     // usuário reconhecido, mas BANKID/ACCTID sem mapping ainda
  ERROR
}

model EmailImportLog {
  id               String            @id @default(uuid())
  messageId        String            // Message-ID do header IMAP
  attachmentHash   String
  recipientAddress String            // header "To" recebido, útil para depurar roteamento
  status           EmailImportStatus
  createdAt        DateTime          @default(now())

  userId String?
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  importBatchId String?
  importBatch   ImportBatch? @relation(fields: [importBatchId], references: [id])

  @@unique([messageId, attachmentHash])
  @@map("email_import_logs")
}
```

`EmailImportLog` existe principalmente para **evitar reprocessar o mesmo
email/anexo** (ex: falha de rede fazendo o n8n rodar de novo) e para
depuração — o `recipientAddress` bruto fica registrado mesmo quando o
token não é reconhecido, facilitando identificar problema de
encaminhamento sem precisar vasculhar a caixa de email manualmente.

## 5. Autenticação do endpoint de automação

O n8n não tem sessão de usuário — chama a API de forma desatendida. Como
existe apenas uma caixa e um workflow, uma **chave estática única** basta
(guardada em `.env` dos dois lados, Orcadom e n8n):

```ts
@Injectable()
export class AutomationApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-orcadom-api-key'];
    const expected = process.env.AUTOMATION_API_KEY;

    if (!provided || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
```

## 6. Endpoints

| Endpoint | Quem chama | O que faz |
|---|---|---|
| `POST /automation/email-imports` | n8n | Recebe `{ token, attachment }`; resolve usuário, parseia OFX, resolve conta, cria `ImportBatch` + `EmailImportLog` |
| `GET /settings/import-alias` | Frontend | Retorna o alias de importação do usuário logado (gera na primeira chamada, se ainda não existir) |
| `GET/POST /bank-account-mappings` | Frontend | CRUD do mapeamento `BANKID`/`ACCTID` → conta, escopado ao usuário via JWT normal |

## 7. Tratando o caso "conta ainda não mapeada"

Quando não existe `BankAccountMapping` para o `BANKID`/`ACCTID` recebido
(situação normal na primeira vez que aquele banco chega por email), o
`ImportBatch` é criado mesmo assim, com `accountId` nulo e status
`UNMAPPED_ACCOUNT`. O usuário resolve isso uma vez, na tela de preview —
as próximas importações daquele mesmo banco já caem direto na conta certa.

## 8. Infraestrutura — Container n8n

O serviço entra no `docker-compose.yml` já existente do projeto,
reaproveitando o mesmo Postgres em um **schema próprio** (`n8n`), para não
exigir um segundo banco de dados só para isso:

```yaml
services:
  # ...postgres e adminer já existentes permanecem sem alteração...

  n8n:
    image: n8nio/n8n:latest
    container_name: orcadom_n8n
    restart: unless-stopped
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: ${POSTGRES_DB:-orcadom_db}
      DB_POSTGRESDB_SCHEMA: n8n
      DB_POSTGRESDB_USER: ${POSTGRES_USER:-orcadom}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD:-orcadom_dev_password}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      WEBHOOK_URL: ${N8N_WEBHOOK_URL:-http://localhost:5678/}
      GENERIC_TIMEZONE: America/Sao_Paulo
    ports:
      - "${N8N_PORT:-5678}:5678"
    volumes:
      - orcadom_n8n_data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  orcadom_n8n_data:
    name: orcadom_n8n_data
```

Novas variáveis em `.env` / `.env.example`:

```env
N8N_PORT=5678
# Gerar uma vez (ex: `openssl rand -hex 16`) e nunca mudar depois que
# credenciais forem salvas no n8n, ou elas ficam ilegíveis.
N8N_ENCRYPTION_KEY=troque_este_valor_em_producao
N8N_WEBHOOK_URL=http://localhost:5678/

# Chave compartilhada entre o workflow do n8n e a API, usada pelo
# AutomationApiKeyGuard no endpoint /automation/email-imports.
AUTOMATION_API_KEY=troque_este_valor_em_producao
```

**Por que schema separado em vez de um segundo `POSTGRES_DB`:** criar um
segundo banco dentro da mesma instância Postgres via Docker Compose exige
um script de inicialização adicional (a imagem oficial só cria
automaticamente o banco definido em `POSTGRES_DB`). Um schema à parte
(`n8n`) dentro do banco já existente evita essa complexidade extra sem
misturar as tabelas do n8n com as tabelas de domínio do Orcadom.

**Por que a senha da caixa de email nunca entra no Postgres do Orcadom:**
ela é cadastrada como credencial diretamente na UI do n8n, que já tem
cofre próprio criptografado com o `N8N_ENCRYPTION_KEY`. O Orcadom nunca
manipula esse segredo — só recebe chamadas HTTP do workflow.

## 9. Fases de Execução

1. **Provisionamento**
   - [x] Adicionar o serviço `n8n` ao `docker-compose.yml` (bloco acima).
   - [x] Adicionar as novas variáveis ao `.env.example` e gerar os valores
         reais em `.env` (`N8N_ENCRYPTION_KEY`, `AUTOMATION_API_KEY`).
   - [ ] Criar a caixa `importacoes@orcadom.app` (ou domínio equivalente)
         no provedor de email escolhido, com acesso IMAP habilitado.
   - [ ] `docker compose up -d n8n` e acessar a UI em
         `http://localhost:5678` para o setup inicial.

2. **Workflow único no n8n**
   - [x] Exportável em `infra/n8n/email-import-workflow.json` (importar na UI).
   - [ ] Cadastrar a credencial IMAP da caixa (uma única vez).
   - [ ] Montar o workflow: `IMAP Trigger` → filtro de anexo `.ofx` →
         extrair header `To` → `HTTP Request` para
         `/automation/email-imports` (com o header `x-orcadom-api-key`) →
         marcar email como lido / mover para pasta "Processados".
   - [ ] Ativar o workflow.

3. **Modelagem e endpoint de automação**
   - [x] Migration com `UserImportAlias`, `BankAccountMapping` e
         `EmailImportLog`.
   - [x] `AutomationApiKeyGuard`.
   - [x] `POST /automation/email-imports`, reaproveitando o parser de OFX
         já existente da feature de importação manual.

4. **Geração de alias e resolução de conta**
   - [x] `UserImportAlias` gerado na criação do usuário (ou lazy, na
         primeira visita à tela de configuração).
   - [x] Lógica de resolução de conta por `BANKID`/`ACCTID`, escopada por
         usuário, com tratamento explícito do caso `UNMAPPED_ACCOUNT`.

5. **Frontend**
   - [x] Tela `/settings/import-alias`, mostrando o endereço de
         encaminhamento para o usuário copiar, com instrução resumida de
         como configurar o encaminhamento no banco/cliente de email.
   - [x] Tela de mapeamento `BANKID`/`ACCTID` → conta.

6. **Notificação**
   - [x] Aviso ao usuário (email transacional ou notificação in-app)
         quando um novo `ImportBatch` chega via email.

## 10. Riscos e pontos de atenção

- **Preservação do `+token` no encaminhamento não é garantida
  universalmente** — depende do cliente/provedor de quem encaminha. A
  maioria preserva, mas não é uma regra absoluta. Por isso, um email com
  token não reconhecido (`UNRECOGNIZED_TOKEN`) não deve ser descartado
  silenciosamente — deve cair em uma fila de revisão simples (uma tela
  admin, ou ao menos um log consultável).
- **Chave única de automação é um ponto único de falha de segurança:** se
  `AUTOMATION_API_KEY` vazar, qualquer chamador pode submeter importações
  em nome de qualquer `token` válido. Vale considerar rotação periódica da
  chave como prática operacional, mesmo sem um mecanismo automático de
  expiração no MVP desta feature.
- **`N8N_ENCRYPTION_KEY` é imutável na prática:** trocá-la depois que a
  credencial IMAP já foi salva torna essa credencial ilegível para o n8n,
  exigindo recadastro manual. Deve ser gerada uma vez, em ambiente de
  produção, e tratada como segredo permanente (mesmo nível de cuidado dos
  secrets de JWT).
- **Suporte a OAuth (Gmail/Outlook) fica fora do escopo desta fase.** O
  desenho atual pressupõe IMAP genérico com usuário/senha (ou senha de
  aplicativo). Login "Conectar com Google/Microsoft" exigiria token OAuth
  com refresh — mudança de escopo relevante, não bloqueante para esta
  entrega, mas registrada aqui para não ser esquecida.
