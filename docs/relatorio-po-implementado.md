# Relatório de produto — Orcadom

**Destinatário:** Product Owner  
**Data:** 27 de setembro de 2026  
**Versão do produto:** 0.11.0 (pré-1.0)  
**Escopo:** o que já está implementado e utilizável, alinhado ao roadmap
atual (`15-roadmap-v1.md`), ao plano de versões (`16-versionamento.md`) e
ao detalhamento de onboarding (`20-onboarding.md`).

---

## 1. Resumo executivo

O Orcadom nasceu como um controle financeiro doméstico para uma pessoa
cadastrar contas, lançar o mês e ver números consistentes no painel. Esse
critério de sucesso do MVP **já foi entregue** e, desde então, o produto
evoluiu para um **espaço familiar compartilhado**.

Hoje uma família (ou uma pessoa) consegue:

- cadastrar-se e entrar com sessão revisada (“lembrar neste dispositivo”,
  renovação automática e logout que realmente encerra a sessão);
- organizar **contas**, **categorias** e **lançamentos** (receita, despesa,
  transferência);
- acompanhar o mês no **painel**;
- definir **orçamentos** e **metas de economia**;
- parcelar compras e cadastrar **recorrentes** (aluguel, assinatura,
  salário);
- importar extrato por **arquivo (OFX/CSV)** ou **e-mail**;
- receber **avisos** (sino e, em alguns casos, e-mail);
- ver **quem mudou o quê** no espaço (auditoria);
- convidar outra pessoa para o mesmo espaço;
- editar **perfil** (nome, formato de datas, senha).

O produto está **pronto para uso pessoal/familiar no dia a dia**. Ainda
não é a versão 1.0. O próximo item de produto do roadmap é o
**onboarding** (previsto como `0.12.0`): o plano já está escrito, a
implementação ainda não começou. Depois vêm exportação, PWA, permissão
por conta e a camada de produção (backup, staging, observabilidade,
CI/CD completo, testes E2E).

---

## 2. O que o Orcadom é

Sistema de controle financeiro **doméstico**, não uma fintech
corporativa. A proposta visual reforça isso: tela clara, tipografia
editorial (Fraunces + Manrope), acento verde-petróleo, cores fixas para
receita / despesa / transferência / pendência.

A unidade de dados não é mais “a conta de um usuário isolado”. É o
**espaço (household)**: contas, categorias, histórico, orçamentos e
metas pertencem à família. O usuário só **pertence** a um ou mais
espaços e opera em um de cada vez.

**Papéis atuais**

| Papel | O que pode fazer |
| --- | --- |
| **OWNER** | Convidar, renomear o espaço e remover membros. Não vê conta restrita sem estar na lista de acesso. |
| **MEMBER** | Operar contas, lançamentos, orçamentos, metas, importação e demais dados financeiros que possa ver — sem gerir a família |

Uma conta pode ser **restrita** a alguns membros. Quem não está na lista
não vê a conta, o saldo nem os lançamentos — vale também para o OWNER.
O valor ainda pode entrar em orçamentos compartilhados (agregam por
categoria, não por conta).

---

## 3. Linha do tempo do que já foi entregue

| Versão | Entrega de produto |
| --- | --- |
| **0.1.0** | MVP: cadastro/login, contas, categorias, lançamentos, painel mensal |
| **0.2.0** | Importação OFX/CSV com prévia, deduplicação e memória de categoria |
| **0.3.0** | Importação por e-mail (encaminhar extrato, sem upload) |
| **0.4.0** | Orçamentos por categoria |
| **0.5.0** | Notificações no app e por e-mail |
| **0.6.0** | Parcelamento de compras |
| **0.7.0** | Lançamentos recorrentes |
| **0.8.0** | Multiusuário / família (household) |
| **0.9.0** | Auditoria e rastreabilidade |
| **0.10.0** | Revisão de design, navegação mobile, contraste WCAG AA |
| **0.11.0** | Metas de economia |

**Já no código, ainda sem bump de versão oficial** (changesets
pendentes — entram na próxima release, que **não** é o onboarding):

- revisão de **autenticação e sessão** (lembrar login, tempos de
  sessão, refresh rotacionado no banco);
- página de **perfil** e menu da conta (avatar, configurações, sair);
- **localidade de datas** (`pt-BR`, `en-US` ou sistema) — a interface
  continua em português.

Pelo plano de versões (`16-versionamento.md`), a próxima **feature**
numerada do roadmap é o onboarding, prevista como **`0.12.0`**. As
entregas de sessão/perfil/locale acima são trabalho já feito que ainda
precisa ser empacotado em release.

---

## 4. Revisão de autenticação e cadastro (já implementada)

Revisão recente do fluxo de entrar e criar conta. Está no código e
documentada em `03-decisoes-arquiteturais.md`. Ainda não tem número de
versão próprio no changelog (`0.11.0` é só Metas).

### O que a pessoa vê

**Cadastro (`/register`)**

- Nome, e-mail, senha (mínimo 8 caracteres) e confirmação de senha.
- Ao concluir, o sistema cria o usuário **e** um espaço “Família de
  {nome}”, com o usuário como OWNER.
- A pessoa entra já logada, mas com **sessão curta**: some ao fechar o
  navegador (no máximo 12 horas). Não há checkbox “lembrar” nessa tela.

**Login (`/login`)**

- E-mail e senha.
- Checkbox **“Lembrar login neste dispositivo”**, com texto explícito:
  marca = sessão de 30 dias; sem marcar = vale até fechar o navegador
  (no máximo 12 horas).

**Perfil (`/profile`)**

- Avatar com iniciais, e-mail somente leitura, edição de nome, formato
  de datas e troca de senha (pede a senha atual).
- Menu da conta na barra: perfil, configurações, sair.

**Sair**

- Revoga a sessão no banco e limpa os cookies. Não deixa um token
  “órfão” válido.

### Como a sessão funciona (o que o PO precisa saber)

| | Sem “lembrar” | Com “lembrar” |
| --- | --- | --- |
| Tempo efetivo | Até fechar o navegador, no máximo 12 h | 30 dias |
| Cookie | De sessão (some ao fechar) | Persistente |
| Access token | ~15 minutos nos dois casos; o site renova em silêncio | ~15 minutos |

Outros pontos da revisão:

- Tokens ficam em **cookie httpOnly**, não no JavaScript do navegador
  (reduz risco de roubo por script na página).
- Cada renovação **invalida o token antigo**. Se alguém tentar reusar
  um token já renovado, o sistema trata como sinal de roubo e derruba
  **todas** as sessões daquela conta.
- E-mail é comparado **sem diferenciar maiúsculas**.
- Mensagem de login inválido é a mesma para e-mail inexistente e senha
  errada (“E-mail ou senha inválidos.”), para não revelar se a conta
  existe.

### O que esta revisão **não** entregou

Ainda não existem: recuperar senha, verificar e-mail, login social,
autenticação em dois fatores, exclusão da conta, nem uma tela de
“dispositivos conectados” para encerrar outras sessões.

---

## 5. O que o usuário consegue fazer hoje

### 5.1 Espaço familiar

- Um usuário pode participar de **vários espaços** e trocar o ativo
  pelo seletor.
- OWNER **renomeia** o espaço, **convida** por e-mail (link para
  copiar, validade 7 dias) e **remove** membros.
- O convidado precisa estar logado com o **mesmo e-mail** do convite
  para aceitar (`/invite/[token]`).
- O último OWNER não pode sair nem ser removido.

**Limites conscientes:** o convite é um link copiado, não um e-mail
automático do sistema; a tela só convida como MEMBER; criar um segundo
espaço existe na API, mas **não há botão na interface**; o MEMBER não
tem “sair sozinho” — só o OWNER remove.

### 5.2 Contas

- Tipos: **Carteira**, **Conta corrente**, **Cartão de crédito**.
- Criar com nome, tipo, saldo inicial e cor.
- Editar nome e cor. Tipo e saldo **não se editam à mão** — o saldo só
  muda por lançamento.
- Excluir só se não houver lançamentos nem meta vinculada.

### 5.3 Categorias

- Duas colunas: **Receita** e **Despesa**.
- Criar/editar nome e cor; nome único no espaço por tipo.
- Excluir só se não estiver em uso.
- Seed de demonstração no cadastro do espaço: Alimentação, Transporte,
  Moradia, Salário.

O banco já aceita ícone de categoria; **a tela ainda não mostra
ícone**. O plano de onboarding (`20`) deliberadamente **não** pede
“criar uma categoria”, justamente porque as padrão já nascem no
cadastro.

### 5.4 Lançamentos e saldo

Regra de ouro do produto: os números não mentem.

- **Receita / despesa:** exigem conta e categoria; atualizam o saldo na
  hora.
- **Transferência:** origem ≠ destino, sem categoria; move dinheiro nas
  duas pontas na mesma operação.
- Editar ou excluir **desfaz o efeito antigo** e aplica o novo.
- Lista paginada (20 itens), filtros por conta, categoria e período.
- Badges de **Agendada** e **Importado**.
- No modal de edição, histórico de auditoria daquele lançamento.
- Na criação de despesa, opção **“É parcelado?”** (2 a 60 parcelas).

### 5.5 Painel (dashboard)

Por mês selecionado:

- totais de receitas e despesas;
- saldo consolidado das contas;
- compromissos futuros (parcelas ainda não debitadas);
- recorte dos orçamentos do mês;
- até 3 metas ativas;
- gráfico de despesa por categoria;
- empty state com atalhos quando ainda não há dados.

Ainda **não** há o card de checklist de onboarding nem o modal de
boas-vindas — isso é o item 3 do roadmap, ainda não construído.

### 5.6 Orçamentos

- Limite mensal por categoria de **despesa**.
- Barra de progresso e status: no prazo / aviso em **80%** / estourado
  em **100%**.
- Só o **mês atual** é editável.
- Mudar o limite **não reescreve o passado** (vigência versionada).
- “Encerrar” fecha a vigência daquele orçamento.
- Ao cruzar 80% ou 100%, **todos os membros** do espaço são
  notificados.

**Detalhe de produto:** o gasto do mês no orçamento (e nos totais do
painel) inclui despesas daquele mês, **inclusive parcelas ainda
agendadas**; o saldo da conta, porém, só muda quando a parcela vence.

### 5.7 Parcelamentos

- Uma compra vira N parcelas.
- A parcela já vencida debita na hora; as futuras ficam **agendadas** e
  só entram no saldo no vencimento (rotina automática de madrugada).
- Tela de planos: progresso X/N pagas e valor restante.
- Cancelar atinge só as parcelas futuras; as já debitadas permanecem.

### 5.8 Recorrentes

- Cadastro único de aluguel, assinatura, salário etc.
- Frequência: **semanal**, **mensal** (dia 1–31) ou **anual**.
- Data de início; fim opcional.
- O sistema gera as próximas ocorrências (horizonte de 3 dias + rotina
  diária).
- Pausar, retomar, editar (vale da próxima em diante) e excluir (apaga
  só as agendadas).
- Só receita ou despesa — **não** transferência recorrente.

### 5.9 Metas de economia (0.11.0 — item 2 do roadmap 1.0)

Entregue. O detalhamento está em `19-metas-economia.md`. A ordem do
roadmap foi ajustada: Metas entrou **antes** do onboarding, e o plano
de onboarding já nasce com “criar a primeira meta” como passo de
aprofundamento.

- Meta vinculada a **uma conta** (recomendação de uso: conta dedicada).
- Campos: nome, valor alvo, conta, prazo opcional, data de início
  (pode ser anterior à criação — “já vinha guardando desde janeiro”).
- Progresso = transferências **para** a conta − transferências **para
  fora**, a partir da data de início. Salário ou gasto na mesma conta
  **não** entram na conta da meta.
- Retirar dinheiro da conta **reduz** o progresso — de propósito.
- Status: ativa, concluída (ao atingir o alvo; notifica o espaço),
  abandonada.
- Tela de detalhe com progresso, lista de transferências que contam,
  editar, abandonar e excluir.
- Abandonar ou excluir **não apaga** as transferências.
- Prazo vencido **não** abandona a meta sozinho — fica ativa até a
  pessoa decidir.
- Duas metas na mesma conta são permitidas (limitação conhecida: o
  mesmo dinheiro pode parecer “contado duas vezes”).

### 5.10 Importação de extrato

**Por arquivo:** upload OFX ou CSV (até 2 MB); prévia linha a linha
(incluir/excluir, categoria, duplicata, sugestão “conhecida”);
confirmar cria lançamentos como **Importado**; descartar o lote sem
lançar.

**Por e-mail:** cada espaço tem um endereço exclusivo; qualquer membro
pode encaminhar; sem mapeamento banco → conta o lote fica parado até
alguém mapear; histórico na tela de Email.

Os dois caminhos caem na **mesma fila de revisão** em Importar.

### 5.11 Notificações

Sino no cabeçalho: não lidas, marcar uma ou todas, atalho para o
contexto (orçamento, importação, meta).

| Evento | No app | E-mail |
| --- | --- | --- |
| Orçamento em 80% | Sim | Não |
| Orçamento estourado | Sim | Sim (se o envio estiver configurado) |
| Extrato por e-mail pronto para revisar | Sim | Não |
| Extrato sem conta mapeada | Sim | Sim |
| Meta concluída | Sim | Não |

Ainda não existem: histórico de lidas, preferências por usuário, tela
própria de notificações. O e-mail é complementar; se a automação de
envio não estiver ligada, o aviso continua só no sino.

### 5.12 Auditoria

- Registra criar / editar / excluir em lançamentos, contas, orçamentos,
  metas e demais mudanças financeiras.
- Distingue ator humano, job automático (parcela/recorrente) e
  importação por e-mail.
- **Atividade** (últimos 50 eventos do espaço) e bloco de histórico no
  detalhe de conta, lançamento, orçamento e meta.
- Sem exportação da trilha.

---

## 6. Mapa de telas

**Desktop:** barra lateral.  
**Mobile:** quatro abas — Painel, Lançamentos, Importar, Mais — mais
seletor de espaço e sino.

| Tela | Rota | Uso |
| --- | --- | --- |
| Login | `/login` | Entrar + lembrar dispositivo |
| Cadastro | `/register` | Criar usuário e o primeiro espaço |
| Painel | `/dashboard` | Consolidação do mês |
| Lançamentos | `/transactions` | Lista, filtros, criar/editar/excluir |
| Contas | `/accounts` | Cards e CRUD |
| Categorias | `/categories` | Receita / despesa |
| Orçamentos | `/budgets` | Limites do mês |
| Metas | `/savings-goals` e detalhe | Lista e acompanhamento |
| Parcelas | `/installments` | Planos e cancelamento de futuras |
| Recorrentes | `/recurring` | Regras que se repetem |
| Importar | `/imports` | Upload e lotes pendentes |
| Configurações | `/settings` | Índice: Perfil, Email, Família, Atividade |
| Perfil | `/profile` | Nome, locale, senha |
| Email | `/settings/import-alias` | Endereço do espaço, mapeamentos, logs |
| Família | `/settings/household` | Nome, membros, convites |
| Atividade | `/settings/activity` | Auditoria do espaço |
| Aceitar convite | `/invite/[token]` | Entrar no espaço |

---

## 7. Fundação (o que o PO precisa saber, sem jargão)

- **Dois sistemas no mesmo repositório:** o site que a família usa e a
  API que guarda as regras.
- **Banco PostgreSQL:** receita soma, despesa subtrai, transferência
  move nas duas pontas na mesma operação — evita saldo inconsistente.
- **Sessão em cookie** (não token solto no navegador), com tempos
  diferentes para “lembrar” e para sessão curta.
- **Isolamento por espaço:** um membro não vê dado de outra família.
- **Rotinas noturnas** (horário de Brasília): parcelas vencidas (~1h) e
  recorrentes (meia-noite).
- **n8n** (automação): lê e-mails de extrato e pode disparar e-mail de
  aviso.
- **Qualidade local:** commits padronizados, changelog por versão,
  testes unitários das regras críticas (saldo, orçamento, recorrência,
  sessão, auditoria, metas).
- **Ainda não há:** testes ponta a ponta na interface, pipeline que
  barre PR sem teste, ambiente de staging, backup automático,
  monitoramento de erros em produção.

A interface foi revisada na 0.10.0 (contraste WCAG AA, navegação
mobile). Não há tema escuro, PWA nem troca de idioma dos textos — só
formato de data.

---

## 8. Roadmap até a 1.0 (estado honesto)

A ordem abaixo é a do `15-roadmap-v1.md` **atual** — Metas e Onboarding
trocaram de posição em relação ao plano original. Metas foi
implementada logo após a revisão de design; o onboarding foi
detalhado em `20-onboarding.md` já prevendo Metas como passo do
roteiro. Numeração de versão segundo `16-versionamento.md`.

| # | Item | Versão prevista | Status |
| --- | --- | --- | --- |
| 1 | Revisão de design / UX | 0.10.0 | **Entregue** |
| 2 | Metas de economia | 0.11.0 | **Entregue** |
| 3 | Onboarding para novos usuários | 0.12.0 | **Planejado** — spec pronta (`20`); código ainda não |
| 4 | Exportar PDF / Excel | 0.13.0 | **Não iniciado** |
| 5 | PWA (instalável no celular, possível push) | 0.14.0 | **Não iniciado** — o site já é responsivo |
| 6 | Permissão granular por conta | 0.15.0 | **Não iniciado** |
| 7 | Observabilidade | (infra — não gera MINOR) | **Entregue** |
| 8 | Backup automático do banco | (infra) | **Não iniciado** |
| 9 | CI/CD (lint/teste/build/deploy) | (infra) | **Entregue** — gate de PR, imagens no GHCR, deploy/migrate prontos (host = item 10) |
| 10 | Staging formal | (infra) | **Artefatos entregues** — compose `deps`, seed sintético, `.env` template e runbook; host cloud + `DEPLOY_ENABLED` pendentes |
| 11 | Testes E2E dos fluxos críticos | (infra) | **Entregue** — Playwright API-first, smoke em PR, suíte completa no cron noturno |
| 12 | Rate limiting (login e automação) | (infra) | **Entregue** — `@nestjs/throttler`, limites por IP (login 5/min, automation 60/min, geral 120/min), 429 padronizado |
| 13 | Open Finance Brasil | 0.16.0 | **Não iniciado** |
| 14 | Insights automáticos | 0.17.0 | **Não iniciado** |
| — | Marco estável | **1.0.0** | Quando os 14 itens acima estiverem completos |

Itens de infraestrutura (7–12) **não incrementam MINOR**: se o usuário
final não percebe nada de novo no app, não é feature de versão. Também
fora de escopo atual: app nativo, preferências de notificação,
recuperação de senha.

---

## 9. Próximo item de produto: onboarding (`0.12.0`)

**Não está implementado.** O plano (`20-onboarding.md`) já está
fechado o suficiente para execução. Em resumo, para o PO:

**Decisão de produto:** checklist dispensável no próprio painel — **não**
um assistente bloqueante em tela cheia. Quem já sabe o que fazer pode
fechar e usar o app na hora.

**Como o progresso é medido:** o sistema olha se o dado já existe no
espaço (tem conta? tem lançamento? tem orçamento? tem meta?). Não há
uma lista paralela de “marquei o passo X”. A única preferência gravada
é **dispensar o checklist**, e isso é **por pessoa**, não por família
— um membro pode esconder e o outro continuar vendo.

**Passos essenciais** (sempre primeiro):

1. Criar a primeira conta financeira.
2. Lançar a primeira transação.

Não haverá passo “criar categoria” (as padrão já nascem no cadastro).

**Passos de aprofundamento** (opcionais, recolhidos depois que os
essenciais estiverem feitos):

3. Definir o primeiro orçamento.
4. Criar a primeira meta de economia.
5. Configurar o alias de importação por e-mail.
6. Convidar alguém para o household.

**Quem chega convidado** não é forçado a “criar a primeira conta” se o
espaço já tiver dados. Vê os aprofundamentos ainda pendentes e uma
orientação extra (“explore o painel”, “veja a atividade da família”).

**Interface prevista:**

- modal de boas-vindas **uma vez**, logo após o primeiro acesso, com
  ação direta (“Criar minha primeira conta”);
- card no dashboard com “N de M passos essenciais”;
- cada item é um atalho para a tela correspondente;
- dispensar sempre visível;
- em Configurações, opção de **mostrar o checklist de novo**.

Completar um passo acontece **usando o app** (criar conta, lançar,
etc.), nunca por um botão “marcar como feito”.

---

## 10. Limitações que o PO deve ter em mente

1. **Privacidade dentro da casa:** conta restrita some para quem não tem
   acesso, inclusive o OWNER. Orçamentos por categoria ainda somam o
   household inteiro — o valor pode vazar indiretamente.
2. **Primeiro uso ainda sem roteiro:** quem cadastra cai no painel
   vazio; o caminho esperado é conta → lançamento, mas o checklist
   ainda não existe (é o próximo item).
3. **Convite artesanal:** OWNER copia o link; o sistema não dispara o
   e-mail do convite.
4. **Sem exportação:** o dado vive no app; não há extrato para Excel/PDF.
5. **Sino sem memória:** só o que ainda não foi lido.
6. **E-mail de aviso depende de automação ligada;** senão, o aviso fica
   só no app.
7. **Sem “esqueci minha senha”** e sem o MEMBER sair sozinho do espaço.
8. **Segundo espaço** só via API — a UI não oferece “criar outra
   família”.
9. **Produção formal ainda é dívida parcial:** backup e E2E seguem
   abertos; staging tem artefatos no repo (compose, seed, runbook) mas
   ainda sem host cloud nem `DEPLOY_ENABLED`.

---

## 11. Conclusão para o Product Owner

O Orcadom **já cobre o ciclo completo de uso familiar**: entrar com
sessão previsível, compartilhar o espaço, lançar (na mão ou
importando), orçar, guardar para uma meta, parcelar, repetir o que é
fixo, ser avisado e saber quem mexeu.

A versão **0.11.0** é um produto utilizável, não um protótipo. A
revisão de autenticação e cadastro já está no código (ainda sem número
de release). O que falta para declarar **1.0** é menos “mais módulo
financeiro” e mais **adoção e operação**.

O roadmap atual aponta o próximo passo de produto com spec pronta:
**onboarding `0.12.0`** — checklist no painel, diferente para dono e
convidado, já incluindo meta de economia. Em paralelo, vale decidir
quando empacotar a release das mudanças de sessão/perfil/locale que
já existem, e quanto de infraestrutura (backup, CI, staging) entra
antes de exportação e PWA.
