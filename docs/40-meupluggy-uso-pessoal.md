# Meu Pluggy: uso pessoal

Este adapter lê as contas de **uma pessoa** pelo conector gratuito Meu Pluggy.
Ele não é o adapter comercial da Pluggy. Um produto para outros usuários, se
existir, será outro pacote (`open-finance-pluggy`), com conta da plataforma.

**`OPEN_FINANCE_MEUPLUGGY_ENABLED` deve ficar `false` em qualquer deploy
comercial.** Com a flag desligada o módulo não registra rotas, a tela some
das configurações e o webhook responde 404.

## O que a pessoa faz

1. Cria a conta em [meu.pluggy.ai](https://meu.pluggy.ai) e conecta os bancos.
2. No [Dashboard da Pluggy](https://dashboard.pluggy.ai), cria uma aplicação.
3. Em Demo, conecta pelo conector **MeuPluggy** (não pelo banco e não pelo Sandbox).
4. Copia o Client ID, o Client Secret e os `itemId`. A Pluggy não oferece
   `GET /items` para listar esses itens.
5. Cola os três no Orcadom, em Configurações → Meu Pluggy, e aponta cada
   conta externa para uma conta do domicílio.

A Pluggy atualiza os itens a cada 24 horas. O Orcadom não chama
`PATCH /items`. O sync só relê o que já está lá. A autorização do Meu Pluggy
dura um ano (`consentExpiresAt`). Com 30 dias ou menos, e quando a Pluggy
devolve `USER_AUTHORIZATION_EXPIRED`, o status avisa para repetir o passo 3.

## O que fica guardado

`MeuPluggyCredential` tem um registro por usuário. O Client Secret e o token
do webhook ficam cifrados com AES-256-GCM (`CREDENTIALS_ENCRYPTION_KEY`,
32 bytes em base64). A API não devolve o secret e não o escreve em log.

O webhook é `POST /open-finance/webhooks/meupluggy/:userToken`. A Pluggy não
assina o corpo; o token na URL é comparado em tempo constante. Há também um
job diário. A janela é `lastSyncAt − 7 dias` (a Pluggy reenvia dias
anteriores) e, na primeira carga, 365 dias. O `externalProvider` gravado é
`meupluggy`.

## Extratos importados antes

Um sync não cria de novo um lançamento que já entrou por OFX ou CSV. Na mesma
conta, com o mesmo valor e até 3 dias de diferença, o Orcadom grava a chave
do provedor naquele lançamento. A leitura dessa conta é uma só, limitada a
essa janela: o domicílio inteiro não entra no casamento. Se houver mais de
um candidato, fica o mais próximo na data e, em seguida, o de descrição mais
parecida. Cada lançamento só casa com uma transação do provedor. Fica de
fora quem já tem `externalProvider` ou uma chave deste provedor. O pagamento
da fatura continua virando transferência da corrente para o cartão. O import
por arquivo segue pedindo confirmação; essa ligação automática vale só para
o sync.

## Como desligar

Deixe `OPEN_FINANCE_MEUPLUGGY_ENABLED` diferente de `true`. Sem a flag, o
pacote pode continuar instalado, mas nenhuma rota, nenhum job e nenhuma
entrada na interface sobem.
