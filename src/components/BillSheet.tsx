import { useState } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { query, where, setDoc, doc } from 'firebase/firestore';
import { db, collections } from '../db';
import type { Account } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import { X, RefreshCw, CalendarDays } from 'lucide-react';
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
          next.setDate(dueDay);
          if (next <= new Date()) next.setMonth(next.getMonth() + 1);
          return next.getTime();
        })(),
        variableAmountFlag: false,
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
        timesRecurred: 0,
        householdId: currentHouseholdId
      });
    }

    // Reset
    onClose();
    setName('');
    setAmount('');
    setAccountId('');
    setDueType('monthly');
    setDueDay(0);
    setShowMonthlyCalendar(false);
    setSpecificDates([]);
    setShowSpecificCalendar(false);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add New Bill">
      <div className="space-y-5 max-h-[80vh] overflow-y-auto no-scrollbar pb-6">

        {/* Bill Name */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Bill Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="e.g. PLDT Wifi, Meralco, Netflix"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Amount (₱)</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="0.00"
          />
        </div>

        {/* ── Due Schedule ── */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2.5 block">Due Schedule</label>

          {/* Mode toggle */}
          <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl ring-1 ring-white/5 mb-3">
            <button
              type="button"
              onClick={() => { setDueType('monthly'); setShowSpecificCalendar(false); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                dueType === 'monthly'
                  ? 'bg-zinc-800 shadow-md text-zinc-100 ring-1 ring-white/10'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <RefreshCw size={12} />
              Monthly Recurring
            </button>
            <button
              type="button"
              onClick={() => { setDueType('specific'); setShowMonthlyCalendar(false); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                dueType === 'specific'
                  ? 'bg-zinc-800 shadow-md text-zinc-100 ring-1 ring-white/10'
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
              {/* Trigger pill */}
              <button
                type="button"
                onClick={() => setShowMonthlyCalendar(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-bold transition-all ${
                  dueDay > 0
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30'
                    : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <RefreshCw size={15} className={dueDay > 0 ? 'text-amber-500' : ''} />
                  {dueDay > 0
                    ? `Recurs every ${getOrdinal(dueDay)} of the month`
                    : 'Tap to pick recurring due day…'
                  }
                </div>
                <span className="text-xs opacity-60">{showMonthlyCalendar ? '▲' : '▼'}</span>
              </button>

              {/* Calendar dropdown */}
              {showMonthlyCalendar && (
                <div className="mt-1 animate-in slide-in-from-top-1 duration-150">
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
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/40 rounded-xl border border-white/5">
                  <RefreshCw size={13} className="text-amber-500 flex-shrink-0" />
                  <p className="text-[11px] text-zinc-400 font-medium">
                    This bill will automatically recur on the <strong className="text-zinc-200">{getOrdinal(dueDay)}</strong> of every month.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── SPECIFIC MODE ── */}
          {dueType === 'specific' && (
            <div className="space-y-3">
              {/* Trigger */}
              <button
                type="button"
                onClick={() => setShowSpecificCalendar(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border text-sm font-bold transition-all ${
                  specificDates.length > 0
                    ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/30'
                    : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CalendarDays size={15} className={specificDates.length > 0 ? 'text-indigo-500' : ''} />
                  {specificDates.length > 0
                    ? `${specificDates.length} date${specificDates.length > 1 ? 's' : ''} scheduled — tap to add more`
                    : 'Tap to pick specific dates…'
                  }
                </div>
                <span className="text-xs opacity-60">{showSpecificCalendar ? '▲' : '▼'}</span>
              </button>

              {/* Calendar dropdown */}
              {showSpecificCalendar && (
                <div className="animate-in slide-in-from-top-1 duration-150">
                  <SpecificDatePicker
                    selectedDates={specificDates}
                    onToggle={toggleSpecificDate}
                  />
                </div>
              )}

              {/* Selected date chips + recurrence count */}
              {specificDates.length > 0 && (
                <div className="border border-white/5 bg-zinc-900/40 rounded-xl p-3.5 space-y-3">
                  {/* Count header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 bg-zinc-800 text-indigo-400 rounded-lg">
                        <RefreshCw size={13} />
                      </div>
                      <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                        Recurs {specificDates.length}× total
                      </span>
                    </div>
                  </div>

                  {/* Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
                    {specificDates.map(ts => {
                      const d = new Date(ts);
                      const label = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                      return (
                        <div
                          key={ts}
                          className="flex items-center gap-1.5 bg-zinc-800 border border-white/5 text-zinc-300 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-sm"
                        >
                          {label}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeSpecificDate(ts); }}
                            className="text-zinc-500 hover:text-rose-400 transition-colors"
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

        {/* Paying Account */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Paying Account</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {accounts?.map(acc => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setAccountId(acc.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  accountId === acc.id
                    ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                    : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!isValid()}
          className="w-full h-14 bg-zinc-100 text-zinc-950 rounded-2xl font-black tracking-wide text-lg disabled:opacity-30 disabled:active:scale-100 active:scale-[0.98] transition-all mt-4"
        >
          Add Bill
        </button>
      </div>
    </BottomSheet>
  );
}
