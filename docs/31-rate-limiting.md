# Rate Limiting

> Detalhamento do item 12 do [roadmap para a 1.0](./15-roadmap-v1.md). Item
> de infraestrutura — não incrementa `MINOR`. Depende de Observabilidade
> (item 7) para enxergar o efeito real da mudança antes e depois.

## 1. Objetivo

Estender o limite de requisições já existente no login (Fase 4 do MVP
original) para os demais endpoints sensíveis — em especial
`/automation/*`, autenticados por chave estática em vez de sessão de
usuário.

## 2. Por que endpoints de chave estática também precisam de limite

Uma sessão de usuário expira e é revogável individualmente (revisão de
auth, `21-autenticacao-sessao.md`). Uma chave estática (`AUTOMATION_API_KEY`,
`NOTIFICATIONS_WEBHOOK_SECRET`) não tem esse ciclo de vida — se vazar,
continua válida até ser trocada manualmente. Limitar volume nesses
endpoints reduz o dano possível de uma chave vazada, mesmo que não
elimine o problema por completo (isso é revisão de segredo, não deste
item).

## 3. Escopo técnico

Usando `@nestjs/throttler`, já mencionado desde o MVP:

| Rota | Limite sugerido | Motivo |
|---|---|---|
| `/auth/login` | 5 tentativas/min por IP | Já previsto desde o MVP original |
| `/automation/email-imports` | 60 req/min | Tráfego esperado do n8n, mas com teto contra abuso |
| Demais rotas autenticadas por sessão | Limite geral mais permissivo | Proteção de última linha, não o foco principal |

Resposta de limite excedido segue o formato de erro padronizado já
definido no interceptor global (Fase 4 do MVP), com `429` explícito, não
uma falha genérica.

## 4. Fases de Execução

1. Throttler geral (extensão do que já existe no login).
2. Limites específicos para `/automation/*`.
3. Padronização da resposta `429`.
4. Validação com Observabilidade (item 7) — medir taxa real de bloqueio
   antes e depois de calibrar os números.

### Implementação

- Pacote `@nestjs/throttler` com `AppThrottlerGuard` global; tracking por IP
  (`trust proxy` habilitado).
- Defaults: geral **120**/min, `POST /auth/login` **5**/min,
  `/automation/*` **60**/min. Override via
  `THROTTLE_DEFAULT_LIMIT` / `THROTTLE_LOGIN_LIMIT` /
  `THROTTLE_AUTOMATION_LIMIT`. CI/E2E usa `THROTTLE_DISABLED=true`.
- Resposta `429`: `{ statusCode, message, error }`.
- Calibração (fase 4): observar
  `http_requests_total{status="429"}` no Prometheus (já emitido pelo
  interceptor HTTP da Observabilidade) e ajustar os env se o n8n sofrer
  rajadas legítimas após downtime.

## 5. Riscos e pontos de atenção

- **Limite mal calibrado pode bloquear tráfego legítimo em rajada** — o
  cenário já discutido na indisponibilidade de email
  (conversa sobre `08-integracao-email.md`): se o n8n ficar fora do ar por
  um tempo e depois reprocessar vários emails acumulados de uma vez, um
  limite calibrado só para tráfego médio bloquearia esse reprocessamento
  legítimo. Calibrar considerando esse cenário de recuperação em rajada,
  não só o volume médio esperado.
- **Rate limiting não substitui rotação de segredo** — um limite reduz o
  volume de abuso possível, mas não invalida uma chave vazada; a resposta
  correta a um vazamento continua sendo trocar a chave, não confiar no
  limite para conter o problema indefinidamente.
