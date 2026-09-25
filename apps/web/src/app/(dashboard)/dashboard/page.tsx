'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { currentMonth, formatMoney } from '@/lib/format';
import type { BudgetList, DashboardSummary } from '@/lib/models';
import { BudgetProgressBar, StatCard, controlClass } from '@/components/ui';

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth);
  const summary = useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => api<DashboardSummary>(`/dashboard/summary?month=${month}`),
  });
  const budgets = useQuery({
    queryKey: ['budgets', month],
    queryFn: () => api<BudgetList>(`/budgets?month=${month}`),
  });
  const data = summary.data;
  const empty = data ? Number(data.income) === 0 && Number(data.expense) === 0 : false;
  const chart = (data?.expensesByCategory ?? []).map((item) => ({
    name: item.name || 'Sem categoria',
    total: Number(item.total),
  }));

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] font-semibold leading-none">Painel</h1>
          <p className="mt-2 text-sm text-ink-soft">Receitas, despesas e saldo do mês.</p>
        </div>
        <label className="text-sm text-ink-soft">
          Mês
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
            }}
            className={`${controlClass} mt-1`}
          />
        </label>
      </div>

      {summary.isLoading ? <p className="mt-6 text-ink-soft">Carregando resumo…</p> : null}
      {summary.isError ? (
        <p className="mt-6 text-ink">Não foi possível carregar o painel.</p>
      ) : null}

      {data ? (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Receitas" value={formatMoney(data.income)} tone="income" />
            <StatCard label="Despesas" value={formatMoney(data.expense)} tone="expense" />
            <StatCard label="Saldo das contas" value={formatMoney(data.balance)} tone="balance" />
            <StatCard
              label="Compromissos futuros"
              value={formatMoney(data.scheduledCommitments)}
              tone="expense"
            />
          </div>
          {Number(data.scheduledCommitments) > 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              Parcelas ainda não debitadas.{' '}
              <Link href="/installments" className="text-brand">
                Ver planos
              </Link>
            </p>
          ) : null}
          {empty ? (
            <div className="mt-6 rounded-lg bg-surface p-6">
              <h2 className="font-display text-[21px] font-medium">Nenhum movimento neste mês</h2>
              <p className="mt-2 text-sm text-ink-soft">
                Crie uma conta, uma categoria e o primeiro lançamento para ver os números aqui.
              </p>
              <p className="mt-4 flex flex-wrap gap-4 text-sm">
                <Link href="/accounts" className="text-brand">
                  Contas
                </Link>
                <Link href="/categories" className="text-brand">
                  Categorias
                </Link>
                <Link href="/transactions" className="text-brand">
                  Lançamentos
                </Link>
              </p>
            </div>
          ) : null}
          <section className="mt-6 rounded-lg bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-[21px] font-medium">Orçamentos do mês</h2>
              <Link href="/budgets" className="text-sm text-brand">
                Gerenciar
              </Link>
            </div>
            {budgets.data?.budgets.length ? (
              <ul className="mt-4 space-y-4">
                {budgets.data.budgets.map((budget) => (
                  <li key={budget.id}>
                    <p className="mb-2 text-sm font-medium text-ink">{budget.categoryName}</p>
                    <BudgetProgressBar
                      spent={budget.spent}
                      limit={budget.limit}
                      ratio={budget.ratio}
                      status={budget.status}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">
                Nenhum limite definido para este mês.{' '}
                <Link href="/budgets" className="text-brand">
                  Definir orçamentos
                </Link>
              </p>
            )}
          </section>
          <section className="mt-6 rounded-lg bg-surface p-6">
            <h2 className="font-display text-[21px] font-medium">Despesas por categoria</h2>
            {chart.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">Nenhuma despesa neste mês.</p>
            ) : (
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: '#5c645f', fontSize: 14 }}
                    />
                    <Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} />
                    <Bar dataKey="total" fill="#c4462f" radius={8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
