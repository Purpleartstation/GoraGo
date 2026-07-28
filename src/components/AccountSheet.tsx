import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../db';
import type { AccountType } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';

const PALETTE = [
  '#1e40af', // Blue 800
  '#991b1b', // Red 800
  '#166534', // Green 800
  '#9d174d', // Pink 800
  '#5b21b6', // Purple 800
  '#b45309', // Amber 800
  '#065f46', // Emerald 800
  '#115e59', // Teal 800
  '#3730a3', // Indigo 800
];

interface AccountSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountSheet({ isOpen, onClose }: AccountSheetProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('bank');
  const [institution, setInstitution] = useState('');
  const [balance, setBalance] = useState('');
  const [selectedColor, setSelectedColor] = useState(PALETTE[0]);

  const handleSave = async () => {
    if (!name || !institution || !balance) return;
    const numBalance = parseFloat(balance);
    if (isNaN(numBalance)) return;

    const accountId = `acc_${Date.now()}`;
    await setDoc(doc(db, 'accounts', accountId), {
      id: accountId,
      householdId: currentHouseholdId,
      ownerId: currentUserId, // Default to user-owned, could be shared if type is cash
      name,
      type,
      institution,
      balance: numBalance,
      color: selectedColor,
      icon: type === 'bank' ? 'landmark' : type === 'ewallet' ? 'smartphone' : 'wallet'
    });

    onClose();
    setName('');
    setType('bank');
    setInstitution('');
    setBalance('');
    setSelectedColor(PALETTE[0]);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Add New Account">
      <div className="space-y-5">
        {/* Account Name */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Account Name</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="e.g. My Maya, BDO Payroll, Cash Wallet"
          />
        </div>

        {/* Account Type */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Account Type</label>
          <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl ring-1 ring-white/5">
            {([
              { id: 'bank', label: 'Bank' },
              { id: 'ewallet', label: 'E-Wallet' },
              { id: 'cash', label: 'Cash' }
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex-1 py-2.5 text-sm font-bold rounded-xl capitalize transition-all duration-300 ${
                  type === t.id 
                    ? 'bg-zinc-800 shadow-md text-zinc-100 ring-1 ring-white/10' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Institution / Brand */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Financial Institution</label>
          <input 
            type="text" 
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="e.g. BDO, GCash, UnionBank, Cash"
          />
        </div>

        {/* Initial Balance */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Initial Balance (₱)</label>
          <input 
            type="number" 
            step="any"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="0.00"
          />
        </div>

        {/* Color Palette */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Theme Color</label>
          <div className="flex flex-wrap gap-2 justify-between">
            {PALETTE.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                className={`w-10 h-10 rounded-full border-2 transition-all ${
                  selectedColor === color ? 'border-zinc-100 scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'border-transparent'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Save Button */}
        <button 
          onClick={handleSave}
          disabled={!name || !institution || !balance}
          className="w-full h-14 bg-zinc-100 text-zinc-950 rounded-2xl font-black tracking-wide text-lg disabled:opacity-30 disabled:active:scale-100 active:scale-[0.98] transition-all mt-4"
        >
          Create Account
        </button>
      </div>
    </BottomSheet>
  );
}
