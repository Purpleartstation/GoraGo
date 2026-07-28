import { useState } from 'react';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import TransactionSheet from './TransactionSheet';
import TransferSheet from './TransferSheet';
import AccountSheet from './AccountSheet';
import BillSheet from './BillSheet';
import DebtSheet from './DebtSheet';
import { ArrowDownRight, ArrowUpRight, ArrowRightLeft, Wallet, FileText, CreditCard } from 'lucide-react';
import type { TransactionType } from '../db';

type SheetType = 'expense' | 'income' | 'transfer' | 'account' | 'bill' | 'debt';

export default function AddMenu() {
  const isOpen = useAppStore((state) => state.isAddMenuOpen);
  const toggleAddMenu = useAppStore((state) => state.toggleAddMenu);
  
  const [activeSheet, setActiveSheet] = useState<SheetType | null>(null);

  const actions = [
    { id: 'expense', label: 'Expense', icon: ArrowUpRight, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
    { id: 'income', label: 'Income', icon: ArrowDownRight, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
    { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
    { id: 'account', label: 'Account', icon: Wallet, color: 'text-fuchsia-600 dark:text-fuchsia-400', bg: 'bg-fuchsia-500/10' },
    { id: 'bill', label: 'Bill', icon: FileText, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
    { id: 'debt', label: 'Loan', icon: CreditCard, color: 'text-fuchsia-500 dark:text-fuchsia-300', bg: 'bg-fuchsia-500/10' },
  ];

  const handleAction = (id: string) => {
    setActiveSheet(id as SheetType);
    toggleAddMenu(false);
  };

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={() => toggleAddMenu(false)} title="Add New">
        <div className="grid grid-cols-3 gap-3">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              className="flex flex-col items-center justify-center gap-2.5 p-4 bg-black/5 dark:bg-zinc-900/60 rounded-2xl border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-zinc-800/60 active:scale-95 transition-all shadow-sm"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${action.bg} ${action.color}`}>
                <action.icon size={22} strokeWidth={2.5} />
              </div>
              <span className="text-xs font-bold tracking-wide text-zinc-800 dark:text-zinc-200">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>
      
      {/* Sheets */}
      <TransactionSheet 
        isOpen={activeSheet === 'expense' || activeSheet === 'income'} 
        onClose={() => setActiveSheet(null)} 
        type={(activeSheet === 'income' ? 'income' : 'expense') as TransactionType} 
      />

      <TransferSheet
        isOpen={activeSheet === 'transfer'}
        onClose={() => setActiveSheet(null)}
      />

      <AccountSheet
        isOpen={activeSheet === 'account'}
        onClose={() => setActiveSheet(null)}
      />

      <BillSheet
        isOpen={activeSheet === 'bill'}
        onClose={() => setActiveSheet(null)}
      />

      <DebtSheet
        isOpen={activeSheet === 'debt'}
        onClose={() => setActiveSheet(null)}
      />
    </>
  );
}
