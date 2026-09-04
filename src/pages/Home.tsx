import { useState, useMemo, useEffect } from 'react';
import { useSafeDocumentData, useSafeCollectionData } from '../db';
import type { User, Account, Bill, Debt, Transaction, Category, Goal } from '../db';
import { useAppStore } from '../store';
import { formatDistanceToNow, isPast } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import SettingsSheet from '../components/SettingsSheet';
import AccountSheet from '../components/AccountSheet';
import TransactionDetailsSheet from '../components/TransactionDetailsSheet';
import BillDetailsSheet from '../components/BillDetailsSheet';
import DebtDetailsSheet from '../components/DebtDetailsSheet';
import AccountDetailsSheet from '../components/AccountDetailsSheet';
import EmergencyFundDepositModal from '../components/EmergencyFundDepositModal';
import EmergencyFundWithdrawModal from '../components/EmergencyFundWithdrawModal';
import PaymentModal, { type PaymentItem } from '../components/PaymentModal';
import HelpTooltip from '../components/HelpTooltip';
import GoalCard from '../components/GoalCard';
import GoalDetailsSheet from '../components/GoalDetailsSheet';
import GoalCreationModal from '../components/GoalCreationModal';
import SecurityPinModal from '../components/SecurityPinModal';
import WeatherHeaderBanner from '../components/WeatherHeaderBanner';
import { ArrowRightLeft, Plus, Receipt, TrendingUp, ChevronRight, ShieldCheck, Lock, Unlock, ArrowUpRight, Target, Sparkles } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();
  const currentUserId = useAppStore((state) => state.currentUserId);
  const viewMode = useAppStore((state) => state.viewMode);
  const toggleAddMenu = useAppStore((state) => state.toggleAddMenu);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountCreationOpen, setIsAccountCreationOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [isGoalCreationOpen, setIsGoalCreationOpen] = useState(false);
  const [paymentModalItem, setPaymentModalItem] = useState<PaymentItem | null>(null);
  const [isEfDepositOpen, setIsEfDepositOpen] = useState(false);
  const [isEfWithdrawOpen, setIsEfWithdrawOpen] = useState(false);
  const [isEfUnlocked, setIsEfUnlocked] = useState(false);
  const [isEfPinModalOpen, setIsEfPinModalOpen] = useState(false);

  // Global AI-Triggered Event Listeners for seamless intent execution
  useEffect(() => {
    const handleOpenDeposit = () => setIsEfDepositOpen(true);
    const handleOpenWithdraw = () => setIsEfWithdrawOpen(true);
    const handleOpenPin = () => setIsEfPinModalOpen(true);
    const handleOpenGoal = () => setIsGoalCreationOpen(true);
    const handleOpenAccount = () => setIsAccountCreationOpen(true);
    const handleOpenSettings = () => setIsSettingsOpen(true);

    window.addEventListener('gorago_open_safetynet_deposit', handleOpenDeposit);
    window.addEventListener('gorago_open_safetynet_withdraw', handleOpenWithdraw);
    window.addEventListener('gorago_open_pin_modal', handleOpenPin);
    window.addEventListener('gorago_open_goal_creation', handleOpenGoal);
    window.addEventListener('gorago_open_account_creation', handleOpenAccount);
    window.addEventListener('gorago_open_settings_sheet', handleOpenSettings);

    return () => {
      window.removeEventListener('gorago_open_safetynet_deposit', handleOpenDeposit);
      window.removeEventListener('gorago_open_safetynet_withdraw', handleOpenWithdraw);
      window.removeEventListener('gorago_open_pin_modal', handleOpenPin);
      window.removeEventListener('gorago_open_goal_creation', handleOpenGoal);
      window.removeEventListener('gorago_open_account_creation', handleOpenAccount);
      window.removeEventListener('gorago_open_settings_sheet', handleOpenSettings);
    };
  }, []);

  // Firestore & Local Safe hooks
  const [user] = useSafeDocumentData<User>(null, 'users', currentUserId);
  const [allAccounts] = useSafeCollectionData<Account>(null, 'accounts');
  const [allBills] = useSafeCollectionData<Bill>(null, 'bills');
  const [allDebts] = useSafeCollectionData<Debt>(null, 'debts');
  const [allRawTransactions] = useSafeCollectionData<Transaction>(null, 'transactions');
  const [categories] = useSafeCollectionData<Category>(null, 'categories');
  const [allGoals = []] = useSafeCollectionData<Goal>(null, 'goals');

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

  const regularAccounts = accounts?.filter(a => !a.isSystemDefault) || [];
  const emergencyFund = accounts?.find(a => a.isSystemDefault && a.id === 'acc_system_ef');
  const isLocked = Boolean(user?.emergencyFundPin && !isEfUnlocked);
  
  const totalBalance = regularAccounts.reduce((sum, acc) => sum + acc.balance, 0);

  const handleEmergencyFundTap = () => {
    if (!emergencyFund) return;
    if (isLocked) {
      setIsEfPinModalOpen(true);
    } else {
      setSelectedAccountId(emergencyFund.id);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-40">

      {/* ── Weather Sync & Dynamic Atmospheric Header Banner ── */}
      <div className="px-4 pt-4 pb-2">
        <WeatherHeaderBanner
          user={user || null}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </div>

      {/* ── Balance & Emergency Fund row ── */}
      <div className="px-4 flex flex-col sm:flex-row gap-4">
        {/* Total Balance Card */}
        <div
          id="home-total-balance-card"
          onClick={() => navigate('/accounts')}
          className="flex-1 bg-[#F0F4F8] dark:bg-[#2D3748] border border-white/70 dark:border-white/10 text-zinc-800 dark:text-zinc-100 p-6 rounded-3xl shadow-md dark:shadow-[0_15px_35px_rgba(0,0,0,0.5)] relative shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] cursor-pointer hover:bg-white dark:hover:bg-zinc-800/80 active:scale-[0.99] transition-all duration-300"
        >
          {/* Decorative glowing gradient backdrop */}
          <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div className="absolute -right-10 -top-10 w-44 h-44 bg-purple-500/15 dark:bg-purple-500/15 rounded-full blur-2xl" />
            <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-fuchsia-500/15 dark:bg-fuchsia-500/15 rounded-full blur-2xl" />
          </div>

          <div className="flex items-center gap-1 mb-2 relative z-10">
            <span className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">Total Balance</span>
            <HelpTooltip
              title="Total Balance"
              text="Calculated real-time sum of your active accounts, excluding your protected Emergency Fund."
            />
          </div>

          <p className="text-[2.65rem] font-black tracking-tight leading-none relative z-10 text-zinc-900 dark:text-zinc-100 tabular-nums truncate">
            <span className="text-2xl font-bold text-purple-600 dark:text-fuchsia-400 mr-1">₱</span>
            {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>

          {/* Accounts row */}
          {regularAccounts && regularAccounts.length > 0 && (
            <div className="flex gap-2.5 mt-5 relative z-10 overflow-x-auto no-scrollbar pb-1">
              {regularAccounts.map(acc => (
                <div
                  key={acc.id}
                  className="flex-shrink-0 flex items-center gap-2.5 bg-white/80 dark:bg-zinc-900/60 backdrop-blur-md rounded-2xl px-3.5 py-2.5 border border-white/70 dark:border-white/10 shadow-sm shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] dark:shadow-none"
                >
                  <div className="w-3 h-3 rounded-full shrink-0 shadow-xs ring-2 ring-white/40 dark:ring-black/40" style={{ backgroundColor: acc.color }} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 leading-tight mb-0.5 whitespace-nowrap">{acc.name}</p>
                    <p className="text-xs font-black text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
                      ₱{acc.balance.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Emergency Fund Card */}
        {emergencyFund && (
          <div 
            id="home-safety-net-card"
            onClick={handleEmergencyFundTap}
            className="flex-1 sm:max-w-[250px] bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/30 dark:border-amber-500/20 text-zinc-800 dark:text-zinc-100 p-5 rounded-3xl cursor-pointer hover:bg-amber-500/15 dark:hover:bg-amber-500/10 active:scale-[0.98] transition-all duration-300 flex flex-col justify-between relative shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] overflow-hidden group"
          >
            <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-amber-500/15 dark:bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            {/* Top Row: Icon + Title + Tooltip + Top-Right Lock Status Badge */}
            <div className="flex items-start justify-between gap-2 mb-3 relative z-10">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-md shrink-0">
                  <ShieldCheck size={16} />
                </div>
                <div className="flex items-center min-w-0">
                  <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-widest truncate">Safety Net</span>
                  <HelpTooltip
                    title="Emergency Fund / Safety Net"
                    text="Your locked reserve for unforeseen crises, medical emergencies, or urgent repairs. Kept isolated from your daily spendable balance."
                  />
                </div>
              </div>

              {/* Integrated Top-Right Lock Status Badge */}
              {user?.emergencyFundPin ? (
                isLocked ? (
                  <button
                    type="button"
                    id="safetynet-lock-badge"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEfPinModalOpen(true);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 dark:bg-amber-500/15 border border-amber-500/35 text-amber-800 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider shadow-xs hover:bg-amber-500/30 active:scale-95 transition-all cursor-pointer shrink-0"
                    title="Locked with PIN • Click to unlock"
                  >
                    <Lock size={10} className="text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>Protected</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    id="safetynet-unlock-badge"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEfUnlocked(false);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 dark:bg-emerald-500/15 border border-emerald-500/35 text-emerald-800 dark:text-emerald-300 text-[10px] font-black uppercase tracking-wider shadow-xs hover:bg-emerald-500/30 active:scale-95 transition-all cursor-pointer shrink-0"
                    title="Unlocked • Click to lock"
                  >
                    <Unlock size={10} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span>Unlocked</span>
                  </button>
                )
              ) : (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider shadow-xs shrink-0">
                  <ShieldCheck size={10} className="text-amber-700 dark:text-amber-400 shrink-0" />
                  <span>Active</span>
                </div>
              )}
            </div>

            {/* Balance Display with Obscuration when Locked */}
            <div className="relative z-10 mb-4 min-h-[36px] flex items-center">
              {isLocked ? (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-amber-600 dark:text-amber-400">₱</span>
                    <span className="text-2xl font-black tracking-widest text-zinc-400 dark:text-zinc-500 select-none">••••••</span>
                  </div>
                  <button
                    type="button"
                    id="safetynet-reveal-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEfPinModalOpen(true);
                    }}
                    className="text-[10px] font-black text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 transition-all active:scale-95 cursor-pointer"
                  >
                    Reveal
                  </button>
                </div>
              ) : (
                <p className="text-[1.75rem] font-black tracking-tight leading-none text-zinc-900 dark:text-zinc-100 tabular-nums truncate">
                  <span className="text-xl font-bold text-amber-600 dark:text-amber-400 mr-1">₱</span>
                  {emergencyFund.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex gap-1.5 relative z-10 pt-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                id="safetynet-deposit-btn"
                onClick={() => setIsEfDepositOpen(true)}
                className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1 shadow-xs transition-transform active:scale-95 cursor-pointer"
              >
                <Plus size={12} />
                <span>Deposit</span>
              </button>
              <button
                type="button"
                id="safetynet-withdraw-btn"
                onClick={() => setIsEfWithdrawOpen(true)}
                className="flex-1 py-1.5 px-2 bg-black/5 dark:bg-zinc-800/80 hover:bg-black/10 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-black/5 dark:border-white/10 rounded-xl text-[11px] font-black flex items-center justify-center gap-1 shadow-xs transition-transform active:scale-95 cursor-pointer"
              >
                <ArrowUpRight size={12} />
                <span>Withdraw</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Cash Flow Projection Clay Link Card ── */}
      <div id="home-cashflow-card" className="px-4">
        <Link
          to="/insights"
          className="group block p-4 bg-[#F0F4F8] dark:bg-[#2D3748] hover:bg-white dark:hover:bg-zinc-800/80 border border-purple-300/40 dark:border-purple-500/25 rounded-3xl shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] transition-all active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 shadow-sm border border-purple-500/20">
                <TrendingUp size={22} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                    Prophet AI
                  </span>
                  <span className="text-xs font-black text-zinc-900 dark:text-zinc-100 truncate">
                    30-Day Cash Flow Projection
                  </span>
                  <HelpTooltip
                    title="Prophet AI Forecast"
                    text="Deconstructs your historical spending rhythm and upcoming recurring obligations into a 30-day forward liquidity forecast."
                    icon="sparkles"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                  Forecast balance, upcoming bill clusters & spending anomalies
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-zinc-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        </Link>
      </div>

      {/* ── Financial Goals & Savings Planner ── */}
      <div id="home-goals-card" className="px-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Target size={16} />
            </div>
            <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
              Financial Goals & Savings
            </h2>
            <HelpTooltip
              title="Savings Goals"
              text="Set target milestones (vacation, downpayment, safety nets). Gora AI calculates exact deposit rates and payday reminders."
            />
          </div>
          <button
            type="button"
            id="home-create-goal-btn"
            onClick={() => setIsGoalCreationOpen(true)}
            className="flex items-center gap-1 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 px-2.5 py-1 rounded-xl transition-all active:scale-95 shrink-0"
          >
            <Plus size={14} />
            <span>New Goal</span>
          </button>
        </div>

        {allGoals && allGoals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onClick={() => setSelectedGoal(goal)}
              />
            ))}
          </div>
        ) : (
          <div className="p-5 bg-white/60 dark:bg-zinc-900/40 rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-800 text-center flex flex-col items-center justify-center">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2">
              <Sparkles size={20} />
            </div>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">No Active Financial Goals</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-3 max-w-[280px]">
              Plan a vacation, purchase, or emergency fund with Gora AI feasibility coaching.
            </p>
            <button
              type="button"
              onClick={() => setIsGoalCreationOpen(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <Plus size={14} />
              <span>Create Your First Goal</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Coming Up (Bills & Loans) ── */}
      {upcomingItems && upcomingItems.length > 0 && (
        <div id="home-obligations-card" className="px-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="flex items-center min-w-0">
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight truncate">Coming Up</h2>
              <HelpTooltip
                title="Obligations"
                text="Upcoming and due bills (utilities, subscriptions) and monthly loan installments prioritized by due date."
              />
            </div>
            <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider shrink-0 whitespace-nowrap">
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
                className={`snap-center shrink-0 w-[220px] p-4 rounded-3xl border border-white/70 dark:border-white/10 relative overflow-hidden flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] ${
                  item.type === 'loan' 
                    ? 'bg-[#F0F4F8] dark:bg-[#2D3748] border-fuchsia-300/40 dark:border-fuchsia-500/20' 
                    : 'bg-[#F0F4F8] dark:bg-[#2D3748]'
                }`}
              >
                {item.isOverdue && <div className="absolute inset-0 bg-rose-500/10 pointer-events-none" />}
                {item.isDueSoon && <div className="absolute inset-0 bg-purple-500/10 pointer-events-none" />}
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap shrink-0 ${
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
                  <span className={`inline-block text-[10px] font-black px-2.5 py-1 rounded-xl uppercase tracking-wide border whitespace-nowrap ${
                    item.isOverdue
                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30'
                      : item.isDueSoon
                      ? 'bg-purple-500/20 text-purple-700 dark:text-fuchsia-300 border-purple-500/30'
                      : 'bg-white/80 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border-white/60 dark:border-white/10 shadow-2xs'
                  }`}>
                    {item.daysText}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Activity / Transactions Soft Clay Card ── */}
      <div id="home-recent-activity-card" className="px-4">
        <div className="bg-[#F0F4F8] dark:bg-[#2D3748] border border-white/70 dark:border-white/10 rounded-3xl p-5 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-3 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                <Receipt size={18} />
              </div>
              <h2 className="text-base font-black text-zinc-900 dark:text-zinc-100 tracking-tight truncate">Recent Transactions</h2>
            </div>
            <Link
              to="/tracker"
              className="text-[11px] font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider hover:text-purple-700 dark:hover:text-fuchsia-300 transition-colors whitespace-nowrap shrink-0"
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
                    className="p-3.5 bg-white/80 dark:bg-zinc-900/60 rounded-2xl border border-white/80 dark:border-white/10 flex items-center gap-3 shadow-xs hover:bg-white dark:hover:bg-zinc-900 active:scale-[0.99] transition-all cursor-pointer shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] dark:shadow-none"
                  >
                    {/* Category icon */}
                    <div
                      className="w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-sm font-black border border-black/5 dark:border-white/10 shadow-xs"
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

                    {/* Details with zero-overlap protection */}
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
              <div className="py-10 flex flex-col items-center justify-center text-center px-4 bg-white/50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-black/10 dark:border-white/10">
                <div className="w-12 h-12 rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80 border border-black/10 dark:border-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400 mb-3 shadow-xs">
                  <Receipt size={24} />
                </div>
                <p className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">No recent transactions</p>
                <p className="text-xs text-zinc-500 mt-1 mb-4 max-w-[220px]">
                  Add an expense, income, or transfer to track your spending.
                </p>
                <button
                  onClick={() => toggleAddMenu(true)}
                  className="btn-clay-primary text-xs"
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
      <AccountSheet isOpen={isAccountCreationOpen} onClose={() => setIsAccountCreationOpen(false)} />
      <TransactionDetailsSheet 
        transactionId={selectedTxId}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
      <GoalDetailsSheet
        goal={selectedGoal}
        isOpen={selectedGoal !== null}
        onClose={() => setSelectedGoal(null)}
      />
      <GoalCreationModal
        isOpen={isGoalCreationOpen}
        onClose={() => setIsGoalCreationOpen(false)}
      />
      <BillDetailsSheet
        billId={selectedBillId}
        isOpen={selectedBillId !== null}
        onClose={() => setSelectedBillId(null)}
        onPay={(bill) => {
          setSelectedBillId(null);
          setPaymentModalItem({ type: 'bill', bill });
        }}
      />
      <DebtDetailsSheet
        debtId={selectedDebtId}
        isOpen={selectedDebtId !== null}
        onClose={() => setSelectedDebtId(null)}
        onPay={(debt) => {
          setSelectedDebtId(null);
          setPaymentModalItem({ type: 'loan', debt });
        }}
      />
      <AccountDetailsSheet
        accountId={selectedAccountId}
        isOpen={selectedAccountId !== null}
        onClose={() => setSelectedAccountId(null)}
      />
      <PaymentModal
        isOpen={paymentModalItem !== null}
        item={paymentModalItem}
        onClose={() => setPaymentModalItem(null)}
      />

      {emergencyFund && (
        <>
          <EmergencyFundDepositModal
            isOpen={isEfDepositOpen}
            onClose={() => setIsEfDepositOpen(false)}
            emergencyFundAccount={emergencyFund}
          />
          <EmergencyFundWithdrawModal
            isOpen={isEfWithdrawOpen}
            onClose={() => setIsEfWithdrawOpen(false)}
            emergencyFundAccount={emergencyFund}
            user={user || undefined}
          />
          <SecurityPinModal
            isOpen={isEfPinModalOpen}
            onClose={() => setIsEfPinModalOpen(false)}
            expectedPin={user?.emergencyFundPin || user?.pin}
            title="Unlock Safety Net"
            subtitle="Enter your 4-digit PIN to authorize and reveal your Safety Net Emergency Fund."
            onSuccess={() => {
              setIsEfUnlocked(true);
              setIsEfPinModalOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
}


