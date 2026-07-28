import { useState } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, getDoc, updateDoc, setDoc, query, where } from 'firebase/firestore';
import { db, collections } from '../db';
import type { Bill, Debt, Account } from '../db';
import { formatDistanceToNow, isPast } from 'date-fns';
import { List, Calendar as CalendarIcon } from 'lucide-react';
import { useAppStore } from '../store';
import DebtDetailsSheet from '../components/DebtDetailsSheet';
import BillDetailsSheet from '../components/BillDetailsSheet';
import ConfirmModal from '../components/ConfirmModal';
import BillsLoansCalendar from '../components/BillsLoansCalendar';
import HelpTooltip from '../components/HelpTooltip';

export default function BillsDebts() {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [activeTab, setActiveTab] = useState<'bills' | 'loans'>('bills');
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'success' | 'info';
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  });

  const showConfirm = (opts: Omit<typeof confirmModal, 'isOpen'>) => {
    setConfirmModal({ isOpen: true, ...opts });
  };

  const hideConfirm = () => {
    setConfirmModal(c => ({ ...c, isOpen: false }));
  };

  const [bills] = useCollectionData<Bill>(
    currentHouseholdId ? query(collections.bills, where('householdId', '==', currentHouseholdId)) : null
  );
  const [debts] = useCollectionData<Debt>(
    currentHouseholdId ? query(collections.debts, where('householdId', '==', currentHouseholdId)) : null
  );
  const [accounts] = useCollectionData<Account>(
    currentHouseholdId ? query(collections.accounts, where('householdId', '==', currentHouseholdId)) : null
  );

  const handlePayBill = async (billId: string) => {
    const billSnap = await getDoc(doc(db, 'bills', billId));
    const bill = billSnap.data() as Bill | undefined;
    if (!bill) return;

    if (bill.isVariableAmount || bill.variableAmountFlag) {
      // For variable bills, open detail sheet so user can verify & enter actual statement amount
      setSelectedBillId(billId);
      return;
    }

    const accountSnap = await getDoc(doc(db, 'accounts', bill.accountId));
    const account = accountSnap.data() as Account | undefined;
    if (!account) return;

    if (account.balance < bill.amount) {
      showConfirm({
        title: 'Insufficient Funds',
        message: `${account.name} only has ₱${account.balance.toLocaleString()}. You need ₱${bill.amount.toLocaleString()} to pay this bill.`,
        variant: 'danger',
        confirmLabel: 'Got it',
        onConfirm: hideConfirm,
      });
      return;
    }

    showConfirm({
      title: `Pay ${bill.name}`,
      message: `Confirm payment of ₱${bill.amount.toLocaleString()} using ${account.name}?`,
      variant: 'info',
      confirmLabel: 'Pay Now',
      onConfirm: async () => {
        hideConfirm();
        await updateDoc(doc(db, 'accounts', bill.accountId), { balance: account.balance - bill.amount });
        
        const txId = `tx_${Date.now()}`;
        await setDoc(doc(db, 'transactions', txId), {
          id: txId,
          accountId: bill.accountId,
          categoryId: 'cat_bills',
          amount: bill.amount,
          type: 'expense',
          note: `Paid ${bill.name} Bill`,
          date: Date.now()
        });
        
        await updateDoc(doc(db, 'bills', billId), {
          status: 'paid',
          lastPaidDate: Date.now(),
          timesRecurred: ((bill as any).timesRecurred || 0) + 1
        });
      },
    });
  };

  const handlePayLoan = async (debtId: string) => {
    const debtSnap = await getDoc(doc(db, 'debts', debtId));
    const debt = debtSnap.data() as Debt | undefined;
    if (!debt) return;

    if (!accounts || accounts.length === 0) return;

    const paymentAmount = Math.min(debt.installmentAmount, debt.remainingBalance);
    const account = accounts.find(a => a.balance >= paymentAmount) || accounts[0];

    if (account.balance < paymentAmount) {
      showConfirm({
        title: 'Insufficient Funds',
        message: `You don't have enough balance to make a ₱${paymentAmount.toLocaleString()} loan payment.`,
        variant: 'danger',
        confirmLabel: 'Got it',
        onConfirm: hideConfirm,
      });
      return;
    }

    showConfirm({
      title: `Pay Loan`,
      message: `Pay ₱${paymentAmount.toLocaleString()} towards ${debt.name} using ${account.name}?`,
      variant: 'info',
      confirmLabel: 'Pay Now',
      onConfirm: async () => {
        hideConfirm();
        await updateDoc(doc(db, 'accounts', account.id), { balance: account.balance - paymentAmount });
        const newRemaining = Math.max(0, debt.remainingBalance - paymentAmount);
        await updateDoc(doc(db, 'debts', debtId), { remainingBalance: newRemaining });
        
        const txId = `tx_${Date.now()}`;
        await setDoc(doc(db, 'transactions', txId), {
          id: txId,
          accountId: account.id,
          amount: paymentAmount,
          type: 'expense',
          note: `Loan Payment: ${debt.name}`,
          date: Date.now()
        });
        
        if (newRemaining === 0) {
          showConfirm({
            title: '🎉 Loan Fully Paid!',
            message: `Congratulations! You have fully paid off your loan to ${debt.lender}!`,
            variant: 'success',
            confirmLabel: 'Awesome!',
            onConfirm: hideConfirm,
          });
        }
      },
    });
  };

  return (
    <div className="p-4 space-y-5 pb-32 h-full overflow-y-auto no-scrollbar">
      <header className="pt-1 flex items-center justify-between">
        <div>
          <div className="flex items-center">
            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.15em]">Obligations</p>
            <HelpTooltip
              title="Obligations"
              text="Manage recurring utility bills, subscriptions, and loan installment plans in list or calendar view."
            />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Bills & Loans</h1>
        </div>
        <div className="flex bg-white/60 dark:bg-zinc-900/60 p-1 rounded-2xl border border-black/10 dark:border-white/10 backdrop-blur-xl">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              viewMode === 'list'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <List size={14} /> List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              viewMode === 'calendar'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <CalendarIcon size={14} /> Calendar
          </button>
        </div>
      </header>

      {viewMode === 'calendar' ? (
        <BillsLoansCalendar
          bills={bills || []}
          debts={debts || []}
          onSelectBill={setSelectedBillId}
          onSelectDebt={setSelectedDebtId}
          onPayBill={handlePayBill}
          onPayLoan={handlePayLoan}
        />
      ) : (
        <>
          {/* Segmented Control */}
          <div className="flex bg-white/60 dark:bg-zinc-900/40 p-1.5 rounded-2xl border border-black/10 dark:border-white/10 backdrop-blur-xl">
            <button
              onClick={() => setActiveTab('bills')}
              className={`flex-1 py-2 text-sm font-black rounded-xl capitalize transition-all duration-300 ${
                activeTab === 'bills' 
                  ? 'bg-purple-500/15 dark:bg-white/10 shadow-md text-purple-700 dark:text-zinc-100 border border-purple-500/30 dark:border-white/10' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Bills
            </button>
            <button
              onClick={() => setActiveTab('loans')}
              className={`flex-1 py-2 text-sm font-black rounded-xl capitalize transition-all duration-300 ${
                activeTab === 'loans' 
                  ? 'bg-purple-500/15 dark:bg-white/10 shadow-md text-purple-700 dark:text-zinc-100 border border-purple-500/30 dark:border-white/10' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Loans
            </button>
          </div>

      {/* Content */}
      <div className="space-y-3">
        {activeTab === 'bills' && bills?.map(bill => {
          const isPaid = bill.status === 'paid';
          const isMonthly = !bill.dueType || bill.dueType === 'monthly';

          let dueLabel = '';
          if (isPaid) {
            dueLabel = 'Paid this cycle';
          } else if (isMonthly) {
            const due = new Date();
            const lastDayThisMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
            due.setDate(Math.min(bill.dueDay, lastDayThisMonth));
            if (isPast(due) && due.getDate() !== new Date().getDate()) {
              due.setMonth(due.getMonth() + 1);
              const lastDayNextMonth = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
              due.setDate(Math.min(bill.dueDay, lastDayNextMonth));
            }
            dueLabel = `Due ${formatDistanceToNow(due, { addSuffix: true })}`;
          } else {
            const now = Date.now();
            const upcoming = (bill.specificDates || []).filter(ts => ts >= now).sort((a, b) => a - b);
            if (upcoming.length > 0) {
              dueLabel = `Next: ${new Date(upcoming[0]).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`;
            } else {
              dueLabel = 'All dates passed';
            }
          }

          const recurrenceLabel = isMonthly
            ? `↻ Monthly · ${(bill as any).timesRecurred || 0}× paid`
            : `${(bill.specificDates || []).length} dates · ${(bill as any).timesRecurred || 0}× paid`;

          return (
            <div
              key={bill.id}
              onClick={() => setSelectedBillId(bill.id)}
              className="p-4 bg-white/70 dark:bg-zinc-900/40 backdrop-blur-xl rounded-3xl border border-black/10 dark:border-white/10 shadow-md relative overflow-hidden active:scale-[0.99] transition-all cursor-pointer space-y-3"
            >
              <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-base leading-tight truncate">{bill.name}</p>
                    {(bill.isVariableAmount || bill.variableAmountFlag) && (
                      <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wider flex items-center">
                        Variable
                        <HelpTooltip
                          title="Variable Bill"
                          text="Amount fluctuates each month (e.g., Meralco electricity, water meter). You can confirm the exact statement amount before paying."
                        />
                      </span>
                    )}
                  </div>
                  <p className={`text-xs font-bold mt-1 truncate ${
                    isPaid ? 'text-emerald-600 dark:text-emerald-400' : bill.status === 'overdue' ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-500 dark:text-zinc-400'
                  }`}>
                    {dueLabel}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-lg text-zinc-900 dark:text-zinc-100 tabular-nums">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mr-0.5">₱</span>
                    {bill.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/10 dark:border-white/10 relative z-10">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${
                  isMonthly ? 'text-amber-700 dark:text-amber-400/80' : 'text-indigo-700 dark:text-indigo-400/80'
                }`}>
                  {recurrenceLabel}
                </span>

                {!isPaid ? (
                  <button
                    onClick={e => { e.stopPropagation(); handlePayBill(bill.id); }}
                    className={`whitespace-nowrap shrink-0 text-[10px] uppercase tracking-wider font-black px-3.5 py-1.5 rounded-full active:scale-95 transition-transform ${
                      bill.isVariableAmount || bill.variableAmountFlag
                        ? 'text-amber-950 bg-amber-400 hover:bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                        : 'text-white bg-purple-600 hover:bg-purple-500 dark:text-zinc-950 dark:bg-zinc-100 dark:hover:bg-white'
                    }`}
                  >
                    {bill.isVariableAmount || bill.variableAmountFlag ? 'Verify & Pay' : 'Pay Now'}
                  </button>
                ) : (
                  <span className="whitespace-nowrap shrink-0 text-[10px] uppercase tracking-wider font-black text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-full inline-block">
                    Paid
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {activeTab === 'bills' && bills?.length === 0 && (
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/30 backdrop-blur-xl rounded-3xl border border-dashed border-white/10">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-800/50 flex items-center justify-center border border-white/10">
              <i className="lucide lucide-file-text text-2xl text-zinc-400"></i>
            </div>
            <p className="font-bold tracking-wide">No bills added yet.</p>
          </div>
        )}

        {activeTab === 'loans' && debts?.map(debt => {
          const progress = ((debt.originalAmount - debt.remainingBalance) / debt.originalAmount) * 100;
          return (
            <div 
              key={debt.id} 
              onClick={() => setSelectedDebtId(debt.id)}
              className="p-4 bg-white/70 dark:bg-zinc-900/40 backdrop-blur-xl rounded-3xl border border-black/10 dark:border-white/10 shadow-md space-y-3 active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 text-base truncate">{debt.name}</p>
                  <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                    LENDER <span className="text-zinc-800 dark:text-zinc-200">{debt.lender}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-lg text-zinc-900 dark:text-zinc-100 tabular-nums">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mr-0.5">₱</span>
                    {debt.remainingBalance.toLocaleString()}
                  </p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div>
                <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800/80 rounded-full overflow-hidden mb-1 border border-black/5 dark:border-white/5">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 dark:text-zinc-400 tracking-wider">
                  <span><strong className="text-zinc-800 dark:text-zinc-200">{progress.toFixed(0)}%</strong> PAID</span>
                  <span>INSTALLMENT: <strong className="text-zinc-800 dark:text-zinc-200">₱{Math.min(debt.installmentAmount, debt.remainingBalance).toLocaleString()}</strong></span>
                </div>
              </div>

              {debt.remainingBalance > 0 && (
                <div className="flex justify-end pt-2 border-t border-black/10 dark:border-white/10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePayLoan(debt.id);
                    }}
                    className="whitespace-nowrap text-[10px] uppercase tracking-wider font-black text-indigo-700 bg-indigo-50 border border-indigo-200 dark:text-indigo-300 dark:bg-indigo-500/20 dark:border-indigo-500/30 px-3.5 py-1.5 rounded-full active:scale-95 transition-transform hover:bg-indigo-100 dark:hover:bg-indigo-500/30 shadow-sm"
                  >
                    Pay ₱{Math.min(debt.installmentAmount, debt.remainingBalance).toLocaleString()}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {activeTab === 'loans' && debts?.length === 0 && (
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/30 backdrop-blur-xl rounded-3xl border border-dashed border-white/10">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-800/50 flex items-center justify-center border border-white/10">
              <i className="lucide lucide-credit-card text-2xl text-zinc-400"></i>
            </div>
            <p className="font-bold tracking-wide">No loans added yet.</p>
          </div>
        )}
      </div>
        </>
      )}

      {/* Loan Detail Sheet */}
      <DebtDetailsSheet 
        debtId={selectedDebtId} 
        isOpen={selectedDebtId !== null} 
        onClose={() => setSelectedDebtId(null)} 
      />

      {/* Bill Detail Sheet */}
      <BillDetailsSheet
        billId={selectedBillId}
        isOpen={selectedBillId !== null}
        onClose={() => setSelectedBillId(null)}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmLabel={confirmModal.confirmLabel}
        onConfirm={confirmModal.onConfirm}
        onCancel={hideConfirm}
      />
    </div>
  );
}

