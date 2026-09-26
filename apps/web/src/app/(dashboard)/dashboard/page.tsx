'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { currentMonth, daysUntil, daysUntilLabel, formatMoney } from '@/lib/format';
import type { BudgetList, DashboardSummary, SavingsGoal } from '@/lib/models';
import { MonthInput } from '@/components/date-fields';
import {
  ButtonLink,
  BudgetProgressBar,
  EmptyState,
  PageHeader,
  ProgressBar,
  StatCard,
} from '@/components/ui';

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
  const goals = useQuery({
    queryKey: ['savings-goals'],
    queryFn: () => api<SavingsGoal[]>('/savings-goals'),
  });
  const data = summary.data;
  const featuredGoals = pickFeaturedGoals(goals.data ?? []);
  const empty = data ? Number(data.income) === 0 && Number(data.expense) === 0 : false;
  const chart = (data?.expensesByCategory ?? []).map((item) => ({
    name: item.name || 'Sem categoria',
    total: Number(item.total),
  }));

  return (
    <section>
      <PageHeader title="Painel" description="Receitas, despesas e saldo do mês." display>
        <label className="text-sm text-ink-soft">
          Mês
          <span className="mt-1 block min-w-52">
            <MonthInput value={month} onChange={setMonth} />
          </span>
        </label>
      </PageHeader>

      {summary.isLoading ? <p className="mt-6 text-ink-soft">Carregando resumo…</p> : null}
      {summary.isError ? (
        <p className="mt-6 text-ink">Não foi possível carregar o painel.</p>
      ) : null}

      {data ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <EmptyState title="Nenhum movimento neste mês">
              <p>Crie uma conta, uma categoria e o primeiro lançamento para ver os números aqui.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href="/accounts">Criar conta</ButtonLink>
                <ButtonLink href="/categories" variant="secondary">
                  Categorias
                </ButtonLink>
                <ButtonLink href="/transactions" variant="ghost">
                  Lançar
                </ButtonLink>
              </div>
            </EmptyState>
          ) : null}
          <section className="mt-6 rounded-lg bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-h2 font-medium">Orçamentos do mês</h2>
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
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-h2 font-medium">Metas de economia</h2>
              <Link href="/savings-goals" className="text-sm text-brand">
                Gerenciar
              </Link>
            </div>
            {featuredGoals.length ? (
              <ul className="mt-4 space-y-4">
                {featuredGoals.map((goal) => (
                  <li key={goal.id}>
                    <Link href={`/savings-goals/${goal.id}`} className="mb-2 block text-sm font-medium text-ink">
                      {goal.name}
                    </Link>
                    <ProgressBar
                      ratio={goal.ratio}
                      tone={goal.ratio >= 1 ? 'income' : 'brand'}
                      label={`${formatMoney(goal.saved)} de ${formatMoney(goal.targetAmount)} guardados`}
                    />
                    <p className="mt-2 text-sm text-ink">
                      {formatMoney(goal.saved)} de {formatMoney(goal.targetAmount)} guardados
                      {goal.targetDate ? ` · ${daysUntilLabel(goal.targetDate)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">
                Nenhuma meta ativa.{' '}
                <Link href="/savings-goals" className="text-brand">
                  Definir uma meta
                </Link>
              </p>
            )}
          </section>
          <section className="mt-6 rounded-lg bg-surface p-6">
            <h2 className="font-display text-h2 font-medium">Despesas por categoria</h2>
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
                      width={80}
                      tick={{ fill: 'var(--color-ink-soft)', fontSize: 12 }}
                    />
                    <Tooltip formatter={(value) => formatMoney(Number(value).toFixed(2))} />
                    <Bar dataKey="total" fill="var(--color-expense)" radius={8} />
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

function pickFeaturedGoals(goals: SavingsGoal[]): SavingsGoal[] {
  return goals
    .filter((goal) => goal.status === 'ACTIVE')
    .slice()
    .sort((left, right) => featuredScore(right) - featuredScore(left))
    .slice(0, 3);
}

function featuredScore(goal: SavingsGoal): number {
  const due = goal.targetDate ? daysUntil(goal.targetDate) : null;
  const deadlineScore = due === null ? 0 : Math.max(0, 1 - due / 90);
  return Math.max(goal.ratio, deadlineScore);
}
