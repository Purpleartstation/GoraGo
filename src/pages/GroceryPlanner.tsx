import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, Plus, Trash2, Camera, CheckCircle2, Search,
  Store, Calendar, Sparkles, CreditCard, Receipt, Check,
  Clock, AlertCircle, RefreshCw, X, Tag, ArrowRight
} from 'lucide-react';
import { useSafeCollectionData, saveGroceryList, deleteGroceryList, completeGroceryList, saveGroceryItem, deleteGroceryItem } from '../db';
import type { GroceryItem, GroceryList, GroceryListItem, Account } from '../db';
import { useAppStore } from '../store';
import HelpTooltip from '../components/HelpTooltip';

function formatUpdatedDateLabel(timestamp?: number): string {
  if (!timestamp) return 'Updated recently';
  const now = new Date();
  const date = new Date(timestamp);

  const isToday =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (isToday) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Updated Today (${timeStr})`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    yesterday.getFullYear() === date.getFullYear() &&
    yesterday.getMonth() === date.getMonth() &&
    yesterday.getDate() === date.getDate();

  if (isYesterday) {
    return 'Updated Yesterday';
  }

  return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export default function GroceryPlanner() {
  const navigate = useNavigate();
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const setActiveCategoryFilter = useAppStore((state) => state.setActiveCategoryFilter);

  const [activeTab, setActiveTab] = useState<'lists' | 'catalog' | 'history'>('lists');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [tripSuccessBanner, setTripSuccessBanner] = useState<{ title: string; amount: number; storeName?: string } | null>(null);

  // Firestore / Safe hooks
  const [allLists] = useSafeCollectionData<GroceryList>(null, 'groceryLists');
  const [allItems] = useSafeCollectionData<GroceryItem>(null, 'groceryItems');
  const [allAccounts] = useSafeCollectionData<Account>(null, 'accounts');

  const lists = useMemo(() => {
    return (allLists || []).filter(l => !l.householdId || l.householdId === currentHouseholdId);
  }, [allLists, currentHouseholdId]);

  const priceCatalog = useMemo(() => {
    return (allItems || []).filter(i => !i.householdId || i.householdId === currentHouseholdId);
  }, [allItems, currentHouseholdId]);

  const accounts = useMemo(() => allAccounts || [], [allAccounts]);

  const activeLists = useMemo(() => lists.filter(l => l.status === 'active'), [lists]);
  const completedLists = useMemo(() => lists.filter(l => l.status === 'completed'), [lists]);

  // If no list is selected, default to the first active list if available
  const currentList = useMemo(() => {
    if (selectedListId) {
      const found = lists.find(l => l.id === selectedListId);
      if (found) return found;
    }
    return activeLists[0] || null;
  }, [lists, selectedListId, activeLists]);

  const handleDeleteList = async (listId: string) => {
    await deleteGroceryList(listId);
    if (selectedListId === listId) {
      const remaining = activeLists.filter(l => l.id !== listId);
      setSelectedListId(remaining[0]?.id || null);
    }
  };

  // Modal / Form States
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('Weekly Groceries');
  const [newListStore, setNewListStore] = useState('SM Supermarket');

  // Add Item to List State
  const [itemQuery, setItemQuery] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemPriceEstimate, setItemPriceEstimate] = useState<number | ''>('');
  const [itemStore, setItemStore] = useState('');
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);

  // Scan Receipt State
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanSuccessMsg, setScanSuccessMsg] = useState('');

  // Payment Confirmation Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Catalog Item Editor Modal
  const [isAddingCatalogItem, setIsAddingCatalogItem] = useState(false);
  const [catalogName, setCatalogName] = useState('');
  const [catalogPrice, setCatalogPrice] = useState<number | ''>('');
  const [catalogStore, setCatalogStore] = useState('SM Supermarket');
  const [catalogCategory, setCatalogCategory] = useState('Groceries');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Selected Price Memory Item for Detail Popup Modal
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<GroceryItem | null>(null);
  const [editCatalogName, setEditCatalogName] = useState('');
  const [editCatalogPrice, setEditCatalogPrice] = useState<number | ''>('');
  const [editCatalogStore, setEditCatalogStore] = useState('');
  const [editCatalogCategory, setEditCatalogCategory] = useState('');

  // Selected History Trip for Detail Popup Modal
  const [selectedHistoryList, setSelectedHistoryList] = useState<GroceryList | null>(null);
  const [editHistoryStore, setEditHistoryStore] = useState('');

  // Selected Active Grocery List Item for Price Update Popup Modal
  const [selectedActiveItem, setSelectedActiveItem] = useState<GroceryListItem | null>(null);
  const [editActiveItemName, setEditActiveItemName] = useState('');
  const [editActivePrice, setEditActivePrice] = useState<number | ''>('');
  const [editActiveQty, setEditActiveQty] = useState<number>(1);
  const [editActiveActualPrice, setEditActiveActualPrice] = useState<number | ''>('');
  const [editActiveStore, setEditActiveStore] = useState('');
  const [updatePriceMemoryCheck, setUpdatePriceMemoryCheck] = useState(true);

  // Preferred Stores list loaded from localStorage (supports custom store additions)
  const DEFAULT_STORES = [
    'SM Supermarket', 'Puregold', 'Robinsons Supermarket',
    'S&R Membership', 'Landers', 'Savemore', 'WalterMart', 'Local Wet Market'
  ];

  const [preferredStores, setPreferredStores] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('user_grocery_preferred_stores');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_STORES;
  });

  const saveCustomStore = (storeName: string) => {
    const trimmed = storeName.trim();
    if (!trimmed) return;
    if (!preferredStores.includes(trimmed)) {
      const updated = [...preferredStores, trimmed];
      setPreferredStores(updated);
      try {
        localStorage.setItem('user_grocery_preferred_stores', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleOpenActiveItemDetails = (it: GroceryListItem) => {
    setSelectedActiveItem(it);
    setEditActiveItemName(it.name);
    setEditActivePrice(it.unitPriceEstimate);
    setEditActiveQty(it.quantity);
    setEditActiveActualPrice(it.actualUnitPrice !== undefined ? it.actualUnitPrice : '');
    setEditActiveStore(it.storeName || currentList?.storeName || 'Supermarket');
    setUpdatePriceMemoryCheck(true);
  };

  const handleSaveActiveItemUpdate = async () => {
    if (!currentList || !selectedActiveItem) return;

    const newPrice = typeof editActivePrice === 'number' ? editActivePrice : selectedActiveItem.unitPriceEstimate;
    const newQty = editActiveQty > 0 ? editActiveQty : 1;
    const newActual = typeof editActiveActualPrice === 'number' ? editActiveActualPrice : undefined;

    if (editActiveStore.trim()) {
      saveCustomStore(editActiveStore.trim());
    }

    const updatedItems = currentList.items.map(it => {
      if (it.id === selectedActiveItem.id) {
        return {
          ...it,
          name: editActiveItemName.trim() || it.name,
          unitPriceEstimate: newPrice,
          quantity: newQty,
          actualUnitPrice: newActual,
          storeName: editActiveStore.trim() || it.storeName || currentList.storeName
        };
      }
      return it;
    });

    const newEstimatedTotal = updatedItems.reduce((acc, it) => acc + (it.unitPriceEstimate * it.quantity), 0);
    const newActualTotal = updatedItems.reduce((acc, it) => acc + ((it.actualUnitPrice ?? it.unitPriceEstimate) * it.quantity), 0);

    const updatedList: GroceryList = {
      ...currentList,
      items: updatedItems,
      estimatedTotal: newEstimatedTotal,
      actualTotal: currentList.actualTotal !== undefined ? newActualTotal : undefined
    };

    await saveGroceryList(updatedList);

    // Sync with Price Memory catalog if requested
    if (updatePriceMemoryCheck && newPrice > 0) {
      const existingCatalog = priceCatalog.find(i => i.name.toLowerCase() === editActiveItemName.trim().toLowerCase());
      await saveGroceryItem({
        id: existingCatalog ? existingCatalog.id : `gi_${Date.now()}`,
        householdId: currentHouseholdId || 'h_sample',
        name: editActiveItemName.trim(),
        lastUnitPrice: newActual !== undefined ? newActual : newPrice,
        storeName: editActiveStore.trim() || 'Supermarket',
        category: existingCatalog?.category || 'Groceries',
        lastUpdatedDate: Date.now()
      });
    }

    setSelectedActiveItem(null);
  };

  const handleOpenCatalogDetails = (item: GroceryItem) => {
    setSelectedCatalogItem(item);
    setEditCatalogName(item.name);
    setEditCatalogPrice(item.lastUnitPrice);
    setEditCatalogStore(item.storeName || 'SM Supermarket');
    setEditCatalogCategory(item.category || 'Groceries');
  };

  const handleSaveCatalogDetails = async () => {
    if (!selectedCatalogItem || !editCatalogName.trim()) return;
    if (editCatalogStore.trim()) saveCustomStore(editCatalogStore.trim());

    const updated: GroceryItem = {
      ...selectedCatalogItem,
      name: editCatalogName.trim(),
      lastUnitPrice: typeof editCatalogPrice === 'number' ? editCatalogPrice : selectedCatalogItem.lastUnitPrice,
      storeName: editCatalogStore.trim() || 'Supermarket',
      category: editCatalogCategory || 'Groceries',
      lastUpdatedDate: Date.now()
    };
    await saveGroceryItem(updated);
    setSelectedCatalogItem(null);
  };

  const handleOpenHistoryDetails = (list: GroceryList) => {
    setSelectedHistoryList(list);
    setEditHistoryStore(list.storeName || 'SM Supermarket');
  };

  const handleSaveHistoryStore = async () => {
    if (!selectedHistoryList) return;
    if (editHistoryStore.trim()) saveCustomStore(editHistoryStore.trim());

    const updated: GroceryList = {
      ...selectedHistoryList,
      storeName: editHistoryStore.trim() || 'Supermarket'
    };
    await saveGroceryList(updated);
    setSelectedHistoryList(updated);
  };

  // Auto-fill price estimate when itemQuery matches price memory catalog
  const matchingCatalogItems = useMemo(() => {
    if (!itemQuery.trim()) return [];
    const q = itemQuery.toLowerCase();
    return priceCatalog
      .filter(i => i.name.toLowerCase().includes(q))
      .sort((a, b) => (b.lastUpdatedDate || 0) - (a.lastUpdatedDate || 0));
  }, [itemQuery, priceCatalog]);

  const handleSelectItemSuggestion = (gi: GroceryItem) => {
    setItemQuery(gi.name);
    setItemPriceEstimate(gi.lastUnitPrice);
    if (gi.storeName) setItemStore(gi.storeName);
    setShowItemSuggestions(false);
  };

  const handleAddItemToList = async () => {
    if (!currentList || !itemQuery.trim()) return;

    const price = typeof itemPriceEstimate === 'number' ? itemPriceEstimate : 0;
    const newItem: GroceryListItem = {
      id: `gli_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: itemQuery.trim(),
      quantity: itemQty > 0 ? itemQty : 1,
      unitPriceEstimate: price,
      storeName: itemStore || currentList.storeName || 'Supermarket',
      isPurchased: false
    };

    const updatedItems = [...currentList.items, newItem];
    const newEstimatedTotal = updatedItems.reduce((acc, it) => acc + (it.unitPriceEstimate * it.quantity), 0);

    const updatedList: GroceryList = {
      ...currentList,
      items: updatedItems,
      estimatedTotal: newEstimatedTotal
    };

    await saveGroceryList(updatedList);

    // Also sync/update AI Price Memory catalog with new price & timestamp starting from the day it's updated
    if (price > 0) {
      const existing = priceCatalog.find(i => i.name.toLowerCase() === itemQuery.trim().toLowerCase());
      await saveGroceryItem({
        id: existing ? existing.id : `gi_${Date.now()}`,
        householdId: currentHouseholdId || 'h_sample',
        name: itemQuery.trim(),
        lastUnitPrice: price,
        storeName: itemStore || existing?.storeName || currentList.storeName || 'Supermarket',
        lastUpdatedDate: Date.now(),
        category: existing?.category || 'Groceries'
      });
    }

    // Reset inputs
    setItemQuery('');
    setItemQty(1);
    setItemPriceEstimate('');
    setItemStore('');
  };

  const handleRemoveListItem = async (itemId: string) => {
    if (!currentList) return;
    const updatedItems = currentList.items.filter(i => i.id !== itemId);
    const newEstimatedTotal = updatedItems.reduce((acc, it) => acc + (it.unitPriceEstimate * it.quantity), 0);
    const updatedList: GroceryList = {
      ...currentList,
      items: updatedItems,
      estimatedTotal: newEstimatedTotal
    };
    await saveGroceryList(updatedList);
  };

  const handleCreateNewList = async () => {
    if (!newListTitle.trim()) return;
    const newList: GroceryList = {
      id: `glist_${Date.now()}`,
      householdId: currentHouseholdId || 'h_sample',
      title: newListTitle.trim(),
      status: 'active',
      items: [],
      estimatedTotal: 0,
      createdAt: Date.now(),
      storeName: newListStore.trim() || 'Supermarket'
    };
    await saveGroceryList(newList);
    setSelectedListId(newList.id);
    setIsCreatingList(false);
  };

  // Receipt Scan Function
  const handleReceiptScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentList) return;

    setIsScanning(true);
    setScanError('');
    setScanSuccessMsg('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;

        const res = await fetch('/api/ai-receipt-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data })
        });

        if (!res.ok) {
          throw new Error('Failed to scan receipt image.');
        }

        const data = await res.json();
        const scannedItems: Array<{ name: string; price: number; quantity?: number }> = data.items || [];
        const scannedStore = data.merchantName || currentList.storeName || 'Scanned Store';

        // Auto-reconcile with list items
        let updatedItems = [...currentList.items];

        scannedItems.forEach(scanned => {
          const scannedPrice = typeof scanned.price === 'number' ? scanned.price : 0;
          const matchIndex = updatedItems.findIndex(it =>
            it.name.toLowerCase() === scanned.name.toLowerCase() ||
            scanned.name.toLowerCase().includes(it.name.toLowerCase()) ||
            it.name.toLowerCase().includes(scanned.name.toLowerCase())
          );

          if (matchIndex >= 0) {
            updatedItems[matchIndex] = {
              ...updatedItems[matchIndex],
              actualUnitPrice: scannedPrice,
              isPurchased: true
            };
          } else if (scanned.name && scannedPrice > 0) {
            // Add extra line item detected from receipt
            updatedItems.push({
              id: `gli_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              name: scanned.name,
              quantity: scanned.quantity || 1,
              unitPriceEstimate: scannedPrice,
              actualUnitPrice: scannedPrice,
              storeName: scannedStore,
              isPurchased: true
            });
          }
        });

        const actualTotal = updatedItems.reduce((acc, it) => {
          const unitPrice = it.actualUnitPrice !== undefined ? it.actualUnitPrice : it.unitPriceEstimate;
          return acc + (unitPrice * it.quantity);
        }, 0);

        const updatedList: GroceryList = {
          ...currentList,
          items: updatedItems,
          actualTotal: actualTotal > 0 ? actualTotal : data.totalAmount || currentList.estimatedTotal,
          receiptScanDate: Date.now(),
          storeName: scannedStore
        };

        await saveGroceryList(updatedList);

        // Sync all scanned items to AI Price Memory catalog with lastUpdatedDate = Date.now()
        for (const scanned of scannedItems) {
          const scannedPrice = typeof scanned.price === 'number' ? scanned.price : 0;
          if (scanned.name && scannedPrice > 0) {
            const existingInCatalog = priceCatalog.find(p => p.name.toLowerCase() === scanned.name.trim().toLowerCase());
            await saveGroceryItem({
              id: existingInCatalog ? existingInCatalog.id : `gi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              householdId: currentHouseholdId || 'h_sample',
              name: scanned.name.trim(),
              lastUnitPrice: scannedPrice,
              storeName: scannedStore,
              lastUpdatedDate: Date.now(),
              category: existingInCatalog?.category || 'Groceries'
            });
          }
        }

        setScanSuccessMsg(`Scanned ${scannedItems.length} items from ${scannedStore}! Prices reconciled.`);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setScanError(err?.message || 'Error processing receipt scan.');
    } finally {
      setIsScanning(false);
      e.target.value = '';
    }
  };

  const handleConfirmAndPay = async () => {
    if (!currentList || !selectedAccountId) return;

    setIsSubmittingPayment(true);
    try {
      const finalTotal = currentList.actualTotal || currentList.estimatedTotal;
      await completeGroceryList(currentList.id, selectedAccountId, finalTotal, currentList.storeName);
      setTripSuccessBanner({
        title: currentList.title,
        amount: finalTotal,
        storeName: currentList.storeName,
      });
      setIsPaymentModalOpen(false);
      setSelectedAccountId('');
    } catch (err: any) {
      alert(err?.message || 'Failed to complete transaction.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleSaveCatalogItem = async () => {
    if (!catalogName.trim()) return;
    const newItem: GroceryItem = {
      id: `gi_${Date.now()}`,
      householdId: currentHouseholdId || 'h_sample',
      name: catalogName.trim(),
      lastUnitPrice: typeof catalogPrice === 'number' ? catalogPrice : 0,
      storeName: catalogStore.trim() || 'Supermarket',
      lastUpdatedDate: Date.now(),
      category: catalogCategory
    };
    await saveGroceryItem(newItem);
    setCatalogName('');
    setCatalogPrice('');
    setIsAddingCatalogItem(false);
  };

  const filteredCatalog = useMemo(() => {
    const list = !catalogSearch.trim()
      ? [...priceCatalog]
      : priceCatalog.filter(i =>
          i.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
          (i.storeName && i.storeName.toLowerCase().includes(catalogSearch.toLowerCase())) ||
          (i.category && i.category.toLowerCase().includes(catalogSearch.toLowerCase()))
        );
    return list.sort((a, b) => (b.lastUpdatedDate || 0) - (a.lastUpdatedDate || 0));
  }, [priceCatalog, catalogSearch]);

  return (
    <div className="px-4 py-5 space-y-5 animate-in fade-in duration-300">
      
      {/* Top Header Banner */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
              <ShoppingCart size={18} />
            </div>
            <div className="flex items-center">
              <h1 className="text-xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight">Grocery Planner</h1>
              <HelpTooltip
                title="Grocery Budgeting"
                text="Plan shopping runs, calculate estimated basket totals using historical catalog unit prices, and auto-reconcile items via receipt scanning."
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">Predictive pricing & AI receipt reconciliation</p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreatingList(true)}
          className="py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow-sm shadow-purple-500/20 cursor-pointer shrink-0"
        >
          <Plus size={15} />
          <span>New List</span>
        </button>
      </div>

      {/* Success Notification Banner */}
      {tripSuccessBanner && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-900 dark:text-emerald-200">
                Grocery purchase recorded successfully!
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                Logged <span className="font-bold">₱{tripSuccessBanner.amount.toLocaleString()}</span> under default category <span className="font-bold underline">Groceries</span>
                {tripSuccessBanner.storeName ? ` at ${tripSuccessBanner.storeName}` : ''}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveCategoryFilter('cat_groceries');
                navigate('/tracker');
              }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
            >
              <span>View in Tracker</span>
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={() => setTripSuccessBanner(null)}
              className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex p-1 bg-black/5 dark:bg-zinc-900/60 rounded-2xl border border-black/5 dark:border-white/5">
        <button
          type="button"
          onClick={() => setActiveTab('lists')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'lists'
              ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-fuchsia-400 shadow-sm border border-black/5 dark:border-white/10'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <ShoppingCart size={14} />
          <span>Planner ({activeLists.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-fuchsia-400 shadow-sm border border-black/5 dark:border-white/10'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Tag size={14} />
          <span>Price Memory ({priceCatalog.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'history'
              ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-fuchsia-400 shadow-sm border border-black/5 dark:border-white/10'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Receipt size={14} />
          <span>History ({completedLists.length})</span>
        </button>
      </div>

      {/* ─── TAB 1: GROCERY PLANNER (ACTIVE LISTS) ──────────────────────────────── */}
      {activeTab === 'lists' && (
        <div className="space-y-4">
          
          {/* Active Lists Selector */}
          {activeLists.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {activeLists.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedListId(l.id)}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer border ${
                    currentList?.id === l.id
                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                      : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  {l.title} (₱{(l.actualTotal || l.estimatedTotal).toLocaleString()})
                </button>
              ))}
            </div>
          )}

          {currentList ? (
            <div className="space-y-4">
              
              {/* List Header Card */}
              <div className="p-4 bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-900/90 border border-black/5 dark:border-white/10 rounded-3xl space-y-3 shadow-md shadow-zinc-200/50 dark:shadow-black/40 relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase text-purple-600 dark:text-fuchsia-400 tracking-wider flex items-center gap-1 mb-0.5">
                      <Store size={12} />
                      {currentList.storeName || 'SM Supermarket'}
                    </span>
                    <h2 className="text-lg font-black text-zinc-950 dark:text-zinc-100">{currentList.title}</h2>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteList(currentList.id)}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors rounded-lg cursor-pointer"
                    title="Delete list"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Total Summary Banner */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 rounded-2xl">
                  <div>
                    <div className="flex items-center">
                      <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase">Estimated Total</p>
                      <HelpTooltip
                        title="Estimated Budget"
                        text="Calculated from item quantities multiplied by unit prices remembered in your AI Price Memory catalog."
                      />
                    </div>
                    <p className="text-base font-black text-purple-700 dark:text-fuchsia-300 tabular-nums">
                      ₱{currentList.estimatedTotal.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center">
                      <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase">
                        {currentList.actualTotal !== undefined ? 'Actual Reconciled' : 'Status'}
                      </p>
                      <HelpTooltip
                        title="Reconciled Receipt Total"
                        text="Calculated from actual items and register prices extracted via receipt OCR scanning."
                      />
                    </div>
                    {currentList.actualTotal !== undefined ? (
                      <p className={`text-base font-black tabular-nums ${
                        currentList.actualTotal > currentList.estimatedTotal
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        ₱{currentList.actualTotal.toLocaleString()}
                        <span className="text-[10px] font-bold block">
                          ({currentList.actualTotal > currentList.estimatedTotal ? '+' : ''}
                          ₱{(currentList.actualTotal - currentList.estimatedTotal).toLocaleString()})
                        </span>
                      </p>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 mt-1">
                        <Clock size={13} />
                        Planning Phase
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Toolbar */}
                <div className="flex gap-2 pt-1">
                  {/* Scan Receipt Button */}
                  <label className="flex-1 py-2.5 px-3 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm">
                    {isScanning ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Camera size={14} />
                    )}
                    <span>{isScanning ? 'Scanning OCR...' : 'Scan Receipt'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleReceiptScan}
                      disabled={isScanning}
                      className="hidden"
                    />
                  </label>

                  {/* Confirm & Pay Button */}
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(true)}
                    disabled={currentList.items.length === 0}
                    className="flex-1 py-2.5 px-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md shadow-purple-500/20"
                  >
                    <CheckCircle2 size={14} />
                    <span>Confirm & Pay</span>
                  </button>
                </div>

                {scanError && (
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    {scanError}
                  </p>
                )}

                {scanSuccessMsg && (
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Sparkles size={12} />
                    {scanSuccessMsg}
                  </p>
                )}
              </div>

              {/* Add Item Form (Predictive Search) */}
              <div className="p-3.5 bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-2xl space-y-2.5 shadow-sm">
                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block">Add Grocery Item</span>
                
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={itemQuery}
                        onChange={(e) => {
                          setItemQuery(e.target.value);
                          setShowItemSuggestions(true);
                        }}
                        onFocus={() => setShowItemSuggestions(true)}
                        placeholder="Item name (e.g. Jasmine Rice, Eggs, Milk)"
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>

                    <div className="w-20">
                      <input
                        type="number"
                        value={itemPriceEstimate}
                        onChange={(e) => setItemPriceEstimate(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="₱ Price"
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-2 text-xs font-black text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 tabular-nums"
                      />
                    </div>

                    <div className="w-14">
                      <input
                        type="number"
                        min="1"
                        value={itemQty}
                        onChange={(e) => setItemQty(Math.max(1, Number(e.target.value)))}
                        placeholder="Qty"
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-2 text-xs font-black text-center text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddItemToList}
                      disabled={!itemQuery.trim()}
                      className="p-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl active:scale-95 transition-all cursor-pointer shrink-0"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* Autocomplete Suggestions Popup */}
                  {showItemSuggestions && matchingCatalogItems.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-20 max-h-56 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      <div className="p-2 text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-fuchsia-400 bg-purple-50/80 dark:bg-purple-950/40 px-3 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Sparkles size={11} />
                          <span>AI Price Memory Suggestions</span>
                        </span>
                        <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-400">
                          Auto-synced
                        </span>
                      </div>
                      {matchingCatalogItems.map(gi => (
                        <button
                          key={gi.id}
                          type="button"
                          onClick={() => handleSelectItemSuggestion(gi)}
                          className="w-full p-2.5 text-left hover:bg-purple-50/70 dark:hover:bg-purple-950/40 flex items-center justify-between text-xs transition-colors cursor-pointer group"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-purple-600 dark:group-hover:text-fuchsia-300">
                                {gi.name}
                              </p>
                              {gi.lastUpdatedDate && (
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40 shrink-0">
                                  {formatUpdatedDateLabel(gi.lastUpdatedDate)}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-400 font-medium flex items-center gap-1 mt-0.5">
                              <Store size={10} className="text-purple-500 shrink-0" />
                              <span>{gi.storeName || 'Supermarket'}</span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-black text-purple-700 dark:text-fuchsia-300 tabular-nums bg-purple-100 dark:bg-purple-900/60 px-2.5 py-1 rounded-xl text-[11px] block border border-purple-200/50 dark:border-purple-800/50">
                              ₱{gi.lastUnitPrice.toLocaleString()}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table / List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-400">List Items ({currentList.items.length})</span>
                  {currentList.actualTotal !== undefined && (
                    <span className="text-[10px] font-bold text-purple-600 dark:text-fuchsia-400 flex items-center gap-1">
                      <Sparkles size={11} />
                      Side-by-Side Reconciled
                    </span>
                  )}
                </div>

                {currentList.items.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl space-y-2">
                    <ShoppingCart size={32} className="mx-auto text-zinc-300 dark:text-zinc-700" />
                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Your grocery list is empty</p>
                    <p className="text-[10px] text-zinc-400">Type items above or query AI Price Memory to build your list.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentList.items.map((it) => {
                      const estSubtotal = it.unitPriceEstimate * it.quantity;
                      const hasActual = it.actualUnitPrice !== undefined;
                      const actSubtotal = (it.actualUnitPrice ?? it.unitPriceEstimate) * it.quantity;
                      const diff = actSubtotal - estSubtotal;

                      return (
                        <div
                          key={it.id}
                          onClick={() => handleOpenActiveItemDetails(it)}
                          className={`p-3 bg-white dark:bg-zinc-900 border rounded-2xl flex items-center justify-between gap-3 shadow-xs transition-all cursor-pointer hover:border-purple-500/80 group ${
                            it.isPurchased
                              ? 'border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10'
                              : 'border-black/5 dark:border-white/10 hover:bg-purple-50/30 dark:hover:bg-purple-950/20'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              it.isPurchased ? 'bg-emerald-500 text-white' : 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-fuchsia-300'
                            }`}>
                              {it.isPurchased ? <Check size={16} /> : <ShoppingCart size={15} />}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">{it.name}</h4>
                                <span className="text-[9px] font-bold text-purple-600 dark:text-fuchsia-400 bg-purple-100 dark:bg-purple-950 px-1.5 py-0.5 rounded-md shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                                  Update Price
                                </span>
                              </div>
                              <p className="text-[10px] text-zinc-400 font-medium">
                                Qty: {it.quantity} x ₱{it.unitPriceEstimate.toLocaleString()} est.
                                {it.storeName && ` • ${it.storeName}`}
                              </p>
                            </div>
                          </div>

                          {/* Price & Reconcile Comparison Column */}
                          <div className="text-right shrink-0">
                            {hasActual ? (
                              <div>
                                <p className="font-black text-xs text-zinc-900 dark:text-zinc-100 tabular-nums">
                                  ₱{actSubtotal.toLocaleString()}
                                </p>
                                <p className={`text-[9px] font-bold tabular-nums ${
                                  diff > 0 ? 'text-rose-600 dark:text-rose-400' : diff < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'
                                }`}>
                                  Est: ₱{estSubtotal.toLocaleString()} ({diff > 0 ? '+' : ''}₱{diff})
                                </p>
                              </div>
                            ) : (
                              <div>
                                <p className="font-black text-xs text-purple-700 dark:text-fuchsia-300 tabular-nums">
                                  ₱{estSubtotal.toLocaleString()}
                                </p>
                                <span className="text-[9px] text-zinc-400 block font-medium">Estimated</span>
                              </div>
                            )}
                          </div>

                          {/* Delete Item Button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveListItem(it.id);
                            }}
                            className="p-1 text-zinc-300 hover:text-rose-600 transition-colors shrink-0 cursor-pointer"
                            title="Remove from list"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-3xl space-y-3">
              <ShoppingCart size={36} className="mx-auto text-purple-600 dark:text-fuchsia-400" />
              <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-100">No Active Grocery Lists</h3>
              <p className="text-xs text-zinc-500 max-w-xs mx-auto">Create a new grocery list to start predictive pricing and receipt scanning.</p>
              <button
                type="button"
                onClick={() => setIsCreatingList(true)}
                className="py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} />
                <span>Create First List</span>
              </button>
            </div>
          )}

        </div>
      )}

      {/* ─── TAB 2: PRICE MEMORY STORE (CATALOG) ───────────────────────────────── */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">AI Price Memory Catalog</span>
              <HelpTooltip
                title="Historical Price Memory"
                text="Stores historical unit prices across Philippine grocery stores (SM, Puregold, Robinsons) to automatically predict shopping cart costs."
              />
            </div>
            <span className="text-xs font-black text-purple-600 dark:text-fuchsia-400">
              {priceCatalog.length} Items Saved
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search grocery items or stores..."
                className="w-full bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-2xl pl-9 pr-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 shadow-sm"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsAddingCatalogItem(true)}
              className="py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all cursor-pointer shrink-0 shadow-sm"
            >
              <Plus size={14} />
              <span>Add Price</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {filteredCatalog.map(item => (
              <div
                key={item.id}
                onClick={() => handleOpenCatalogDetails(item)}
                className="p-3.5 bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:border-purple-500/40 hover:bg-purple-50/10 transition-all cursor-pointer group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate group-hover:text-purple-600 dark:group-hover:text-fuchsia-400">{item.name}</h4>
                    {item.category && (
                      <span className="text-[9px] font-extrabold px-2 py-0.5 bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-fuchsia-300 rounded-full shrink-0">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <Store size={10} className="text-purple-500 shrink-0" />
                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">{item.storeName || 'Supermarket'}</span>
                    <span>•</span>
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">
                      {formatUpdatedDateLabel(item.lastUpdatedDate)}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-purple-700 dark:text-fuchsia-300 tabular-nums bg-purple-50 dark:bg-zinc-800 px-2.5 py-1 rounded-xl border border-purple-200/50 dark:border-purple-900/50">
                    ₱{item.lastUnitPrice.toLocaleString()}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteGroceryItem(item.id);
                    }}
                    className="p-1 text-zinc-300 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Delete item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 3: GROCERY HISTORY ────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {completedLists.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-3xl space-y-2">
              <Receipt size={32} className="mx-auto text-zinc-300 dark:text-zinc-700" />
              <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">No completed grocery trips yet</p>
              <p className="text-[10px] text-zinc-400">Completed grocery lists and payment records will appear here.</p>
            </div>
          ) : (
            completedLists.map(list => (
              <div
                key={list.id}
                onClick={() => handleOpenHistoryDetails(list)}
                className="p-4 bg-white dark:bg-zinc-900 border border-black/5 dark:border-white/10 rounded-2xl space-y-2.5 shadow-xs hover:border-purple-500/40 hover:bg-purple-50/10 transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                      <CheckCircle2 size={10} />
                      Completed
                    </span>
                    <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mt-1 group-hover:text-purple-600 dark:group-hover:text-fuchsia-400">{list.title}</h4>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                      ₱{(list.actualTotal || list.estimatedTotal).toLocaleString()}
                    </p>
                    <p className="text-[9px] text-zinc-400 font-medium">
                      Est: ₱{list.estimatedTotal.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <span className="flex items-center gap-1 font-semibold text-zinc-600 dark:text-zinc-300">
                    <Store size={11} className="text-purple-500" />
                    {list.storeName || 'Supermarket'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={10} />
                    {list.completedAt ? new Date(list.completedAt).toLocaleDateString() : 'Paid'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── MODAL 1: CREATE NEW LIST ─────────────────────────────────────────── */}
      {isCreatingList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-white/20 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-base text-zinc-900 dark:text-zinc-100">Create Grocery List</h3>
              <button
                type="button"
                onClick={() => setIsCreatingList(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">List Name</label>
                <input
                  type="text"
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  placeholder="e.g. Weekly Supermarket Run"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Preferred Store / Market</label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={newListStore}
                    onChange={(e) => setNewListStore(e.target.value)}
                    placeholder="Type market/store name (e.g. SM, Puregold, Uncle John's)"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {preferredStores.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewListStore(s)}
                        className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                          newListStore === s
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-purple-50 dark:hover:bg-purple-950'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleCreateNewList}
                disabled={!newListTitle.trim()}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                Start List
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingList(false)}
                className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: CONFIRM & PAY (ACCOUNT DEDUCTION) ───────────────────────── */}
      {isPaymentModalOpen && currentList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-white/20 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-100">Confirm & Deduct</h3>
                  <p className="text-[10px] text-zinc-400">Select payment source to complete list</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Total Summary */}
            <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase">Grocery Total</p>
                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{currentList.title}</p>
                </div>
                <p className="text-lg font-black text-purple-700 dark:text-fuchsia-300 tabular-nums">
                  ₱{(currentList.actualTotal || currentList.estimatedTotal).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-purple-200/50 dark:border-purple-900/40">
                <span className="text-zinc-500 font-medium">Expense Category:</span>
                <span className="font-bold text-purple-700 dark:text-fuchsia-300 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <span>🛒</span> Groceries
                </span>
              </div>
            </div>

            {/* Account Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-zinc-400 block">Select Funding Account</label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      selectedAccountId === acc.id
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                        : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 hover:border-purple-500'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-xs">{acc.name}</p>
                      <p className={`text-[10px] ${selectedAccountId === acc.id ? 'text-purple-200' : 'text-zinc-400'}`}>
                        {acc.institution}
                      </p>
                    </div>
                    <p className="font-black text-xs tabular-nums">
                      ₱{acc.balance.toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmAndPay}
                disabled={!selectedAccountId || isSubmittingPayment}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
              >
                {isSubmittingPayment ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                <span>Confirm & Deduct Balance</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: ADD CATALOG PRICE MEMORY ITEM ───────────────────────────── */}
      {isAddingCatalogItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-white/20 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-base text-zinc-900 dark:text-zinc-100">Add Price Memory</h3>
              <button
                type="button"
                onClick={() => setIsAddingCatalogItem(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Item Name</label>
                <input
                  type="text"
                  value={catalogName}
                  onChange={(e) => setCatalogName(e.target.value)}
                  placeholder="e.g. Premium White Sugar 1kg"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Unit Price (₱)</label>
                  <input
                    type="number"
                    value={catalogPrice}
                    onChange={(e) => setCatalogPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="₱ 95"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-black text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Category</label>
                  <select
                    value={catalogCategory}
                    onChange={(e) => setCatalogCategory(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="Groceries">Groceries</option>
                    <option value="Pantry">Pantry</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Fresh Produce">Fresh Produce</option>
                    <option value="Meat & Poultry">Meat & Poultry</option>
                    <option value="Beverage">Beverage</option>
                    <option value="Toiletries">Toiletries</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Store Name</label>
                <input
                  type="text"
                  value={catalogStore}
                  onChange={(e) => setCatalogStore(e.target.value)}
                  placeholder="e.g. SM Supermarket"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveCatalogItem}
                disabled={!catalogName.trim()}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                Save to Memory
              </button>
              <button
                type="button"
                onClick={() => setIsAddingCatalogItem(false)}
                className="px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: PRICE MEMORY ITEM DETAILS & LOCATION POPUP ───────────── */}
      {selectedCatalogItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-white/20 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-fuchsia-400 rounded-xl">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-100">Price Memory Details</h3>
                  <p className="text-[10px] text-zinc-400">View & update store price memory</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCatalogItem(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Item Name</label>
                <input
                  type="text"
                  value={editCatalogName}
                  onChange={(e) => setEditCatalogName(e.target.value)}
                  placeholder="e.g. Jasmine Rice 5kg"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Unit Price (₱)</label>
                  <input
                    type="number"
                    value={editCatalogPrice}
                    onChange={(e) => setEditCatalogPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-black text-purple-600 dark:text-fuchsia-400 focus:outline-none focus:ring-1 focus:ring-purple-500 tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Category</label>
                  <select
                    value={editCatalogCategory}
                    onChange={(e) => setEditCatalogCategory(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="Groceries">Groceries</option>
                    <option value="Pantry">Pantry</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Fresh Produce">Fresh Produce</option>
                    <option value="Meat & Poultry">Meat & Poultry</option>
                    <option value="Beverage">Beverage</option>
                    <option value="Toiletries">Toiletries</option>
                    <option value="Snacks">Snacks</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">
                  Where did you buy this? (Store / Mall / Supermarket)
                </label>
                <input
                  type="text"
                  value={editCatalogStore}
                  onChange={(e) => setEditCatalogStore(e.target.value)}
                  placeholder="e.g. SM Supermarket, Puregold, S&R"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 mb-1.5"
                />
                
                {/* Quick Store Chips */}
                <div className="flex flex-wrap gap-1">
                  {preferredStores.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEditCatalogStore(s)}
                      className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                        editCatalogStore === s
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-purple-50 dark:hover:bg-purple-950'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl flex items-center justify-between text-[10px] text-zinc-400 border border-zinc-100 dark:border-zinc-800">
                <span className="flex items-center gap-1 font-medium">
                  <Clock size={12} />
                  Last Updated Date
                </span>
                <span className="font-bold text-zinc-700 dark:text-zinc-300">
                  {new Date(selectedCatalogItem.lastUpdatedDate).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveCatalogDetails}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-md"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteGroceryItem(selectedCatalogItem.id);
                  setSelectedCatalogItem(null);
                }}
                className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer border border-rose-200 dark:border-rose-900/40"
                title="Delete from memory"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: GROCERY TRIP HISTORY DETAILS & LOCATION POPUP ─────────── */}
      {selectedHistoryList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-white/20 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <span className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full inline-flex items-center gap-1 mb-1">
                  <CheckCircle2 size={10} />
                  Completed Grocery Trip
                </span>
                <h3 className="font-black text-base text-zinc-900 dark:text-zinc-100">{selectedHistoryList.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryList(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Trip Details Header */}
            <div className="p-3 bg-purple-50/50 dark:bg-purple-950/30 rounded-2xl border border-purple-100 dark:border-purple-900/40 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-zinc-500 dark:text-zinc-400">Total Paid Amount</span>
                <span className="font-black text-base text-emerald-600 dark:text-emerald-400 tabular-nums">
                  ₱{(selectedHistoryList.actualTotal || selectedHistoryList.estimatedTotal).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-zinc-500 border-t border-purple-100/60 dark:border-purple-900/30 pt-1.5">
                <span>Estimated Planned Total</span>
                <span className="font-bold tabular-nums">₱{selectedHistoryList.estimatedTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-400 pt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  Trip Date
                </span>
                <span>
                  {selectedHistoryList.completedAt
                    ? new Date(selectedHistoryList.completedAt).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })
                    : 'Paid'}
                </span>
              </div>
            </div>

            {/* "Where did you buy that?" Store / Supermarket Editor */}
            <div className="space-y-2 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
              <label className="text-[10px] font-black uppercase text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                <Store size={12} className="text-purple-600" />
                Where did you buy this? (Store / Supermarket / Mall)
              </label>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={editHistoryStore}
                  onChange={(e) => setEditHistoryStore(e.target.value)}
                  placeholder="e.g. SM Megamall, Puregold Cubao, S&R"
                  className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={handleSaveHistoryStore}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  Save Store
                </button>
              </div>

              {/* Quick Store Chips */}
              <div className="flex flex-wrap gap-1 pt-1">
                {preferredStores.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditHistoryStore(s)}
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                      editHistoryStore === s
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-purple-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Purchased Items List Breakdown */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
                Purchased Items ({selectedHistoryList.items.length})
              </span>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {selectedHistoryList.items.map((it) => {
                  const estSub = it.unitPriceEstimate * it.quantity;
                  const actSub = (it.actualUnitPrice ?? it.unitPriceEstimate) * it.quantity;

                  return (
                    <div
                      key={it.id}
                      className="p-2.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{it.name}</p>
                        <p className="text-[10px] text-zinc-400">
                          {it.quantity} {it.quantity > 1 ? 'units' : 'unit'} @ ₱{(it.actualUnitPrice ?? it.unitPriceEstimate).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-purple-700 dark:text-fuchsia-400 tabular-nums">
                          ₱{actSub.toLocaleString()}
                        </p>
                        {it.actualUnitPrice !== undefined && it.actualUnitPrice !== it.unitPriceEstimate && (
                          <p className="text-[9px] text-zinc-400 line-through tabular-nums">
                            ₱{estSub.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedHistoryList(null)}
              className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: UPDATE ACTIVE LIST ITEM PRICE & SETTINGS ────────────── */}
      {selectedActiveItem && currentList && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-white/20 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-fuchsia-400 rounded-xl">
                  <Tag size={16} />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900 dark:text-zinc-100">Update Item Price</h3>
                  <p className="text-[10px] text-zinc-400">Modify unit price, quantity or actual cost</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedActiveItem(null)}
                className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Item Name</label>
                <input
                  type="text"
                  value={editActiveItemName}
                  onChange={(e) => setEditActiveItemName(e.target.value)}
                  placeholder="e.g. Jasmine Rice 5kg"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Unit Price Estimate (₱)</label>
                  <input
                    type="number"
                    value={editActivePrice}
                    onChange={(e) => setEditActivePrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="₱ 0"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-black text-purple-600 dark:text-fuchsia-400 focus:outline-none focus:ring-1 focus:ring-purple-500 tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editActiveQty}
                    onChange={(e) => setEditActiveQty(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-black text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">
                  Actual Receipt Price (₱) <span className="text-zinc-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  value={editActiveActualPrice}
                  onChange={(e) => setEditActiveActualPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Actual price paid at register"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-purple-500 tabular-nums"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Store / Market Location</label>
                <input
                  type="text"
                  value={editActiveStore}
                  onChange={(e) => setEditActiveStore(e.target.value)}
                  placeholder="e.g. SM Supermarket, Puregold, Local Market"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 mb-1.5"
                />

                {/* Quick Store Chips */}
                <div className="flex flex-wrap gap-1">
                  {preferredStores.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEditActiveStore(s)}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                        editActiveStore === s
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-purple-50 dark:hover:bg-purple-950'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 p-2.5 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updatePriceMemoryCheck}
                    onChange={(e) => setUpdatePriceMemoryCheck(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 cursor-pointer"
                  />
                  <div className="text-[11px]">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 block">Save to Price Memory</span>
                    <span className="text-[9px] text-zinc-500 dark:text-zinc-400 block">Remember this price change for future lists</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveActiveItemUpdate}
                disabled={!editActiveItemName.trim()}
                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-md"
              >
                Save Price Change
              </button>
              <button
                type="button"
                onClick={() => {
                  handleRemoveListItem(selectedActiveItem.id);
                  setSelectedActiveItem(null);
                }}
                className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl active:scale-95 transition-all cursor-pointer border border-rose-200 dark:border-rose-900/40"
                title="Delete item"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
