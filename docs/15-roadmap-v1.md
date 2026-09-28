# Roadmap para a Versão 1.0

Este documento é um resumo de alto nível — cada item aqui vai virar um
documento detalhado próprio (no mesmo padrão dos anteriores) quando
chegar a vez de planejá-lo. O objetivo agora é só registrar **o que é
cada um, por que entra nesta leva, e o escopo aproximado**, para servir de
referência enquanto os detalhamos um a um.

A ordem abaixo é a ordem de execução definida, não uma classificação por
importância — features de produto e itens de infraestrutura estão
intercalados de propósito, para não deixar a aplicação acumular dívida de
produção enquanto todas as features de negócio são construídas primeiro.

---

## 1. Revisão de Design de Interface e UX — ✅ já implementado

**Objetivo:** revisar, de forma holística, tudo que foi construído desde
o MVP — consistência visual, arquitetura de navegação e usabilidade dos
fluxos críticos — antes de continuar adicionando superfície nova de
produto. Detalhado em [`18-revisao-design-ux.md`](./18-revisao-design-ux.md).

**Por que primeiro:** o design system (`06`) foi definido no início, mas
cada feature seguinte (`07` a `14`) introduziu telas e componentes novos
de forma incremental, sem uma passada de revisão que garanta que tudo
isso ainda conversa entre si como um sistema coeso. Assim como as
features de infraestrutura existem para não deixar acumular dívida
técnica, esta existe para não deixar acumular **dívida de design** — e faz
mais sentido pagá-la agora, antes de mais telas entrarem em cima de uma
base não revisada.

**Escopo aproximado:**
- Auditoria de consistência visual e de tokens do design system.
- Revisão de arquitetura de informação e navegação.
- Revisão de usabilidade dos fluxos mais críticos.
- Revisão de responsividade (breakpoints, navegação mobile, tabelas
  densas).
- Consolidação de componentes dispersos em componentes reais do design
  system.

---

## 2. Metas de Economia — ✅ já implementado

**Objetivo:** permitir que o usuário defina uma meta de valor a guardar
até uma data (ex: "R$ 5.000 até dezembro"), com acompanhamento de
progresso. Detalhado em [`19-metas-economia.md`](./19-metas-economia.md).

**Por que nesta posição:** implementado logo após a revisão de design —
na prática, antes do onboarding (item 3), invertendo a ordem
originalmente cogitada. Não há problema nisso: a única dependência real
de Metas era a base visual já estável (item 1), não o onboarding. O plano
de onboarding (`20-onboarding.md`) já foi ajustado para incluir Metas como
um dos passos de aprofundamento do roteiro, exatamente por já existir
quando o onboarding começou a ser desenhado.

**Escopo aproximado:**
- Model `SavingsGoal` (valor alvo, prazo, conta de destino).
- Cálculo de progresso a partir de transferências para a conta vinculada.
- Tela de acompanhamento, reaproveitando componentes visuais de barra de
  progresso já existentes (orçamento, parcelamento).

---

## 3. Onboarding para Novos Usuários

**Objetivo:** orientar quem acabou de criar conta pelos primeiros passos
reais de uso — criar a primeira conta financeira, lançar a primeira
transação, e opcionalmente configurar orçamento, meta de economia ou
importação por email — em vez de deixar a pessoa sozinha diante de um
dashboard vazio. Detalhado em [`20-onboarding.md`](./20-onboarding.md).

**Por que nesta posição:** depende da base visual e de navegação já
estarem estáveis (item 1) — um roteiro guiado aponta para telas
específicas, então precisa de uma interface que não vá mudar de estrutura
logo em seguida. Como Metas de Economia (item 2) já estava implementada
quando chegou a vez de desenhar o onboarding, o roteiro já nasce
incorporando-a como um dos passos de aprofundamento, em vez de precisar de
uma revisão posterior para incluí-la.

**Escopo aproximado:**
- Checklist de progresso (não wizard bloqueante) cobrindo os passos
  essenciais: criar a primeira conta, lançar a primeira transação.
- Passos de aprofundamento opcionais: orçamento, meta de economia, alias
  de importação por email, convite de membro para o household.
- Estado de dispensa (`dismissed`) persistido por usuário — progresso dos
  passos em si é calculado a partir dos dados reais já existentes, não de
  uma tabela paralela de "concluído".
- Roteiro diferente para quem cria um household novo vs. quem é convidado
  para um já existente.

---

## 4. Exportar Relatórios

**Objetivo:** gerar extrato/relatório consolidado em PDF ou Excel, por
período e por conta/categoria.

**Por que agora:** baixo risco técnico, alto valor percebido — dado que
já existe (transações, categorias, orçamentos), só falta uma camada de
apresentação para fora do app. Não dependia de nenhuma feature anterior
além do próprio domínio já maduro.

**Escopo aproximado:**
- Geração de PDF (extrato formatado) e Excel (dados tabulares para quem
  quer manipular fora do app).
- Filtros por período, conta e categoria, reaproveitando os mesmos
  filtros já usados na listagem de transações.
- Execução assíncrona se o relatório for grande (evitar travar a
  requisição HTTP em geração pesada).

---

## 5. App Mobile como PWA

**Objetivo:** tornar o Next.js já existente instalável e utilizável como
app mobile, sem construir um app nativo separado.

**Por que agora:** menor esforço que um app nativo (React Native/Flutter
exigiria outro código-base inteiro) e aproveita 100% do frontend já
construído. Faz mais sentido antes de qualquer app nativo — e adiar a
decisão de nativo até ver se PWA já resolve a necessidade real de uso.
Também se beneficia de vir depois da revisão de UX (item 1): revisar
responsividade mobile em telas já consistentes é mais barato do que
revisar em cima de telas ainda desalinhadas.

**Escopo aproximado:**
- Manifest, ícones, service worker básico (cache de shell da aplicação).
- Revisão de responsividade das telas já existentes para uso mobile real
  (não só "cabe na tela").
- Possível suporte a notificação push via Web Push, como canal adicional
  do módulo de Notificações (`10`) — a avaliar no detalhamento.

---

## 6. Permissão Granular por Conta — ✅ já implementado

**Objetivo:** permitir que, dentro de um household, uma conta específica
seja restrita a um subconjunto de membros (ex: cartão pessoal não visível
para o resto da família). Detalhado em [`25-permissao-granular-conta.md`](./25-permissao-granular-conta.md).

**Por que agora:** limitação já registrada como conhecida em
`13-multiusuario.md` — o modelo `OWNER`/`MEMBER` simples não cobre esse
caso de uso real. Só faz sentido depois que multiusuário está em uso e a
necessidade real (ou não) dessa granularidade puder ser confirmada.

**Escopo aproximado:**
- Tabela de permissão por par (conta, membro), além do papel geral do
  household.
- Revisão de todo filtro de consulta que hoje assume "todo membro vê toda
  conta do household".

---

## 7. Observabilidade — ✅ já implementado

**Objetivo:** logs estruturados, métricas e rastreamento de erro em
produção — visibilidade sobre o que a aplicação está fazendo sem depender
de reclamação do usuário.

**Por que agora:** com três rotinas rodando sozinhas (cron de
parcelamento, cron de recorrência, automação de email), a ausência de
observabilidade é a lacuna mais urgente de infraestrutura antes de seguir
empilhando mais features automatizadas.

**Escopo aproximado:**
- Logging estruturado (JSON) na API, substituindo `console.log` solto.
- Métricas básicas (requisições, erros, duração de jobs).
- Rastreamento de erro (ex: Sentry ou equivalente) capturando exceções não
  tratadas, incluindo as dos jobs agendados.

Detalhado em [`26-observabilidade.md`](./26-observabilidade.md).

---

## 8. Backup Automatizado do Postgres — ✅ já implementado

**Objetivo:** rotina de backup recorrente do banco, com teste periódico de
restauração. Detalhado em [`27-backup-postgres.md`](./27-backup-postgres.md).

**Por que agora:** crítico especialmente depois da feature de Auditoria
(`14`) — perder o banco sem backup também apaga todo o histórico de
rastreabilidade que acabou de ser construído.

**Escopo aproximado:**
- Job de dump periódico (`pg_dump`), com retenção configurável.
- Armazenamento externo ao container (não adianta backup no mesmo volume
  Docker que pode ser perdido junto).
- Procedimento documentado e testado de restauração — não só o backup em
  si.

---

## 9. CI/CD

**Objetivo:** pipeline automatizado de build, teste e deploy, para os dois
apps do monorepo.

**Por que agora:** o volume de mudanças de schema já é significativo
(principalmente a migração de `13-multiusuario.md`) — migration
automatizada e testada em pipeline deixa de ser opcional a partir daqui.
Parte da automação de versionamento (`16`, `17`) já foi implementada antes
deste item formalmente chegar no roadmap — este item consolida o restante
da pipeline (build, teste, deploy) em torno dela.

**Escopo aproximado:**
- Pipeline rodando lint, build e testes a cada PR (aproveitando o cache
  do Turborepo já configurado).
- Deploy automatizado para staging (item 10) a cada merge, e para
  produção via aprovação manual ou tag.
- Execução de migration do Prisma como etapa controlada do pipeline, não
  manual.

---

## 10. Ambiente de Staging Formal

**Objetivo:** ambiente separado de produção, com dados representativos,
para validar mudanças antes do deploy real.

**Por que agora:** a própria feature de Multiusuário (`13`) já recomendou
rodar o backfill em staging antes de produção — essa recomendação hoje não
tem um ambiente formal que a garanta. Depende do CI/CD (item 9) para o
deploy automatizado ser útil na prática.

**Escopo aproximado:**
- Infraestrutura espelhando produção (mesmos serviços do
  `docker-compose.yml`, em escala menor).
- Processo de sincronização de dados de teste (nunca dados reais de
  produção sem anonimização).

---

## 11. Cobertura de Testes E2E

**Objetivo:** suíte de testes de regressão cobrindo os fluxos críticos de
todas as features já construídas, não só os testes pontuais já registrados
feature a feature.

**Por que agora:** com 14 features interagindo entre si (orçamento lê
transação, notificação lê orçamento, auditoria observa tudo), o risco de
uma nova feature quebrar uma anterior sem ninguém perceber já é real.
Faz sentido consolidar isso depois que CI/CD (item 9) já existe, para os
testes rodarem automaticamente a cada mudança.

**Escopo aproximado:**
- Suíte cobrindo os fluxos mais sensíveis: cálculo de saldo (incluindo
  transferência), orçamento, parcelamento/recorrência (idempotência do
  job), multiusuário (isolamento entre households).
- Integração da suíte ao pipeline de CI como gate de merge.

---

## 12. Rate Limiting

**Objetivo:** limitar volume de requisições em endpoints sensíveis, além
do login (já coberto na Fase 4 do MVP original).

**Por que agora:** os endpoints `/automation/*` (email e notificações) são
autenticados por chave estática, não por sessão de usuário — merecem
revisão de rate limiting própria, e só faz sentido revisar isso depois que
observabilidade (item 7) já existe, para conseguir enxergar o efeito da
mudança.

**Escopo aproximado:**
- Revisão de todos os endpoints autenticados por API key estática.
- Limite configurável por endpoint, com resposta clara (`429`) em vez de
  falha genérica.

---

## 13. Integração Open Finance

**Objetivo:** conexão direta com bancos participantes do Open Finance
Brasil, eliminando a necessidade de OFX/CSV/email para instituições que
participam.

**Por que agora, e por que por último entre as features de produto:** é a
evolução natural de tudo que foi construído em `07` (importação),
`08` (email) e parte de `10` (notificação) — mas é um projeto grande por
si só, exigindo certificação junto ao Banco Central e tratamento de
consentimento sob a LGPD. Só faz sentido depois que toda a base de
infraestrutura (observabilidade, backup, CI/CD, staging) já está madura,
porque é a integração de maior superfície de risco regulatório e técnico
do roadmap.

**Escopo aproximado (preliminar — vai exigir levantamento regulatório
antes do detalhamento técnico):**
- Fluxo de consentimento do usuário (LGPD).
- Integração com um agregador Open Finance ou diretamente com a API de
  cada instituição participante.
- Convivência com os fluxos de importação já existentes (nem todo banco
  do usuário necessariamente participa do Open Finance).

---

## 14. Insights Automáticos

**Objetivo:** gerar observações automáticas sobre o comportamento
financeiro do usuário (ex: "você gastou 23% a mais em Mercado este mês"),
sem esforço manual de análise.

**Por que por último:** depende de meses de dado categorizado já fluindo
(import + memória de categorização) para gerar comparações que façam
sentido — e se beneficia de Open Finance (item 13) trazendo dado mais
completo e menos dependente de o usuário lembrar de encaminhar extrato.
É a feature que mais se apoia em tudo que veio antes, então fica por
último por natureza, não por baixa prioridade.

**Escopo aproximado:**
- Comparações mês a mês por categoria (já documentado como possível desde
  `09-orcamentos.md`, agora formalizado como feature própria).
- Entrega via card no dashboard e/ou notificação (reaproveitando o módulo
  `10`), não uma tela nova isolada.

---

## Resumo da sequência e dependências

```
Revisão de Design de Interface e UX ─── primeiro: paga dívida de design
        │                                antes de expandir superfície de produto
        ▼
Metas de Economia ─────────────────── implementado logo em seguida
        │
        ▼
Onboarding para Novos Usuários ──────── depende da IA/navegação já revisada;
        │                                já incorpora Metas como passo do roteiro
        ▼
Exportar Relatórios ────────────┐
App Mobile (PWA) ────────────────┤ (produto — pouca dependência de infra)
Permissão Granular por Conta ───┘

Observabilidade ─────┐
Backup Postgres ──────┤ (infraestrutura — independentes entre si)
CI/CD ────────────────┤
                      ▼
Ambiente de Staging ──── depende de CI/CD
Cobertura E2E ────────── depende de CI/CD (para rodar automaticamente)
Rate Limiting ────────── depende de Observabilidade (para medir efeito)

Integração Open Finance ── depende de toda a infraestrutura acima
Insights Automáticos ────── depende de Open Finance (dado mais completo)
```

Quando terminarmos de detalhar e implementar os 14 itens acima, a
aplicação chega à **versão 1.0**.
