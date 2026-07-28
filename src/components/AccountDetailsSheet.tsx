import { useState, useMemo } from 'react';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db, collections } from '../db';
import type { Account, Transaction, Category } from '../db';
import BottomSheet from './BottomSheet';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, Landmark, Smartphone, Wallet, ArrowRightLeft } from 'lucide-react';
import TransactionDetailsSheet from './TransactionDetailsSheet';

interface AccountDetailsSheetProps {
  accountId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountDetailsSheet({ accountId, isOpen, onClose }: AccountDetailsSheetProps) {
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  const [account] = useDocumentData<Account>(
    accountId ? doc(collections.accounts, accountId) : null
  );

  const [allTransactions] = useCollectionData<Transaction>(
    accountId ? query(collections.transactions, where('accountId', '==', accountId)) : null
  );

  const transactions = useMemo(() => {
    if (!allTransactions) return [];
    return [...allTransactions].sort((a, b) => b.date - a.date);
  }, [allTransactions]);

  const [categories] = useCollectionData<Category>(collections.categories);
  const getCategory = (id?: string) => categories?.find(c => c.id === id);

  const handleDelete = async () => {
    if (!accountId || !account) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete the account "${account.name}"? This will also delete all associated transactions.`);
    if (!confirmDelete) return;

    // Delete associated transactions & account in a batch
    const txQuery = query(collections.transactions, where('accountId', '==', accountId));
    const txSnap = await getDocs(txQuery);
    const batch = writeBatch(db);
    txSnap.forEach((d) => {
      batch.delete(d.ref);
    });
    batch.delete(doc(db, 'accounts', accountId));
    await batch.commit();
    onClose();
  };

  const getIcon = (type?: string) => {
    const props = { size: 24, className: "text-white" };
    switch (type) {
      case 'bank': return <Landmark {...props} />;
      case 'ewallet': return <Smartphone {...props} />;
      default: return <Wallet {...props} />;
    }
  };

  if (!account) return null;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Account Details">
      <div className="space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar pb-6">
        {/* Account Summary Header */}
        <div className="p-6 rounded-3xl text-white relative overflow-hidden shadow-lg ring-1 ring-white/10" style={{ backgroundColor: account.color }}>
          <div className="absolute -right-4 -top-4 w-32 h-32 bg-white rounded-full opacity-5 blur-2xl"></div>
          <div className="flex justify-between items-start mb-5">
            <div>
              <p className="text-[11px] opacity-70 font-black uppercase tracking-widest">{account.institution}</p>
              <h3 className="text-2xl font-black mt-1 tracking-tight">{account.name}</h3>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
              {getIcon(account.type)}
            </div>
          </div>
          <div>
            <p className="text-[11px] opacity-70 font-black uppercase tracking-widest">Current Balance</p>
            <p className="text-3xl font-black tracking-tight mt-1 tabular-nums">
              <span className="opacity-50 mr-1 text-2xl">₱</span>
              {account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            className="flex-1 py-3.5 border border-rose-500/30 hover:bg-rose-500/10 text-rose-400 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
          >
            <Trash2 size={16} />
            Delete Account
          </button>
        </div>

        {/* Transactions List */}
        <div>
          <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-widest pl-1 mb-2">
            Recent Transactions
          </h4>
          <div className="bg-zinc-900/60 rounded-2xl border border-white/5 divide-y divide-white/5">
            {transactions && transactions.length > 0 ? (
              transactions.map((tx) => {
                const cat = getCategory(tx.categoryId);
                const isIncome = tx.type === 'income';
                const isTransfer = tx.type === 'transfer';
                // For transfers: note ending in "(In)" means money came in
                const isTransferIn = isTransfer && tx.note?.endsWith('(In)');

                const amountColor = isTransfer
                  ? (isTransferIn ? 'text-blue-400' : 'text-zinc-400')
                  : (isIncome ? 'text-emerald-400' : 'text-zinc-200');

                const amountPrefix = isTransfer
                  ? (isTransferIn ? '↓ +' : '↑ -')
                  : (isIncome ? '+' : '-');

                const cleanNote = tx.note?.replace(/\s*\((In|Out)\)$/i, '') || cat?.name || 'Transaction';

                return (
                  <div 
                    key={tx.id} 
                    onClick={() => setSelectedTxId(tx.id)}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-zinc-800/40 active:scale-[0.99] transition-all duration-150 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-bold text-sm"
                        style={{
                          backgroundColor: isTransfer ? '#1e40af20' : (cat?.color ? `${cat.color}20` : '#27272a'),
                          color: isTransfer ? '#60a5fa' : (cat?.color || '#71717a')
                        }}
                      >
                        {isTransfer ? <ArrowRightLeft size={16} /> : (cat?.name ? cat.name.charAt(0) : 'T')}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-zinc-100 truncate">{cleanNote}</p>
                        <p className="text-xs text-zinc-500 font-medium">
                          {formatDistanceToNow(tx.date, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <p className={`font-black text-sm shrink-0 whitespace-nowrap tabular-nums ${amountColor}`}>
                      {amountPrefix}₱ {tx.amount.toLocaleString()}
                    </p>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                No transactions recorded for this account.
              </div>
            )}
          </div>
        </div>
      </div>
      
      <TransactionDetailsSheet 
        transactionId={selectedTxId}
        isOpen={selectedTxId !== null}
        onClose={() => setSelectedTxId(null)}
      />
    </BottomSheet>
  );
}
