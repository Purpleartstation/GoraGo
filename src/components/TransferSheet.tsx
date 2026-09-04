import { useState } from 'react';
import { useSafeCollectionData, useSafeDocumentData, saveTransfer } from '../db';
import type { Account, User } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import EmergencyFundAIImpactModal from './EmergencyFundAIImpactModal';
import SecurityPinModal from './SecurityPinModal';

interface TransferSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TransferSheet({ isOpen, onClose }: TransferSheetProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const [user] = useSafeDocumentData<User>(null, 'users', currentUserId);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');

  // Protection Handshake States
  const [isImpactModalOpen, setIsImpactModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const [accounts] = useSafeCollectionData<Account>(null, 'accounts');

  const handleKeypad = (num: string) => {
    if (num === 'backspace') setAmount(prev => prev.slice(0, -1));
    else if (num === '.' && amount.includes('.')) return;
    else setAmount(prev => prev + num);
  };

  const executeTransfer = async () => {
    const fromId = fromAccountId || (accounts && accounts.length > 0 ? accounts[0].id : '');
    const toId = toAccountId || (accounts && accounts.length > 1 ? accounts[1].id : '');
    if (!amount || !fromId || !toId || fromId === toId) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    await saveTransfer(
      fromId,
      toId,
      numAmount,
      note.trim(),
      currentHouseholdId || 'h_sample'
    );

    onClose();
    setAmount('');
    setNote('');
    setFromAccountId('');
    setToAccountId('');
  };

  const handleSave = async () => {
    const fromId = fromAccountId || (accounts && accounts.length > 0 ? accounts[0].id : '');
    const toId = toAccountId || (accounts && accounts.length > 1 ? accounts[1].id : '');
    if (!amount || !fromId || !toId || fromId === toId) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    const fromAcc = accounts?.find(a => a.id === fromId);
    const isEmergencyFund = fromAcc && (fromAcc.isSystemDefault || fromAcc.id === 'acc_system_ef');

    // If transferring out of Emergency Fund, trigger AI impact confirmation first
    if (isEmergencyFund) {
      setIsImpactModalOpen(true);
      return;
    }

    await executeTransfer();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Transfer Funds">
      <div className="space-y-6">
        {/* Amount Input */}
        <div className="text-center">
          <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2">Amount</p>
          <div className="text-5xl font-black tracking-tight text-indigo-400 tabular-nums">
            <span className="text-3xl mr-1 opacity-70">₱</span>
            {amount || '0'}
          </div>
        </div>

        {/* From Account Selection */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">From Account</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {accounts?.map(acc => (
              <button
                key={acc.id}
                onClick={() => setFromAccountId(acc.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  fromAccountId === acc.id 
                    ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/30' 
                    : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>

        {/* To Account Selection */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">To Account</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {accounts?.filter(acc => acc.id !== fromAccountId).map(acc => (
              <button
                key={acc.id}
                onClick={() => setToAccountId(acc.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  toAccountId === acc.id 
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' 
                    : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Note (Optional)</label>
          <input 
            type="text" 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="e.g. GCash Cash-in, Bank transfer"
          />
        </div>

        {/* Custom Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0, 'backspace'].map((key) => (
            <button
              key={key}
              onClick={() => handleKeypad(key.toString())}
              className="h-14 rounded-2xl bg-zinc-900/50 text-zinc-100 text-xl font-bold flex items-center justify-center active:bg-zinc-800 transition-colors ring-1 ring-white/5"
            >
              {key === 'backspace' ? '⌫' : key}
            </button>
          ))}
        </div>

        {/* Save Button */}
        <button 
          onClick={handleSave}
          disabled={!amount || !fromAccountId || !toAccountId || fromAccountId === toAccountId}
          className="w-full h-14 bg-zinc-100 text-zinc-950 rounded-2xl font-black tracking-wide text-lg disabled:opacity-30 disabled:active:scale-100 active:scale-[0.98] transition-all"
        >
          Transfer
        </button>
      </div>

      {/* Emergency Fund AI Warning Confirmation Modal */}
      {(() => {
        const fromId = fromAccountId || (accounts && accounts.length > 0 ? accounts[0].id : '');
        const toId = toAccountId || (accounts && accounts.length > 1 ? accounts[1].id : '');
        const fromAcc = accounts?.find((a) => a.id === fromId);
        const toAcc = accounts?.find((a) => a.id === toId);
        const numAmount = parseFloat(amount) || 0;

        return (
          <>
            <EmergencyFundAIImpactModal
              isOpen={isImpactModalOpen}
              onClose={() => setIsImpactModalOpen(false)}
              withdrawAmount={numAmount}
              currentBalance={fromAcc?.balance || 0}
              destinationType="transfer"
              destinationName={toAcc?.name || 'Account'}
              note={note || 'Emergency Fund Transfer'}
              onProceedToPin={() => {
                setIsImpactModalOpen(false);
                setIsPinModalOpen(true);
              }}
            />

            <SecurityPinModal
              isOpen={isPinModalOpen}
              onClose={() => setIsPinModalOpen(false)}
              expectedPin={user?.emergencyFundPin || user?.pin}
              title="Authorize Safety Net Transfer"
              subtitle={`Enter 4-digit PIN to authorize transferring ₱${numAmount.toLocaleString()} out of Safety Net`}
              onSuccess={async () => {
                setIsPinModalOpen(false);
                await executeTransfer();
              }}
            />
          </>
        );
      })()}
    </BottomSheet>
  );
}
