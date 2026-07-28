import { useState } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { query, where, setDoc, doc } from 'firebase/firestore';
import { db, collections } from '../db';
import type { Account } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import { X, RefreshCw, CalendarDays, HelpCircle } from 'lucide-react';
import { MonthlyDayPicker, SpecificDatePicker, getOrdinal } from './CalendarPickers';

// ─── Main BillSheet ───────────────────────────────────────────────────────────
interface BillSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BillSheet({ isOpen, onClose }: BillSheetProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [isVariableAmount, setIsVariableAmount] = useState(false);
  const [showVariableInfo, setShowVariableInfo] = useState(false);

  // Mode
  const [dueType, setDueType] = useState<'monthly' | 'specific'>('monthly');

  // Monthly mode state
  const [dueDay, setDueDay] = useState(0);
  const [showMonthlyCalendar, setShowMonthlyCalendar] = useState(false);

  // Specific mode state
  const [specificDates, setSpecificDates] = useState<number[]>([]);
  const [showSpecificCalendar, setShowSpecificCalendar] = useState(false);

  const [accounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );

  const toggleSpecificDate = (ts: number) => {
    setSpecificDates(prev => {
      if (prev.includes(ts)) {
        return prev.filter(t => t !== ts);
      }
      return [...prev, ts].sort((a, b) => a - b);
    });
  };

  const removeSpecificDate = (ts: number) => {
    setSpecificDates(prev => prev.filter(t => t !== ts));
  };

  const isValid = () => {
    if (!name.trim() || !amount || !accountId) return false;
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return false;
    if (dueType === 'monthly') return dueDay >= 1 && dueDay <= 31;
    return specificDates.length > 0;
  };

  const handleSave = async () => {
    if (!isValid()) return;
    const numAmount = parseFloat(amount);

    if (dueType === 'monthly') {
      // Auto-create a recurring rule for monthly bills
      const ruleId = `rule_${Date.now()}`;
      await setDoc(doc(db, 'recurringRules', ruleId), {
        id: ruleId,
        accountId,
        type: 'expense',
        categoryId: `cat_bills_${currentHouseholdId}`,
        amount: numAmount,
        frequency: 'monthly',
        nextRunDate: (() => {
          const next = new Date();
          const lastDayThisMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(Math.min(dueDay, lastDayThisMonth));
          if (next <= new Date()) {
            next.setMonth(next.getMonth() + 1);
            const lastDayNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
            next.setDate(Math.min(dueDay, lastDayNextMonth));
          }
          return next.getTime();
        })(),
        variableAmountFlag: isVariableAmount,
        note: `Recurring: ${name}`,
        endType: 'forever',
        householdId: currentHouseholdId
      });

      const billId = `bill_${Date.now()}`;
      await setDoc(doc(db, 'bills', billId), {
        id: billId,
        name: name.trim(),
        accountId,
        amount: numAmount,
        dueDay,
        dueType: 'monthly',
        status: 'upcoming',
        isVariableAmount: isVariableAmount,
        variableAmountFlag: isVariableAmount,
        recurringRuleId: ruleId,
        timesRecurred: 0,
        householdId: currentHouseholdId
      });
    } else {
      // Specific mode: one bill record with specificDates array
      const billId = `bill_${Date.now()}`;
      await setDoc(doc(db, 'bills', billId), {
        id: billId,
        name: name.trim(),
        accountId,
        amount: numAmount,
        dueDay: new Date(specificDates[0]).getDate(),
        dueType: 'specific',
        specificDates,
        status: 'upcoming',
        isVariableAmount: isVariableAmount,
        variableAmountFlag: isVariableAmount,
        timesRecurred: 0,
        householdId: currentHouseholdId
      });
    }

    // Reset
    onClose();
    setName('');
    setAmount('');
    setAccountId('');
    setIsVariableAmount(false);
    setDueType('monthly');
    setDueDay(0);
    setShowMonthlyCalendar(false);
    setSpecificDates([]);
    setShowSpecificCalendar(false);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add New Bill">
      <div className="space-y-5 max-h-[80vh] overflow-y-auto no-scrollbar pb-6 px-0.5">

        {/* ── Bill Info Section ── */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-4">
          {/* Bill Name */}
          <div>
            <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">Bill Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-zinc-900/80 border border-white/10 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 text-sm font-bold placeholder:text-zinc-600 placeholder:font-normal transition-all"
              placeholder="e.g. Electric Bill, Internet, Netflix"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-1.5 block">
              {isVariableAmount ? 'Estimated Base Amount (₱)' : 'Fixed Amount (₱)'}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-zinc-500 text-sm">₱</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-zinc-900/80 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-zinc-100 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 font-black text-base placeholder:text-zinc-600 placeholder:font-normal transition-all"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* ── Variable Amount Toggle Card ── */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 transition-all space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-zinc-100">Variable Bill Amount</span>
              <button
                type="button"
                onClick={() => setShowVariableInfo(!showVariableInfo)}
                className="inline-flex items-center justify-center text-zinc-400 hover:text-amber-400 p-1 rounded-full hover:bg-white/5 transition-colors"
                title="What is a variable bill?"
              >
                <HelpCircle size={15} />
              </button>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isVariableAmount}
              onClick={() => setIsVariableAmount(prev => !prev)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isVariableAmount ? 'bg-amber-500' : 'bg-zinc-800'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isVariableAmount ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Toggleable Info Helper */}
          {showVariableInfo && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-zinc-300 leading-relaxed animate-fadeIn">
              <p className="font-bold text-amber-400 mb-0.5">Variable Bill Verification</p>
              Turn this on for utility bills or credit cards with fluctuating monthly charges. When the due date arrives, you'll be prompted to verify and adjust the exact statement amount before finalizing payment.
            </div>
          )}
        </div>

        {/* ── Due Schedule Section ── */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-3.5">
          <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest block">Due Schedule</label>

          {/* Mode toggle */}
          <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => { setDueType('monthly'); setShowSpecificCalendar(false); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                dueType === 'monthly'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-white/10'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <RefreshCw size={12} />
              Monthly Recurring
            </button>
            <button
              type="button"
              onClick={() => { setDueType('specific'); setShowMonthlyCalendar(false); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                dueType === 'specific'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-white/10'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <CalendarDays size={12} />
              Custom Dates
            </button>
          </div>

          {/* ── MONTHLY MODE ── */}
          {dueType === 'monthly' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowMonthlyCalendar(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                  dueDay > 0
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20'
                    : 'border-white/5 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RefreshCw size={14} className={dueDay > 0 ? 'text-amber-400' : 'text-zinc-500'} />
                  {dueDay > 0
                    ? `Recurs every ${getOrdinal(dueDay)} of the month`
                    : 'Tap to pick recurring due day…'
                  }
                </div>
                <span className="text-[10px] text-zinc-500">{showMonthlyCalendar ? '▲' : '▼'}</span>
              </button>

              {/* Calendar dropdown */}
              {showMonthlyCalendar && (
                <div className="mt-1">
                  <MonthlyDayPicker
                    selectedDay={dueDay}
                    onChange={day => {
                      setDueDay(day);
                      setShowMonthlyCalendar(false);
                    }}
                  />
                </div>
              )}

              {dueDay > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-950/60 rounded-xl border border-white/5">
                  <RefreshCw size={12} className="text-amber-400 shrink-0" />
                  <p className="text-[11px] text-zinc-400">
                    This bill will recur on the <strong className="text-zinc-200">{getOrdinal(dueDay)}</strong> of every month.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── SPECIFIC MODE ── */}
          {dueType === 'specific' && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setShowSpecificCalendar(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                  specificDates.length > 0
                    ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20'
                    : 'border-white/5 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CalendarDays size={14} className={specificDates.length > 0 ? 'text-indigo-400' : 'text-zinc-500'} />
                  {specificDates.length > 0
                    ? `${specificDates.length} date${specificDates.length > 1 ? 's' : ''} scheduled`
                    : 'Tap to pick specific dates…'
                  }
                </div>
                <span className="text-[10px] text-zinc-500">{showSpecificCalendar ? '▲' : '▼'}</span>
              </button>

              {/* Calendar dropdown */}
              {showSpecificCalendar && (
                <div>
                  <SpecificDatePicker
                    selectedDates={specificDates}
                    onToggle={toggleSpecificDate}
                  />
                </div>
              )}

              {/* Selected date chips */}
              {specificDates.length > 0 && (
                <div className="border border-white/5 bg-zinc-950/60 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    <RefreshCw size={12} className="text-indigo-400" />
                    Recurs {specificDates.length}× total
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5">
                    {specificDates.map(ts => {
                      const d = new Date(ts);
                      const label = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                      return (
                        <div
                          key={ts}
                          className="flex items-center gap-1.5 bg-zinc-800 border border-white/10 text-zinc-200 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                        >
                          {label}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeSpecificDate(ts); }}
                            className="text-zinc-400 hover:text-rose-400 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Paying Account Section ── */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-2.5">
          <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest block">Default Paying Account</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {accounts?.map(acc => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setAccountId(acc.id)}
                className={`flex-shrink-0 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                  accountId === acc.id
                    ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                    : 'border-white/5 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {acc.name} <span className="text-[10px] opacity-60 ml-1">₱{acc.balance.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Primary CTA Button ── */}
        <button
          onClick={handleSave}
          disabled={!isValid()}
          className="w-full h-14 bg-zinc-100 hover:bg-white text-zinc-950 rounded-2xl font-black tracking-wide text-base disabled:opacity-30 disabled:active:scale-100 active:scale-[0.98] transition-all shadow-md mt-2"
        >
          Add Bill
        </button>
      </div>
    </BottomSheet>
  );
}
