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
    { id: 'expense', label: 'Expense', icon: ArrowUpRight, color: 'text-rose-400', bg: 'bg-rose-500/10' },
    { id: 'income', label: 'Income', icon: ArrowDownRight, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { id: 'account', label: 'Account', icon: Wallet, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { id: 'bill', label: 'Bill', icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { id: 'debt', label: 'Loan', icon: CreditCard, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  ];

  const handleAction = (id: string) => {
    setActiveSheet(id as SheetType);
    toggleAddMenu(false);
  };

  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={() => toggleAddMenu(false)} title="Add New">
        <div className="grid grid-cols-3 gap-4">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              className="flex flex-col items-center justify-center gap-3 p-4 bg-zinc-900/50 rounded-2xl ring-1 ring-white/5 hover:bg-zinc-800/60 active:scale-95 transition-all"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${action.bg} ${action.color}`}>
                <action.icon size={24} strokeWidth={2.5} />
              </div>
              <span className="text-xs font-bold tracking-wide text-zinc-300">
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
