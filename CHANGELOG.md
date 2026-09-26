# Changelog

Todas as mudanças relevantes do Orcadom são registradas neste arquivo.
O produto usa uma única versão SemVer (`MAJOR.MINOR.PATCH`) para o
monorepo inteiro. A partir de `0.9.0`, as entradas passam a ser geradas
pelos changesets.

## 0.10.0

### Minor Changes

- Revisão de design, navegação mobile e contraste WCAG AA em todas as telas existentes.

## 0.9.0

### Minor Changes

- Auditoria e rastreabilidade: registro de quem fez o quê, quando e a
  partir de onde, nas mudanças financeiras do household.

## 0.8.0

### Minor Changes

- Multiusuário/Família: contas, categorias e histórico passam a
  pertencer a um `Household` compartilhado, em vez de um único usuário.

## 0.7.0

### Minor Changes

- Transações recorrentes: cadastro único de lançamentos que se repetem
  (aluguel, assinatura, salário), com geração automática das ocorrências.

## 0.6.0

### Minor Changes

- Parcelamento de compras: um lançamento gera as N parcelas futuras, cada
  uma impactando o saldo apenas no mês em que vence.

## 0.5.0

### Minor Changes

- Notificações in-app e por email: orçamento estourado, extrato pendente
  de revisão e falha na identificação automática da conta.

## 0.4.0

### Minor Changes

- Orçamentos por categoria: limite mensal de gasto e acompanhamento do
  quanto já foi usado em relação a esse limite.

## 0.3.0

### Minor Changes

- Integração com email via n8n: encaminhar o extrato para um endereço
  fixo cria um lote pendente de revisão, sem upload manual.

## 0.2.0

### Minor Changes

- Importação de extratos OFX/CSV com preview, deduplicação e memória de
  categorização.

## 0.1.0

### Minor Changes

- MVP: autenticação, contas, categorias, transações e dashboard mensal.
