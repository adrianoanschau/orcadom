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
mais adiante. Nenhum agregador está escolhido. O código depende só do
contrato `OpenFinanceProvider`; cada provedor será um pacote. O desenho
está em [39-open-finance-adapters.md](./39-open-finance-adapters.md).

## 3. Decisão de arquitetura: reaproveitar a conciliação de extrato

A sincronização não cria um segundo pipeline de lançamentos. As
transações do provedor viram linhas do `matchImportRows` já usado no OFX
([`36`](./36-importacao-conciliacao-contas-a-pagar.md)). Saída numa conta
controlada e entrada na outra, com o mesmo valor e até 3 dias, viram uma
`TRANSFER` — inclusive o pagamento de fatura no cartão. A idempotência
é o par `externalProvider` + `externalId` (e a chave da segunda perna).
A tela de preview continua prevista; esta etapa grava o resultado do
matcher.

## 4. Modelagem de Dados

`OpenFinanceConnection` guarda usuário, domicílio, provedor, id externo,
status e `lastSyncAt`. `Account` pode apontar para a conta externa
(`externalProvider`, `externalAccountId`), único por domicílio.
`Transaction` guarda o mesmo par de provedor e id externo, também único.
`OpenFinanceExternalKey` lembra a outra perna quando duas linhas do
provedor viram uma transferência só. O schema definitivo está em
`packages/database/prisma/schema.prisma`.

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

1. **Levantamento regulatório e escolha do agregador** — precede o
   adapter real. O contrato e o provedor fake já existem; ver
   [39](./39-open-finance-adapters.md).
2. **Fluxo de consentimento** (OAuth2/FAPI, conforme exigido pelo padrão
   Open Finance).
3. **Ingestão pelo matcher de extrato** — mesma conciliação do OFX, com
   idempotência por id externo.
4. **Tela de gerenciamento de conexões bancárias** — conectar, ver
   status, revogar.
5. **Alerta de expiração de consentimento**, via Notificações.

## 7. Riscos e pontos de atenção

- **Mudança de API do agregador é risco fora do controle do time** —
  qualquer integração de terceiro carrega esse risco; vale isolar bem a
  camada de integração (um adapter próprio) para que uma troca de
  agregador no futuro não exija reescrever a lógica de domínio que já
  reaproveita o matcher de extrato.
- **Consentimento expirado sem tratamento vira interrupção silenciosa de
  importação** — é exatamente o que a notificação de expiração (seção 5)
  existe para evitar; sem ela, o usuário só descobre que parou de
  funcionar quando notar que os dados pararam de atualizar.
- **Dado obtido via Open Finance tem uma base legal e política de
  retenção diferentes** de dado inserido manualmente pelo próprio usuário
  — isso precisa de revisão jurídica específica antes do lançamento, não
  só da implementação técnica.
