import { useState, useMemo } from 'react';
import BottomSheet from './BottomSheet';
import { useSafeCollectionData, saveTransfer, saveTransaction } from '../db';
import type { Account, Category, User } from '../db';
import { useAppStore } from '../store';
import { ShieldAlert, ArrowUpRight, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import EmergencyFundAIImpactModal from './EmergencyFundAIImpactModal';
import SecurityPinModal from './SecurityPinModal';
import { triggerHaptic } from '../utils/haptics';
import { playSound } from '../utils/soundFX';

interface EmergencyFundWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  emergencyFundAccount: Account;
  user?: User;
  onSuccess?: () => void;
}

export default function EmergencyFundWithdrawModal({
  isOpen,
  onClose,
  emergencyFundAccount,
  user,
  onSuccess
}: EmergencyFundWithdrawModalProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const [allAccounts] = useSafeCollectionData<Account>(null, 'accounts');
  const [allCategories] = useSafeCollectionData<Category>(null, 'categories');

  const [amount, setAmount] = useState('');
  const [withdrawType, setWithdrawType] = useState<'transfer' | 'expense'>('transfer');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Flow states
  const [isImpactModalOpen, setIsImpactModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Eligible destination accounts (excluding Emergency Fund)
  const targetAccounts = useMemo(() => {
    if (!allAccounts) return [];
    return allAccounts.filter(
      (a) => a.id !== emergencyFundAccount.id && (!a.isSystemDefault || a.id !== 'acc_system_ef')
    );
  }, [allAccounts, emergencyFundAccount.id]);

  const selectedDestination = useMemo(() => {
    return targetAccounts.find((a) => a.id === toAccountId) || targetAccounts[0];
  }, [targetAccounts, toAccountId]);

  const expenseCategories = useMemo(() => {
    if (!allCategories) return [];
    return allCategories.filter((c) => c.type === 'expense');
  }, [allCategories]);

  const selectedCategory = useMemo(() => {
    return expenseCategories.find((c) => c.id === categoryId) || expenseCategories[0];
  }, [expenseCategories, categoryId]);

  const numAmount = parseFloat(amount) || 0;
  const isExceeding = numAmount > emergencyFundAccount.balance;
  const isValid = numAmount > 0 && !isExceeding;

  const quickAmounts = [
    500,
    1000,
    2000,
    Math.min(5000, Math.floor(emergencyFundAccount.balance)),
    Math.floor(emergencyFundAccount.balance)
  ].filter((v, idx, arr) => v > 0 && v <= emergencyFundAccount.balance && arr.indexOf(v) === idx);

  const handleKeypad = (val: string) => {
    if (val === 'backspace') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (val === '.' && amount.includes('.')) {
      return;
    } else {
      setAmount((prev) => prev + val);
    }
  };

  const handleReviewImpact = () => {
    if (!isValid) return;
    setIsImpactModalOpen(true);
  };

  const handleProceedToPin = () => {
    setIsImpactModalOpen(false);
    setIsPinModalOpen(true);
  };

  const handlePinSuccess = async () => {
    setIsPinModalOpen(false);
    setIsSubmitting(true);

    try {
      const hid = currentHouseholdId || 'h_sample';

      if (withdrawType === 'transfer' && selectedDestination) {
        const transferNote = note.trim() || `Withdrawal to ${selectedDestination.name}`;
        await saveTransfer(
          emergencyFundAccount.id,
          selectedDestination.id,
          numAmount,
          transferNote,
          hid
        );
      } else {
        const finalCatId = selectedCategory?.id || 'cat_emergency';
        const expenseNote = note.trim() || 'Emergency Fund Expense';
        await saveTransaction({
          id: `tx_ef_${Date.now()}`,
          accountId: emergencyFundAccount.id,
          categoryId: finalCatId,
          amount: numAmount,
          type: 'expense',
          note: expenseNote,
          date: Date.now(),
          householdId: hid
        });
      }

      setSuccessMessage(`Authorized & logged ₱${numAmount.toLocaleString()} withdrawal from Safety Net!`);
      triggerHaptic('success');
      playSound('success');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccessMessage('');
        setIsSubmitting(false);
        setAmount('');
        setNote('');
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to process emergency fund withdrawal:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <BottomSheet isOpen={isOpen && !isImpactModalOpen && !isPinModalOpen} onClose={onClose} title="Withdraw from Safety Net">
        <div className="space-y-5 py-1">
          {/* Header Badge */}
          <div className="flex items-center gap-3 p-3.5 bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 rounded-2xl">
            <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center text-white shadow-md shrink-0">
              <ShieldAlert size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-400">
                Safety Net Withdrawal
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Current Reserve: <span className="font-bold tabular-nums">₱{emergencyFundAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </p>
            </div>
          </div>

          {/* Amount Display */}
          <div className="text-center py-2">
            <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">
              Withdrawal Amount
            </p>
            <div className="text-4xl sm:text-5xl font-black tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
              <span className="text-2xl sm:text-3xl mr-1 opacity-70">₱</span>
              {amount || '0'}
            </div>
          </div>

          {/* Quick Amount Chips */}
          {quickAmounts.length > 0 && (
            <div className="flex gap-2 justify-center flex-wrap">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    amount === String(q)
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-black/5 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-zinc-700'
                  }`}
                >
                  {q === emergencyFundAccount.balance ? 'All ₱' + q.toLocaleString() : '₱' + q.toLocaleString()}
                </button>
              ))}
            </div>
          )}

          {/* Withdrawal Mode Toggle */}
          <div className="flex rounded-2xl bg-black/5 dark:bg-zinc-800 p-1">
            <button
              type="button"
              onClick={() => setWithdrawType('transfer')}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                withdrawType === 'transfer'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Transfer to Account
            </button>
            <button
              type="button"
              onClick={() => setWithdrawType('expense')}
              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                withdrawType === 'expense'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Emergency Expense
            </button>
          </div>

          {/* Destination Account Selection */}
          {withdrawType === 'transfer' ? (
            <div>
              <label className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">
                Transfer To (Destination Account) *
              </label>
              <div className="relative">
                <select
                  value={selectedDestination?.id || ''}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/10 rounded-2xl p-3.5 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm appearance-none cursor-pointer pr-10"
                >
                  {targetAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.institution}) — ₱{acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 dark:text-zinc-400">
                  <ArrowUpRight size={18} />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5 block">
                Expense Category
              </label>
              <select
                value={selectedCategory?.id || ''}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/10 rounded-2xl p-3.5 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm cursor-pointer"
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reason / Memo Input */}
          <div>
            <label className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
              Emergency Purpose / Note
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Hospital bill, Emergency car repair"
              className="w-full bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/10 rounded-2xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-sm"
            />
          </div>

          {/* Validation Warning */}
          {isExceeding && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-2 text-xs font-bold">
              <AlertCircle size={16} className="shrink-0" />
              <span>Amount exceeds available Safety Net balance (₱{emergencyFundAccount.balance.toLocaleString()}).</span>
            </div>
          )}

          {/* Success message */}
          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center gap-2 text-xs font-bold">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeypad(key)}
                className="h-11 rounded-xl bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-700 active:scale-95 font-bold text-base text-zinc-900 dark:text-zinc-100 shadow-xs border border-black/5 dark:border-white/5 transition-all flex items-center justify-center"
              >
                {key === 'backspace' ? '⌫' : key}
              </button>
            ))}
          </div>

          {/* Next Button: Review Financial Impact */}
          <button
            type="button"
            onClick={handleReviewImpact}
            disabled={!isValid || isSubmitting}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 disabled:opacity-50 text-white font-black text-base transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Sparkles size={18} />
            <span>Review Impact with Gora AI</span>
          </button>
        </div>
      </BottomSheet>

      {/* Gora AI Impact Modal */}
      <EmergencyFundAIImpactModal
        isOpen={isImpactModalOpen}
        onClose={() => setIsImpactModalOpen(false)}
        withdrawAmount={numAmount}
        currentBalance={emergencyFundAccount.balance}
        destinationType={withdrawType}
        destinationName={withdrawType === 'transfer' ? selectedDestination?.name : selectedCategory?.name}
        note={note}
        onProceedToPin={handleProceedToPin}
      />

      {/* PIN Verification Handshake */}
      <SecurityPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        expectedPin={user?.emergencyFundPin || user?.pin}
        title="Safety Net PIN Verification"
        subtitle={`Authorize withdrawal of ₱${numAmount.toLocaleString()} from Emergency Fund`}
        onSuccess={handlePinSuccess}
      />
    </>
  );
}
