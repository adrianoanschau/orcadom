# Notificações

> Depende do evento `budget.threshold_crossed` (feature
> [Orçamentos por Categoria](./09-orcamentos.md)) e do fluxo de importação
> por email (feature
> [Integração com Email](./08-integracao-email.md)) — este módulo apenas
> consome eventos que essas features já emitem (ou passam a emitir, com um
> pequeno complemento descrito na seção 4). Nenhuma das duas precisa saber
> como uma notificação é entregue.

## 1. Objetivo

Avisar o usuário quando algo relevante acontece sem ele estar olhando a
tela: um orçamento estourou, uma importação por email trouxe um extrato
pendente de revisão, ou uma conta não pôde ser identificada
automaticamente. Dois canais no MVP desta feature: **in-app** (sino de
notificação na interface) e **email transacional**.

## 2. Decisão principal: reaproveitar o n8n para o envio de email

Duas opções foram consideradas para o canal de email:

| Opção | Como funciona | Trade-off |
|---|---|---|
| **A — Cliente SMTP direto no NestJS** | Biblioteca tipo `nodemailer`, credenciais SMTP em `.env`, envio síncrono ou via fila própria | Mais uma dependência de infraestrutura de envio (retry, fila, templates) para construir do zero dentro da API |
| **B — Webhook para um workflow n8n dedicado** | A API chama um endpoint webhook do n8n; um segundo workflow (`Webhook Trigger → Send Email`) cuida do envio | Reaproveita o container n8n que já está no `docker-compose.yml` desde a feature de importação por email — nenhuma dependência nova na API |

Optou-se pela **Opção B**. O n8n já está provisionado, já tem um node
nativo de envio de email pronto, e centralizar "coisas que se comunicam
com serviços externos de email" em um único lugar (o mesmo container que
já lê a caixa `importacoes@orcadom.app`) é mais simples do que manter duas
formas diferentes de lidar com SMTP no projeto.

## 3. Modelagem de Dados

```prisma
enum NotificationType {
  BUDGET_WARNING
  BUDGET_EXCEEDED
  EMAIL_IMPORT_READY
  EMAIL_IMPORT_UNMAPPED_ACCOUNT
}

enum NotificationChannel {
  IN_APP
  EMAIL
}

model Notification {
  id        String                @id @default(uuid())
  type      NotificationType
  title     String
  message   String
  metadata  Json?                 // ex: { categoryId, importBatchId } — usado para o link de destino no front
  channels  NotificationChannel[] // quais canais foram efetivamente usados nesta notificação
  readAt    DateTime?
  createdAt DateTime              @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt])
  @@map("notifications")
}
```

Não existe, nesta primeira versão, uma tabela de preferências por usuário
— a política de "qual tipo vai por qual canal" é fixa em código (seção 4).
Isso evita construir uma tela de preferências antes de saber se o volume e
os tipos de notificação atuais realmente incomodam o usuário. Uma tabela
`NotificationPreference` fica como evolução natural, não como bloqueio.

## 4. Política de canais por tipo

| Tipo | In-app | Email | Por quê |
|---|---|---|---|
| `BUDGET_WARNING` | ✅ | ❌ | Aviso informativo, não urgente — não justifica interromper o usuário fora do app |
| `BUDGET_EXCEEDED` | ✅ | ✅ | Já passou do limite — vale um alerta que chega mesmo se o usuário não abrir o app |
| `EMAIL_IMPORT_READY` | ✅ | ❌ | O usuário já recebeu o extrato por email; notificar de novo por email seria redundante |
| `EMAIL_IMPORT_UNMAPPED_ACCOUNT` | ✅ | ✅ | Requer ação do usuário (mapear a conta) para a importação não ficar parada indefinidamente |

**Complemento necessário na feature de Importação por Email:** o endpoint
`POST /automation/email-imports` (definido em `08-integracao-email.md`)
precisa passar a emitir dois eventos de domínio que hoje não existem —
`email-import.ready` (ao criar um `ImportBatch` com sucesso) e
`email-import.unmapped-account` (quando o status é `UNMAPPED_ACCOUNT`) —
seguindo o mesmo padrão do `budget.threshold_crossed` já usado na feature
de orçamentos. Nenhuma mudança na lógica de negócio daquela feature, só a
adição da emissão do evento no fim do fluxo já existente.

## 5. Fluxo completo

```
Evento de domínio disparado
  (budget.threshold_crossed | email-import.ready | email-import.unmapped-account)
        │
        ▼
NotificationsService (listener do evento)
        │
        ├─▶ 1. Sempre cria Notification (channels inclui IN_APP)
        │
        └─▶ 2. Se a política do tipo incluir EMAIL:
                   POST http://n8n:5678/webhook/send-notification
                   header: x-notification-secret
                   body: { to, subject, body, type }
                        │
                        ▼
                 n8n: Webhook Trigger → Send Email (SMTP já configurado) → 200 OK
```

O envio de email é **best-effort**: se a chamada ao webhook do n8n falhar
(timeout, n8n fora do ar), a `Notification` em si já foi persistida com
sucesso e continua visível in-app — o usuário não perde o aviso, só perde
o canal extra. O `NotificationsService` registra a falha em log, sem
propagar erro para o fluxo que originou o evento (ex: uma falha ao enviar
email de orçamento estourado não pode fazer a criação da transação que
disparou o evento falhar).

## 6. Autenticação do webhook (API → n8n)

Direção inversa da automação de import (que é n8n → API). Aqui é a API
chamando o n8n, então a autenticação é configurada como **Header Auth**
diretamente no node de Webhook Trigger do n8n — sem precisar de um guard
novo no NestJS:

```env
# .env — compartilhado entre a API e a configuração do node no n8n
NOTIFICATIONS_WEBHOOK_URL=http://n8n:5678/webhook/send-notification
NOTIFICATIONS_WEBHOOK_SECRET=troque_este_valor_em_producao
```

## 7. Endpoints (API do Orcadom)

| Endpoint | Quem chama | O que faz |
|---|---|---|
| `GET /notifications?unread=true&limit=20` | Frontend | Lista notificações do usuário logado, mais recentes primeiro |
| `PATCH /notifications/:id/read` | Frontend | Marca uma notificação como lida (`readAt`) |
| `PATCH /notifications/read-all` | Frontend | Marca todas como lidas |

Não existe endpoint de criação manual de notificação pela API pública —
toda `Notification` nasce de um listener de evento de domínio, nunca de
uma chamada direta de fora.

## 8. Frontend

- **Ícone de sino** no layout do dashboard, com contador de não lidas.
- Busca via TanStack Query com `refetchInterval` (ex: a cada 30s) —
  suficiente para o volume de uso de um app doméstico, sem exigir
  WebSocket nesta fase.
- Lista suspensa ao clicar no sino: título, mensagem, tempo relativo
  (`há 2 horas`). Clicar em uma notificação marca como lida e navega para
  o destino relevante, resolvido a partir do `metadata`:
  - `EMAIL_IMPORT_READY` / `EMAIL_IMPORT_UNMAPPED_ACCOUNT` →
    `/imports/:importBatchId`
  - `BUDGET_WARNING` / `BUDGET_EXCEEDED` → `/budgets`
- Ação "marcar todas como lidas" no topo da lista.

## 9. Configuração do n8n — Workflow de Envio

Um **segundo workflow**, separado do workflow de leitura de email já
existente (que continua intocado):

1. **Webhook Trigger** — método `POST`, path `/send-notification`,
   autenticação Header Auth com o `NOTIFICATIONS_WEBHOOK_SECRET`.
2. **Send Email** (node nativo do n8n) — usa a mesma credencial SMTP da
   caixa `importacoes@orcadom.app`, ou uma credencial `noreply@orcadom.app`
   separada, se preferir distinguir "recebe extratos" de "envia avisos".
3. **Respond to Webhook** — retorna `200 OK` para a API confirmar o envio.

Nenhuma mudança no `docker-compose.yml` — o mesmo container `n8n` já
provisionado na feature de integração de email hospeda os dois workflows.

## 10. Fases de Execução

### Fase 1 — Modelagem e emissão de eventos

- [ ] Migration com o model `Notification`.
- [ ] Complementar `POST /automation/email-imports` (feature de email) com
      a emissão de `email-import.ready` e `email-import.unmapped-account`.
- [ ] Confirmar que `budget.threshold_crossed` (já existente) carrega os
      dados necessários para montar título/mensagem/metadata da
      notificação.

### Fase 2 — Serviço de notificações e canal in-app

- [ ] `NotificationsModule` com listeners para os três eventos.
- [ ] Lógica de política de canal por tipo (tabela da seção 4), como
      constante de código.
- [ ] `GET /notifications`, `PATCH /notifications/:id/read`,
      `PATCH /notifications/read-all`.

### Fase 3 — Canal de email via n8n

- [ ] Criar o segundo workflow no n8n (Webhook Trigger → Send Email →
      Respond to Webhook).
- [ ] Configurar `NOTIFICATIONS_WEBHOOK_URL` e
      `NOTIFICATIONS_WEBHOOK_SECRET` no `.env`.
- [ ] Chamada HTTP do `NotificationsService` ao webhook, com tratamento
      best-effort (falha não propaga para o fluxo de origem).

### Fase 4 — Frontend

- [ ] Ícone de sino com contador, no layout do dashboard.
- [ ] Lista suspensa com marcação de lida e navegação para o destino.
- [ ] Ação "marcar todas como lidas".

## 11. Riscos e pontos de atenção

- **Entregabilidade de email depende de configuração correta de
  SPF/DKIM** no domínio usado para envio — sem isso, uma parte relevante
  dos emails de `BUDGET_EXCEEDED` pode cair em spam. Vale validar isso
  antes de considerar a Fase 3 concluída, não só testar que o envio
  "funciona" localmente.
- **Falha silenciosa do canal de email:** como o envio é best-effort por
  design (seção 5), um problema persistente no webhook do n8n pode passar
  despercebido por um tempo, já que a notificação in-app continua
  funcionando normalmente e mascara o problema. Vale, no mínimo, logar
  falhas de forma que sejam fáceis de auditar depois.
- **Ausência de preferências por usuário** significa que, se o volume de
  notificações incomodar (ex: várias categorias estourando orçamento no
  mesmo dia), não há hoje uma forma do usuário reduzir isso além de editar
  os próprios orçamentos. Aceitável para uso doméstico single-user no
  início, mas é o gatilho mais provável para priorizar a tabela
  `NotificationPreference` mencionada na seção 3.
- **Polling de 30s no frontend** é suficiente para o caso de uso atual,
  mas não escala bem se o app crescer para uso multiusuário/família
  (feature já registrada no backlog) — nesse cenário, vale reavaliar
  WebSocket ou Server-Sent Events em vez de manter polling por conexão.
