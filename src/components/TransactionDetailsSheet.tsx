import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc } from 'firebase/firestore';
import { collections } from '../db';
import type { Transaction, Account, Category } from '../db';
import BottomSheet from './BottomSheet';
import { format } from 'date-fns';
import { ArrowRightLeft, Calendar, Tag, CreditCard, FileText } from 'lucide-react';

interface TransactionDetailsSheetProps {
  transactionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionDetailsSheet({ transactionId, isOpen, onClose }: TransactionDetailsSheetProps) {
  // Fetch transaction
  const [transaction] = useDocumentData<Transaction>(
    transactionId ? doc(collections.transactions, transactionId) : null
  );

  // Fetch accounts and categories
  const [accounts] = useCollectionData<Account>(collections.accounts);
  const [categories] = useCollectionData<Category>(collections.categories);

  if (!transaction) return null;

  const isTransfer = transaction.type === 'transfer';
  const isIncome = transaction.type === 'income';

  // Clean note (strip " (In)" / " (Out)")
  const cleanNote = transaction.note?.replace(/\s*\((In|Out)\)$/i, '') || 'Transaction';

  const cat = categories?.find(c => c.id === transaction.categoryId);
  const primaryAccount = accounts?.find(a => a.id === transaction.accountId);
  const targetAccount = isTransfer && transaction.targetAccountId 
    ? accounts?.find(a => a.id === transaction.targetAccountId)
    : null;

  // Determine source and destination for transfers
  // If transaction ID ends with '_in', then the current account (transaction.accountId) is the destination (To)
  // and targetAccount is the source (From). Otherwise, it's vice versa.
  const isTransferIn = isTransfer && transaction.id.endsWith('_in');
  const fromAccount = isTransfer
    ? (isTransferIn ? targetAccount : primaryAccount)
    : null;
  const toAccount = isTransfer
    ? (isTransferIn ? primaryAccount : targetAccount)
    : null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Transaction Details">
      <div className="space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar pb-6">
        
        {/* Amount Badge Header */}
        <div className="text-center py-6 bg-zinc-900/40 rounded-3xl border border-white/5 relative overflow-hidden">
          <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Amount</p>
          <h3 className={`text-3xl font-black tracking-tight tabular-nums ${
            isTransfer 
              ? 'text-zinc-100' 
              : isIncome ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            <span>{isTransfer ? '⇄ ' : isIncome ? '+ ' : '- '}</span>
            ₱ {transaction.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h3>
        </div>

        {/* Info Grid */}
        <div className="bg-zinc-900/60 rounded-2xl border border-white/5 divide-y divide-white/5">
          {/* Note / Description */}
          <div className="p-4 flex items-start gap-3">
            <FileText size={18} className="text-zinc-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Description</p>
              <p className="text-sm font-bold text-zinc-200">{cleanNote}</p>
            </div>
          </div>

          {/* Type / Category */}
          <div className="p-4 flex items-start gap-3">
            <Tag size={18} className="text-zinc-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1">Category & Type</p>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  isTransfer 
                    ? 'bg-zinc-800 text-zinc-300' 
                    : isIncome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {transaction.type}
                </span>
                {cat && (
                  <span 
                    className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                  >
                    {cat.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Accounts Involved */}
          <div className="p-4 flex items-start gap-3">
            <CreditCard size={18} className="text-zinc-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Account</p>
              
              {isTransfer ? (
                /* Transfer Flow rendering */
                <div className="flex items-center gap-3 bg-zinc-950 p-3 rounded-xl ring-1 ring-white/5 mt-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">From</p>
                    <p className="text-xs font-black text-zinc-300 truncate">{fromAccount?.name || 'Unknown'}</p>
                  </div>
                  <ArrowRightLeft size={14} className="text-zinc-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">To</p>
                    <p className="text-xs font-black text-zinc-300 truncate">{toAccount?.name || 'Unknown'}</p>
                  </div>
                </div>
              ) : (
                /* Standard account rendering */
                <div className="flex items-center gap-2 bg-zinc-950 p-2.5 rounded-xl ring-1 ring-white/5 mt-1 inline-flex">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: primaryAccount?.color || '#52525b' }} />
                  <span className="text-xs font-black text-zinc-300 pr-1">{primaryAccount?.name || 'Unknown'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Date */}
          <div className="p-4 flex items-start gap-3">
            <Calendar size={18} className="text-zinc-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Date & Time</p>
              <p className="text-sm font-bold text-zinc-200">
                {format(transaction.date, 'PPPP p')}
              </p>
            </div>
          </div>
        </div>

      </div>
    </BottomSheet>
  );
}
