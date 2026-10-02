# Integração Open Finance

> Detalhamento do item 13 do [roadmap para a 1.0](./15-roadmap-v1.md).
> Depende de toda a infraestrutura dos itens 7 a 12 já madura — é a
> integração de maior superfície de risco regulatório e técnico do
> roadmap. Este plano é **preliminar**: o escopo técnico definitivo
> depende de levantamento regulatório que ainda não foi feito.

## 1. Objetivo

Conexão direta com bancos participantes do Open Finance Brasil,
eliminando a necessidade de OFX/CSV/email para instituições que
participam do sistema.

## 2. Decisão central: agregador certificado, não certificação própria

Duas formas de integrar foram consideradas: certificação direta junto ao
Banco Central para acessar as APIs de cada instituição, ou integração via
um agregador já certificado (ex: Pluggy, Belvo). Certificação própria é um
projeto regulatório grande por si só — a recomendação é **agregador**
para esta primeira versão da feature, revisitando certificação direta só
se o volume de uso ou a estratégia de produto justificar o investimento
mais adiante.

## 3. Decisão de arquitetura: reaproveitar `ImportBatch`, não criar um pipeline novo

Dado trazido pelo Open Finance (saldo, transações) entra no **mesmo**
fluxo de preview/confirmação já maduro desde `07-importacao-extratos.md` —
tratado como mais uma origem, ao lado de `FILE` (upload manual) e `EMAIL`:

```prisma
enum ImportSource {
  FILE
  EMAIL
  OPEN_FINANCE
}
// Transaction.source (já existente) ganha esse valor adicional de origem
```

Isso significa que toda a lógica de deduplicação, categorização por
memória, e revisão humana antes de confirmar já funciona sem
modificação — só a etapa de "de onde vêm os dados" muda.

## 4. Modelagem de Dados (preliminar)

```prisma
enum OpenFinanceConnectionStatus {
  ACTIVE
  CONSENT_EXPIRING
  CONSENT_EXPIRED
  ERROR
}

model OpenFinanceConnection {
  id                   String    @id @default(uuid())
  bankName             String
  aggregatorItemId     String    // referência à conexão no agregador
  consentExpiresAt     DateTime
  status               OpenFinanceConnectionStatus @default(ACTIVE)
  createdAt            DateTime  @default(now())

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@map("open_finance_connections")
}
```

## 5. Consentimento (LGPD)

- Tela explicando exatamente o que será compartilhado antes do redirect
  para o banco.
- Consentimento com validade definida pelo Open Finance (tipicamente até
  12 meses) — `consentExpiresAt` acompanha isso.
- Revogação a qualquer momento, pelo usuário, sem precisar contatar
  suporte.
- Notificação (reaproveitando `10-notificacoes.md`) alertando dias antes
  do consentimento expirar, para a importação não parar de forma
  silenciosa.

## 6. Fases de Execução

1. **Levantamento regulatório e escolha do agregador** — etapa que
   precede qualquer código, dado o preliminar desta seção 4.
2. **Fluxo de consentimento** (OAuth2/FAPI, conforme exigido pelo padrão
   Open Finance).
3. **Ingestão via `ImportBatch`** — nova origem `OPEN_FINANCE`, sem
   alterar o pipeline de revisão já existente.
4. **Tela de gerenciamento de conexões bancárias** — conectar, ver
   status, revogar.
5. **Alerta de expiração de consentimento**, via Notificações.

## 7. Riscos e pontos de atenção

- **Mudança de API do agregador é risco fora do controle do time** —
  qualquer integração de terceiro carrega esse risco; vale isolar bem a
  camada de integração (um adapter próprio) para que uma troca de
  agregador no futuro não exija reescrever a lógica de domínio que já
  reaproveita `ImportBatch`.
- **Consentimento expirado sem tratamento vira interrupção silenciosa de
  importação** — é exatamente o que a notificação de expiração (seção 5)
  existe para evitar; sem ela, o usuário só descobre que parou de
  funcionar quando notar que os dados pararam de atualizar.
- **Dado obtido via Open Finance tem uma base legal e política de
  retenção diferentes** de dado inserido manualmente pelo próprio usuário
  — isso precisa de revisão jurídica específica antes do lançamento, não
  só da implementação técnica.
