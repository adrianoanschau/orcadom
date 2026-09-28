# Exportar Relatórios

> Detalhamento do item 4 do [roadmap para a 1.0](./15-roadmap-v1.md).
> Nenhuma dependência de feature anterior além do domínio já maduro
> (contas, categorias, transações).

## 1. Objetivo

Gerar extrato/relatório consolidado em PDF ou Excel, filtrável por
período, conta e categoria — os mesmos filtros já usados na listagem de
transações.

## 2. Decisão central: geração síncrona por padrão, assíncrona acima de um limiar

A maioria dos relatórios (um mês, uma conta) gera rápido o suficiente para
responder na própria requisição HTTP. Só relatórios grandes (ex: um ano
inteiro, todas as contas) justificam processamento em segundo plano. Em
vez de sempre assíncrono (complexidade desnecessária no caso comum) ou
sempre síncrono (risco de timeout no caso grande), a régua é por volume:

```
se o filtro resultar em > 2.000 transações → processamento assíncrono
caso contrário → gera e retorna na mesma requisição
```

## 3. Modelagem de Dados

```prisma
enum ReportFormat { PDF, XLSX }
enum ReportStatus { PENDING, PROCESSING, READY, FAILED }

model ReportRequest {
  id          String        @id @default(uuid())
  format      ReportFormat
  status      ReportStatus  @default(PENDING)
  filters     Json          // accountId?, categoryId?, dateFrom, dateTo
  filePath    String?
  expiresAt   DateTime?     // arquivo baixável por tempo limitado, depois removido
  createdAt   DateTime      @default(now())
  completedAt DateTime?

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  requestedByUserId String
  requestedBy       User   @relation(fields: [requestedByUserId], references: [id])

  @@map("report_requests")
}
```

Segue o mesmo padrão de "job" já usado por `ImportBatch` (`07`) —
`PENDING` → `PROCESSING` → `READY`/`FAILED`.

## 4. Fluxo

```
POST /reports (filtros + formato)
        │
        ▼
   Volume ≤ 2.000 transações?
        │
   ┌────┴────┐
  Sim         Não
   │           │
   ▼           ▼
Gera na    Cria ReportRequest (PENDING),
requisição processa em background,
e retorna  responde 202 com o id
o arquivo         │
                  ▼
          Ao concluir: status READY,
          emite report.ready (só para
          requestedByUserId, não fan-out
          de household — é um pedido pessoal)
```

## 5. Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /reports` | Cria o pedido; resposta imediata (síncrono) ou `202` com `id` (assíncrono) |
| `GET /reports/:id` | Status e link de download quando `READY` |
| `GET /reports/:id/download` | Stream do arquivo |

## 6. Fases de Execução

1. **Geração síncrona:** templates de PDF (extrato formatado) e Excel
   (dados tabulares), com os filtros já existentes na listagem de
   transações.
2. **Geração assíncrona:** `ReportRequest`, processamento em background,
   evento `report.ready` (canal pessoal, não fan-out).
3. **Frontend:** botão "Exportar" em `/transactions`, com seleção de
   formato e filtros já aplicados na tela; lista de relatórios pendentes/
   prontos.
4. **Limpeza:** job removendo arquivos expirados (`expiresAt` vencido).

## 7. Riscos e pontos de atenção

- **Armazenamento do arquivo gerado precisa de um lugar durável fora do
  container** — mesma preocupação de Backup (item 8); vale coordenar a
  escolha de armazenamento externo entre as duas features, em vez de
  decidir isoladamente.
- **Arquivo baixável contém dado financeiro sensível** — expiração
  automática (`expiresAt`) não é só limpeza de espaço, é decisão de
  segurança: o link não deve ficar válido indefinidamente.
- **PDF de período muito longo pode ficar ilegível** (muitas páginas,
  tabela densa) — vale um limite de bom senso na UI, sugerindo Excel para
  exportações grandes em vez de PDF.
