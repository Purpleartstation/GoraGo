import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, ArrowUpRight, ArrowDownLeft, ArrowRightLeft } from 'lucide-react';
import type { Transaction, Category, Account } from '../db';
import { MONTHS, WEEKDAYS, getOrdinal } from './CalendarPickers';

interface TrackerCalendarProps {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  onSelectTransaction: (txId: string) => void;
}

export default function TrackerCalendar({
  transactions = [],
  categories = [],
  accounts = [],
  onSelectTransaction,
}: TrackerCalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDow = new Date(viewYear, viewMonth, 1).getDay();
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const goToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  const getCategory = (id?: string) => categories.find(c => c.id === id);
  const getAccount = (id: string) => accounts.find(a => a.id === id);

  // Group transactions by day for current month
  const dayTxMap = useMemo(() => {
    const map: Record<number, { items: Transaction[]; income: number; expense: number }> = {};

    for (let day = 1; day <= daysInMonth; day++) {
      map[day] = { items: [], income: 0, expense: 0 };
    }

    transactions.forEach(tx => {
      if (tx.id.endsWith('_in')) return; // Hide duplicate transfer side
      const txDate = new Date(tx.date);
      if (txDate.getFullYear() === viewYear && txDate.getMonth() === viewMonth) {
        const day = txDate.getDate();
        if (map[day]) {
          map[day].items.push(tx);
          if (tx.type === 'income') map[day].income += tx.amount;
          if (tx.type === 'expense') map[day].expense += tx.amount;
        }
      }
    });

    return map;
  }, [transactions, viewYear, viewMonth, daysInMonth]);

  const [periodScope, setPeriodScope] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('month');

  // Compute Auto-Totals for Tracker based on selected period scope
  const periodSummary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let count = 0;

    const isSameWeek = (d: Date, target: Date) => {
      const start = new Date(target);
      start.setDate(target.getDate() - target.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    };

    transactions.forEach(tx => {
      if (tx.id.endsWith('_in')) return; // Hide duplicate transfer side
      const d = new Date(tx.date);
      const year = d.getFullYear();
      const month = d.getMonth();
      const day = d.getDate();

      let isMatch = false;
      if (periodScope === 'all') isMatch = true;
      else if (periodScope === 'year') isMatch = year === viewYear;
      else if (periodScope === 'month') isMatch = year === viewYear && month === viewMonth;
      else if (periodScope === 'day') isMatch = year === viewYear && month === viewMonth && day === selectedDay;
      else if (periodScope === 'week') {
        const targetDate = new Date(viewYear, viewMonth, selectedDay);
        isMatch = isSameWeek(d, targetDate);
      }

      if (isMatch) {
        count++;
        if (tx.type === 'income') income += tx.amount;
        if (tx.type === 'expense') expense += tx.amount;
      }
    });

    return {
      income,
      expense,
      net: income - expense,
      count,
    };
  }, [transactions, periodScope, viewYear, viewMonth, selectedDay]);

  const selectedDayData = dayTxMap[selectedDay] || { items: [], income: 0, expense: 0 };
  const hasTxOnSelectedDay = selectedDayData.items.length > 0;

  return (
    <div className="space-y-4">
      {/* ── Auto-Total Summary Banner ── */}
      <div className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border border-white/40 dark:border-white/10 p-4 rounded-2xl shadow-lg space-y-3 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl border border-purple-500/20">
              <Calendar size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Auto-Total Activity</p>
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                {periodScope === 'day' && `${MONTHS[viewMonth]} ${getOrdinal(selectedDay)}, ${viewYear}`}
                {periodScope === 'week' && `Week of ${MONTHS[viewMonth]} ${selectedDay}`}
                {periodScope === 'month' && `${MONTHS[viewMonth]} ${viewYear}`}
                {periodScope === 'year' && `Year ${viewYear}`}
                {periodScope === 'all' && 'All-Time Total Activity'}
              </p>
            </div>
          </div>

          {/* Scope Selector */}
          <div className="flex bg-black/5 dark:bg-zinc-950/80 p-1 rounded-xl border border-black/10 dark:border-white/5 self-start sm:self-auto">
            {(['day', 'week', 'month', 'year', 'all'] as const).map(scope => (
              <button
                key={scope}
                type="button"
                onClick={() => setPeriodScope(scope)}
                className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  periodScope === scope
                    ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {scope}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Calculated Cards */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 bg-black/5 dark:bg-zinc-950/60 rounded-xl border border-black/10 dark:border-white/5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Total Income</p>
            <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">+₱{periodSummary.income.toLocaleString()}</p>
          </div>

          <div className="p-2.5 bg-black/5 dark:bg-zinc-950/60 rounded-xl border border-black/10 dark:border-white/5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Total Expense</p>
            <p className="text-xs font-black text-rose-600 dark:text-rose-400">-₱{periodSummary.expense.toLocaleString()}</p>
          </div>

          <div className="p-2.5 bg-black/5 dark:bg-zinc-950/60 rounded-xl border border-black/10 dark:border-white/5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Net Cash Flow</p>
            <p className={`text-xs font-black ${periodSummary.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {periodSummary.net >= 0 ? '+' : ''}₱{periodSummary.net.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── Month Calendar Grid Card ── */}
      <div className="bg-white/60 dark:bg-zinc-900/60 border border-white/40 dark:border-white/10 rounded-2xl overflow-hidden shadow-lg backdrop-blur-xl">
        {/* Navigation Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-black/5 dark:bg-zinc-800/80 border-b border-black/10 dark:border-white/5">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            title="Previous Month"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-1.5">
            {/* Month Select Dropdown */}
            <select
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="bg-white/80 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs font-black rounded-lg px-2 py-1 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={idx} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                  {m}
                </option>
              ))}
            </select>

            {/* Year Select Dropdown */}
            <select
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="bg-white/80 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs font-black rounded-lg px-2 py-1 border border-black/10 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
            >
              {Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i).map(y => (
                <option key={y} value={y} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                  {y}
                </option>
              ))}
            </select>

            {!isCurrentMonth && (
              <button
                type="button"
                onClick={goToToday}
                className="text-[10px] font-bold text-purple-600 dark:text-fuchsia-400 bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded-lg hover:bg-purple-500/20 transition-colors ml-0.5"
              >
                Today
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            title="Next Month"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Weekday Labels */}
        <div className="grid grid-cols-7 px-2 pt-2.5 pb-1 border-b border-black/10 dark:border-white/5 bg-black/5 dark:bg-zinc-900/30">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Day Cells Grid */}
        <div className="grid grid-cols-7 px-2 py-2 gap-1">
          {Array.from({ length: startDow }).map((_, i) => (
            <div key={`empty-${i}`} className="h-12 w-full" />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const isToday = isCurrentMonth && today.getDate() === day;
            const isSelected = selectedDay === day;
            const dayData = dayTxMap[day] || { items: [], income: 0, expense: 0 };
            const hasIncome = dayData.income > 0;
            const hasExpense = dayData.expense > 0;

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`h-12 w-full rounded-xl flex flex-col items-center justify-between p-1 transition-all relative ${
                  isSelected
                    ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-lg scale-[1.03] ring-2 ring-purple-400/50 z-10'
                    : isToday
                    ? 'bg-purple-500/15 dark:bg-purple-500/20 text-purple-700 dark:text-fuchsia-300 ring-1 ring-purple-500/40'
                    : 'bg-black/5 dark:bg-zinc-900/40 text-zinc-800 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-zinc-800'
                }`}
              >
                <span className={`text-xs font-black ${isSelected ? 'text-white' : isToday ? 'text-purple-600 dark:text-fuchsia-400' : 'text-zinc-800 dark:text-zinc-300'}`}>
                  {day}
                </span>

                {/* Dots / Indicators */}
                <div className="flex items-center justify-center gap-0.5 mt-auto">
                  {hasIncome && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-emerald-200' : 'bg-emerald-500'
                      }`}
                      title={`Income: +₱${dayData.income.toLocaleString()}`}
                    />
                  )}
                  {hasExpense && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-rose-200' : 'bg-rose-500'
                      }`}
                      title={`Expense: -₱${dayData.expense.toLocaleString()}`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Selected Day Transactions List ── */}
      <div className="bg-white/60 dark:bg-zinc-900/60 border border-white/40 dark:border-white/10 rounded-2xl p-4 space-y-3 shadow-lg backdrop-blur-xl">
        <div className="flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
              {MONTHS[viewMonth]} {getOrdinal(selectedDay)}
            </span>
            {isCurrentMonth && selectedDay === today.getDate() && (
              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-fuchsia-400 border border-purple-500/20 uppercase">
                Today
              </span>
            )}
          </div>
          {hasTxOnSelectedDay && (
            <div className="flex items-center gap-2 text-[10px] font-black">
              {selectedDayData.income > 0 && <span className="text-emerald-600 dark:text-emerald-400">+₱{selectedDayData.income.toLocaleString()}</span>}
              {selectedDayData.expense > 0 && <span className="text-rose-600 dark:text-rose-400">-₱{selectedDayData.expense.toLocaleString()}</span>}
            </div>
          )}
        </div>

        {!hasTxOnSelectedDay ? (
          <div className="py-6 text-center text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            No transactions recorded on {MONTHS[viewMonth]} {selectedDay}.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDayData.items.map(tx => {
              const cat = getCategory(tx.categoryId);
              const acc = getAccount(tx.accountId);
              const isIncome = tx.type === 'income';
              const isTransfer = tx.type === 'transfer';

              return (
                <div
                  key={tx.id}
                  onClick={() => onSelectTransaction(tx.id)}
                  className="bg-black/5 dark:bg-zinc-900/80 border border-black/10 dark:border-white/5 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-black/10 dark:hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${
                      isIncome
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : isTransfer
                        ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}>
                      {isIncome ? <ArrowDownLeft size={16} /> : isTransfer ? <ArrowRightLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                        {tx.note || cat?.name || (isTransfer ? 'Transfer' : 'Transaction')}
                      </p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold flex items-center gap-1 truncate">
                        {acc?.name || 'Account'} {cat?.name ? `· ${cat.name}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`text-xs font-black ${
                      isIncome ? 'text-emerald-600 dark:text-emerald-400' : isTransfer ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-900 dark:text-zinc-100'
                    }`}>
                      {isIncome ? '+' : isTransfer ? '' : '-'}₱{tx.amount.toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
