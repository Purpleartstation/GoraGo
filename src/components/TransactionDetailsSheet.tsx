import { useState } from 'react';
import { useSafeDocumentData, useSafeCollectionData, saveTransaction, saveCategory } from '../db';
import type { Transaction, Account, Category, GroceryList } from '../db';
import BottomSheet from './BottomSheet';
import { format } from 'date-fns';
import { ArrowRightLeft, Calendar, Tag, CreditCard, FileText, ShoppingCart, CheckCircle2, Store, Edit2, Check } from 'lucide-react';

interface TransactionDetailsSheetProps {
  transactionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function TransactionDetailsSheet({ transactionId, isOpen, onClose }: TransactionDetailsSheetProps) {
  // Fetch transaction
  const [transaction] = useSafeDocumentData<Transaction>(null, 'transactions', transactionId);

  // Fetch accounts, categories, and grocery lists
  const [accounts] = useSafeCollectionData<Account>(null, 'accounts');
  const [categories] = useSafeCollectionData<Category>(null, 'categories');
  const [groceryLists] = useSafeCollectionData<GroceryList>(null, 'groceryLists');

  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isUpdatingCategory, setIsUpdatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

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

  const handleSelectCategory = async (catId: string) => {
    if (!transaction || isUpdatingCategory) return;
    setIsUpdatingCategory(true);
    try {
      await saveTransaction({
        ...transaction,
        categoryId: catId
      });
      setIsEditingCategory(false);
    } catch (err) {
      console.error('Failed to update transaction category:', err);
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  const handleCreateAndAssignCategory = async () => {
    if (!transaction || !newCategoryName.trim() || isUpdatingCategory) return;
    setIsUpdatingCategory(true);
    try {
      const name = newCategoryName.trim();
      const hid = transaction.householdId || 'h_sample';
      const catId = `cat_${Date.now()}`;
      await saveCategory({
        id: catId,
        name,
        icon: 'tag',
        type: transaction.type || 'expense',
        color: transaction.type === 'income' ? '#10B981' : '#F59E0B',
        householdId: hid
      });
      await saveTransaction({
        ...transaction,
        categoryId: catId
      });
      setNewCategoryName('');
      setIsEditingCategory(false);
    } catch (err) {
      console.error('Failed to create and assign category:', err);
    } finally {
      setIsUpdatingCategory(false);
    }
  };

  // Find linked grocery items & details
  let displayItems = transaction.groceryItems || [];
  let displayStore = '';

  if (displayItems.length === 0 && transaction.groceryListId) {
    const listById = groceryLists?.find(l => l.id === transaction.groceryListId);
    if (listById && listById.items && listById.items.length > 0) {
      displayItems = listById.items;
      displayStore = listById.storeName || '';
    }
  }

  if (displayItems.length === 0) {
    const linkedGroceryList = groceryLists?.find(l => {
      if (l.status !== 'completed' || !l.items || l.items.length === 0) return false;
      
      const noteLower = cleanNote.toLowerCase();
      const titleLower = l.title.toLowerCase();
      const matchesTitle = noteLower.includes(titleLower) || titleLower.includes('grocery');
      
      const txTime = transaction.date || 0;
      const listTime = l.completedAt || l.createdAt || 0;
      const timeDiff = Math.abs(txTime - listTime);
      const matchesTime = timeDiff <= 300000;

      const listTotal = l.actualTotal ?? l.estimatedTotal;
      const matchesAmount = Math.abs(listTotal - transaction.amount) < 1;

      return (matchesTitle && (matchesTime || matchesAmount)) || (matchesTime && matchesAmount);
    });

    if (linkedGroceryList) {
      displayItems = linkedGroceryList.items;
      displayStore = linkedGroceryList.storeName || '';
    }
  }

  if (!displayStore) {
    const storeMatch = cleanNote.match(/\((.*?)\)/) || cleanNote.match(/(SM Supermarket|Puregold|Robinsons|S&R|Landers|Savemore|WalterMart|Local Market)/i);
    if (storeMatch && storeMatch[1]) {
      displayStore = storeMatch[1];
    }
  }

  // Calculate items subtotal sum
  const itemsSubtotalSum = displayItems.reduce((acc, it) => {
    const price = it.actualUnitPrice !== undefined ? it.actualUnitPrice : it.unitPriceEstimate;
    return acc + (price * it.quantity);
  }, 0);

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
      <div className="space-y-6">
        
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
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Category & Type</p>
                {!isTransfer && (
                  <button
                    onClick={() => setIsEditingCategory(!isEditingCategory)}
                    className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <Edit2 size={12} />
                    <span>{isEditingCategory ? 'Done' : 'Change Category'}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  isTransfer 
                    ? 'bg-zinc-800 text-zinc-300' 
                    : isIncome ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {transaction.type}
                </span>
                {cat && (
                  <span 
                    className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1"
                    style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                  >
                    {cat.name}
                  </span>
                )}
              </div>

              {/* Quick Category Selector Grid when editing */}
              {isEditingCategory && (
                <div className="mt-3 p-3 bg-zinc-950/80 border border-white/10 rounded-2xl space-y-3">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Select or Add Category:</p>
                  <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {(categories || []).filter(c => c.type === transaction.type || (!transaction.type && c.type === 'expense')).map(c => {
                      const isSelected = c.id === transaction.categoryId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCategory(c.id)}
                          className={`p-2 rounded-xl text-xs font-bold text-left flex items-center justify-between transition-all border ${
                            isSelected 
                              ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' 
                              : 'bg-zinc-900 border-white/5 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <span className="truncate pr-1">{c.name}</span>
                          {isSelected && <Check size={13} className="text-blue-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-1 border-t border-white/10 flex gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateAndAssignCategory();
                        }
                      }}
                      placeholder="Type new category name..."
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold placeholder:font-normal placeholder:text-zinc-600"
                    />
                    <button
                      type="button"
                      onClick={handleCreateAndAssignCategory}
                      disabled={!newCategoryName.trim() || isUpdatingCategory}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all shrink-0 cursor-pointer"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              )}
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

        {/* Grocery Purchase Breakdown (If linked to a grocery trip or items exist) */}
        {displayItems.length > 0 && (
          <div className="bg-purple-950/40 border border-purple-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-purple-500/20">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-500/20 text-fuchsia-400 rounded-lg">
                  <ShoppingCart size={16} />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-zinc-100">Itemized Purchase Breakdown</h4>
                  <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                    <Store size={10} className="text-purple-400" />
                    {displayStore || 'Supermarket / Store'}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 size={10} />
                {displayItems.length} Items
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {displayItems.map((it) => {
                const effectivePrice = it.actualUnitPrice ?? it.unitPriceEstimate;
                const subtotal = effectivePrice * it.quantity;

                return (
                  <div
                    key={it.id}
                    className="p-2.5 bg-zinc-950/80 border border-white/5 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-bold text-zinc-200">{it.name}</p>
                      <p className="text-[10px] text-zinc-400">
                        {it.quantity} {it.quantity > 1 ? 'units' : 'unit'} @ ₱{effectivePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-fuchsia-400 tabular-nums">
                        ₱{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {it.actualUnitPrice !== undefined && it.actualUnitPrice !== it.unitPriceEstimate && (
                        <p className="text-[9px] text-zinc-500 line-through tabular-nums">
                          ₱{(it.unitPriceEstimate * it.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center text-xs pt-1.5 text-zinc-300 font-bold border-t border-purple-500/20">
              <span>Items Total Breakdown</span>
              <span className="text-fuchsia-300 font-black tabular-nums">
                ₱{itemsSubtotalSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

      </div>
    </BottomSheet>
  );
}
