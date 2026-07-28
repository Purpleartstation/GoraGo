import { useState } from 'react';
import { useCollectionData, useDocumentData } from 'react-firebase-hooks/firestore';
import { doc, query, where, orderBy, limit } from 'firebase/firestore';
import { collections } from '../db';
import type { User, Account, Bill, Transaction, Category } from '../db';
import { useAppStore } from '../store';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Link } from 'react-router-dom';
import SettingsSheet from '../components/SettingsSheet';
import TransactionDetailsSheet from '../components/TransactionDetailsSheet';
import { ArrowRightLeft } from 'lucide-react';

export default function Home() {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const viewMode = useAppStore((state) => state.viewMode);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  // Safely skip queries if user is not loaded
  const [user] = useDocumentData<User>(
    currentUserId ? doc(collections.users, currentUserId) : null
  );

  const [allAccounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );
  
  const accounts = allAccounts && viewMode === 'mine' 
    ? allAccounts.filter(a => a.ownerId === currentUserId || a.ownerId === null)
    : allAccounts;

  const [bills] = useCollectionData<Bill>(
    currentHouseholdId ? query(collections.bills, where('householdId', '==', currentHouseholdId), where('status', 'in', ['upcoming', 'due-soon', 'overdue'])) : null
  );

  const [allTransactions] = useCollectionData<Transaction>(
    currentHouseholdId ? query(collections.transactions, where('householdId', '==', currentHouseholdId), orderBy('date', 'desc'), limit(15)) : null
  );
  const transactions = allTransactions?.filter(tx => !tx.id.endsWith('_in')).slice(0, 5);

  const [categories] = useCollectionData<Category>(
    currentHouseholdId ? query(collections.categories, where('householdId', '==', currentHouseholdId)) : null
  );
  const getCategory = (id?: string) => categories?.find(c => c.id === id);
  const getAccount = (id: string) => accounts?.find(a => a.id === id);

  const totalBalance = accounts?.reduce((sum, acc) => sum + acc.balance, 0) || 0;

  return (
    <div className="space-y-6 pb-4">

      {/* ── Header ── */}
      <div className="px-4 pt-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Welcome back</p>
          <h1 className="text-2xl font-black text-zinc-100 tracking-tight">{user?.name || 'User'}</h1>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="w-11 h-11 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-100 font-black text-lg ring-1 ring-white/10 shadow-inner hover:bg-zinc-700 active:scale-95 transition-all"
        >
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </button>
      </div>

      {/* ── Balance Card ── */}
      <div className="px-4">
        <div className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 text-white p-6 rounded-[2rem] shadow-[0_12px_40px_rgba(0,0,0,0.6)] relative overflow-hidden ring-1 ring-white/8">
          {/* Decorative blobs */}
          <div className="absolute -right-8 -top-8 w-48 h-48 bg-white rounded-full opacity-[0.03] blur-3xl pointer-events-none" />
          <div className="absolute -left-6 -bottom-6 w-36 h-36 bg-zinc-400 rounded-full opacity-[0.05] blur-2xl pointer-events-none" />

          <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-3 relative z-10">Total Balance</p>
          <p className="text-[2.75rem] font-black tracking-tight leading-none relative z-10 text-zinc-100 tabular-nums">
            <span className="text-2xl font-bold text-zinc-400 mr-1">₱</span>
            {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>

          {/* Accounts row */}
          {accounts && accounts.length > 0 && (
            <div className="flex gap-2 mt-5 relative z-10 overflow-x-auto no-scrollbar">
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  className="flex-shrink-0 flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 ring-1 ring-white/8"
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 leading-none mb-0.5 truncate max-w-[70px]">{acc.name}</p>
                    <p className="text-xs font-black text-zinc-200 tabular-nums whitespace-nowrap">
                      ₱{acc.balance.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Coming Up (Bills) ── */}
      {bills && bills.length > 0 && (
        <div>
          <div className="px-4 flex items-center justify-between mb-3">
            <h2 className="text-base font-black text-zinc-100 tracking-tight">Coming Up</h2>
            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-wider">{bills.length} bill{bills.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 snap-x snap-mandatory">
            {bills.map((bill) => {
              const due = new Date();
              due.setDate(bill.dueDay);
              if (isPast(due) && due.getDate() !== new Date().getDate()) {
                due.setMonth(due.getMonth() + 1);
              }
              const daysText = formatDistanceToNow(due, { addSuffix: true });
              const isOverdue = bill.status === 'overdue';
              const isDueSoon = bill.status === 'due-soon';

              return (
                <div
                  key={bill.id}
                  className="snap-center shrink-0 w-[200px] bg-zinc-900/70 p-4 rounded-2xl ring-1 ring-white/5 relative overflow-hidden"
                >
                  {isOverdue && <div className="absolute inset-0 bg-rose-500/5 pointer-events-none" />}
                  {isDueSoon && <div className="absolute inset-0 bg-amber-500/5 pointer-events-none" />}
                  <p className="font-black text-zinc-100 text-sm truncate mb-1">{bill.name}</p>
                  <p className="text-xl font-black text-zinc-100 tabular-nums mb-2">
                    <span className="text-xs text-zinc-500 font-bold mr-0.5">₱</span>
                    {bill.amount.toLocaleString()}
                  </p>
                  <span className={`inline-block text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide ${
                    isOverdue
                      ? 'bg-rose-500/15 text-rose-400'
                      : isDueSoon
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {daysText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent Activity ── */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-zinc-100 tracking-tight">Recent Activity</h2>
          <Link
            to="/tracker"
            className="text-[11px] font-black text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors"
          >
            See all →
          </Link>
        </div>

        <div className="space-y-2">
          {transactions && transactions.length > 0 ? (
            transactions.map((tx) => {
              const cat = getCategory(tx.categoryId);
              const acc = getAccount(tx.accountId);
              const isIncome = tx.type === 'income';
              const isTransfer = tx.type === 'transfer';

              // Clean note to strip " (In)" / " (Out)"
              const cleanNote = tx.note?.replace(/\s*\((In|Out)\)$/i, '') || cat?.name || 'Transaction';

              const amountColor = isTransfer
                ? 'text-zinc-300'
                : (isIncome ? 'text-emerald-400' : 'text-zinc-100');

              const amountPrefix = isTransfer
                ? '⇄ '
                : (isIncome ? '+' : '−');

              return (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTxId(tx.id)}
                  className="p-3.5 bg-zinc-900/60 rounded-2xl ring-1 ring-white/5 flex items-center gap-3 hover:bg-zinc-800/60 hover:ring-white/8 active:scale-[0.99] transition-all duration-150 cursor-pointer"
                >
                  {/* Category icon */}
                  <div
                    className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-black ring-1 ring-white/10"
                    style={{
                      background: cat?.color
                        ? `linear-gradient(135deg, ${cat.color}25, ${cat.color}45)`
                        : isTransfer
                        ? 'linear-gradient(135deg, #3730a320, #4338ca40)'
                        : 'linear-gradient(135deg, #27272a, #3f3f46)',
                      color: cat?.color || (isTransfer ? '#818cf8' : '#71717a'),
                    }}
                  >
                    {isTransfer ? <ArrowRightLeft size={16} /> : (cat?.name ? cat.name.charAt(0).toUpperCase() : '?')}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-zinc-100 text-sm leading-tight truncate">
                      {cleanNote}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 max-w-[80px] truncate"
                        style={{
                          backgroundColor: cat?.color ? `${cat.color}18` : '#27272a',
                          color: cat?.color || (isTransfer ? '#818cf8' : '#52525b'),
                        }}
                      >
                        {cat?.name || (isTransfer ? 'Transfer' : 'Uncategorized')}
                      </span>
                      <span className="text-zinc-700 text-[10px]">•</span>
                      <span className="text-zinc-600 text-[10px] font-medium truncate">{acc?.name}</span>
                      <span className="text-zinc-700 text-[10px] shrink-0">•</span>
                      <span className="text-zinc-600 text-[10px] font-medium shrink-0 whitespace-nowrap">
                        {formatDistanceToNow(tx.date, { addSuffix: true })}
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <p className={`font-black text-sm shrink-0 whitespace-nowrap tabular-nums ${amountColor}`}>
                    <span className="text-[10px] font-bold opacity-60 mr-0.5">{amountPrefix}₱</span>
                    {tx.amount.toLocaleString()}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="py-14 flex flex-col items-center justify-center text-zinc-600 bg-zinc-900/30 rounded-[2rem] ring-1 ring-white/5">
              <div className="text-4xl mb-3">📭</div>
              <p className="font-bold text-sm">No transactions yet</p>
              <p className="text-[11px] text-zinc-700 mt-1">Tap + to record your first one</p>
            </div>
          )}
        </div>
      </div>

      <SettingsSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <TransactionDetailsSheet 
        transactionId={selectedTxId}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
    </div>
  );
}
