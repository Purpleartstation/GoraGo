import { useState } from 'react';
import { useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, getDoc, updateDoc, setDoc, query, where } from 'firebase/firestore';
import { db, collections } from '../db';
import type { Bill, Debt, Account } from '../db';
import { formatDistanceToNow, isPast } from 'date-fns';
import { useAppStore } from '../store';
import DebtDetailsSheet from '../components/DebtDetailsSheet';
import BillDetailsSheet from '../components/BillDetailsSheet';
import ConfirmModal from '../components/ConfirmModal';

export default function BillsDebts() {
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
    <div className="p-4 space-y-6 pb-24 h-full overflow-y-auto no-scrollbar">
      <header className="pt-1">
        <p className="text-[11px] font-black text-zinc-600 uppercase tracking-[0.15em] mb-0.5">Obligations</p>
        <h1 className="text-2xl font-black text-zinc-100 tracking-tight">Bills & Loans</h1>
      </header>

      {/* Segmented Control */}
      <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl ring-1 ring-white/5">
        <button
          onClick={() => setActiveTab('bills')}
          className={`flex-1 py-2 text-sm font-bold rounded-xl capitalize transition-all duration-300 ${
            activeTab === 'bills' 
              ? 'bg-zinc-800 shadow-md text-zinc-100 ring-1 ring-white/10' 
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Bills
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`flex-1 py-2 text-sm font-bold rounded-xl capitalize transition-all duration-300 ${
            activeTab === 'loans' 
              ? 'bg-zinc-800 shadow-md text-zinc-100 ring-1 ring-white/10' 
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Loans
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'bills' && bills?.map(bill => {
          const isPaid = bill.status === 'paid';
          const isMonthly = !bill.dueType || bill.dueType === 'monthly';

          let dueLabel = '';
          if (isPaid) {
            dueLabel = 'Paid this cycle';
          } else if (isMonthly) {
            const due = new Date();
            due.setDate(bill.dueDay);
            if (isPast(due) && due.getDate() !== new Date().getDate()) {
              due.setMonth(due.getMonth() + 1);
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
              className="p-4 bg-zinc-900/60 rounded-2xl ring-1 ring-white/5 relative overflow-hidden active:scale-[0.99] transition-all duration-150 cursor-pointer"
            >
              <div className="flex items-start justify-between relative z-10">
                <div className="flex-1 mr-2 min-w-0">
                  <p className="font-bold text-zinc-100 text-base leading-tight truncate">{bill.name}</p>
                  <p className={`text-xs font-bold mt-0.5 truncate ${
                    isPaid ? 'text-emerald-500' : bill.status === 'overdue' ? 'text-rose-500' : 'text-zinc-400'
                  }`}>
                    {dueLabel}
                  </p>
                  <p className={`text-[10px] font-bold mt-1.5 uppercase tracking-wider ${
                    isMonthly ? 'text-amber-500/70' : 'text-indigo-500/70'
                  }`}>
                    {recurrenceLabel}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-lg text-zinc-100 tabular-nums">
                    <span className="text-[10px] font-bold opacity-60 mr-0.5">₱</span>
                    {bill.amount.toLocaleString()}
                  </p>
                  {!isPaid ? (
                    <button
                      onClick={e => { e.stopPropagation(); handlePayBill(bill.id); }}
                      className="text-[10px] uppercase tracking-wider font-black text-zinc-900 bg-zinc-200 px-3 py-1.5 rounded-full mt-2 active:scale-95 transition-transform"
                    >
                      Pay Now
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full mt-2 inline-block">
                      Paid
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {activeTab === 'bills' && bills?.length === 0 && (
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/30 rounded-[2rem] ring-1 ring-white/5 border-dashed border-zinc-800">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-800/50 flex items-center justify-center ring-1 ring-white/5">
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
              className="p-4 bg-zinc-900/60 rounded-2xl ring-1 ring-white/5 space-y-3 active:scale-[0.99] transition-all duration-150 cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 mr-2">
                  <p className="font-bold text-zinc-100 text-base truncate">{debt.name}</p>
                  <p className="text-[11px] font-bold text-zinc-500 mt-0.5 truncate">LENDER <span className="text-zinc-300">{debt.lender}</span></p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-lg text-zinc-100 tabular-nums">
                    <span className="text-[10px] font-bold opacity-60 mr-0.5">₱</span>
                    {debt.remainingBalance.toLocaleString()}
                  </p>
                  {debt.remainingBalance > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePayLoan(debt.id);
                      }}
                      className="text-[10px] uppercase tracking-wider font-black text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-full mt-2 active:scale-95 transition-transform"
                    >
                      Pay ₱{Math.min(debt.installmentAmount, debt.remainingBalance).toLocaleString()}
                    </button>
                  )}
                </div>
              </div>
              
              {/* Progress Bar */}
              <div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden mb-1.5">
                  <div 
                    className="h-full bg-indigo-500 rounded-full" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[10px] font-bold text-zinc-500 text-right tracking-wider">
                  <span className="text-zinc-300">{progress.toFixed(0)}%</span> PAID
                </p>
              </div>
            </div>
          );
        })}

        {activeTab === 'loans' && debts?.length === 0 && (
          <div className="p-10 flex flex-col items-center justify-center text-zinc-500 bg-zinc-900/30 rounded-[2rem] ring-1 ring-white/5 border-dashed border-zinc-800">
            <div className="w-16 h-16 mb-4 rounded-full bg-zinc-800/50 flex items-center justify-center ring-1 ring-white/5">
              <i className="lucide lucide-credit-card text-2xl text-zinc-400"></i>
            </div>
            <p className="font-bold tracking-wide">No loans added yet.</p>
          </div>
        )}
      </div>

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
