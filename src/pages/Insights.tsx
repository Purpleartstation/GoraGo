import { useMemo } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { query, where } from 'firebase/firestore';
import { collections } from '../db';
import type { Transaction, Category } from '../db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useAppStore } from '../store';
import HelpTooltip from '../components/HelpTooltip';

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
    <div className="p-4 space-y-6 pb-32 h-full overflow-y-auto no-scrollbar">
      <header className="pt-1">
        <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.15em] mb-0.5">Analytics</p>
        <div className="flex items-center">
          <h1 className="text-2xl font-black text-zinc-100 tracking-tight">Insights</h1>
          <HelpTooltip
            title="Insights & Analytics"
            text="Categorized expense breakdown and spending trends based on logged household transactions."
          />
        </div>
      </header>

      {/* Chart Card */}
      <div className="bg-zinc-900/40 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-lg relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <h2 className="text-base font-extrabold mb-6 text-center text-zinc-100 tracking-wide uppercase text-xs">Expense Breakdown</h2>
        
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
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ color: '#a1a1aa', fontSize: '11px', fontWeight: 600 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-zinc-500 font-bold text-sm">
            No expenses recorded yet.
          </div>
        )}
      </div>

      {/* Smart Tip Glass Card */}
      <div className="bg-gradient-to-br from-indigo-500/15 via-zinc-900/40 to-emerald-500/15 backdrop-blur-xl border border-white/10 p-5 rounded-3xl flex items-start gap-3.5 shadow-lg">
        <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-300 text-lg shrink-0">
          💡
        </div>
        <div>
          <p className="font-extrabold text-zinc-100 text-sm mb-1">Financial Tip</p>
          <p className="text-xs font-medium text-zinc-300 leading-relaxed">
            Consistently logging variable bills (like Meralco and water) allows accurate month-over-month comparisons!
          </p>
        </div>
      </div>
    </div>
  );
}

