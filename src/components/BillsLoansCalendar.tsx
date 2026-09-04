import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, Receipt, Landmark } from 'lucide-react';
import type { Bill, Debt } from '../db';
import { MONTHS, WEEKDAYS, getOrdinal } from './CalendarPickers';

interface BillsLoansCalendarProps {
  bills: Bill[];
  debts: Debt[];
  onSelectBill: (billId: string) => void;
  onSelectDebt: (debtId: string) => void;
  onPayBill: (billId: string) => void;
  onPayLoan: (debtId: string) => void;
}

export default function BillsLoansCalendar({
  bills = [],
  debts = [],
  onSelectBill,
  onSelectDebt,
  onPayBill,
  onPayLoan,
}: BillsLoansCalendarProps) {
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

  // Map items to day numbers for the currently viewed month
  const dayItemsMap = useMemo(() => {
    const map: Record<number, { bills: Bill[]; debts: Debt[]; totalAmount: number }> = {};

    for (let day = 1; day <= daysInMonth; day++) {
      map[day] = { bills: [], debts: [], totalAmount: 0 };
    }

    // Process Bills
    bills.forEach(bill => {
      if (bill.dueType === 'specific' && bill.specificDates && bill.specificDates.length > 0) {
        bill.specificDates.forEach(ts => {
          const d = new Date(ts);
          if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
            const day = d.getDate();
            if (map[day]) {
              map[day].bills.push(bill);
              map[day].totalAmount += bill.amount;
            }
          }
        });
      } else {
        // Monthly recurring
        const rawDueDay = bill.dueDay || 1;
        const targetDay = Math.min(rawDueDay, daysInMonth);
        if (map[targetDay]) {
          map[targetDay].bills.push(bill);
          map[targetDay].totalAmount += bill.amount;
        }
      }
    });

    // Process Debts / Loans (active with remaining balance)
    debts.filter(d => d.remainingBalance > 0).forEach(debt => {
      const rawDueDay = debt.dueDay || 1;
      const targetDay = Math.min(rawDueDay, daysInMonth);
      if (map[targetDay]) {
        const installment = Math.min(debt.installmentAmount, debt.remainingBalance);
        map[targetDay].debts.push(debt);
        map[targetDay].totalAmount += installment;
      }
    });

    return map;
  }, [bills, debts, viewYear, viewMonth, daysInMonth]);

  const [periodScope, setPeriodScope] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('month');

  // Compute Auto-Totals for Bills & Loans based on selected period scope
  const periodStats = useMemo(() => {
    let billCount = 0;
    let billTotal = 0;
    let billPaidTotal = 0;
    let loanCount = 0;
    let loanTotal = 0;

    // Helper check if a date falls in selected week
    const isSameWeek = (d: Date, target: Date) => {
      const start = new Date(target);
      start.setDate(target.getDate() - target.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    };

    const isMatchDate = (year: number, month: number, day: number) => {
      if (periodScope === 'all') return true;
      if (periodScope === 'year') return year === viewYear;
      if (periodScope === 'month') return year === viewYear && month === viewMonth;
      if (periodScope === 'day') return year === viewYear && month === viewMonth && day === selectedDay;
      if (periodScope === 'week') {
        const targetDate = new Date(viewYear, viewMonth, selectedDay);
        const curDate = new Date(year, month, day);
        return isSameWeek(curDate, targetDate);
      }
      return true;
    };

    // Calculate Bills
    bills.forEach(bill => {
      if (bill.dueType === 'specific' && bill.specificDates && bill.specificDates.length > 0) {
        bill.specificDates.forEach(ts => {
          const d = new Date(ts);
          if (isMatchDate(d.getFullYear(), d.getMonth(), d.getDate())) {
            billCount++;
            billTotal += bill.amount;
            if (bill.status === 'paid') billPaidTotal += bill.amount;
          }
        });
      } else {
        // Monthly recurring check
        const rawDueDay = bill.dueDay || 1;
        if (periodScope === 'year') {
          for (let m = 0; m < 12; m++) {
            billCount++;
            billTotal += bill.amount;
            if (bill.status === 'paid') billPaidTotal += bill.amount;
          }
        } else if (periodScope === 'all') {
          billCount++;
          billTotal += bill.amount;
          if (bill.status === 'paid') billPaidTotal += bill.amount;
        } else {
          const targetDay = Math.min(rawDueDay, daysInMonth);
          if (isMatchDate(viewYear, viewMonth, targetDay)) {
            billCount++;
            billTotal += bill.amount;
            if (bill.status === 'paid') billPaidTotal += bill.amount;
          }
        }
      }
    });

    // Calculate Debts / Loans
    debts.filter(d => d.remainingBalance > 0).forEach(debt => {
      const rawDueDay = debt.dueDay || 1;
      const installment = Math.min(debt.installmentAmount, debt.remainingBalance);

      if (periodScope === 'year') {
        for (let m = 0; m < 12; m++) {
          loanCount++;
          loanTotal += installment;
        }
      } else if (periodScope === 'all') {
        loanCount++;
        loanTotal += installment;
      } else {
        const targetDay = Math.min(rawDueDay, daysInMonth);
        if (isMatchDate(viewYear, viewMonth, targetDay)) {
          loanCount++;
          loanTotal += installment;
        }
      }
    });

    return {
      billCount,
      billTotal,
      billPaidTotal,
      billPendingTotal: Math.max(0, billTotal - billPaidTotal),
      loanCount,
      loanTotal,
      grandTotal: billTotal + loanTotal,
    };
  }, [bills, debts, periodScope, viewYear, viewMonth, selectedDay, daysInMonth]);

  const selectedDayData = dayItemsMap[selectedDay] || { bills: [], debts: [], totalAmount: 0 };
  const hasItemsOnSelectedDay = selectedDayData.bills.length > 0 || selectedDayData.debts.length > 0;

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
              <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Auto-Total Obligations</p>
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                {periodScope === 'day' && `${MONTHS[viewMonth]} ${getOrdinal(selectedDay)}, ${viewYear}`}
                {periodScope === 'week' && `Week of ${MONTHS[viewMonth]} ${selectedDay}`}
                {periodScope === 'month' && `${MONTHS[viewMonth]} ${viewYear}`}
                {periodScope === 'year' && `Year ${viewYear}`}
                {periodScope === 'all' && 'All Registered Obligations'}
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
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">
              Bills ({periodStats.billCount})
            </p>
            <p className="text-xs font-black text-purple-600 dark:text-fuchsia-400">₱{periodStats.billTotal.toLocaleString()}</p>
            {periodStats.billPaidTotal > 0 && (
              <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                Paid: ₱{periodStats.billPaidTotal.toLocaleString()}
              </p>
            )}
          </div>

          <div className="p-2.5 bg-black/5 dark:bg-zinc-950/60 rounded-xl border border-black/10 dark:border-white/5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">
              Loans ({periodStats.loanCount})
            </p>
            <p className="text-xs font-black text-fuchsia-600 dark:text-fuchsia-300">₱{periodStats.loanTotal.toLocaleString()}</p>
            <p className="text-[9px] text-zinc-500 dark:text-zinc-400 font-bold mt-0.5">Installments</p>
          </div>

          <div className="p-2.5 bg-black/5 dark:bg-zinc-950/60 rounded-xl border border-black/10 dark:border-white/5">
            <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Grand Total</p>
            <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">₱{periodStats.grandTotal.toLocaleString()}</p>
            <p className="text-[9px] text-purple-600/80 dark:text-fuchsia-400/80 font-bold mt-0.5">Auto-Summed</p>
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
            const dayData = dayItemsMap[day] || { bills: [], debts: [], totalAmount: 0 };
            const hasBills = dayData.bills.length > 0;
            const hasLoans = dayData.debts.length > 0;

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

                {/* Status Dot / Badge Indicators */}
                <div className="flex items-center justify-center gap-0.5 mt-auto">
                  {hasBills && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-purple-500 dark:bg-fuchsia-400'
                      }`}
                      title={`${dayData.bills.length} bill(s)`}
                    />
                  )}
                  {hasLoans && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-fuchsia-200' : 'bg-fuchsia-600 dark:bg-purple-400'
                      }`}
                      title={`${dayData.debts.length} loan(s)`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Selected Day Schedule Details ── */}
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
          {hasItemsOnSelectedDay && (
            <span className="text-[11px] font-black text-zinc-900 dark:text-zinc-100">
              Total Due: ₱{selectedDayData.totalAmount.toLocaleString()}
            </span>
          )}
        </div>

        {!hasItemsOnSelectedDay ? (
          <div className="py-6 text-center text-zinc-500 dark:text-zinc-400 text-xs font-medium">
            No bills or loans due on {MONTHS[viewMonth]} {selectedDay}.
          </div>
        ) : (
          <div className="space-y-2.5">
            {/* Bills due on this day */}
            {selectedDayData.bills.map(bill => {
              const isPaid = bill.status === 'paid';
              return (
                <div
                  key={bill.id}
                  onClick={() => onSelectBill(bill.id)}
                  className="bg-black/5 dark:bg-zinc-900/80 border border-black/10 dark:border-white/5 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-black/10 dark:hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-fuchsia-400 rounded-xl shrink-0">
                      <Receipt size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">{bill.name}</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold">Bill</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">₱{bill.amount.toLocaleString()}</p>
                    </div>
                    {!isPaid ? (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          onPayBill(bill.id);
                        }}
                        className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white hover:from-purple-600 hover:to-fuchsia-600 transition-all active:scale-95 shadow-sm"
                      >
                        Pay
                      </button>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Paid
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Debts / Loans due on this day */}
            {selectedDayData.debts.map(debt => {
              const installment = Math.min(debt.installmentAmount, debt.remainingBalance);
              return (
                <div
                  key={debt.id}
                  onClick={() => onSelectDebt(debt.id)}
                  className="bg-black/5 dark:bg-zinc-900/80 border border-black/10 dark:border-white/5 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-black/10 dark:hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 rounded-xl shrink-0">
                      <Landmark size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">{debt.name}</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold">Loan ({debt.lender || 'Lender'})</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">₱{installment.toLocaleString()}</p>
                      <p className="text-[9px] text-zinc-500 dark:text-zinc-400 font-bold">Inst.</p>
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onPayLoan(debt.id);
                      }}
                      className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30 hover:bg-fuchsia-500/30 transition-all active:scale-95"
                    >
                      Pay
                    </button>
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
