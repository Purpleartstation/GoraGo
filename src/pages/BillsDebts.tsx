import { useState } from 'react';
import { useSafeCollectionData } from '../db';
import type { Bill, Debt, Transaction, Account } from '../db';
import { formatDistanceToNow, isPast } from 'date-fns';
import { List, Calendar as CalendarIcon, FileText, CreditCard } from 'lucide-react';
import DebtDetailsSheet from '../components/DebtDetailsSheet';
import BillDetailsSheet from '../components/BillDetailsSheet';
import ConfirmModal from '../components/ConfirmModal';
import PaymentModal, { type PaymentItem } from '../components/PaymentModal';
import BillsLoansCalendar from '../components/BillsLoansCalendar';
import HelpTooltip from '../components/HelpTooltip';
import DetectedSubscriptionsCard from '../components/DetectedSubscriptionsCard';
import { useAppStore } from '../store';

export default function BillsDebts() {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [activeTab, setActiveTab] = useState<'bills' | 'loans'>('bills');
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [paymentModalItem, setPaymentModalItem] = useState<PaymentItem | null>(null);

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

  const [bills] = useSafeCollectionData<Bill>(null, 'bills');
  const [debts] = useSafeCollectionData<Debt>(null, 'debts');
  const [transactions] = useSafeCollectionData<Transaction>(null, 'transactions');
  const [accounts] = useSafeCollectionData<Account>(null, 'accounts');

  const handlePayBill = (billId: string) => {
    const bill = bills.find(b => b.id === billId);
    if (!bill) return;
    setPaymentModalItem({ type: 'bill', bill });
  };

  const handlePayLoan = (debtId: string) => {
    const debt = debts.find(d => d.id === debtId);
    if (!debt) return;
    setPaymentModalItem({ type: 'loan', debt });
  };

  const handlePaymentSuccess = (details: { type: 'bill' | 'loan'; name: string; amount: number; accountName: string; isFullyPaid?: boolean }) => {
    if (details.isFullyPaid) {
      showConfirm({
        title: '🎉 Loan Fully Paid Off!',
        message: `Congratulations! You have completed all payments for ${details.name}! Paid ₱${details.amount.toLocaleString()} from ${details.accountName}.`,
        variant: 'success',
        confirmLabel: 'Awesome!',
        onConfirm: hideConfirm,
      });
    } else {
      showConfirm({
        title: 'Payment Successful',
        message: `Successfully paid ₱${details.amount.toLocaleString()} for ${details.name} using ${details.accountName}.`,
        variant: 'success',
        confirmLabel: 'Done',
        onConfirm: hideConfirm,
      });
    }
  };

  return (
    <div className="p-4 space-y-5 pb-40">
      <header className="pt-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center">
            <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.15em]">Obligations</p>
            <HelpTooltip
              title="Obligations"
              text="Manage recurring utility bills, subscriptions, and loan installment plans in list or calendar view."
            />
          </div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight truncate">Bills & Loans</h1>
        </div>
        <div className="flex bg-white/70 dark:bg-zinc-900/60 p-1.5 rounded-2xl border border-white/60 dark:border-white/10 backdrop-blur-2xl shadow-sm shrink-0">
          <button
            onClick={() => setViewMode('list')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'list'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/25 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)]'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <List size={15} /> List
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'calendar'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-500/25 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)]'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <CalendarIcon size={15} /> Calendar
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
          {/* Segmented Control with 44px min-h */}
          <div className="flex bg-white/70 dark:bg-zinc-900/60 p-1.5 rounded-2xl border border-white/60 dark:border-white/10 backdrop-blur-2xl shadow-sm">
            <button
              onClick={() => setActiveTab('bills')}
              className={`flex-1 min-h-[44px] py-2 text-sm font-black rounded-xl capitalize active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer ${
                activeTab === 'bills' 
                  ? 'bg-white dark:bg-zinc-800 text-purple-700 dark:text-fuchsia-300 shadow-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-white/80 dark:border-white/5' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Bills
            </button>
            <button
              onClick={() => setActiveTab('loans')}
              className={`flex-1 min-h-[44px] py-2 text-sm font-black rounded-xl capitalize active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer ${
                activeTab === 'loans' 
                  ? 'bg-white dark:bg-zinc-800 text-purple-700 dark:text-fuchsia-300 shadow-md shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] border border-white/80 dark:border-white/5' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Loans
            </button>
          </div>

      {/* Content */}
      <div className="space-y-3.5">
        {activeTab === 'bills' && (
          <DetectedSubscriptionsCard
            transactions={transactions || []}
            bills={bills || []}
            accounts={accounts || []}
            householdId={currentHouseholdId || 'h_sample'}
            onTrackedSuccess={(name, amount) => {
              showConfirm({
                title: '🎉 Subscription Tracked!',
                message: `"${name}" (₱${amount.toLocaleString()}/cycle) is now officially tracked under your Bills and will automatically factor into your calendar and cash flow forecasts.`,
                variant: 'success',
                confirmLabel: 'Awesome',
                onConfirm: hideConfirm,
              });
            }}
          />
        )}

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
              className="p-6 bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl border border-white/90 dark:border-white/10 shadow-md shadow-zinc-200/50 dark:shadow-black/40 relative overflow-hidden active:scale-[0.99] transition-all cursor-pointer space-y-3.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)]"
            >
              <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-zinc-900 dark:text-zinc-100 text-base leading-tight max-w-[140px] xs:max-w-[180px] sm:max-w-[220px] md:max-w-none truncate">{bill.name}</p>
                    {(bill.isVariableAmount || bill.variableAmountFlag) && (
                      <span className="shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wider flex items-center">
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
                  <p className="font-black text-lg text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
                    <span className="text-xs font-bold text-purple-600 dark:text-fuchsia-400 mr-0.5">₱</span>
                    {bill.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-black/5 dark:border-white/10 relative z-10">
                <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${
                  isMonthly ? 'text-zinc-600 dark:text-zinc-400' : 'text-purple-600 dark:text-purple-400'
                }`}>
                  {recurrenceLabel}
                </span>

                {!isPaid ? (
                  <button
                    onClick={e => { e.stopPropagation(); handlePayBill(bill.id); }}
                    className={`min-h-[44px] px-4 py-2 rounded-full font-black text-xs uppercase tracking-wider whitespace-nowrap shrink-0 shadow-md active:scale-95 transition-all flex items-center justify-center cursor-pointer ${
                      bill.isVariableAmount || bill.variableAmountFlag
                        ? 'btn-clay-amber'
                        : 'btn-clay-primary'
                    }`}
                  >
                    {bill.isVariableAmount || bill.variableAmountFlag ? 'Verify & Pay' : 'Pay Now'}
                  </button>
                ) : (
                  <span className="min-h-[44px] px-4 py-2 rounded-full font-black text-xs uppercase tracking-wider whitespace-nowrap shrink-0 text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 inline-flex items-center justify-center">
                    Paid
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {activeTab === 'bills' && bills?.length === 0 && (
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl border border-dashed border-black/10 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)]">
            <div className="w-16 h-16 mb-3 rounded-full bg-white/70 dark:bg-zinc-800/80 flex items-center justify-center border border-white/60 dark:border-white/10 shadow-sm">
              <FileText className="text-zinc-400" size={28} />
            </div>
            <p className="font-bold tracking-wide text-zinc-800 dark:text-zinc-200">No bills added yet.</p>
          </div>
        )}

        {activeTab === 'loans' && debts && debts.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Active Loan Portfolios</span>
              <HelpTooltip
                title="Debt Payoff Strategy"
                text="Tracks principal paydowns, recurring installment amortizations, and remaining balances for credit cards, personal loans, or equipment financing."
              />
            </div>
            <span className="text-xs font-black text-fuchsia-600 dark:text-fuchsia-400">
              {debts.length} {debts.length === 1 ? 'Debt' : 'Debts'}
            </span>
          </div>
        )}

        {activeTab === 'loans' && debts?.map(debt => {
          const progress = ((debt.originalAmount - debt.remainingBalance) / debt.originalAmount) * 100;
          return (
            <div 
              key={debt.id} 
              onClick={() => setSelectedDebtId(debt.id)}
              className="p-6 bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl border border-white/90 dark:border-white/10 shadow-md shadow-zinc-200/50 dark:shadow-black/40 space-y-3.5 active:scale-[0.99] transition-all cursor-pointer shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 dark:text-zinc-100 text-base max-w-[140px] xs:max-w-[180px] sm:max-w-[220px] md:max-w-none truncate">{debt.name}</p>
                  <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                    LENDER <span className="text-zinc-800 dark:text-zinc-200">{debt.lender}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-lg text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
                    <span className="text-xs font-bold text-fuchsia-600 dark:text-fuchsia-400 mr-0.5">₱</span>
                    {debt.remainingBalance.toLocaleString()}
                  </p>
                </div>
              </div>
              
              {/* Progress Bar with Clay styling */}
              <div>
                <div className="h-2 w-full bg-black/5 dark:bg-black/30 rounded-full overflow-hidden mb-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-600 to-fuchsia-500 rounded-full shadow-xs" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 dark:text-zinc-400 tracking-wider">
                  <span><strong className="text-zinc-800 dark:text-zinc-200">{progress.toFixed(0)}%</strong> PAID</span>
                  <span className="truncate ml-2">INSTALLMENT: <strong className="text-zinc-800 dark:text-zinc-200">₱{Math.min(debt.installmentAmount, debt.remainingBalance).toLocaleString()}</strong></span>
                </div>
              </div>

              {debt.remainingBalance > 0 && (
                <div className="flex justify-end pt-2.5 border-t border-black/5 dark:border-white/10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePayLoan(debt.id);
                    }}
                    className="btn-clay-primary text-xs"
                  >
                    Pay ₱{Math.min(debt.installmentAmount, debt.remainingBalance).toLocaleString()}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {activeTab === 'loans' && debts?.length === 0 && (
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl border border-dashed border-black/10 dark:border-white/10 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)]">
            <div className="w-16 h-16 mb-3 rounded-full bg-white/70 dark:bg-zinc-800/80 flex items-center justify-center border border-white/60 dark:border-white/10 shadow-sm">
              <CreditCard className="text-zinc-400" size={28} />
            </div>
            <p className="font-bold tracking-wide text-zinc-800 dark:text-zinc-200">No loans added yet.</p>
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
        onPay={(debt) => {
          setSelectedDebtId(null);
          setPaymentModalItem({ type: 'loan', debt });
        }}
      />

      {/* Bill Detail Sheet */}
      <BillDetailsSheet
        billId={selectedBillId}
        isOpen={selectedBillId !== null}
        onClose={() => setSelectedBillId(null)}
        onPay={(bill) => {
          setSelectedBillId(null);
          setPaymentModalItem({ type: 'bill', bill });
        }}
      />

      {/* Pop-up Payment Modal Window */}
      <PaymentModal
        isOpen={paymentModalItem !== null}
        item={paymentModalItem}
        onClose={() => setPaymentModalItem(null)}
        onSuccess={handlePaymentSuccess}
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

