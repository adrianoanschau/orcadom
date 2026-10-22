# Open Finance: portas e adaptadores

O núcleo do Orcadom não fala com um agregador. Ele depende só de
`OpenFinanceProvider`, exportado por `@orcadom/open-finance-core`. Cada
agregador (Pluggy, Belvo ou outro) entra depois como um pacote próprio.
Este documento cobre o contrato e o caminho até um adapter novo. A escolha
do agregador continua em aberto; ver também
[37-open-finance.md](./37-open-finance.md).

## Pacotes

| Pacote | Papel |
| --- | --- |
| `@orcadom/open-finance-core` | Schemas Zod, erros e a interface. Sem SDK de provedor. |
| `@orcadom/open-finance-testing` | `FakeOpenFinanceProvider`, usado em desenvolvimento e teste. |
| `@orcadom/open-finance-meupluggy` | Uso pessoal do conector gratuito Meu Pluggy. Flag desligada por padrão. Ver [40](./40-meupluggy-uso-pessoal.md). |
| `apps/api` (`modules/open-finance`) | Persistência, endpoints e a sincronização. |

A API escolhe o provedor pela variável `OPEN_FINANCE_PROVIDER`. Sem valor,
o ambiente que não é `production` usa `fake`. Com `NODE_ENV=production`,
`fake` é recusado na subida. O token de injeção Nest tem o mesmo nome.

## O que a sincronização faz

`POST /open-finance/connections/:id/sync` lista as contas do provedor,
vincula cada uma a uma conta do domicílio (o corpo pode mandar `accountId`;
sem vínculo, a conta é criada) e baixa as transações desde `lastSyncAt`
(na primeira vez, 90 dias). Cada linha vira uma linha do mesmo
`matchImportRows` do OFX. Pagamento de fatura na corrente que casa com o
crédito no cartão vira um `TRANSFER`. A segunda perna fica em
`OpenFinanceExternalKey`, então rodar o sync de novo não duplica o
lançamento.

O webhook `POST /open-finance/webhooks/:provider` é público. Ele só
aceita o corpo se `parseWebhook` validar a assinatura, responde `202` e
enfileira o sync. Assinatura inválida responde `401` e não entra na fila.

Não registre token de conexão nem número de conta que não esteja
mascarado.

## Como criar um adapter

1. Crie `packages/open-finance-<nome>` com
   `"name": "@orcadom/open-finance-<nome>"`, dependendo só de
   `@orcadom/open-finance-core`.
2. Implemente `OpenFinanceProvider`. Valores monetários são centavos
   inteiros, negativo para saída. `externalId` de conta e de transação
   não pode mudar entre chamadas. `parseWebhook` devolve `null` se a
   assinatura não fechar. Falha de credencial, limite e indisponibilidade
   usam `ProviderAuthError`, `ProviderRateLimitError` (`retryAfter`) e
   `ProviderUnavailableError`.
3. No spec do pacote, rode a suíte compartilhada:

```ts
import { runProviderContractTests } from '@orcadom/open-finance-core/contract';

runProviderContractTests(() => ({
  provider: new MeuProvider(/* transporte de teste */),
  connectionId: 'id-da-fixture',
}));
```

A suíte exige paginação até o fim, centavos inteiros, `externalId`
estável, webhook inválido `null`, e os ids `error:auth`, `error:rate` e
`error:down` mapeados para os três erros. Um adapter real atende isso com
um transporte falso no teste, não em produção.

4. Inclua o pacote no grupo `fixed` de `.changeset/config.json` e na cópia
   de `dist` do `apps/api/Dockerfile`.
5. Em `createOpenFinanceProvider`, aceite o novo valor de
   `OPEN_FINANCE_PROVIDER` e instancie o adapter. Não importe o SDK do
   agregador em `open-finance-core` nem nos módulos de domínio.
