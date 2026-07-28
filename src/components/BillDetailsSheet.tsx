import { useState, useEffect, useRef } from 'react';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db, collections } from '../db';
import type { Bill, Account } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import { Trash2, RefreshCw, Edit2, CalendarDays, X, Sliders, HelpCircle } from 'lucide-react';
import { MonthlyDayPicker, SpecificDatePicker } from './CalendarPickers';

interface BillDetailsSheetProps {
  billId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

type EditableField = 'name' | 'amount' | 'dueDay' | null;

export default function BillDetailsSheet({ billId, isOpen, onClose }: BillDetailsSheetProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);

  const [editingField, setEditingField] = useState<EditableField>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Temporary values for inline editing
  const [tempName, setTempName] = useState('');
  const [tempAmount, setTempAmount] = useState('');

  // Selected Account for Payment State
  const [paymentAccountId, setPaymentAccountId] = useState('');

  // Variable amount state
  const [isVariableAmount, setIsVariableAmount] = useState(false);
  const [showVariableInfo, setShowVariableInfo] = useState(false);
  const [verifyAmount, setVerifyAmount] = useState('');

  // Due Schedule state (same as BillSheet)
  const [dueType, setDueType] = useState<'monthly' | 'specific'>('monthly');
  const [dueDay, setDueDay] = useState(0);
  const [showMonthlyCalendar, setShowMonthlyCalendar] = useState(false);
  const [specificDates, setSpecificDates] = useState<number[]>([]);
  const [showSpecificCalendar, setShowSpecificCalendar] = useState(false);

  // Refs for focusing inputs
  const nameInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const [bill] = useDocumentData<Bill>(
    billId ? doc(collections.bills, billId) : null
  );

  const [accounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );

  // Initialize values
  useEffect(() => {
    if (bill) {
      setTempName(bill.name);
      setTempAmount(bill.amount.toString());
      setPaymentAccountId(bill.accountId);
      setIsVariableAmount(Boolean(bill.isVariableAmount || bill.variableAmountFlag));
      setVerifyAmount(bill.amount ? bill.amount.toString() : '');
      
      // Load schedule fields
      setDueType(bill.dueType || 'monthly');
      setDueDay(bill.dueDay || 0);
      setSpecificDates(bill.specificDates || []);
    }
  }, [bill]);

  const handleToggleVariableAmount = async (flag: boolean) => {
    setIsVariableAmount(flag);
    if (!billId) return;
    await updateDoc(doc(db, 'bills', billId), {
      isVariableAmount: flag,
      variableAmountFlag: flag
    });
    if (bill?.recurringRuleId) {
      await updateDoc(doc(db, 'recurringRules', bill.recurringRuleId), {
        variableAmountFlag: flag
      });
    }
  };


  // Focus input when editing starts
  useEffect(() => {
    if (editingField === 'name') nameInputRef.current?.focus();
    if (editingField === 'amount') amountInputRef.current?.focus();
  }, [editingField]);

  const handleDelete = async () => {
    if (!billId || !bill) return;
    const confirmDelete = window.confirm(`Delete the bill "${bill.name}"?`);
    if (!confirmDelete) return;

    if (bill.recurringRuleId) {
      await deleteDoc(doc(db, 'recurringRules', bill.recurringRuleId));
    }
    await deleteDoc(doc(db, 'bills', billId));
    onClose();
  };


  const saveField = async (field: EditableField) => {
    if (!billId || !bill) return;

    if (field === 'name' && tempName.trim() !== '') {
      await updateDoc(doc(db, 'bills', billId), { name: tempName });
      if (bill.recurringRuleId) {
        await updateDoc(doc(db, 'recurringRules', bill.recurringRuleId), { note: `Recurring: ${tempName}` });
      }
    } else if (field === 'amount') {
      const amt = parseFloat(tempAmount);
      if (!isNaN(amt) && amt > 0) {
        await updateDoc(doc(db, 'bills', billId), { amount: amt });
        if (bill.recurringRuleId) {
          await updateDoc(doc(db, 'recurringRules', bill.recurringRuleId), { amount: amt });
        }
      } else {
        setTempAmount(bill.amount.toString());
      }
    }

    setEditingField(null);
  };

  const handleDueTypeChange = async (type: 'monthly' | 'specific') => {
    if (!billId) return;
    setDueType(type);
    await updateDoc(doc(db, 'bills', billId), { dueType: type });
  };

  const handleDueDayChange = async (day: number) => {
    if (!billId) return;
    setDueDay(day);
    await updateDoc(doc(db, 'bills', billId), { dueDay: day });
    setEditingField(null);
    
    if (bill?.recurringRuleId) {
      const next = new Date();
      const lastDayThisMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDayThisMonth));
      if (next <= new Date()) {
        next.setMonth(next.getMonth() + 1);
        const lastDayNextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(day, lastDayNextMonth));
      }
      await updateDoc(doc(db, 'recurringRules', bill.recurringRuleId), {
        nextRunDate: next.getTime()
      });
    }
  };


  const toggleSpecificDate = async (ts: number) => {
    if (!billId) return;
    let nextDates = [...specificDates];
    if (nextDates.includes(ts)) {
      nextDates = nextDates.filter(t => t !== ts);
    } else {
      nextDates = [...nextDates, ts].sort((a, b) => a - b);
    }
    setSpecificDates(nextDates);
    await updateDoc(doc(db, 'bills', billId), { 
      specificDates: nextDates,
      dueDay: nextDates.length > 0 ? new Date(nextDates[0]).getDate() : 0
    });
  };

  const removeSpecificDate = async (ts: number) => {
    if (!billId) return;
    const nextDates = specificDates.filter(t => t !== ts);
    setSpecificDates(nextDates);
    await updateDoc(doc(db, 'bills', billId), { 
      specificDates: nextDates,
      dueDay: nextDates.length > 0 ? new Date(nextDates[0]).getDate() : 0
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: EditableField) => {
    if (e.key === 'Enter') {
      saveField(field);
    } else if (e.key === 'Escape') {
      if (bill) {
        setTempName(bill.name);
        setTempAmount(bill.amount.toString());
      }
      setEditingField(null);
    }
  };

  const handlePay = async () => {
    if (!bill || !paymentAccountId) return;
    
    const accountSnap = await getDoc(doc(db, 'accounts', paymentAccountId));
    const account = accountSnap.data() as Account | undefined;
    if (!account) {
      alert('Selected account not found!');
      return;
    }

    const payAmount = isVariableAmount ? parseFloat(verifyAmount) : bill.amount;
    if (isNaN(payAmount) || payAmount <= 0) {
      alert('Please enter a valid bill amount to pay.');
      return;
    }

    if (account.balance < payAmount) {
      alert(`Insufficient funds in ${account.name} (Balance: ₱${account.balance.toLocaleString()}) to pay ₱${payAmount.toLocaleString()}!`);
      return;
    }

    const confirmPay = window.confirm(`Confirm payment of ₱${payAmount.toLocaleString()} to ${bill.name} using ${account.name}?`);
    if (!confirmPay) return;

    await updateDoc(doc(db, 'accounts', paymentAccountId), { balance: account.balance - payAmount });

    const txId = `tx_${Date.now()}`;
    await setDoc(doc(db, 'transactions', txId), {
      id: txId,
      accountId: paymentAccountId,
      categoryId: 'cat_bills',
      amount: payAmount,
      type: 'expense',
      note: `Paid ${bill.name} Bill`,
      date: Date.now()
    });

    await updateDoc(doc(db, 'bills', bill.id), {
      amount: payAmount,
      status: 'paid',
      lastPaidDate: Date.now(),
      timesRecurred: ((bill as any).timesRecurred || 0) + 1
    });

    if (bill.recurringRuleId) {
      await updateDoc(doc(db, 'recurringRules', bill.recurringRuleId), {
        amount: payAmount
      });
    }

    alert(`Successfully paid ₱${payAmount.toLocaleString()} using ${account.name}!`);
    onClose();
  };

  const handleAccountChange = async (accId: string) => {
    if (!billId) return;
    await updateDoc(doc(db, 'bills', billId), { accountId: accId });
    if (bill?.recurringRuleId) {
      await updateDoc(doc(db, 'recurringRules', bill.recurringRuleId), { accountId: accId });
    }
  };

  if (!bill) return null;

  const isPaid = bill.status === 'paid';
  const assignedAccount = accounts?.find(a => a.id === bill.accountId);

  // Generate ordinal text for due day (e.g. 1st, 2nd, 3rd, 4th)
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Bill Overview">
      <div className="space-y-5 max-h-[78vh] overflow-y-auto no-scrollbar pb-6">
        
        {/* Top Toggle Action Bar */}
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={() => setIsEditing(p => !p)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl border transition-all ${
              isEditing
                ? 'bg-zinc-800 text-zinc-100 border-zinc-700 shadow-sm'
                : 'bg-zinc-900/50 text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            <Edit2 size={12} />
            {isEditing ? 'Done Editing' : 'Edit Bill Settings'}
          </button>
        </div>

        {isEditing ? (
          /* ─── EDIT MODE ─── */
          <>
            {/* Bill Name Input */}
            <div>
              <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Bill Name</label>
              <input
                type="text"
                value={tempName}
                onChange={e => setTempName(e.target.value)}
                onBlur={() => saveField('name')}
                onKeyDown={e => handleKeyDown(e, 'name')}
                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 placeholder:text-zinc-600 placeholder:font-medium"
                placeholder="Bill name"
              />
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Amount (₱)</label>
              <input
                type="number"
                value={tempAmount}
                onChange={e => setTempAmount(e.target.value)}
                onBlur={() => saveField('amount')}
                onKeyDown={e => handleKeyDown(e, 'amount')}
                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 placeholder:text-zinc-600 placeholder:font-medium"
                placeholder="0.00"
              />
            </div>

            {/* Variable Bill Toggle in Edit Mode */}
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 transition-all space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <p className="text-xs font-bold text-zinc-100">Variable Bill Amount</p>
                  <button
                    type="button"
                    onClick={() => setShowVariableInfo(!showVariableInfo)}
                    className="inline-flex items-center justify-center text-zinc-400 hover:text-amber-400 p-0.5 rounded-full hover:bg-white/5 transition-colors"
                    title="What is a variable bill?"
                  >
                    <HelpCircle size={15} />
                  </button>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isVariableAmount}
                  onClick={() => handleToggleVariableAmount(!isVariableAmount)}
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

              {/* Toggleable Description */}
              {showVariableInfo && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-[11px] text-zinc-300 leading-snug animate-fadeIn">
                  <p className="font-semibold text-amber-400 mb-0.5">Variable Amount Verification</p>
                  Enable for bills with changing amounts (e.g., Meralco, Water, Credit Cards). You will be prompted to verify and adjust the exact statement amount before paying on the due date.
                </div>
              )}
            </div>

            {/* Due Schedule Section */}
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-4 space-y-3.5">
              <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Due Schedule</label>

              {/* Mode toggle */}
              <div className="flex bg-zinc-950 p-1.5 rounded-2xl ring-1 ring-white/5 mb-1">
                <button
                  type="button"
                  onClick={() => { handleDueTypeChange('monthly'); setShowSpecificCalendar(false); }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                    dueType === 'monthly'
                      ? 'bg-zinc-800 text-zinc-100 ring-1 ring-white/10 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <RefreshCw size={12} />
                  Monthly Recurring
                </button>
                <button
                  type="button"
                  onClick={() => { handleDueTypeChange('specific'); setShowMonthlyCalendar(false); }}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                    dueType === 'specific'
                      ? 'bg-zinc-800 text-zinc-100 ring-1 ring-white/10 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <CalendarDays size={12} />
                  Custom Dates
                </button>
              </div>

              {/* MONTHLY MODE */}
              {dueType === 'monthly' && (
                <div className="space-y-2">
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

                  {showMonthlyCalendar && (
                    <div className="mt-1 animate-in slide-in-from-top-1 duration-150">
                      <MonthlyDayPicker
                        selectedDay={dueDay}
                        onChange={handleDueDayChange}
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

              {/* SPECIFIC MODE */}
              {dueType === 'specific' && (
                <div className="space-y-3">
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

                  {showSpecificCalendar && (
                     <div className="animate-in slide-in-from-top-1 duration-150">
                       <SpecificDatePicker
                         selectedDates={specificDates}
                         onToggle={toggleSpecificDate}
                       />
                     </div>
                  )}

                  {specificDates.length > 0 && (
                     <div className="border border-white/5 bg-zinc-900/40 rounded-xl p-3.5 space-y-3">
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

            {/* Default Paying Account (in edit mode) */}
            <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 space-y-3">
              <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest pl-0.5">Default Paying Account</span>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {accounts?.map(acc => (
                  <button
                    key={acc.id}
                    onClick={() => handleAccountChange(acc.id)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      bill.accountId === acc.id 
                        ? 'border-zinc-500 bg-zinc-800 text-zinc-100 ring-1 ring-white/10' 
                        : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {acc.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete Button */}
            <button
              onClick={handleDelete}
              className="w-full py-3.5 border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98] mt-4"
            >
              <Trash2 size={16} />
              Delete Bill
            </button>
          </>
        ) : (
          /* ─── PAY & VIEW MODE (DEFAULT) ─── */
          <>
            {/* Bill Summary Card */}
            <div className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 text-white p-6 rounded-3xl shadow-lg ring-1 ring-white/10 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] text-zinc-400 font-black uppercase tracking-widest">Bill Payment</p>
                  <h3 className="text-2xl font-black mt-1 tracking-tight text-zinc-100">{bill.name}</h3>
                </div>
                {isVariableAmount && (
                  <span className="shrink-0 flex items-center gap-1 text-[9px] font-extrabold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                    <Sliders size={11} /> Variable
                  </span>
                )}
              </div>
              <div>
                <p className="text-[11px] text-zinc-400 font-black uppercase tracking-widest">
                  {isVariableAmount ? 'Estimated / Statement Amount' : 'Amount Due'}
                </p>
                <p className="text-3xl font-black tracking-tight mt-1 text-zinc-100 tabular-nums">
                  <span className="opacity-50 mr-1 text-2xl font-bold">₱</span>
                  {(isVariableAmount && verifyAmount ? (parseFloat(verifyAmount) || bill.amount) : bill.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Status and Default Account Card */}
            <div className="bg-zinc-900/60 rounded-2xl p-4 ring-1 ring-white/5 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Default Paying Account</span>
                <span className="font-bold text-zinc-200">{assignedAccount?.name || 'None'}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-3 border-t border-white/5">
                <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Status</span>
                <span className={`font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                  isPaid ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30'
                }`}>
                  {isPaid ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            </div>

            {/* Schedule Summary Box */}
            <div className="bg-zinc-900/60 rounded-2xl p-4 ring-1 ring-white/5 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-zinc-800 text-amber-400 ring-1 ring-white/5">
                {dueType === 'monthly' ? <RefreshCw size={18} /> : <CalendarDays size={18} />}
              </div>
              <div>
                <h4 className="font-black text-[11px] text-zinc-500 uppercase tracking-widest">Due Schedule</h4>
                <p className="text-sm font-bold text-zinc-200 mt-0.5">
                  {dueType === 'monthly'
                    ? `Monthly · Due on the ${getOrdinal(dueDay)}`
                    : `Custom Schedule · ${specificDates.length} dates scheduled`
                  }
                </p>
              </div>
            </div>

            {/* Interactive Payment Section (Choose paying account this month) */}
            {!isPaid && (
              <div className="space-y-4 p-4 bg-zinc-900/60 border border-white/5 rounded-2xl">
                {isVariableAmount && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center gap-2 text-amber-400">
                      <Sliders size={14} />
                      <p className="text-xs font-black uppercase tracking-wider">Verify & Adjust Final Statement Amount</p>
                    </div>
                    <p className="text-[11px] text-zinc-300 leading-snug">
                      This bill is marked as variable. Enter or adjust the actual statement amount due for this cycle before paying:
                    </p>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-amber-400 text-sm">₱</span>
                      <input
                        type="number"
                        value={verifyAmount}
                        onChange={e => setVerifyAmount(e.target.value)}
                        className="w-full bg-zinc-950 border border-amber-500/40 rounded-xl pl-8 pr-4 py-2.5 text-zinc-100 font-black text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest pl-0.5 mb-2">
                    Select Paying Account (This Month)
                  </h4>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {accounts?.map(acc => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setPaymentAccountId(acc.id)}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                          paymentAccountId === acc.id 
                            ? 'border-zinc-500 bg-zinc-800 text-zinc-100 ring-1 ring-white/10' 
                            : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {acc.name} (₱{acc.balance.toLocaleString()})
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handlePay}
                  className="w-full h-14 bg-zinc-100 hover:bg-white text-zinc-950 rounded-2xl font-black tracking-wide text-base shadow-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-1.5"
                >
                  Pay {isVariableAmount ? `₱${(parseFloat(verifyAmount) || 0).toLocaleString()}` : `₱${bill.amount.toLocaleString()}`} with Selected Account
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
