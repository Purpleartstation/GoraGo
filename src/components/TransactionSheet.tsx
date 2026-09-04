import { useState, useRef } from 'react';
import { useSafeCollectionData, useSafeDocumentData, saveTransaction, saveCategory } from '../db';
import type { TransactionType, Account, Category, User } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import { suggestCategory } from '../utils/aiCategorizer';
import { scanReceipt } from '../utils/receiptScanner';
import { Sparkles, Loader2, Camera, Scan, CheckCircle2 } from 'lucide-react';
import EmergencyFundAIImpactModal from './EmergencyFundAIImpactModal';
import SecurityPinModal from './SecurityPinModal';

interface TransactionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: TransactionType;
}

export default function TransactionSheet({ isOpen, onClose, type }: TransactionSheetProps) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const aiCategorizationEnabled = useAppStore((state) => state.aiCategorizationEnabled);
  const [user] = useSafeDocumentData<User>(null, 'users', currentUserId);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{ categoryId: string; categoryName?: string; confidence: number; reasoning?: string } | null>(null);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccessMessage, setScanSuccessMessage] = useState('');

  // Emergency Fund Protection Handshake States
  const [isImpactModalOpen, setIsImpactModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [allAccounts] = useSafeCollectionData<Account>(null, 'accounts');
  const [allCategories] = useSafeCollectionData<Category>(null, 'categories');

  const accounts = allAccounts;
  const categories = allCategories.filter(c => c.type === type);

  const handleKeypad = (num: string) => {
    if (num === 'backspace') setAmount(prev => prev.slice(0, -1));
    else if (num === '.' && amount.includes('.')) return;
    else setAmount(prev => prev + num);
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setScanSuccessMessage('');

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const result = await scanReceipt(base64);

        if (result) {
          if (result.totalAmount) {
            setAmount(String(result.totalAmount));
          }
          if (result.merchantName) {
            setNote(result.merchantName);
          }

          // Try to match category
          if (result.categoryHint && categories.length > 0) {
            const matched = categories.find(c => c.name.toLowerCase().includes(result.categoryHint!.toLowerCase()) || result.categoryHint!.toLowerCase().includes(c.name.toLowerCase()));
            if (matched) {
              setCategoryId(matched.id);
            } else {
              setCustomCategoryName(result.categoryHint);
            }
          }

          setScanSuccessMessage(`Scanned ${result.merchantName || 'Receipt'}: ₱${result.totalAmount} extracted successfully!`);
          setTimeout(() => setScanSuccessMessage(''), 5000);
        }
      } catch (err) {
        console.warn("Receipt scan failed:", err);
      } finally {
        setIsScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAiCategorize = async () => {
    if (!note.trim() && !amount) return;
    setIsCategorizing(true);
    setAiSuggestion(null);
    try {
      const res = await suggestCategory(
        note.trim() || (type === 'income' ? 'Income' : 'Expense'),
        parseFloat(amount || '0'),
        type,
        categories
      );
      if (res && res.categoryId) {
        setAiSuggestion(res);
        setCategoryId(res.categoryId);
        setCustomCategoryName('');

        const historyItem = {
          id: `ai_hist_${Date.now()}`,
          note: note.trim() || (type === 'income' ? 'Income' : 'Expense'),
          amount: parseFloat(amount || '0'),
          type,
          categoryName: res.categoryName || categories.find(c => c.id === res.categoryId)?.name || 'Category',
          confidence: res.confidence,
          reasoning: res.reasoning,
          timestamp: Date.now()
        };
        const existing = JSON.parse(localStorage.getItem('ai_categorization_history') || '[]');
        localStorage.setItem('ai_categorization_history', JSON.stringify([historyItem, ...existing].slice(0, 25)));
      }
    } catch (err) {
      console.warn("AI categorization error:", err);
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleCreateCategory = async (catName?: string) => {
    const targetName = (catName || customCategoryName).trim();
    if (!targetName) return;
    const hid = currentHouseholdId || 'h_sample';
    const newCatId = `cat_${Date.now()}`;
    await saveCategory({
      id: newCatId,
      name: targetName,
      icon: 'tag',
      type: type,
      color: type === 'income' ? '#10B981' : '#F59E0B',
      householdId: hid
    });
    setCategoryId(newCatId);
    setCustomCategoryName('');
  };

  const executeSave = async () => {
    const activeAccId = accountId || (accounts.length > 0 ? accounts[0].id : '');
    if (!amount || !activeAccId) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    const hid = currentHouseholdId || 'h_sample';
    let finalCategoryId = categoryId || (categories.length > 0 ? categories[0].id : 'cat_misc');

    if (customCategoryName.trim() !== '') {
      finalCategoryId = `cat_${Date.now()}`;
      await saveCategory({
        id: finalCategoryId,
        name: customCategoryName.trim(),
        icon: 'tag',
        type: type,
        color: type === 'income' ? '#10B981' : '#F59E0B',
        householdId: hid
      });
    }

    const txId = `tx_${Date.now()}`;
    await saveTransaction({
      id: txId,
      accountId: activeAccId,
      categoryId: finalCategoryId,
      amount: numAmount,
      type,
      note: note.trim() || (type === 'income' ? 'Income' : 'Expense'),
      date: Date.now(),
      householdId: hid
    });

    onClose();
    setAmount('');
    setNote('');
    setAccountId('');
    setCategoryId('');
    setCustomCategoryName('');
  };

  const handleSave = async () => {
    const activeAccId = accountId || (accounts.length > 0 ? accounts[0].id : '');
    if (!amount || !activeAccId) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    const selectedAcc = accounts.find((a) => a.id === activeAccId);
    const isEmergencyFund = selectedAcc && (selectedAcc.isSystemDefault || selectedAcc.id === 'acc_system_ef');

    // If spending from Emergency Fund, trigger Gora AI Impact Confirmation modal first
    if (type === 'expense' && isEmergencyFund) {
      setIsImpactModalOpen(true);
      return;
    }

    await executeSave();
  };

  const isIncome = type === 'income';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Add ${isIncome ? 'Income' : 'Expense'}`}>
      <div className="space-y-6">
        {/* Receipt Scanner OCR Banner (inspired by Mindee / DocTR) */}
        <div className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-fuchsia-500/10 border border-purple-500/20 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                <Scan size={20} />
              </div>
              <div>
                <h4 className="text-xs font-black text-zinc-100 uppercase tracking-wide">AI Receipt Scanner (OCR)</h4>
                <p className="text-[11px] text-zinc-400">Instantly extract merchant, amount & category</p>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleReceiptFileChange}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-purple-500/20"
            >
              {isScanning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Camera size={14} />
                  <span>Scan Receipt</span>
                </>
              )}
            </button>
          </div>

          {scanSuccessMessage && (
            <div className="mt-3 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-300 text-xs font-bold animate-fade-in">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>{scanSuccessMessage}</span>
            </div>
          )}
        </div>

        {/* Amount Input */}
        <div className="text-center">
          <p className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2">Amount</p>
          <div className={`text-5xl font-black tracking-tight tabular-nums ${isIncome ? 'text-emerald-400' : 'text-zinc-100'}`}>
            <span className="text-3xl mr-1 opacity-70">₱</span>
            {amount || '0'}
          </div>
        </div>

        {/* Account Selection */}
        <div>
          <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest mb-2 block">Account</label>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {accounts?.map(acc => (
              <button
                key={acc.id}
                onClick={() => setAccountId(acc.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  accountId === acc.id 
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100 ring-1 ring-white/10' 
                    : 'border-white/5 bg-zinc-900/50 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Category Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest block">Category</label>
            <span className="text-[10px] text-zinc-400 font-medium">Select existing or type new below</span>
          </div>

          {categories && categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 max-h-36 overflow-y-auto no-scrollbar p-0.5">
              {categories.map(cat => {
                const isSelected = (!customCategoryName && (categoryId ? categoryId === cat.id : cat.id === (categories[0]?.id)));
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { setCategoryId(cat.id); setCustomCategoryName(''); }}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? isIncome
                          ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40 font-bold shadow-sm'
                          : 'border-rose-500/60 bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/40 font-bold shadow-sm'
                        : 'border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 font-medium'
                    }`}
                  >
                    {isSelected && (
                      <CheckCircle2 size={13} className={isIncome ? 'text-emerald-400 shrink-0' : 'text-rose-400 shrink-0'} />
                    )}
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative">
            <input 
              type="text" 
              value={customCategoryName}
              onChange={(e) => { setCustomCategoryName(e.target.value); setCategoryId(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreateCategory();
                }
              }}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl pl-4 pr-32 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm font-bold placeholder:text-zinc-600 placeholder:font-normal"
              placeholder="Type new category (e.g. Weekly Groceries)..."
            />
            {customCategoryName.trim() && (
              <button
                type="button"
                onClick={() => handleCreateCategory()}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-md cursor-pointer"
              >
                + Add Category
              </button>
            )}
          </div>
          {customCategoryName.trim() && (
            <p className="text-[11px] text-purple-300/90 font-medium mt-1.5 flex items-center gap-1">
              ✨ "<span className="font-bold">{customCategoryName.trim()}</span>" will be added to category list for future use.
            </p>
          )}
        </div>

        {/* Note & AI Categorizer */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">Note & AI Categorizer</label>
            <button
              type="button"
              onClick={handleAiCategorize}
              disabled={!aiCategorizationEnabled || isCategorizing || (!note.trim() && !amount)}
              title={aiCategorizationEnabled ? "Auto-categorize using Gemini AI" : "AI Categorization is disabled in Settings"}
              className="flex items-center gap-1.5 px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-full text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
            >
              {isCategorizing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              <span>AI Auto-Categorize</span>
            </button>
          </div>
          <input 
            type="text" 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3.5 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-600 text-sm font-bold placeholder:text-zinc-600 placeholder:font-medium"
            placeholder="e.g. Starbucks Coffee, GrabCar, Meralco..."
          />

          {/* AI Suggestion Feedback */}
          {aiSuggestion && (
            <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-start gap-3 animate-fade-in">
              <Sparkles size={16} className="text-purple-400 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1">
                <div className="font-bold text-purple-200 flex items-center justify-between">
                  <span>AI Suggested Category: <span className="underline">{aiSuggestion.categoryName || 'Matched Category'}</span></span>
                  <span className="bg-purple-500/20 px-2 py-0.5 rounded-md text-[10px] font-black text-purple-300">
                    {Math.round(aiSuggestion.confidence * 100)}% Confidence
                  </span>
                </div>
                {aiSuggestion.reasoning && (
                  <p className="text-zinc-400 text-[11px] leading-relaxed">{aiSuggestion.reasoning}</p>
                )}
              </div>
            </div>
          )}
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
          disabled={!amount || !accountId}
          className="w-full h-14 bg-zinc-100 text-zinc-950 rounded-2xl font-black tracking-wide text-lg disabled:opacity-30 disabled:active:scale-100 active:scale-[0.98] transition-all"
        >
          Save
        </button>
      </div>

      {/* Emergency Fund AI Warning Confirmation Modal */}
      {(() => {
        const activeAccId = accountId || (accounts.length > 0 ? accounts[0].id : '');
        const selectedAcc = accounts.find((a) => a.id === activeAccId);
        const cat = categories.find((c) => c.id === categoryId);
        const numAmount = parseFloat(amount) || 0;

        return (
          <>
            <EmergencyFundAIImpactModal
              isOpen={isImpactModalOpen}
              onClose={() => setIsImpactModalOpen(false)}
              withdrawAmount={numAmount}
              currentBalance={selectedAcc?.balance || 0}
              destinationType="expense"
              destinationName={cat?.name || customCategoryName || 'Expense'}
              note={note || 'Emergency Expense'}
              onProceedToPin={() => {
                setIsImpactModalOpen(false);
                setIsPinModalOpen(true);
              }}
            />

            <SecurityPinModal
              isOpen={isPinModalOpen}
              onClose={() => setIsPinModalOpen(false)}
              expectedPin={user?.emergencyFundPin || user?.pin}
              title="Authorize Emergency Fund Expense"
              subtitle={`Enter 4-digit PIN to authorize spending ₱${numAmount.toLocaleString()} from Safety Net`}
              onSuccess={async () => {
                setIsPinModalOpen(false);
                await executeSave();
              }}
            />
          </>
        );
      })()}
    </BottomSheet>
  );
}
