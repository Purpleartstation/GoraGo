import { useState } from 'react';
import { query, where } from 'firebase/firestore';
import { collections, useSafeCollectionData } from '../db';
import type { Account } from '../db';
import { Landmark, Smartphone, Wallet, ChevronRight, Sun, Moon } from 'lucide-react';
import { useAppStore } from '../store';
import AccountDetailsSheet from '../components/AccountDetailsSheet';
import HelpTooltip from '../components/HelpTooltip';

export default function Accounts() {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const viewMode = useAppStore((state) => state.viewMode);
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const [allAccounts] = useSafeCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null,
    'accounts'
  );

  const accounts = allAccounts && viewMode === 'mine' 
    ? allAccounts.filter(a => a.ownerId === currentUserId || a.ownerId === null)
    : allAccounts;

  const totalBalance = accounts?.reduce((sum, acc) => sum + acc.balance, 0) || 0;

  const handleAccountTap = (acc: Account) => {
    // We will assume emergencyFundPin check is added next.
    setSelectedAccountId(acc.id);
  };

  const getIcon = (type: string, _color: string) => {
    const props = { size: 22, className: "text-white" };
    switch (type) {
      case 'bank': return <Landmark {...props} />;
      case 'ewallet': return <Smartphone {...props} />;
      default: return <Wallet {...props} />;
    }
  };

  return (
    <div className="p-4 space-y-6">
      <header className="pt-1 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em] mb-0.5">Overview</p>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Accounts</h1>
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          className="px-3 py-2 rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-white/40 dark:border-white/10 shadow-md backdrop-blur-xl text-zinc-800 dark:text-zinc-100 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          title={`Switch to ${themeMode === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {themeMode === 'dark' ? (
            <>
              <Sun size={16} className="text-amber-400" />
              <span className="text-xs font-black">Light</span>
            </>
          ) : (
            <>
              <Moon size={16} className="text-purple-600" />
              <span className="text-xs font-black">Dark</span>
            </>
          )}
        </button>
      </header>

      {/* Total Balance Summary Glass Card */}
      <div className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border border-white/40 dark:border-white/10 text-zinc-800 dark:text-zinc-100 p-6 rounded-3xl shadow-lg dark:shadow-[0_15px_35px_rgba(0,0,0,0.5)] relative flex flex-col items-center justify-center transition-colors duration-300">
        {/* Decorative glowing gradient blur */}
        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
          <div className="absolute -right-10 -top-10 w-44 h-44 bg-purple-500/20 dark:bg-purple-500/15 rounded-full blur-2xl" />
          <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-fuchsia-500/20 dark:bg-fuchsia-500/15 rounded-full blur-2xl" />
        </div>
        
        <div className="flex items-center gap-1 mb-2 relative z-10">
          <span className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">Total Across Accounts</span>
          <HelpTooltip
            title="Total Accounts"
            text="Combined liquid assets across connected checking, savings, e-wallets, and cash accounts."
          />
        </div>

        <p className="text-[2.65rem] font-black tracking-tight leading-none relative z-10 text-zinc-900 dark:text-zinc-100 tabular-nums">
          <span className="text-2xl font-bold text-purple-600 dark:text-fuchsia-400 mr-1">₱</span>
          {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
      </div>

      {/* Account List Header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center">
          <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Connected Accounts</span>
          <HelpTooltip
            title="Liquid Accounts & Safety Net"
            text="Individual checking, e-wallet (GCash, Maya), bank savings, and protected Safety Net accounts. Tap any account to view transaction histories or deposit/withdraw."
          />
        </div>
        <span className="text-xs font-black text-purple-600 dark:text-fuchsia-400">{accounts?.length || 0} Total</span>
      </div>

      {/* Account List Glass Cards */}
      <div className="space-y-3">
        {accounts?.map((acc) => (
          <div 
            key={acc.id} 
            onClick={() => handleAccountTap(acc)}
            className="p-4 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl rounded-3xl border border-white/40 dark:border-white/10 shadow-lg flex items-center gap-3 hover:bg-white/80 dark:hover:bg-white/5 active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div 
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border border-black/10 dark:border-white/10" 
                style={{ background: `linear-gradient(135deg, ${acc.color}30, ${acc.color}60)`, color: acc.color }}
              >
                {getIcon(acc.type, acc.color)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-tight truncate">{acc.name}</p>
                  {(acc.isSystemDefault || acc.id === 'acc_system_ef') && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
                      Safety Net
                      <HelpTooltip
                        title="Protected Reserve"
                        text="This account is designated as your Emergency Safety Net. Balance is protected and excluded from daily spendable totals."
                        icon="sparkles"
                      />
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider mt-0.5 truncate">{acc.institution}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-black text-base text-zinc-900 dark:text-zinc-100 tabular-nums">
                <span className="text-[10px] font-bold text-purple-600 dark:text-fuchsia-400 mr-0.5">₱</span>
                {acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <ChevronRight size={18} className="text-zinc-400 dark:text-zinc-500" />
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

