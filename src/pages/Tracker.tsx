import { useState, useMemo } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { query, orderBy, where } from 'firebase/firestore';
import { collections } from '../db';
import type { Transaction, Category, Account } from '../db';
import { formatDistanceToNow, isAfter, isBefore, subDays, startOfMonth, startOfYear, format } from 'date-fns';
import { ArrowRightLeft } from 'lucide-react';
import { useAppStore } from '../store';
import TransactionDetailsSheet from '../components/TransactionDetailsSheet';

type DateFilter = 'all' | '7d' | 'month' | 'year' | 'custom';
type CustomMode = 'range' | 'days';

export default function Tracker() {
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Custom date range
  const [customMode, setCustomMode] = useState<CustomMode>('range');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customDays, setCustomDays] = useState('');

  const currentHouseholdId = useAppStore(state => state.currentHouseholdId);

  const [allTransactions] = useCollectionData<Transaction>(
    currentHouseholdId ? query(collections.transactions, where('householdId', '==', currentHouseholdId), orderBy('date', 'desc')) : null
  );
  const [categories] = useCollectionData<Category>(
    currentHouseholdId ? query(collections.categories, where('householdId', '==', currentHouseholdId)) : null
  );
  const [accounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );

  const getCategory = (id?: string) => categories?.find(c => c.id === id);
  const getAccount = (id: string) => accounts?.find(a => a.id === id);

  const filteredTransactions = useMemo(() => {
    if (!allTransactions) return [];

    const now = new Date();
    let cutoffStart: Date | null = null;
    let cutoffEnd: Date | null = null;

    if (dateFilter === '7d') cutoffStart = subDays(now, 7);
    if (dateFilter === 'month') cutoffStart = startOfMonth(now);
    if (dateFilter === 'year') cutoffStart = startOfYear(now);
    if (dateFilter === 'custom') {
      if (customMode === 'days' && customDays) {
        const d = parseInt(customDays, 10);
        if (!isNaN(d) && d > 0) cutoffStart = subDays(now, d);
      } else if (customMode === 'range') {
        if (customFrom) cutoffStart = new Date(customFrom + 'T00:00:00');
        if (customTo) cutoffEnd = new Date(customTo + 'T23:59:59');
      }
    }

    return allTransactions.filter(tx => {
      if (tx.id.endsWith('_in')) return false; // Hide duplicate transfer side
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (selectedCategoryId !== 'all' && tx.categoryId !== selectedCategoryId) return false;
      const txDate = new Date(tx.date);
      if (cutoffStart && !isAfter(txDate, cutoffStart)) return false;
      if (cutoffEnd && !isBefore(txDate, cutoffEnd)) return false;
      return true;
    });
  }, [allTransactions, typeFilter, selectedCategoryId, dateFilter, customFrom, customTo, customDays, customMode]);

  const totalIncome = filteredTransactions.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = filteredTransactions.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="p-4 space-y-5 pb-32 h-full overflow-y-auto no-scrollbar">
      <header className="pt-1">
        <p className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.15em] mb-0.5">Activity</p>
        <h1 className="text-2xl font-black text-zinc-100 tracking-tight">Tracker</h1>
      </header>

      {/* Advanced Filters */}
      <div className="space-y-3">
        {/* Type Tabs */}
        <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl ring-1 ring-white/5">
          {(['all', 'income', 'expense', 'transfer'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`flex-1 py-2 text-sm font-bold rounded-xl capitalize transition-all duration-300 ${
                typeFilter === f
                  ? 'bg-zinc-800 shadow-md text-zinc-100 ring-1 ring-white/10'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Category Dropdown */}
          <select
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
            className="flex-1 bg-zinc-900/50 border-0 ring-1 ring-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-600 appearance-none"
          >
            <option value="all">All Categories</option>
            {categories?.filter(c => typeFilter === 'all' || c.type === typeFilter).map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* Date Range Dropdown */}
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="flex-1 bg-zinc-900/50 border-0 ring-1 ring-white/5 rounded-2xl px-4 py-3 text-sm font-bold text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-600 appearance-none"
          >
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="custom">Custom…</option>
          </select>
        </div>

        {/* Custom Date Panel — slides in when "Custom" is selected */}
        {dateFilter === 'custom' && (
          <div className="bg-zinc-900/60 ring-1 ring-white/5 rounded-2xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Mode toggle */}
            <div className="flex bg-zinc-800/60 p-1 rounded-xl ring-1 ring-white/5">
              <button
                onClick={() => setCustomMode('range')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                  customMode === 'range' ? 'bg-zinc-700 text-zinc-100 ring-1 ring-white/10' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                📅 Date Range
              </button>
              <button
                onClick={() => setCustomMode('days')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                  customMode === 'days' ? 'bg-zinc-700 text-zinc-100 ring-1 ring-white/10' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                🔢 Last N Days
              </button>
            </div>

            {customMode === 'range' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || todayStr}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full bg-zinc-800/60 ring-1 ring-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-500 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">To</label>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={todayStr}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full bg-zinc-800/60 ring-1 ring-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-500 [color-scheme:dark]"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">Number of days back</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={customDays}
                    onChange={e => setCustomDays(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full bg-zinc-800/60 ring-1 ring-white/10 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-500 placeholder:text-zinc-600 pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">days</span>
                </div>
                {customDays && parseInt(customDays) > 0 && (
                  <p className="text-[11px] text-zinc-500 mt-1.5 pl-1">
                    Showing from <span className="text-zinc-300 font-bold">{format(subDays(new Date(), parseInt(customDays)), 'MMM d, yyyy')}</span> to today
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900/40 p-5 rounded-[2rem] ring-1 ring-white/5 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl"></div>
          <p className="text-xs font-bold text-emerald-500/70 mb-2 uppercase tracking-wider relative z-10">Total Income</p>
          <p className="text-2xl font-black text-emerald-400 relative z-10 tracking-tight">₱ {totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900/40 p-5 rounded-[2rem] ring-1 ring-white/5 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-rose-500/10 rounded-full blur-xl"></div>
          <p className="text-xs font-bold text-rose-500/70 mb-2 uppercase tracking-wider relative z-10">Total Expense</p>
          <p className="text-2xl font-black text-rose-400 relative z-10 tracking-tight">₱ {totalExpense.toLocaleString()}</p>
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredTransactions?.map((tx) => {
          const cat = getCategory(tx.categoryId);
          const acc = getAccount(tx.accountId);
          const isIncome = tx.type === 'income';
          const isTransfer = tx.type === 'transfer';

          // Clean note to strip " (In)" / " (Out)"
          const cleanNote = tx.note?.replace(/\s*\((In|Out)\)$/i, '') || cat?.name || 'Transaction';

          const amountColor = isTransfer
            ? 'text-zinc-300'
            : (isIncome ? 'text-emerald-400' : 'text-zinc-100');

          const amountPrefix = isTransfer
            ? '⇄ '
            : (isIncome ? '+' : '−');
          
          return (
            <div 
              key={tx.id} 
              onClick={() => setSelectedTxId(tx.id)}
              className="p-4 bg-zinc-900/60 backdrop-blur-md rounded-2xl ring-1 ring-white/5 flex items-center gap-3 hover:bg-zinc-800/60 hover:ring-white/10 active:scale-[0.99] transition-all duration-200 cursor-pointer"
            >
              {/* Icon */}
              <div 
                className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-base font-black shadow-inner ring-1 ring-white/10"
                style={{ 
                  background: cat?.color 
                    ? `linear-gradient(135deg, ${cat.color}25, ${cat.color}45)` 
                    : isTransfer
                    ? 'linear-gradient(135deg, #3730a320, #4338ca40)'
                    : 'linear-gradient(135deg, #27272a, #3f3f46)', 
                  color: cat?.color || (isTransfer ? '#818cf8' : '#a1a1aa') 
                }}
              >
                {isTransfer ? <ArrowRightLeft size={16} /> : (cat?.name ? cat.name.charAt(0).toUpperCase() : 'T')}
              </div>

              {/* Middle: name + meta — takes remaining space, truncates */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-100 text-sm leading-tight truncate">{cleanNote}</p>
                <div className="flex items-center gap-1.5 text-[11px] font-medium mt-1 overflow-hidden">
                  <span 
                    className="px-1.5 py-0.5 rounded-md shrink-0 max-w-[90px] truncate"
                    style={{ backgroundColor: cat?.color ? `${cat.color}20` : '#27272a', color: cat?.color || (isTransfer ? '#818cf8' : '#71717a') }}
                  >
                    {cat?.name || (isTransfer ? 'Transfer' : 'Uncategorized')}
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-zinc-500 truncate shrink">{acc?.name}</span>
                  <span className="text-zinc-600 shrink-0">•</span>
                  <span className="text-zinc-600 shrink-0 whitespace-nowrap">{formatDistanceToNow(tx.date, { addSuffix: true })}</span>
                </div>
              </div>

              {/* Amount — never wraps */}
              <p className={`font-black text-base shrink-0 whitespace-nowrap tabular-nums ${amountColor}`}>
                <span className="text-xs font-bold opacity-70 mr-0.5">{amountPrefix}₱</span>{tx.amount.toLocaleString()}
              </p>
            </div>
          );
        })}
        
        {filteredTransactions?.length === 0 && (
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/30 rounded-[2rem] ring-1 ring-white/5 border-dashed border-zinc-800">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-800/50 flex items-center justify-center ring-1 ring-white/5">
              <i className="lucide lucide-inbox text-2xl text-zinc-400"></i>
            </div>
            <p className="font-bold tracking-wide">No transactions found</p>
          </div>
        )}
      </div>

      <TransactionDetailsSheet 
        transactionId={selectedTxId}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
    </div>
  );
}
