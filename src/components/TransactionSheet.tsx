import { useState } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { query, where, getDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, collections } from '../db';
import type { TransactionType, Account, Category } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';

interface TransactionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: TransactionType;
}

export default function TransactionSheet({ isOpen, onClose, type }: TransactionSheetProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [customCategoryName, setCustomCategoryName] = useState('');

  const [accounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );
  const [categories] = useCollectionData<Category>(
    currentHouseholdId ? query(collections.categories, where('householdId', '==', currentHouseholdId), where('type', '==', type)) : null
  );

  const handleKeypad = (num: string) => {
    if (num === 'backspace') setAmount(prev => prev.slice(0, -1));
    else if (num === '.' && amount.includes('.')) return;
    else setAmount(prev => prev + num);
  };

  const handleSave = async () => {
    if (!amount || !accountId || !currentHouseholdId) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    let finalCategoryId = categoryId;

    if (customCategoryName.trim() !== '') {
      finalCategoryId = `cat_${Date.now()}`;
      await setDoc(doc(db, 'categories', finalCategoryId), {
        id: finalCategoryId,
        name: customCategoryName.trim(),
        icon: 'tag',
        type: type,
        color: type === 'income' ? '#10B981' : '#F59E0B',
        householdId: currentHouseholdId
      });
    }

    const txId = `tx_${Date.now()}`;
    await setDoc(doc(db, 'transactions', txId), {
      id: txId,
      accountId,
      categoryId: finalCategoryId,
      amount: numAmount,
      type,
      note,
      date: Date.now(),
      householdId: currentHouseholdId
    });

    // Update account balance
    const accountSnap = await getDoc(doc(db, 'accounts', accountId));
    const account = accountSnap.data() as Account | undefined;
    if (account) {
      const newBalance = type === 'income' ? account.balance + numAmount : account.balance - numAmount;
      await updateDoc(doc(db, 'accounts', accountId), { balance: newBalance });
    }

    onClose();
    setAmount('');
    setNote('');
    setAccountId('');
    setCategoryId('');
    setCustomCategoryName('');
  };

  const isIncome = type === 'income';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Add ${isIncome ? 'Income' : 'Expense'}`}>
      <div className="space-y-6">
        {/* Amount Input */}
        <div className="text-center">
          <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2">Amount</p>
          <div className={`text-5xl font-black tracking-tight tabular-nums ${isIncome ? 'text-emerald-400' : 'text-zinc-100'}`}>
            <span className="text-3xl mr-1 opacity-70">₱</span>
            {amount || '0'}
          </div>
        </div>

        {/* Account Selection */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Account</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {accounts?.map(acc => (
              <button
                key={acc.id}
                onClick={() => setAccountId(acc.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  accountId === acc.id 
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100 ring-1 ring-white/10' 
                    : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Category Selection */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Category</label>
          {categories && categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setCategoryId(cat.id); setCustomCategoryName(''); }}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                    categoryId === cat.id && !customCategoryName
                      ? 'border-zinc-500 bg-zinc-800 text-zinc-100 ring-1 ring-white/10 font-bold' 
                      : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300 font-medium'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
          <input 
            type="text" 
            value={customCategoryName}
            onChange={(e) => { setCustomCategoryName(e.target.value); setCategoryId(''); }}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="Or type a new category (e.g. Jek Daily Expences)"
          />
        </div>

        {/* Note */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Note (Optional)</label>
          <input 
            type="text" 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="What was this for?"
          />
        </div>

        {/* Custom Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, 'backspace'].map((key) => (
            <button
              key={key}
              onClick={() => handleKeypad(key.toString())}
              className="h-14 rounded-2xl bg-zinc-900/50 text-zinc-100 text-xl font-bold flex items-center justify-center active:bg-zinc-800 transition-colors ring-1 ring-white/5"
            >
              {key === 'backspace' ? '⌫' : key}
            </button>
          ))}
        </div>

        {/* Save Button */}
        <button 
          onClick={handleSave}
          disabled={!amount || !accountId}
          className="w-full h-14 bg-zinc-100 text-zinc-950 rounded-2xl font-black tracking-wide text-lg disabled:opacity-30 disabled:active:scale-100 active:scale-[0.98] transition-all"
        >
          Save
        </button>
      </div>
    </BottomSheet>
  );
}
