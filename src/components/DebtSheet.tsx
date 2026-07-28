import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../db';
import BottomSheet from './BottomSheet';
import { useAppStore } from '../store';

interface DebtSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DebtSheet({ isOpen, onClose }: DebtSheetProps) {
  const currentHouseholdId = useAppStore(state => state.currentHouseholdId);
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [remainingBalance, setRemainingBalance] = useState('');
  const [interestRate, setInterestRate] = useState('0');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [dueDay, setDueDay] = useState('15');
  const [payoffStrategy, setPayoffStrategy] = useState<'snowball' | 'avalanche'>('snowball');

  const handleSave = async () => {
    if (!name || !lender || !originalAmount || !remainingBalance || !installmentAmount) return;
    
    const origAmt = parseFloat(originalAmount);
    const remBal = parseFloat(remainingBalance);
    const rate = parseFloat(interestRate);
    const instAmt = parseFloat(installmentAmount);
    const due = parseInt(dueDay, 10);

    if (isNaN(origAmt) || isNaN(remBal) || isNaN(rate) || isNaN(instAmt) || isNaN(due)) return;

    const debtId = `debt_${Date.now()}`;
    await setDoc(doc(db, 'debts', debtId), {
      id: debtId,
      name,
      lender,
      originalAmount: origAmt,
      remainingBalance: remBal,
      interestRate: rate,
      installmentAmount: instAmt,
      dueDay: due,
      payoffStrategy,
      householdId: currentHouseholdId
    });

    onClose();
    setName('');
    setLender('');
    setOriginalAmount('');
    setRemainingBalance('');
    setInterestRate('0');
    setInstallmentAmount('');
    setDueDay('15');
    setPayoffStrategy('snowball');
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add New Loan">
      <div className="space-y-4 overflow-y-auto max-h-[70vh] pb-6 no-scrollbar">
        {/* Debt Name */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Loan Name</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="e.g. GCredit, Car Loan, Pag-IBIG Loan"
          />
        </div>

        {/* Lender */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Lender</label>
          <input 
            type="text" 
            value={lender}
            onChange={(e) => setLender(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="e.g. GCash, Home Credit, SSS"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Original Amount */}
          <div>
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Original Amount</label>
            <input 
              type="number" 
              value={originalAmount}
              onChange={(e) => setOriginalAmount(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold placeholder:text-zinc-600 placeholder:font-medium"
              placeholder="0"
            />
          </div>

          {/* Remaining Balance */}
          <div>
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Remaining Balance</label>
            <input 
              type="number" 
              value={remainingBalance}
              onChange={(e) => setRemainingBalance(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold placeholder:text-zinc-600 placeholder:font-medium"
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Interest Rate */}
          <div>
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Interest Rate (% yr)</label>
            <input 
              type="number" 
              step="any"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold placeholder:text-zinc-600 placeholder:font-medium"
              placeholder="0"
            />
          </div>

          {/* Installment / Min Payment */}
          <div>
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Monthly Payment</label>
            <input 
              type="number" 
              value={installmentAmount}
              onChange={(e) => setInstallmentAmount(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold placeholder:text-zinc-600 placeholder:font-medium"
              placeholder="0"
            />
          </div>
        </div>

        {/* Due Day & Payoff Strategy */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Due Day (1–28)</label>
            <input 
              type="number" 
              min="1"
              max="28"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold placeholder:text-zinc-600 placeholder:font-medium"
            />
          </div>

          <div>
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5 block">Strategy</label>
            <select
              value={payoffStrategy}
              onChange={(e) => setPayoffStrategy(e.target.value as 'snowball' | 'avalanche')}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold text-sm appearance-none"
            >
              <option value="snowball">Snowball</option>
              <option value="avalanche">Avalanche</option>
            </select>
          </div>
        </div>

        {/* Save Button */}
        <button 
          onClick={handleSave}
          disabled={!name || !lender || !originalAmount || !remainingBalance || !installmentAmount}
          className="w-full h-14 bg-zinc-100 text-zinc-950 rounded-2xl font-black tracking-wide text-lg disabled:opacity-30 disabled:active:scale-100 active:scale-[0.98] transition-all mt-4"
        >
          Add Loan
        </button>
      </div>
    </BottomSheet>
  );
}
