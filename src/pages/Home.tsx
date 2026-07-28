import { useState, useMemo } from 'react';
import { useCollectionData, useDocumentData } from 'react-firebase-hooks/firestore';
import { doc, query, where } from 'firebase/firestore';
import { collections } from '../db';
import type { User, Account, Bill, Debt, Transaction, Category } from '../db';
import { useAppStore } from '../store';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Link } from 'react-router-dom';
import SettingsSheet from '../components/SettingsSheet';
import TransactionDetailsSheet from '../components/TransactionDetailsSheet';
import BillDetailsSheet from '../components/BillDetailsSheet';
import DebtDetailsSheet from '../components/DebtDetailsSheet';
import HelpTooltip from '../components/HelpTooltip';
import { ArrowRightLeft, Plus, Receipt } from 'lucide-react';

export default function Home() {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const viewMode = useAppStore((state) => state.viewMode);
  const toggleAddMenu = useAppStore((state) => state.toggleAddMenu);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  // Memoized query objects to ensure stable Firestore subscriptions
  const userDocRef = useMemo(() => {
    return currentUserId ? doc(collections.users, currentUserId) : null;
  }, [currentUserId]);

  const accountsQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  const billsQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.bills, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  const debtsQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.debts, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  const txQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.transactions, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  const categoriesQuery = useMemo(() => {
    return currentHouseholdId ? query(collections.categories, where('householdId', '==', currentHouseholdId)) : null;
  }, [currentHouseholdId]);

  // Firestore hooks
  const [user] = useDocumentData<User>(userDocRef);
  const [allAccounts] = useCollectionData<Account>(accountsQuery);
  const [allBills] = useCollectionData<Bill>(billsQuery);
  const [allDebts] = useCollectionData<Debt>(debtsQuery);
  const [allRawTransactions] = useCollectionData<Transaction>(txQuery);
  const [categories] = useCollectionData<Category>(categoriesQuery);

  const accounts = useMemo(() => {
    if (!allAccounts) return [];
    return viewMode === 'mine' 
      ? allAccounts.filter(a => a.ownerId === currentUserId || a.ownerId === null)
      : allAccounts;
  }, [allAccounts, viewMode, currentUserId]);

  const upcomingItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: 'bill' | 'loan';
      name: string;
      subtitle?: string;
      amount: number;
      due: Date;
      daysText: string;
      isOverdue: boolean;
      isDueSoon: boolean;
      billId?: string;
      debtId?: string;
    }> = [];

    // Add bills
    if (allBills) {
      allBills.filter(b => ['upcoming', 'due-soon', 'overdue'].includes(b.status)).forEach(bill => {
        const due = new Date();
        const lastDayThisMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
        due.setDate(Math.min(bill.dueDay, lastDayThisMonth));
        if (isPast(due) && due.getDate() !== new Date().getDate()) {
          due.setMonth(due.getMonth() + 1);
          const lastDayNextMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
          due.setDate(Math.min(bill.dueDay, lastDayNextMonth));
        }
        const daysText = formatDistanceToNow(due, { addSuffix: true });
        const isOverdue = bill.status === 'overdue';
        const isDueSoon = bill.status === 'due-soon';

        items.push({
          id: `bill_${bill.id}`,
          type: 'bill',
          name: bill.name,
          amount: bill.amount,
          due,
          daysText,
          isOverdue,
          isDueSoon,
          billId: bill.id,
        });
      });
    }

    // Add active loans
    if (allDebts) {
      allDebts.filter(d => d.remainingBalance > 0).forEach(debt => {
        const due = new Date();
        const lastDayThisMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
        due.setDate(Math.min(debt.dueDay || 1, lastDayThisMonth));
        if (isPast(due) && due.getDate() !== new Date().getDate()) {
          due.setMonth(due.getMonth() + 1);
          const lastDayNextMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
          due.setDate(Math.min(debt.dueDay || 1, lastDayNextMonth));
        }

        const now = new Date();
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const isOverdue = diffDays < 0;
        const isDueSoon = diffDays >= 0 && diffDays <= 3;
        const daysText = formatDistanceToNow(due, { addSuffix: true });
        const installment = Math.min(debt.installmentAmount, debt.remainingBalance);

        items.push({
          id: `loan_${debt.id}`,
          type: 'loan',
          name: debt.name,
          subtitle: debt.lender ? `Lender: ${debt.lender}` : undefined,
          amount: installment,
          due,
          daysText,
          isOverdue,
          isDueSoon,
          debtId: debt.id,
        });
      });
    }

    // Sort by due date ascending (earliest due first)
    return items.sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [allBills, allDebts]);

  const transactions = useMemo(() => {
    if (!allRawTransactions) return [];
    return [...allRawTransactions]
      .filter(tx => !tx.id.endsWith('_in'))
      .sort((a, b) => (b.date || 0) - (a.date || 0))
      .slice(0, 5);
  }, [allRawTransactions]);

  const getCategory = (id?: string) => categories?.find(c => c.id === id);
  const getAccount = (id: string) => accounts?.find(a => a.id === id);

  const totalBalance = accounts?.reduce((sum, acc) => sum + acc.balance, 0) || 0;

  return (
    <div className="flex flex-col gap-6 pb-32">

      {/* ── Header ── */}
      <div className="px-4 pt-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-0.5">Welcome back</p>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">{user?.name || 'User'}</h1>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="w-11 h-11 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-2xl flex items-center justify-center text-zinc-800 dark:text-zinc-100 font-black text-lg shadow-lg hover:bg-white/80 dark:hover:bg-zinc-800/60 active:scale-95 transition-all"
        >
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </button>
      </div>

      {/* ── Balance Glass Card ── */}
      <div className="px-4">
        <div className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border border-white/40 dark:border-white/10 text-zinc-800 dark:text-zinc-100 p-6 rounded-3xl shadow-lg dark:shadow-[0_15px_35px_rgba(0,0,0,0.5)] relative overflow-hidden transition-colors duration-300">
          {/* Decorative glowing gradient backdrop */}
          <div className="absolute -right-10 -top-10 w-44 h-44 bg-purple-500/20 dark:bg-purple-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-fuchsia-500/20 dark:bg-fuchsia-500/15 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-1 mb-2 relative z-10">
            <span className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">Total Balance</span>
            <HelpTooltip
              title="Total Balance"
              text="Calculated real-time sum of all active bank accounts, e-wallets, and cash reserves connected in your household."
            />
          </div>

          <p className="text-[2.65rem] font-black tracking-tight leading-none relative z-10 text-zinc-900 dark:text-zinc-100 tabular-nums">
            <span className="text-2xl font-bold text-purple-600 dark:text-fuchsia-400 mr-1">₱</span>
            {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>

          {/* Accounts row */}
          {accounts && accounts.length > 0 && (
            <div className="flex gap-2 mt-5 relative z-10 overflow-x-auto no-scrollbar pb-0.5">
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  className="flex-shrink-0 flex items-center gap-2 bg-black/5 dark:bg-white/5 backdrop-blur-md rounded-xl px-3 py-2 border border-black/10 dark:border-white/10"
                >
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: acc.color }} />
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 leading-none mb-0.5 truncate max-w-[75px]">{acc.name}</p>
                    <p className="text-xs font-black text-zinc-800 dark:text-zinc-200 tabular-nums whitespace-nowrap">
                      ₱{acc.balance.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Coming Up (Bills & Loans) ── */}
      {upcomingItems && upcomingItems.length > 0 && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Coming Up</h2>
              <HelpTooltip
                title="Obligations"
                text="Upcoming and due bills (utilities, subscriptions) and monthly loan installments prioritized by due date."
              />
            </div>
            <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              {upcomingItems.length} obligation{upcomingItems.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1.5 -mx-4 px-4 snap-x snap-mandatory">
            {upcomingItems.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  if (item.type === 'bill' && item.billId) setSelectedBillId(item.billId);
                  if (item.type === 'loan' && item.debtId) setSelectedDebtId(item.debtId);
                }}
                className={`snap-center shrink-0 w-[210px] p-4 rounded-3xl border border-white/40 dark:border-white/10 backdrop-blur-xl relative overflow-hidden flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all shadow-lg ${
                  item.type === 'loan' ? 'bg-fuchsia-500/10 dark:bg-indigo-950/30' : 'bg-white/60 dark:bg-zinc-900/40'
                }`}
              >
                {item.isOverdue && <div className="absolute inset-0 bg-rose-500/10 pointer-events-none" />}
                {item.isDueSoon && <div className="absolute inset-0 bg-purple-500/10 pointer-events-none" />}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      item.type === 'loan'
                        ? 'bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30'
                        : 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30'
                    }`}>
                      {item.type === 'loan' ? 'LOAN' : 'BILL'}
                    </span>
                  </div>
                  <p className="font-black text-zinc-900 dark:text-zinc-100 text-sm truncate">{item.name}</p>
                  {item.subtitle && <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 truncate mb-1">{item.subtitle}</p>}
                  <p className="text-xl font-black text-zinc-900 dark:text-zinc-100 tabular-nums mt-1 mb-2">
                    <span className="text-xs text-purple-600 dark:text-fuchsia-400 font-bold mr-0.5">₱</span>
                    {item.amount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className={`inline-block text-[10px] font-black px-2.5 py-1 rounded-xl uppercase tracking-wide border ${
                    item.isOverdue
                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30'
                      : item.isDueSoon
                      ? 'bg-purple-500/20 text-purple-700 dark:text-fuchsia-300 border-purple-500/30'
                      : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 border-black/10 dark:border-white/10'
                  }`}>
                    {item.daysText}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Activity / Transactions Card ── */}
      <div className="px-4">
        <div className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl border border-white/40 dark:border-white/10 rounded-3xl p-5 shadow-lg flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Receipt size={18} />
              </div>
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Recent Transactions</h2>
            </div>
            <Link
              to="/tracker"
              className="text-[11px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider hover:text-purple-700 dark:hover:text-fuchsia-300 transition-colors"
            >
              See all →
            </Link>
          </div>

          <div className="flex flex-col gap-2.5">
            {transactions && transactions.length > 0 ? (
              transactions.map((tx) => {
                const cat = getCategory(tx.categoryId);
                const acc = getAccount(tx.accountId);
                const isIncome = tx.type === 'income';
                const isTransfer = tx.type === 'transfer';

                const cleanNote = tx.note?.replace(/\s*\((In|Out)\)$/i, '') || cat?.name || 'Transaction';

                const amountColor = isTransfer
                  ? 'text-zinc-600 dark:text-zinc-300'
                  : (isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-100');

                const amountPrefix = isTransfer
                  ? '⇄ '
                  : (isIncome ? '+' : '−');

                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTxId(tx.id)}
                    className="p-3.5 bg-white/40 dark:bg-black/30 backdrop-blur-md rounded-2xl border border-black/5 dark:border-white/5 flex items-center gap-3 hover:bg-white/70 dark:hover:bg-white/5 active:scale-[0.99] transition-all cursor-pointer"
                  >
                    {/* Category icon */}
                    <div
                      className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-black border border-black/10 dark:border-white/10"
                      style={{
                        background: cat?.color
                          ? `linear-gradient(135deg, ${cat.color}30, ${cat.color}60)`
                          : isTransfer
                          ? 'linear-gradient(135deg, #a855f730, #d946ef60)'
                          : 'linear-gradient(135deg, #e4e4e7, #d4d4d8)',
                        color: cat?.color || (isTransfer ? '#d946ef' : '#52525b'),
                      }}
                    >
                      {isTransfer ? <ArrowRightLeft size={16} /> : (cat?.name ? cat.name.charAt(0).toUpperCase() : '?')}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm leading-tight truncate">
                        {cleanNote}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 max-w-[85px] truncate"
                          style={{
                            backgroundColor: cat?.color ? `${cat.color}20` : '#e4e4e7',
                            color: cat?.color || (isTransfer ? '#d946ef' : '#71717a'),
                          }}
                        >
                          {cat?.name || (isTransfer ? 'Transfer' : 'Uncategorized')}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-600 text-[10px]">•</span>
                        <span className="text-zinc-500 dark:text-zinc-400 text-[10px] font-medium truncate">{acc?.name || 'Account'}</span>
                        <span className="text-zinc-400 dark:text-zinc-600 text-[10px] shrink-0">•</span>
                        <span className="text-zinc-500 dark:text-zinc-400 text-[10px] font-medium shrink-0 whitespace-nowrap">
                          {tx.date ? formatDistanceToNow(tx.date, { addSuffix: true }) : ''}
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
              <div className="py-10 flex flex-col items-center justify-center text-center px-4 bg-black/5 dark:bg-black/20 rounded-2xl border border-black/5 dark:border-white/5">
                <div className="w-12 h-12 rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80 border border-black/10 dark:border-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400 mb-3">
                  <Receipt size={24} />
                </div>
                <p className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">No recent transactions</p>
                <p className="text-xs text-zinc-500 mt-1 mb-4 max-w-[220px]">
                  Add an expense, income, or transfer to track your spending.
                </p>
                <button
                  onClick={() => toggleAddMenu(true)}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600 text-white text-xs font-black rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-md"
                >
                  <Plus size={16} />
                  <span>Record Transaction</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SettingsSheet isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <TransactionDetailsSheet 
        transactionId={selectedTxId}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
      <BillDetailsSheet
        billId={selectedBillId}
        isOpen={selectedBillId !== null}
        onClose={() => setSelectedBillId(null)}
      />
      <DebtDetailsSheet
        debtId={selectedDebtId}
        isOpen={selectedDebtId !== null}
        onClose={() => setSelectedDebtId(null)}
      />
    </div>
  );
}


