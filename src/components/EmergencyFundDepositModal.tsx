import { useState, useMemo } from 'react';
import BottomSheet from './BottomSheet';
import { useSafeCollectionData, saveTransfer } from '../db';
import type { Account } from '../db';
import { useAppStore } from '../store';
import { ShieldCheck, ArrowDownRight, Landmark, Smartphone, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { playSound } from '../utils/soundFX';

interface EmergencyFundDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  emergencyFundAccount: Account;
  onSuccess?: () => void;
}

export default function EmergencyFundDepositModal({
  isOpen,
  onClose,
  emergencyFundAccount,
  onSuccess
}: EmergencyFundDepositModalProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const [allAccounts] = useSafeCollectionData<Account>(null, 'accounts');

  const [amount, setAmount] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [note, setNote] = useState('Deposit to Safety Net');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // List all active user accounts EXCLUDING the Emergency Fund
  const sourceAccounts = useMemo(() => {
    if (!allAccounts) return [];
    return allAccounts.filter(
      (a) => a.id !== emergencyFundAccount.id && (!a.isSystemDefault || a.id !== 'acc_system_ef')
    );
  }, [allAccounts, emergencyFundAccount.id]);

  // Selected source account
  const selectedSource = useMemo(() => {
    return sourceAccounts.find((a) => a.id === fromAccountId) || sourceAccounts[0];
  }, [sourceAccounts, fromAccountId]);

  const numAmount = parseFloat(amount) || 0;
  const isInsufficient = selectedSource ? numAmount > selectedSource.balance : false;
  const isValid = numAmount > 0 && selectedSource && !isInsufficient;

  const quickAmounts = [500, 1000, 2500, 5000];

  const handleKeypad = (val: string) => {
    if (val === 'backspace') {
      setAmount((prev) => prev.slice(0, -1));
    } else if (val === '.' && amount.includes('.')) {
      return;
    } else {
      setAmount((prev) => prev + val);
    }
  };

  const handleDeposit = async () => {
    if (!isValid || !selectedSource) return;
    setIsSubmitting(true);

    try {
      const depositNote = note.trim() || `Deposit to Safety Net from ${selectedSource.name}`;
      await saveTransfer(
        selectedSource.id,
        emergencyFundAccount.id,
        numAmount,
        depositNote,
        currentHouseholdId || 'h_sample'
      );

      setSuccessMessage(`Successfully deposited ₱${numAmount.toLocaleString()} into your Safety Net!`);
      triggerHaptic('success');
      playSound('success');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        setSuccessMessage('');
        setIsSubmitting(false);
        setAmount('');
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to deposit to emergency fund:', err);
      setIsSubmitting(false);
    }
  };

  const getAccountIcon = (type?: string) => {
    const props = { size: 16, className: 'shrink-0' };
    switch (type) {
      case 'bank':
        return <Landmark {...props} />;
      case 'ewallet':
        return <Smartphone {...props} />;
      default:
        return <Wallet {...props} />;
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add Funds to Safety Net">
      <div className="space-y-5 py-1">
        {/* Header Badge */}
        <div className="flex items-center gap-3 p-3.5 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-md shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">Emergency Fund Deposit</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate">
              Current Reserve: <span className="font-bold tabular-nums">₱{emergencyFundAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </p>
          </div>
        </div>

        {/* Amount Display */}
        <div className="text-center py-2">
          <p className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Deposit Amount</p>
          <div className="text-4xl sm:text-5xl font-black tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">
            <span className="text-2xl sm:text-3xl mr-1 opacity-70">₱</span>
            {amount || '0'}
          </div>
        </div>

        {/* Quick Amount Chips */}
        <div className="flex gap-2 justify-center flex-wrap">
          {quickAmounts.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(String(q))}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                amount === String(q)
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-black/5 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-zinc-700'
              }`}
            >
              +₱{q.toLocaleString()}
            </button>
          ))}
        </div>

        {/* Transfer From Dropdown Selector (REQUIRED) */}
        <div>
          <label className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>Transfer From (Source Account) *</span>
            {selectedSource && (
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                Available: ₱{selectedSource.balance.toLocaleString()}
              </span>
            )}
          </label>

          <div className="relative">
            <select
              value={selectedSource?.id || ''}
              onChange={(e) => setFromAccountId(e.target.value)}
              className="w-full bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/10 rounded-2xl p-3.5 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm appearance-none cursor-pointer pr-10"
            >
              {sourceAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.institution}) — ₱{acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500 dark:text-zinc-400">
              <ArrowDownRight size={18} />
            </div>
          </div>

          {isInsufficient && selectedSource && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-500 font-bold">
              <AlertCircle size={14} className="shrink-0" />
              <span>Selected source account only has ₱{selectedSource.balance.toLocaleString()}. Please reduce amount.</span>
            </div>
          )}
        </div>

        {/* Note / Memo Input */}
        <div>
          <label className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1 block">
            Deposit Note
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Monthly emergency fund savings"
            className="w-full bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/10 rounded-2xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
          />
        </div>

        {/* Summary Card */}
        {selectedSource && numAmount > 0 && !isInsufficient && (
          <div className="p-3.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-2xl border border-black/5 dark:border-white/5 space-y-1 text-xs">
            <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
              <span>{selectedSource.name} after deposit:</span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200 tabular-nums">
                ₱{(selectedSource.balance - numAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-amber-700 dark:text-amber-400 font-bold">
              <span>Safety Net after deposit:</span>
              <span className="tabular-nums">
                ₱{(emergencyFundAccount.balance + numAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Success Feedback */}
        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center gap-2 text-xs font-bold">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Numeric Keypad for fast entry */}
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

        {/* Submit Button */}
        <button
          type="button"
          onClick={handleDeposit}
          disabled={!isValid || isSubmitting}
          className="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-base transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <span>Processing Deposit...</span>
          ) : (
            <>
              <ShieldCheck size={18} />
              <span>Confirm ₱{numAmount ? numAmount.toLocaleString() : '0'} Deposit</span>
            </>
          )}
        </button>
      </div>
    </BottomSheet>
  );
}
