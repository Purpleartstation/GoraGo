import { useMemo } from 'react';
import { query, where } from 'firebase/firestore';
import { collections, useSafeCollectionData } from '../db';
import type { Transaction, Category, Account, Bill, Debt } from '../db';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAppStore } from '../store';
import HelpTooltip from '../components/HelpTooltip';
import CashFlowProjection from '../components/CashFlowProjection';
import { TrendingUp } from 'lucide-react';

export default function Insights() {
  const currentHouseholdId = useAppStore(state => state.currentHouseholdId);

  // Use memoized queries to prevent infinite re-renders
  const txQuery = useMemo(() => {
    if (!currentHouseholdId) return null;
    return query(
      collections.transactions, 
      where('householdId', '==', currentHouseholdId)
    );
  }, [currentHouseholdId]);
  
  const catQuery = useMemo(() => {
    if (!currentHouseholdId) return null;
    return query(collections.categories, where('householdId', '==', currentHouseholdId));
  }, [currentHouseholdId]);

  const [transactions] = useSafeCollectionData<Transaction>(txQuery, 'transactions');
  const [categories] = useSafeCollectionData<Category>(catQuery, 'categories');
  const [accounts] = useSafeCollectionData<Account>(null, 'accounts');
  const [bills] = useSafeCollectionData<Bill>(null, 'bills');
  const [debts] = useSafeCollectionData<Debt>(null, 'debts');
  const [allTransactions] = useSafeCollectionData<Transaction>(null, 'transactions');

  // Aggregate expenses by category
  const expenses = useMemo(() => {
    if (!transactions || !categories) return [];

    const categoryTotals: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.type !== 'expense') continue;
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

  // Monthly spending trends aggregation
  const monthlyTrends = useMemo(() => {
    if (!transactions) return [];
    
    const monthlyMap: Record<string, { month: string; expense: number; income: number; sortKey: string }> = {};
    
    const sorted = [...transactions].sort((a, b) => a.date - b.date);
    
    for (const tx of sorted) {
      const d = new Date(tx.date);
      const year = d.getFullYear();
      const monthIdx = d.getMonth();
      const sortKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthLabel = `${monthNames[monthIdx]} ${year}`;
      
      if (!monthlyMap[sortKey]) {
        monthlyMap[sortKey] = { month: monthLabel, expense: 0, income: 0, sortKey };
      }
      
      if (tx.type === 'expense') {
        monthlyMap[sortKey].expense += tx.amount;
      } else if (tx.type === 'income') {
        monthlyMap[sortKey].income += tx.amount;
      }
    }
    
    return Object.values(monthlyMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [transactions]);

  return (
    <div className="p-4 space-y-6 pb-40">
      <header className="sticky top-0 z-20 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-2xl border-b border-white/40 dark:border-white/10 -mx-4 px-4 pt-4 pb-3 transition-colors duration-300">
        <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em] mb-0.5">Analytics</p>
        <div className="flex items-center">
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight truncate">Insights</h1>
          <HelpTooltip
            title="Insights & Analytics"
            text="Categorized expense breakdown, cash flow forecasting, and monthly spending trends based on logged household transactions."
          />
        </div>
      </header>

      {/* Prophet 30-Day Cash Flow Projection */}
      <CashFlowProjection
        accounts={accounts || []}
        bills={bills || []}
        debts={debts || []}
        transactions={allTransactions || transactions || []}
      />

      {/* Monthly Spending Trends Chart */}
      <div className="bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl p-6 border border-white/70 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-36 h-36 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <TrendingUp size={16} />
            </div>
            <div className="flex items-center">
              <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">Monthly Spending Trends</h2>
              <HelpTooltip
                title="Spending Trends"
                text="Tracks your month-over-month total expense trajectory to identify macro spending spikes and seasonal shifts."
              />
            </div>
          </div>
          <span className="text-[11px] font-bold text-zinc-400">Over Time</span>
        </div>

        {monthlyTrends && monthlyTrends.length > 0 ? (
          <div className="h-64 w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="month" stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `₱${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                <Tooltip 
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={((value: number, name: string) => [`₱ ${value.toLocaleString()}`, name === 'expense' ? 'Expenses' : 'Income']) as any}
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="expense" name="Expenses" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#expenseGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-zinc-500 font-bold text-xs italic">
            No transaction history available for trend analysis.
          </div>
        )}
      </div>

      {/* Category Breakdown Chart Card */}
      <div className="bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl p-6 border border-white/70 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center justify-center gap-1 mb-6 relative z-10">
          <h2 className="text-sm font-black text-center text-zinc-900 dark:text-zinc-100 tracking-wide uppercase">Expense Breakdown by Category</h2>
          <HelpTooltip
            title="Category Distribution"
            text="Proportional allocation of total expenses by categorized tags (Food, Utilities, Transport, etc.)."
          />
        </div>
        
        {expenses && expenses.length > 0 ? (
          <div className="h-64 w-full relative z-10">
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
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.95)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff', fontSize: '12px' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ color: '#a1a1aa', fontSize: '11px', fontWeight: 600 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-zinc-500 font-bold text-xs italic">
            No expenses recorded yet.
          </div>
        )}
      </div>

      {/* Smart Tip Glass Card */}
      <div className="bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl p-5 border border-white/70 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-500 dark:text-amber-300 text-lg shrink-0 shadow-xs">
          💡
        </div>
        <div>
          <p className="font-extrabold text-zinc-900 dark:text-zinc-100 text-sm mb-1">Financial Tip</p>
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 leading-relaxed">
            Consistently logging variable bills and expenses allows accurate month-over-month trend comparisons!
          </p>
        </div>
      </div>
    </div>
  );
}

