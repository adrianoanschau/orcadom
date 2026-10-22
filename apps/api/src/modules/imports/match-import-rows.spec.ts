import { describe, expect, it } from 'vitest';
import { matchImportRows, type MatchBillCandidate, type MatchLine, type MatchTransactionCandidate } from './match-import-rows.js';

const account = 'bank';

function line(partial: Partial<MatchLine> & Pick<MatchLine, 'lineId'>): MatchLine {
  return {
    date: '2026-10-12',
    amount: 600,
    direction: 'out',
    description: 'PGTO BOLETO',
    ...partial,
  };
}

describe('conciliação da importação', () => {
  it('sugere pagar a conta quando o valor é exato, a data é próxima e o candidato é único', () => {
    const bills: MatchBillCandidate[] = [
      { id: 'bill-1', description: 'Condomínio', dueDate: '2026-10-10', amount: 600, targetAccountId: null },
    ];
    const result = matchImportRows([line({ lineId: 'r1' })], [], bills, account);
    expect(result.get('r1')).toMatchObject({
      suggestedAction: 'PAY_BILL',
      matches: [{ kind: 'BILL', billId: 'bill-1', matchConfidence: 'high' }],
    });
  });

  it('não pré-seleciona quando duas contas cabem na mesma linha', () => {
    const bills: MatchBillCandidate[] = [
      { id: 'a', description: 'Água', dueDate: '2026-10-10', amount: 100, targetAccountId: null },
      { id: 'b', description: 'Luz', dueDate: '2026-10-11', amount: 100, targetAccountId: null },
    ];
    const result = matchImportRows([line({ lineId: 'r1', amount: 100 })], [], bills, account);
    expect(result.get('r1')?.suggestedAction).toBe('IMPORT');
    expect(result.get('r1')?.matches).toHaveLength(2);
    expect(result.get('r1')?.matches.every((match) => match.matchConfidence === 'low')).toBe(true);
  });

  it('vincula lançamento nascido de conta e só avisa o lançamento manual', () => {
    const transactions: MatchTransactionCandidate[] = [
      {
        id: 'from-bill',
        date: '2026-10-12',
        amount: 600,
        type: 'EXPENSE',
        description: 'Condomínio',
        accountId: account,
        fromAccountId: null,
        toAccountId: null,
        billId: 'bill-1',
        billDescription: 'Condomínio',
      },
    ];
    const linked = matchImportRows([line({ lineId: 'r1' })], transactions, [], account);
    expect(linked.get('r1')?.suggestedAction).toBe('LINK_TRANSACTION');

    const source = transactions[0];
    if (!source) throw new Error('candidato ausente');
    const manual = matchImportRows(
      [line({ lineId: 'r1' })],
      [{ ...source, id: 'manual', billId: null, billDescription: null }],
      [],
      account,
    );
    expect(manual.get('r1')).toMatchObject({
      suggestedAction: 'IMPORT',
      matches: [{ kind: 'TRANSACTION', matchConfidence: 'low' }],
    });
  });

  it('trata a entrada no cartão como espelho da transferência da fatura', () => {
    const mirror: MatchTransactionCandidate = {
      id: 'transfer',
      date: '2026-10-12',
      amount: 600,
      type: 'TRANSFER',
      description: 'Fatura',
      accountId: null,
      fromAccountId: account,
      toAccountId: 'card',
      billId: 'bill-1',
      billDescription: 'Fatura',
    };
    const result = matchImportRows(
      [line({ lineId: 'card-line', direction: 'in', description: 'PAGAMENTO RECEBIDO' })],
      [mirror],
      [],
      'card',
    );
    expect(result.get('card-line')).toMatchObject({
      suggestedAction: 'SKIP',
      matches: [{ kind: 'TRANSFER_MIRROR', matchConfidence: 'high' }],
    });
  });

  it('deixa o pagamento manual do cartão como espelho ainda não vinculado', () => {
    const mirror: MatchTransactionCandidate = {
      id: 'transfer',
      date: '2026-10-12',
      amount: 600,
      type: 'TRANSFER',
      description: 'Fatura Nubank',
      accountId: null,
      fromAccountId: account,
      toAccountId: 'card',
      billId: null,
      billDescription: null,
      linked: false,
    };
    const result = matchImportRows(
      [line({ lineId: 'card-line', direction: 'in', description: 'PAGAMENTO RECEBIDO' })],
      [mirror],
      [],
      'card',
    );
    expect(result.get('card-line')).toMatchObject({
      suggestedAction: 'IMPORT',
      matches: [{ kind: 'TRANSFER_MIRROR', matchConfidence: 'low', linked: false, transactionId: 'transfer' }],
    });
  });

  it('cada candidato casa com no máximo uma linha', () => {
    const bills: MatchBillCandidate[] = [
      { id: 'only', description: 'Internet', dueDate: '2026-10-10', amount: 100, targetAccountId: null },
    ];
    const result = matchImportRows(
      [
        line({ lineId: 'first', date: '2026-10-10', amount: 100 }),
        line({ lineId: 'second', date: '2026-10-11', amount: 100 }),
      ],
      [],
      bills,
      account,
    );
    expect(result.get('first')?.suggestedAction).toBe('PAY_BILL');
    expect(result.get('second')?.matches.filter((match) => match.kind === 'BILL')).toHaveLength(0);
  });

  it('marca como transferência a entrada que casa com a saída já lançada na outra conta', () => {
    const result = matchImportRows(
      [line({ lineId: 'sicredi', direction: 'in', amount: 500, description: 'PIX RECEBIDO' })],
      [],
      [],
      'sicredi',
      [
        {
          id: 'nubank-expense',
          accountId: 'nubank',
          accountName: 'Nubank Adriano',
          date: '2026-10-12',
          amount: 500,
          direction: 'out',
        },
      ],
    );
    expect(result.get('sicredi')).toMatchObject({
      suggestedAction: 'RECORD_TRANSFER',
      matches: [{ kind: 'OWN_TRANSFER', accountId: 'nubank', transactionId: 'nubank-expense', matchConfidence: 'high' }],
    });
  });

  it('liga lançamentos manuais só na estratégia do Open Finance', () => {
    const transactions: MatchTransactionCandidate[] = [
      {
        id: 'padaria',
        date: '2026-10-12',
        amount: 5,
        type: 'EXPENSE',
        description: 'Padaria',
        accountId: account,
        fromAccountId: null,
        toAccountId: null,
        billId: null,
        billDescription: null,
      },
      {
        id: 'farmacia',
        date: '2026-10-12',
        amount: 5,
        type: 'EXPENSE',
        description: 'Farmácia',
        accountId: account,
        fromAccountId: null,
        toAccountId: null,
        billId: null,
        billDescription: null,
      },
    ];
    const lines = [
      line({ lineId: 'p1', amount: 5, description: 'Padaria' }),
      line({ lineId: 'p2', amount: 5, description: 'Farmácia' }),
    ];
    const confirmed = matchImportRows(lines, transactions, [], account);
    expect(confirmed.get('p1')?.suggestedAction).toBe('IMPORT');
    expect(confirmed.get('p2')?.suggestedAction).toBe('IMPORT');
    const linked = matchImportRows(lines, transactions, [], account, [], 'link-existing');
    expect(linked.get('p1')).toMatchObject({
      suggestedAction: 'LINK_TRANSACTION',
      matches: [{ kind: 'TRANSACTION', transactionId: 'padaria' }],
    });
    expect(linked.get('p2')).toMatchObject({
      suggestedAction: 'LINK_TRANSACTION',
      matches: [{ kind: 'TRANSACTION', transactionId: 'farmacia' }],
    });
  });

  it('não pré-seleciona quando duas contas têm a mesma saída', () => {
    const result = matchImportRows(
      [line({ lineId: 'in', direction: 'in', amount: 100 })],
      [],
      [],
      'sicredi',
      [
        { id: 'a', accountId: 'nubank', accountName: 'Nubank', date: '2026-10-12', amount: 100, direction: 'out' },
        { id: 'b', accountId: 'carteira', accountName: 'Carteira', date: '2026-10-11', amount: 100, direction: 'out' },
      ],
    );
    expect(result.get('in')?.suggestedAction).toBe('IMPORT');
    expect(result.get('in')?.matches.filter((match) => match.kind === 'OWN_TRANSFER')).toHaveLength(2);
  });
});
