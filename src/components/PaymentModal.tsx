import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Receipt, 
  Landmark, 
  Wallet, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { useSafeCollectionData, payBill, payDebt } from '../db';
import type { Bill, Debt, Account } from '../db';
import { useBodyScrollLock } from '../utils/scrollLock';

export interface PaymentItem {
  type: 'bill' | 'loan';
  bill?: Bill;
  debt?: Debt;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: PaymentItem | null;
  onSuccess?: (details: { type: 'bill' | 'loan'; name: string; amount: number; accountName: string; isFullyPaid?: boolean }) => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  item,
  onSuccess,
}: PaymentModalProps) {
  const [accounts] = useSafeCollectionData<Account>(null, 'accounts');

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Lock background scroll on iOS when modal is open
  useBodyScrollLock(isOpen);

  // Initialize or reset default values when modal opens or item changes
  useEffect(() => {
    if (isOpen && item) {
      let defaultAmount = 0;
      let preferredAccountId = '';

      if (item.type === 'bill' && item.bill) {
        defaultAmount = item.bill.amount;
        preferredAccountId = item.bill.accountId || '';
      } else if (item.type === 'loan' && item.debt) {
        defaultAmount = Math.min(item.debt.installmentAmount, item.debt.remainingBalance);
      }

      setAmountInput(defaultAmount > 0 ? defaultAmount.toString() : '');

      // Determine initial account: preferred account if valid, or account with highest balance
      if (accounts && accounts.length > 0) {
        const preferred = accounts.find(a => a.id === preferredAccountId);
        if (preferred) {
          setSelectedAccountId(preferred.id);
        } else {
          // Find first account with sufficient balance, or the account with maximum balance
          const capable = accounts.find(a => a.balance >= defaultAmount);
          if (capable) {
            setSelectedAccountId(capable.id);
          } else {
            const sortedByBalance = [...accounts].sort((a, b) => b.balance - a.balance);
            setSelectedAccountId(sortedByBalance[0].id);
          }
        }
      }
    }
  }, [isOpen, item, accounts]);

  // Derived values & validation
  const numAmount = useMemo(() => {
    const parsed = parseFloat(amountInput);
    return isNaN(parsed) ? 0 : parsed;
  }, [amountInput]);

  const selectedAccount = useMemo(() => {
    return accounts?.find(a => a.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  const accountBalance = selectedAccount ? selectedAccount.balance : 0;
  const isExceeded = numAmount > accountBalance;
  const deficit = Math.max(0, numAmount - accountBalance);
  const remainingAfterPayment = accountBalance - numAmount;
  const isValidAmount = numAmount > 0 && !isNaN(numAmount);
  const canProceed = isValidAmount && !isExceeded && selectedAccount !== null && !isSubmitting;

  const itemName = item?.type === 'bill' ? item.bill?.name : item?.debt?.name;
  const itemLender = item?.type === 'loan' ? item.debt?.lender : undefined;
  const isVariableBill = item?.type === 'bill' && (item.bill?.isVariableAmount || item.bill?.variableAmountFlag);
  const loanRemaining = item?.type === 'loan' ? (item.debt?.remainingBalance || 0) : 0;
  const loanInstallment = item?.type === 'loan' ? (item.debt?.installmentAmount || 0) : 0;

  const handleAmountChange = (val: string) => {
    // Only allow valid decimal numbers
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setAmountInput(val);
    }
  };

  const handleQuickAmount = (val: number) => {
    setAmountInput(val.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canProceed || !item || !selectedAccount) return;

    setIsSubmitting(true);
    try {
      if (item.type === 'bill' && item.bill) {
        const res = await payBill(item.bill.id, numAmount, selectedAccount.id);
        if (res.success) {
          onSuccess?.({
            type: 'bill',
            name: item.bill.name,
            amount: numAmount,
            accountName: selectedAccount.name,
          });
          onClose();
        } else {
          alert(res.error || 'Payment failed. Please try again.');
        }
      } else if (item.type === 'loan' && item.debt) {
        const res = await payDebt(item.debt.id, numAmount, selectedAccount.id);
        if (res.success) {
          const isFullyPaid = (item.debt.remainingBalance - numAmount) <= 0;
          onSuccess?.({
            type: 'loan',
            name: item.debt.name,
            amount: numAmount,
            accountName: selectedAccount.name,
            isFullyPaid,
          });
          onClose();
        } else {
          alert(res.error || 'Loan payment failed. Please try again.');
        }
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      alert(err?.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-md transform-gpu [backface-visibility:hidden] will-change-[opacity]"
        />

        {/* Modal Window with iOS Spring & GPU Acceleration */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={{ top: 0.04, bottom: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 90 || info.velocity.y > 450) {
              onClose();
            }
          }}
          className="relative w-full max-w-lg bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 rounded-t-[32px] sm:rounded-[36px] shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden max-h-[92dvh] sm:max-h-[850px] z-[101] transform-gpu [backface-visibility:hidden] will-change-transform touch-manipulation"
        >
          {/* Drag Handle (Mobile only) */}
          <div 
            className="w-full flex justify-center pt-3 pb-1 bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 cursor-grab active:cursor-grabbing shrink-0 sm:hidden touch-none select-none"
            aria-label="Drag down to close"
          >
            <div className="w-12 h-1.5 bg-white/40 rounded-full" />
          </div>

          {/* Top Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 text-white flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md shrink-0 shadow-inner">
                {item.type === 'bill' ? (
                  <Receipt size={22} className="text-white" />
                ) : (
                  <Landmark size={22} className="text-white" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20">
                    {item.type === 'bill' ? 'Bill Payment' : 'Loan Payment'}
                  </span>
                  {isVariableBill && (
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">
                      Variable
                    </span>
                  )}
                </div>
                <h3 className="font-black text-base sm:text-lg tracking-tight truncate mt-0.5">
                  Pay {itemName}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 bg-white/10 hover:bg-white/20 active:scale-90 rounded-full flex items-center justify-center transition-transform shrink-0 cursor-pointer touch-manipulation will-change-transform"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Body */}
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto no-scrollbar space-y-6 flex-1 -webkit-overflow-scrolling-touch overscroll-y-contain pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
            
            {/* Obligation Info Card */}
            <div className="p-4 bg-zinc-100 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                  {item.type === 'bill' ? 'Billed To' : `Lender / Provider`}
                </p>
                <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                  {itemName} {itemLender ? `(${itemLender})` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                  {item.type === 'bill' ? 'Regular Due' : 'Remaining Balance'}
                </p>
                <p className="font-black text-base text-zinc-900 dark:text-zinc-100 tabular-nums">
                  ₱{item.type === 'bill' ? item.bill?.amount.toLocaleString() : loanRemaining.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 1. Account Selector ("Where does this account get the money?") */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={15} className="text-purple-600 dark:text-fuchsia-400" />
                  <span>1. Where does the money come from?</span>
                </label>
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                  Select payment source
                </span>
              </div>

              {/* Account Selection Cards */}
              <div className="space-y-2">
                {(!accounts || accounts.length === 0) ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>No accounts found. Please add an account with balance first.</span>
                  </div>
                ) : (
                  <>
                    {(showAllAccounts ? accounts : accounts.slice(0, 4)).map(acc => {
                      const isSelected = selectedAccountId === acc.id;
                      const isInsufficientForAmount = numAmount > 0 && acc.balance < numAmount;

                      return (
                        <div
                          key={acc.id}
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-purple-500/10 dark:bg-purple-500/15 border-purple-500 ring-2 ring-purple-500/30'
                              : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div 
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm"
                              style={{ backgroundColor: acc.color || '#8b5cf6' }}
                            >
                              {acc.institution?.substring(0, 2).toUpperCase() || 'AC'}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                {acc.name}
                              </p>
                              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize truncate">
                                {acc.institution || acc.type}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-3">
                            <div>
                              <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                Balance
                              </p>
                              <p className={`text-sm font-black tabular-nums ${
                                isInsufficientForAmount && isSelected
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-zinc-900 dark:text-zinc-100'
                              }`}>
                                ₱{acc.balance.toLocaleString()}
                              </p>
                            </div>

                            <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                              isSelected
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'border-zinc-300 dark:border-zinc-700 bg-transparent'
                            }`}>
                              {isSelected && <CheckCircle2 size={16} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {accounts.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllAccounts(!showAllAccounts)}
                        className="w-full py-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline text-center cursor-pointer"
                      >
                        {showAllAccounts ? 'Show fewer accounts' : `Show all ${accounts.length} accounts`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 2. Amount Input ("can input numbers how much") */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-zinc-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={15} className="text-purple-600 dark:text-fuchsia-400" />
                  <span>2. How much to pay?</span>
                </label>
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                  PHP currency
                </span>
              </div>

              {/* Main Number Input Field */}
              <div className={`relative flex items-center bg-zinc-50 dark:bg-zinc-900 border rounded-2xl px-4 py-3 transition-all ${
                isExceeded
                  ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-500/5'
                  : 'border-zinc-300 dark:border-zinc-700 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20'
              }`}>
                <span className="text-xl sm:text-2xl font-black text-purple-600 dark:text-fuchsia-400 mr-2 select-none">
                  ₱
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full bg-transparent text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none tabular-nums"
                />
                {amountInput && (
                  <button
                    type="button"
                    onClick={() => setAmountInput('')}
                    className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer shrink-0"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Quick Fill Pills */}
              <div className="flex flex-wrap gap-2 pt-1">
                {item.type === 'bill' && item.bill && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickAmount(item.bill!.amount)}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs font-black transition-all active:scale-95 cursor-pointer"
                    >
                      Exact Due (₱{item.bill.amount.toLocaleString()})
                    </button>
                    {isVariableBill && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleQuickAmount(1000)}
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-xs font-bold transition-all cursor-pointer"
                        >
                          ₱1,000
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAmount(2500)}
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-xs font-bold transition-all cursor-pointer"
                        >
                          ₱2,500
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAmount(5000)}
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-xs font-bold transition-all cursor-pointer"
                        >
                          ₱5,000
                        </button>
                      </>
                    )}
                  </>
                )}

                {item.type === 'loan' && item.debt && (
                  <>
                    {loanInstallment > 0 && (
                      <button
                        type="button"
                        onClick={() => handleQuickAmount(Math.min(loanInstallment, loanRemaining))}
                        className="px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs font-black transition-all active:scale-95 cursor-pointer"
                      >
                        Installment (₱{Math.min(loanInstallment, loanRemaining).toLocaleString()})
                      </button>
                    )}
                    {loanRemaining > 0 && (
                      <button
                        type="button"
                        onClick={() => handleQuickAmount(loanRemaining)}
                        className="px-3 py-1.5 rounded-xl bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/20 text-xs font-black transition-all active:scale-95 cursor-pointer"
                      >
                        Pay in Full (₱{loanRemaining.toLocaleString()})
                      </button>
                    )}
                    {loanRemaining > loanInstallment && (
                      <button
                        type="button"
                        onClick={() => handleQuickAmount(Math.round(loanInstallment * 2))}
                        className="px-2.5 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-xs font-bold transition-all cursor-pointer"
                      >
                        2× Installment (₱{(loanInstallment * 2).toLocaleString()})
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 3. Real-Time Account Balance & Exceeded Validation ("when the number exceed the account balance it wont go through the payment") */}
            {selectedAccount && isValidAmount && (
              <div className="space-y-3">
                {/* Live calculation balance bar */}
                <div className={`p-4 rounded-2xl border transition-all ${
                  isExceeded
                    ? 'bg-rose-500/10 border-rose-500/30'
                    : 'bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800'
                }`}>
                  <div className="flex items-center justify-between text-xs font-bold pb-2 border-b border-black/5 dark:border-white/5">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {selectedAccount.name} Available Balance:
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-100 tabular-nums">
                      ₱{accountBalance.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold py-2 border-b border-black/5 dark:border-white/5">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      Payment Amount:
                    </span>
                    <span className="text-purple-600 dark:text-fuchsia-400 tabular-nums font-black">
                      - ₱{numAmount.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-black pt-2">
                    <span className={isExceeded ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-300'}>
                      {isExceeded ? 'Shortage / Deficit:' : 'Remaining Account Balance:'}
                    </span>
                    <span className={`tabular-nums text-sm ${
                      isExceeded ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {isExceeded ? `- ₱${deficit.toLocaleString()}` : `₱${remainingAfterPayment.toLocaleString()}`}
                    </span>
                  </div>
                </div>

                {/* Exceeded Balance Warning Banner */}
                {isExceeded && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-rose-500/15 border border-rose-500/40 rounded-2xl flex items-start gap-3 text-rose-700 dark:text-rose-300"
                  >
                    <ShieldAlert size={20} className="text-rose-500 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <p className="font-black text-rose-800 dark:text-rose-200">
                        Insufficient Funds — Payment Blocked
                      </p>
                      <p className="font-medium text-rose-700 dark:text-rose-300 leading-relaxed">
                        The entered amount of <strong>₱{numAmount.toLocaleString()}</strong> exceeds the available balance of <strong>{selectedAccount.name}</strong> (₱{accountBalance.toLocaleString()}) by <strong>₱{deficit.toLocaleString()}</strong>.
                      </p>
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold pt-0.5">
                        Please lower the payment amount or select a different account with sufficient funds.
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* Bottom Action Buttons */}
            <div className="pt-3 flex gap-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-black text-sm rounded-2xl transition-all cursor-pointer touch-manipulation will-change-transform active:scale-[0.96]"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!canProceed}
                className={`flex-[2] py-3.5 px-4 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg touch-manipulation will-change-transform ${
                  canProceed
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white active:scale-[0.96] cursor-pointer'
                    : 'bg-zinc-300 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-500 cursor-not-allowed opacity-70 shadow-none'
                }`}
              >
                {isSubmitting ? (
                  <span>Processing Payment...</span>
                ) : isExceeded ? (
                  <span>Cannot Pay (Short ₱{deficit.toLocaleString()})</span>
                ) : !isValidAmount ? (
                  <span>Enter Payment Amount</span>
                ) : (
                  <>
                    <span>Confirm Pay ₱{numAmount.toLocaleString()}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>

          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
