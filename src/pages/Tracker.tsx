import { useState, useMemo, useEffect } from 'react';
import { query, where } from 'firebase/firestore';
import { collections, useSafeCollectionData } from '../db';
import type { Transaction, Category, Account } from '../db';
import { formatDistanceToNow, isAfter, isBefore, subDays, startOfMonth, startOfYear, format } from 'date-fns';
import { ArrowRightLeft, List, Calendar as CalendarIcon, Sparkles, Trash2, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useAppStore } from '../store';
import TransactionDetailsSheet from '../components/TransactionDetailsSheet';
import TrackerCalendar from '../components/TrackerCalendar';
import HelpTooltip from '../components/HelpTooltip';

type DateFilter = 'all' | '7d' | 'month' | 'year' | 'custom';
type CustomMode = 'range' | 'days';

export default function Tracker() {
  const storeCategoryFilter = useAppStore(state => state.activeCategoryFilter);
  const storeTypeFilter = useAppStore(state => state.activeTypeFilter);
  const setActiveCategoryFilter = useAppStore(state => state.setActiveCategoryFilter);

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>(storeTypeFilter || 'all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(storeCategoryFilter || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  useEffect(() => {
    if (storeCategoryFilter) {
      setSelectedCategoryId(storeCategoryFilter);
    }
  }, [storeCategoryFilter]);

  const handleSelectCategory = (catId: string) => {
    setSelectedCategoryId(catId);
    setActiveCategoryFilter(catId);
  };

  useEffect(() => {
    if (storeTypeFilter) setTypeFilter(storeTypeFilter);
  }, [storeTypeFilter]);

  // AI Categorization History state
  const [aiHistory, setAiHistory] = useState<Array<{
    id: string;
    note: string;
    amount: number;
    type: string;
    categoryName: string;
    confidence: number;
    reasoning?: string;
    timestamp: number;
  }>>([]);
  const [showAiHistoryPanel, setShowAiHistoryPanel] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai_categorization_history');
      if (stored) {
        setAiHistory(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, [selectedTxId]);

  const clearAiHistory = () => {
    localStorage.removeItem('ai_categorization_history');
    setAiHistory([]);
  };

  // Custom date range
  const [customMode, setCustomMode] = useState<CustomMode>('range');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customDays, setCustomDays] = useState('');

  const currentHouseholdId = useAppStore(state => state.currentHouseholdId);

  const txQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.transactions, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  const catQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.categories, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  const accQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  const [allRawTransactions] = useSafeCollectionData<Transaction>(txQuery, 'transactions');
  const [categories] = useSafeCollectionData<Category>(catQuery, 'categories');
  const [accounts] = useSafeCollectionData<Account>(accQuery, 'accounts');

  const allTransactions = useMemo(() => {
    if (!allRawTransactions) return [];
    return [...allRawTransactions].sort((a, b) => (b.date || 0) - (a.date || 0));
  }, [allRawTransactions]);

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

    const cleanQuery = searchQuery.trim().toLowerCase();

    return allTransactions.filter(tx => {
      if (tx.id.endsWith('_in')) return false; // Hide duplicate transfer side
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      
      if (selectedCategoryId !== 'all') {
        const selectedCat = categories?.find(c => c.id === selectedCategoryId);
        const selectedName = selectedCat?.name?.toLowerCase();
        const txCat = categories?.find(c => c.id === tx.categoryId);
        const txCatName = txCat?.name?.toLowerCase();

        const isExactId = tx.categoryId === selectedCategoryId;
        const isNameMatch = selectedName && txCatName && selectedName === txCatName;
        const isGroceryMatch = (selectedCategoryId === 'cat_groceries' || selectedName === 'groceries' || selectedName === 'weekly groceries') &&
          (tx.categoryId === 'cat_groceries' || tx.categoryId?.startsWith('cat_groceries_') || txCatName === 'groceries' || txCatName === 'weekly groceries' || tx.note?.toLowerCase().includes('grocer'));

        if (!isExactId && !isNameMatch && !isGroceryMatch) return false;
      }

      if (cleanQuery) {
        const txCat = categories?.find(c => c.id === tx.categoryId);
        const txAcc = accounts?.find(a => a.id === tx.accountId);
        const noteMatch = tx.note?.toLowerCase().includes(cleanQuery);
        const catMatch = txCat?.name?.toLowerCase().includes(cleanQuery);
        const accMatch = txAcc?.name?.toLowerCase().includes(cleanQuery);
        const amountMatch = tx.amount.toString().includes(cleanQuery);
        if (!noteMatch && !catMatch && !accMatch && !amountMatch) return false;
      }

      const txDate = new Date(tx.date);
      if (cutoffStart && !isAfter(txDate, cutoffStart)) return false;
      if (cutoffEnd && !isBefore(txDate, cutoffEnd)) return false;
      return true;
    });
  }, [allTransactions, typeFilter, selectedCategoryId, searchQuery, dateFilter, customFrom, customTo, customDays, customMode, categories, accounts]);

  const totalIncome = filteredTransactions.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpense = filteredTransactions.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="p-4 space-y-5 pb-40">
      <header className="sticky top-0 z-20 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-2xl border-b border-white/40 dark:border-white/10 -mx-4 px-4 pt-4 pb-3 flex items-center justify-between transition-colors duration-300">
        <div>
          <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em] mb-0.5">Activity</p>
          <div className="flex items-center">
            <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight truncate">Tracker</h1>
            <HelpTooltip
              title="Transaction Tracker"
              text="View, filter, and sum up income, expenses, and transfers across custom timeframes or calendar view."
            />
          </div>
        </div>
        <div className="flex bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-2xl border border-black/5 dark:border-white/10 shadow-xs shrink-0">
          <button
            onClick={() => setViewMode('list')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <List size={14} /> List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'calendar'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <CalendarIcon size={14} /> Calendar
          </button>
        </div>
      </header>

      {viewMode === 'calendar' ? (
        <TrackerCalendar
          transactions={allTransactions}
          categories={categories || []}
          accounts={accounts || []}
          onSelectTransaction={setSelectedTxId}
        />
      ) : (
        <>
          {/* Advanced Filters */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search note, category, account, or amount..."
            className="w-full bg-[#F0F4F8] dark:bg-[#2D3748] border border-white/70 dark:border-white/10 rounded-2xl pl-10 pr-10 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type Tabs */}
        <div className="flex bg-[#F0F4F8] dark:bg-[#2D3748] p-1.5 rounded-2xl border border-white/70 dark:border-white/10 shadow-xs">
          {(['all', 'income', 'expense', 'transfer'] as const).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`flex-1 py-2 text-xs font-black rounded-xl capitalize transition-all duration-200 cursor-pointer ${
                typeFilter === f
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Quick Category Filter Chips */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            onClick={() => handleSelectCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedCategoryId === 'all'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                : 'bg-[#F0F4F8] dark:bg-[#2D3748] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-white/60 dark:border-white/5'
            }`}
          >
            <span>All Categories</span>
          </button>
          {categories
            ?.filter(c => typeFilter === 'all' || c.type === typeFilter)
            .sort((a, b) => {
              // Ensure Groceries is placed near the beginning for easy lookup
              const aIsG = a.name.toLowerCase().includes('grocer') || a.id.includes('grocer');
              const bIsG = b.name.toLowerCase().includes('grocer') || b.id.includes('grocer');
              if (aIsG && !bIsG) return -1;
              if (!aIsG && bIsG) return 1;
              return a.name.localeCompare(b.name);
            })
            .map(cat => {
              const isSelected = selectedCategoryId === cat.id || 
                (selectedCategoryId === 'cat_groceries' && (cat.id.startsWith('cat_groceries') || cat.name.toLowerCase() === 'groceries'));
              const isGrocery = cat.name.toLowerCase().includes('grocer') || cat.id.includes('grocer');

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? isGrocery 
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25 ring-1 ring-emerald-400'
                        : 'bg-purple-600 text-white shadow-md shadow-purple-500/20 ring-1 ring-purple-400'
                      : 'bg-[#F0F4F8] dark:bg-[#2D3748] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-white/60 dark:border-white/5'
                  }`}
                >
                  {isGrocery && <span>🛒</span>}
                  <span>{cat.name}</span>
                </button>
              );
            })}
        </div>

        <div className="flex gap-2">
          {/* Category Dropdown */}
          <select
            value={selectedCategoryId}
            onChange={e => handleSelectCategory(e.target.value)}
            className="flex-1 bg-[#F0F4F8] dark:bg-[#2D3748] border border-white/70 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-black text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer shadow-xs"
          >
            <option value="all" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">All Categories</option>
            {categories?.filter(c => typeFilter === 'all' || c.type === typeFilter).map(cat => (
              <option key={cat.id} value={cat.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">{cat.name}</option>
            ))}
          </select>

          {/* Date Range Dropdown */}
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value as DateFilter)}
            className="flex-1 bg-[#F0F4F8] dark:bg-[#2D3748] border border-white/70 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-black text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500 appearance-none cursor-pointer shadow-xs"
          >
            <option value="all" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">All Time</option>
            <option value="7d" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Last 7 Days</option>
            <option value="month" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">This Month</option>
            <option value="year" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">This Year</option>
            <option value="custom" className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">Custom…</option>
          </select>
        </div>

        {selectedCategoryId !== 'all' && (
          <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
            <span>
              Filtered by:{' '}
              <span className="font-bold text-purple-600 dark:text-purple-400">
                {categories?.find(c => c.id === selectedCategoryId)?.name || selectedCategoryId}
              </span>{' '}
              ({filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''})
            </span>
            <button
              type="button"
              onClick={() => handleSelectCategory('all')}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 underline text-[11px] font-medium cursor-pointer"
            >
              Reset filter
            </button>
          </div>
        )}

        {/* Custom Date Panel — slides in when "Custom" is selected */}
        {dateFilter === 'custom' && (
          <div className="bg-[#F0F4F8] dark:bg-[#2D3748] border border-white/70 dark:border-white/10 rounded-3xl p-4 space-y-4 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Mode toggle */}
            <div className="flex bg-black/5 dark:bg-zinc-800/80 p-1 rounded-2xl border border-black/5 dark:border-white/5">
              <button
                onClick={() => setCustomMode('range')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                  customMode === 'range' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                📅 Date Range
              </button>
              <button
                onClick={() => setCustomMode('days')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer ${
                  customMode === 'days' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                🔢 Last N Days
              </button>
            </div>

            {customMode === 'range' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block mb-1.5">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || todayStr}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block mb-1.5">To</label>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={todayStr}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block mb-1.5">Number of days back</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    value={customDays}
                    onChange={e => setCustomDays(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-zinc-900 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500 pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">days</span>
                </div>
                {customDays && parseInt(customDays) > 0 && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 pl-1">
                    Showing from <span className="text-zinc-900 dark:text-zinc-200 font-bold">{format(subDays(new Date(), parseInt(customDays)), 'MMM d, yyyy')}</span> to today
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#F0F4F8] dark:bg-[#2D3748] p-5 rounded-3xl border border-white/70 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-500/15 rounded-full blur-xl pointer-events-none"></div>
          <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 mb-2 uppercase tracking-wider relative z-10">Total Income</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 relative z-10 tracking-tight">₱ {totalIncome.toLocaleString()}</p>
        </div>
        <div className="bg-[#F0F4F8] dark:bg-[#2D3748] p-5 rounded-3xl border border-white/70 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-rose-500/15 rounded-full blur-xl pointer-events-none"></div>
          <p className="text-xs font-black text-rose-600 dark:text-rose-400 mb-2 uppercase tracking-wider relative z-10">Total Expense</p>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 relative z-10 tracking-tight">₱ {totalExpense.toLocaleString()}</p>
        </div>
      </div>

      {/* AI Categorization History Panel */}
      {viewMode === 'list' && (
        <div className="bg-[#F0F4F8] dark:bg-[#2D3748] border border-white/70 dark:border-white/10 rounded-3xl p-5 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>AI Categorization History</span>
                  <span className="bg-purple-500/20 text-purple-600 dark:text-purple-300 px-2 py-0.5 rounded-full text-[10px] font-black">
                    {aiHistory.length}
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Recent AI classifications powered by Gemini (sakowicz/actual-ai)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {aiHistory.length > 0 && (
                <button
                  type="button"
                  onClick={clearAiHistory}
                  className="p-2 rounded-xl text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors text-xs font-bold flex items-center gap-1 cursor-pointer"
                  title="Clear history"
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAiHistoryPanel(!showAiHistoryPanel)}
                className="p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 transition-colors text-xs font-bold cursor-pointer"
              >
                {showAiHistoryPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>

          {showAiHistoryPanel && (
            <div className="space-y-3 pt-1">
              {aiHistory.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-xs italic">
                  No AI categorization history yet. Try using "AI Auto-Categorize" when adding a new transaction!
                </div>
              ) : (
                aiHistory.map(item => (
                  <div key={item.id} className="bg-white/80 dark:bg-zinc-900/60 border border-white/80 dark:border-white/10 rounded-2xl p-3.5 space-y-2 shadow-xs shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] dark:shadow-none">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{item.note}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-purple-600 dark:text-purple-400 whitespace-nowrap">₱{item.amount.toLocaleString()}</span>
                        <span className="bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-md text-[10px] font-black shrink-0">
                          {Math.round(item.confidence * 100)}% Match
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-black/5 dark:border-white/5">
                      <span className="font-bold text-zinc-600 dark:text-zinc-400 truncate">Category: <span className="text-purple-600 dark:text-purple-300 underline">{item.categoryName}</span></span>
                      <span className="text-zinc-400 shrink-0 whitespace-nowrap ml-2">{formatDistanceToNow(item.timestamp, { addSuffix: true })}</span>
                    </div>
                    {item.reasoning && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 italic bg-purple-500/5 p-2 rounded-xl">
                        "{item.reasoning}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

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
            ? 'text-zinc-600 dark:text-zinc-300'
            : (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100');

          const amountPrefix = isTransfer
            ? '⇄ '
            : (isIncome ? '+' : '−');
          
          return (
            <div 
              key={tx.id} 
              onClick={() => setSelectedTxId(tx.id)}
              className="p-4 bg-white/80 dark:bg-zinc-900/60 rounded-3xl border border-white/80 dark:border-white/10 shadow-xs flex items-center gap-3 hover:bg-white dark:hover:bg-zinc-900 active:scale-[0.99] transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] dark:shadow-none"
            >
              {/* Icon */}
              <div 
                className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-base font-black border border-black/5 dark:border-white/10 shadow-xs"
                style={{ 
                  background: cat?.color 
                    ? `linear-gradient(135deg, ${cat.color}30, ${cat.color}60)` 
                    : isTransfer
                    ? 'linear-gradient(135deg, #a855f730, #d946ef60)'
                    : 'linear-gradient(135deg, #e4e4e7, #d4d4d8)', 
                  color: cat?.color || (isTransfer ? '#d946ef' : '#52525b') 
                }}
              >
                {isTransfer ? <ArrowRightLeft size={16} /> : (cat?.name ? cat.name.charAt(0).toUpperCase() : 'T')}
              </div>

              {/* Middle: name + meta — takes remaining space, truncates */}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-tight truncate">{cleanNote}</p>
                <div className="flex items-center gap-1.5 text-[11px] font-medium mt-1 overflow-hidden">
                  <span 
                    className="px-1.5 py-0.5 rounded-md shrink-0 max-w-[90px] truncate font-bold"
                    style={{ backgroundColor: cat?.color ? `${cat.color}20` : '#f4f4f5', color: cat?.color || (isTransfer ? '#6366f1' : '#71717a') }}
                  >
                    {cat?.name || (isTransfer ? 'Transfer' : 'Uncategorized')}
                  </span>
                  <span className="text-zinc-400 dark:text-zinc-600">•</span>
                  <span className="text-zinc-600 dark:text-zinc-400 truncate shrink">{acc?.name}</span>
                  <span className="text-zinc-400 dark:text-zinc-600 shrink-0">•</span>
                  <span className="text-zinc-500 shrink-0 whitespace-nowrap">{formatDistanceToNow(tx.date, { addSuffix: true })}</span>
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
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl border border-dashed border-black/10 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)]">
            <div className="w-16 h-16 mb-4 rounded-full bg-white/70 dark:bg-zinc-800/80 flex items-center justify-center border border-white/60 dark:border-white/10 shadow-sm">
              <i className="lucide lucide-inbox text-2xl text-zinc-400"></i>
            </div>
            <p className="font-bold tracking-wide text-zinc-800 dark:text-zinc-200">No transactions found</p>
          </div>
        )}
      </div>
        </>
      )}

      <TransactionDetailsSheet 
        transactionId={selectedTxId}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
    </div>
  );
}

