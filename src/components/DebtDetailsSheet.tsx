import { useState, useMemo } from 'react';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, getDoc, updateDoc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db, collections } from '../db';
import type { Debt, Account, Transaction } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import { Trash2, TrendingDown, Award } from 'lucide-react';

interface DebtDetailsSheetProps {
  debtId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function DebtDetailsSheet({ debtId, isOpen, onClose }: DebtDetailsSheetProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const [payAmount, setPayAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const [debt] = useDocumentData<Debt>(
    debtId ? doc(collections.debts, debtId) : null
  );

  const [accounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );

  const [allTransactions] = useCollectionData<Transaction>(collections.transactions);
  
  // Filter transactions that mention this debt in their note
  const payments = useMemo(() => {
    if (!debt || !allTransactions) return [];
    return allTransactions
      .filter(tx => tx.note.toLowerCase().includes(debt.name.toLowerCase()))
      .sort((a, b) => b.date - a.date);
  }, [debt, allTransactions]);

  const handleDelete = async () => {
    if (!debtId || !debt) return;
    const confirmDelete = window.confirm(`Delete the debt "${debt.name}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    await deleteDoc(doc(db, 'debts', debtId));
    onClose();
  };

  const handleCustomPayment = async () => {
    if (!debt || !payAmount || !selectedAccountId) return;
    const amountToPay = parseFloat(payAmount);
    if (isNaN(amountToPay) || amountToPay <= 0 || amountToPay > debt.remainingBalance) {
      alert('Please enter a valid payment amount.');
      return;
    }

    const accountSnap = await getDoc(doc(db, 'accounts', selectedAccountId));
    const account = accountSnap.data() as Account | undefined;
    if (!account || account.balance < amountToPay) {
      alert('Insufficient funds in the selected account.');
      return;
    }

    // Deduct from account
    await updateDoc(doc(db, 'accounts', selectedAccountId), { balance: account.balance - amountToPay });

    // Update remaining balance
    const newBalance = Math.max(0, debt.remainingBalance - amountToPay);
    await updateDoc(doc(db, 'debts', debt.id), { remainingBalance: newBalance });

    // Log transaction
    const txId = `tx_${Date.now()}`;
    await setDoc(doc(db, 'transactions', txId), {
      id: txId,
      accountId: selectedAccountId,
      amount: amountToPay,
      type: 'expense',
      note: `Loan Payment: ${debt.name}`,
      date: Date.now()
    });

    alert(`Successfully paid ₱${amountToPay.toLocaleString()} towards ${debt.name}!`);
    setPayAmount('');
    if (newBalance === 0) onClose();
  };

  if (!debt) return null;

  const progress = ((debt.originalAmount - debt.remainingBalance) / debt.originalAmount) * 100;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Loan Overview">
      <div className="space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar pb-6">
        {/* Debt Header Card */}
        <div className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 text-white p-6 rounded-3xl shadow-lg ring-1 ring-white/10 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[11px] text-zinc-400 font-black uppercase tracking-widest">Owed to {debt.lender}</p>
              <h3 className="text-2xl font-black mt-1 tracking-tight text-zinc-100">{debt.name}</h3>
            </div>
            <div className="bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown size={14} />
              {debt.interestRate ? `${debt.interestRate}% Interest` : 'Interest-free'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
            <div>
              <p className="text-[11px] text-zinc-400 font-black uppercase tracking-widest">Remaining Balance</p>
              <p className="text-2xl font-black tabular-nums tracking-tight mt-1">
                <span className="opacity-50 mr-1 text-xl">₱</span>
                {debt.remainingBalance.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-zinc-400 font-black uppercase tracking-widest">Original Loan</p>
              <p className="text-2xl font-black text-zinc-500 tabular-nums tracking-tight mt-1">
                <span className="opacity-50 mr-1 text-xl">₱</span>
                {debt.originalAmount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden ring-1 ring-white/5">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[11px] font-black text-zinc-500 text-right">{progress.toFixed(0)}% paid off</p>
          </div>
        </div>

        {/* Strategy Advice */}
        <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl flex gap-3 items-start">
          <div className="p-2.5 bg-zinc-800 text-indigo-400 rounded-xl ring-1 ring-white/5">
            <Award size={20} />
          </div>
          <div>
            <h4 className="font-black text-[11px] text-zinc-500 uppercase tracking-widest">
              Strategy: {debt.payoffStrategy === 'snowball' ? 'Loan Snowball' : 'Loan Avalanche'}
            </h4>
            <p className="text-[13px] text-zinc-300 font-bold mt-1.5 leading-relaxed">
              {debt.payoffStrategy === 'snowball' 
                ? 'Pay off smallest balances first to gain motivational momentum and quick psychological wins!' 
                : 'Prioritize paying off high-interest balances first to minimize overall lifetime interest cost!'}
            </p>
          </div>
        </div>

        {/* Payment Form */}
        {debt.remainingBalance > 0 && (
          <div className="space-y-4 p-4 bg-zinc-900/60 rounded-2xl border border-white/5">
            <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest pl-1">
              Make a Payment
            </h4>
            
            {/* Account Selector */}
            <div>
              <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block pl-1">Select Account</label>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {accounts?.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      selectedAccountId === acc.id 
                        ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30' 
                        : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {acc.name} (₱{acc.balance.toLocaleString()})
                  </button>
                ))}
              </div>
            </div>

            {/* Input & Pay Button */}
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount to pay"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="flex-1 bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3 text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600 placeholder:text-zinc-600 placeholder:font-medium"
              />
              <button
                onClick={handleCustomPayment}
                disabled={!payAmount || !selectedAccountId}
                className="px-6 bg-zinc-100 hover:bg-white disabled:opacity-30 text-zinc-950 font-black text-sm rounded-xl transition-all shadow-sm active:scale-[0.98]"
              >
                Pay
              </button>
            </div>
          </div>
        )}

        {/* Payment History */}
        {payments && payments.length > 0 && (
          <div>
            <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 pl-1">
              Payment History
            </h4>
            <div className="divide-y divide-white/5 bg-zinc-900/60 rounded-2xl border border-white/5">
              {payments.map(tx => (
                <div key={tx.id} className="p-4 flex justify-between items-center text-sm">
                  <div>
                    <p className="font-bold text-zinc-300">Payment</p>
                    <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                  <p className="font-black text-indigo-400">-₱ {tx.amount.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="w-full py-3.5 border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98] mt-4"
        >
          <Trash2 size={16} />
          Delete Loan
        </button>
      </div>
    </BottomSheet>
  );
}
