import { useMemo } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { query, where } from 'firebase/firestore';
import { collections } from '../db';
import type { Transaction, Category } from '../db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useAppStore } from '../store';

export default function Insights() {
  const currentHouseholdId = useAppStore(state => state.currentHouseholdId);

  // Use memoized queries to prevent infinite re-renders
  const txQuery = useMemo(() => {
    if (!currentHouseholdId) return null;
    return query(
      collections.transactions, 
      where('householdId', '==', currentHouseholdId),
      where('type', '==', 'expense')
    );
  }, [currentHouseholdId]);
  
  const catQuery = useMemo(() => {
    if (!currentHouseholdId) return null;
    return query(collections.categories, where('householdId', '==', currentHouseholdId));
  }, [currentHouseholdId]);

  const [transactions] = useCollectionData<Transaction>(txQuery);
  const [categories] = useCollectionData<Category>(catQuery);

  // Aggregate expenses by category
  const expenses = useMemo(() => {
    if (!transactions || !categories) return [];

    const categoryTotals: Record<string, number> = {};
    for (const tx of transactions) {
      const catId = tx.categoryId || 'unknown';
      categoryTotals[catId] = (categoryTotals[catId] || 0) + tx.amount;
    }
    
    const data = [];
    for (const [catId, amount] of Object.entries(categoryTotals)) {
      const cat = categories.find(c => c.id === catId);
      data.push({
        name: cat?.name || 'Unknown',
        value: amount,
        color: cat?.color || '#cbd5e1'
      });
    }
    return data.sort((a, b) => b.value - a.value);
  }, [transactions, categories]);

  return (
    <div className="p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Insights</h1>
      </header>

      {/* Chart Card */}
      <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
        <h2 className="text-lg font-bold mb-6 text-center">Expense Breakdown</h2>
        
        {expenses && expenses.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenses}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expenses.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: number) => [`₱ ${value.toLocaleString()}`, 'Amount']) as any}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-500">
            No expenses to show.
          </div>
        )}
      </div>

      {/* Callout */}
      <div className="bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800 p-4 rounded-2xl flex items-start gap-4">
        <div className="text-3xl">💡</div>
        <div>
          <p className="font-bold text-primary-900 dark:text-primary-100 mb-1">Good job!</p>
          <p className="text-sm text-primary-700 dark:text-primary-300">
            You spent 15% less on Food this week compared to last week.
          </p>
        </div>
      </div>
    </div>
  );
}
