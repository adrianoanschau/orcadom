# App Mobile como PWA

> Detalhamento do item 5 do [roadmap para a 1.0](./15-roadmap-v1.md).
> Depende da Revisão de Design/UX (`18`) já ter tratado responsividade —
> este item foca em instalabilidade, não em revisar layout de novo.

## 1. Objetivo

Tornar o `apps/web` já existente instalável como app, sem construir um
segundo código-base nativo.

## 2. Decisão central: PWA não é "funciona offline"

A tentação natural de "PWA" é confundir com "funciona sem internet". Para
o Orcadom, isso é deliberadamente **fora de escopo**: permitir criar
transações offline exigiria resolver conflito de sincronização (o que
acontece se duas edições da mesma transação acontecem offline em dois
dispositivos?) diretamente contra a garantia de consistência de saldo que
todo o sistema protege cuidadosamente desde o MVP. Não vale o risco por
enquanto.

**O que a PWA entrega:** app instalável, que abre rápido, com ícone na
tela inicial — o *shell* da aplicação (HTML/CSS/JS estático) em cache;
**dados financeiros continuam sempre buscados da rede**, nunca servidos
de um cache desatualizado.

## 3. Escopo técnico

- `manifest.json` (nome, ícones, cor de tema — reaproveitando os tokens
  de `06-design-system.md`).
- Service worker via Workbox (ou `next-pwa`), com estratégia
  `NetworkFirst` para chamadas de API (nunca `CacheFirst` em dado
  financeiro) e `CacheFirst` só para assets estáticos (JS/CSS/fontes).
- Cache do service worker **versionado pela própria tag de release**
  (`16-versionamento.md`) — evita a armadilha clássica de PWA de servir
  shell desatualizado depois de um deploy.
- Web Push como canal adicional do módulo de Notificações (`10`):

```prisma
model PushSubscription {
  id        String   @id @default(uuid())
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  userId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("push_subscriptions")
}
```

`NotificationChannel` ganha `WEB_PUSH` ao lado de `IN_APP`/`EMAIL` — o
`NotificationsService` já existente só precisa de mais um branch de
envio, reaproveitando a mesma política de canal por tipo já definida em
`10-notificacoes.md`.

## 4. Fases de Execução

1. **Manifest e ícones** — instalabilidade básica.
2. **Service worker** — cache do shell, estratégia de rede correta por
   tipo de recurso.
3. **Validação em dispositivo real** — instalar de fato em Android/iOS,
   confirmar comportamento (iOS tem suporte mais limitado e mais recente
   a Web Push e ao próprio prompt de instalação).
4. **Web Push (opcional, não bloqueante)** — assinatura de push,
   integração ao `NotificationsService`.

## 5. Riscos e pontos de atenção

- **iOS tem suporte parcial e mais recente** a Web Push e ao fluxo de
  instalação — testar especificamente nesse ambiente, não assumir que o
  comportamento do Android se replica.
- **Cache desatualizado após deploy é o bug mais comum de PWA** — a
  vinculação do cache à versão de release (seção 3) existe justamente
  para isso; sem isso, usuários instalados podem ficar presos em uma
  versão antiga do shell mesmo depois de um deploy.
- **Nenhuma escrita offline é permitida** — se alguém tentar implementar
  isso no futuro "só para melhorar a experiência", revisitar a decisão da
  seção 2 antes, não tratar como extensão trivial.
