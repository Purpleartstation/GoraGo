import { useState } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { query, where } from 'firebase/firestore';
import { collections } from '../db';
import type { Account } from '../db';
import { Landmark, Smartphone, Wallet, ChevronRight } from 'lucide-react';
import { useAppStore } from '../store';
import AccountDetailsSheet from '../components/AccountDetailsSheet';

export default function Accounts() {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const viewMode = useAppStore((state) => state.viewMode);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [allAccounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );

  const accounts = allAccounts && viewMode === 'mine' 
    ? allAccounts.filter(a => a.ownerId === currentUserId || a.ownerId === null)
    : allAccounts;

  const totalBalance = accounts?.reduce((sum, acc) => sum + acc.balance, 0) || 0;

  const getIcon = (type: string, _color: string) => {
    const props = { size: 24, className: "text-white" };
    switch (type) {
      case 'bank': return <Landmark {...props} />;
      case 'ewallet': return <Smartphone {...props} />;
      default: return <Wallet {...props} />;
    }
  };

  return (
    <div className="p-4 space-y-6 pb-24 h-full overflow-y-auto no-scrollbar">
      <header className="pt-1">
        <p className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.15em] mb-0.5">Overview</p>
        <h1 className="text-2xl font-black text-zinc-100 tracking-tight">Accounts</h1>
      </header>

      {/* Total Balance Summary */}
      <div className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 p-6 rounded-[2rem] shadow-[0_12px_40px_rgba(0,0,0,0.6)] relative overflow-hidden ring-1 ring-white/8 flex flex-col items-center justify-center">
        {/* Decorative blobs */}
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-white rounded-full opacity-[0.03] blur-3xl pointer-events-none" />
        <div className="absolute -left-6 -bottom-6 w-36 h-36 bg-zinc-400 rounded-full opacity-[0.05] blur-2xl pointer-events-none" />
        
        <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2 relative z-10">Total Across All Accounts</p>
        <p className="text-[2.75rem] font-black tracking-tight leading-none relative z-10 text-zinc-100 tabular-nums">
          <span className="text-2xl font-bold text-zinc-400 mr-1">₱</span>
          {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {/* Account List */}
      <div className="space-y-3">
        {accounts?.map((acc) => (
          <div 
            key={acc.id} 
            onClick={() => setSelectedAccountId(acc.id)}
            className="p-3.5 bg-zinc-900/60 rounded-2xl ring-1 ring-white/5 flex items-center gap-3 hover:bg-zinc-800/60 hover:ring-white/8 active:scale-[0.99] transition-all duration-150 cursor-pointer"
          >
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-inner shrink-0 ring-1 ring-white/10" 
                style={{ background: `linear-gradient(135deg, ${acc.color}25, ${acc.color}45)`, color: acc.color }}
              >
                {getIcon(acc.type, acc.color)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-100 text-sm leading-tight truncate">{acc.name}</p>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5 truncate">{acc.institution}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-black text-base text-zinc-100 tabular-nums">
                <span className="text-[10px] font-bold opacity-60 mr-0.5">₱</span>
                {acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <ChevronRight size={18} className="text-zinc-600" />
            </div>
          </div>
        ))}
      </div>

      {/* Detail Sheet */}
      <AccountDetailsSheet 
        accountId={selectedAccountId} 
        isOpen={selectedAccountId !== null} 
        onClose={() => setSelectedAccountId(null)} 
      />
    </div>
  );
}
