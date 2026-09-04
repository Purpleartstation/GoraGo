import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Sparkles, AlertTriangle, Flame, ShieldAlert, ArrowRight, X, Clock } from 'lucide-react';
import { computeEmergencyImpact, fetchAIEmergencyImpact } from '../utils/aiEmergencyWarning';
import type { EmergencyImpactAnalysis } from '../utils/aiEmergencyWarning';
import { useSafeCollectionData } from '../db';
import type { Transaction } from '../db';
import { useBodyScrollLock } from '../utils/scrollLock';

interface EmergencyFundAIImpactModalProps {
  isOpen: boolean;
  onClose: () => void;
  withdrawAmount: number;
  currentBalance: number;
  destinationType: 'transfer' | 'expense';
  destinationName?: string;
  note?: string;
  onProceedToPin: () => void;
}

export default function EmergencyFundAIImpactModal({
  isOpen,
  onClose,
  withdrawAmount,
  currentBalance,
  destinationType,
  destinationName,
  note,
  onProceedToPin
}: EmergencyFundAIImpactModalProps) {
  const [transactions] = useSafeCollectionData<Transaction>(null, 'transactions');
  const [aiCommentary, setAiCommentary] = useState<string>('');

  // Compute local mathematical impact analysis instantaneously
  const impact: EmergencyImpactAnalysis = useMemo(() => {
    return computeEmergencyImpact({
      currentBalance,
      withdrawAmount,
      transactions: transactions || [],
      note
    });
  }, [currentBalance, withdrawAmount, transactions, note]);

  // Attempt server-side Gemini enhancement if network is available
  useEffect(() => {
    if (!isOpen || withdrawAmount <= 0) return;
    let isCancelled = false;

    fetchAIEmergencyImpact({
      currentBalance,
      withdrawAmount,
      note,
      category: destinationType === 'transfer' ? 'Transfer' : 'Emergency Expense'
    }).then((res) => {
      if (!isCancelled && res?.aiCommentary) {
        setAiCommentary(res.aiCommentary);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, currentBalance, withdrawAmount, note, destinationType]);

  const isDrainedToZero = impact.newBalance === 0;

  // Lock background scroll on iOS
  useBodyScrollLock(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4 overflow-y-auto -webkit-overflow-scrolling-touch overscroll-y-contain">
          {/* Backdrop with GPU Acceleration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md transform-gpu [backface-visibility:hidden] will-change-[opacity]"
          />

          {/* Modal Container with iOS Spring & GPU Acceleration */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 25 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 25 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-full max-w-lg bg-[#F0F4F8] dark:bg-[#1E293B] text-zinc-900 dark:text-zinc-100 rounded-[2.5rem] p-5 sm:p-6 shadow-2xl border border-rose-500/30 dark:border-rose-500/20 flex flex-col z-10 my-auto transform-gpu [backface-visibility:hidden] will-change-transform touch-manipulation"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-transform active:scale-90 touch-manipulation will-change-transform cursor-pointer"
            >
              <X size={20} />
            </button>

            {/* CFO Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-lg shrink-0">
                <Bot size={26} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-full">
                    Financial Impact Check
                  </span>
                  <Sparkles size={13} className="text-amber-500" />
                </div>
                <h3 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                  GoraGo CFO Safety Warning
                </h3>
              </div>
            </div>

            {/* Primary AI Warning Headline */}
            <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 mb-4 shadow-sm">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="font-black text-sm leading-snug">
                  {impact.warningHeadline}
                </p>
              </div>
            </div>

            {/* Critical Depletion Alert (if balance drops severely or hits ₱0) */}
            {impact.criticalAlert && (
              <div className={`p-4 rounded-2xl mb-4 border ${
                isDrainedToZero 
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-800 dark:text-rose-200' 
                  : 'bg-orange-500/10 border-orange-500/30 text-orange-900 dark:text-orange-200'
              }`}>
                <div className="flex items-start gap-2.5">
                  {isDrainedToZero ? (
                    <Flame size={20} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                  ) : (
                    <ShieldAlert size={20} className="text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                  )}
                  <p className="text-xs font-bold leading-relaxed">
                    {impact.criticalAlert}
                  </p>
                </div>
              </div>
            )}

            {/* Metrics Impact Grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="p-3 bg-white dark:bg-zinc-800/80 rounded-2xl border border-black/5 dark:border-white/5 shadow-xs">
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                  Current Safety Net
                </span>
                <p className="text-base font-black text-zinc-900 dark:text-zinc-100 tabular-nums">
                  ₱{impact.currentBalance.toLocaleString()}
                </p>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  {impact.daysBefore} days cushion
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-zinc-800/80 rounded-2xl border border-black/5 dark:border-white/5 shadow-xs">
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
                  Projected Balance
                </span>
                <p className="text-base font-black text-rose-600 dark:text-rose-400 tabular-nums">
                  ₱{impact.newBalance.toLocaleString()}
                </p>
                <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {impact.daysAfter} days cushion (-{impact.daysLost}d)
                </span>
              </div>
            </div>

            {/* Rebuild Warning Box */}
            <div className="p-3.5 bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/25 rounded-2xl mb-4">
              <div className="flex items-start gap-2.5">
                <Clock size={17} className="text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-0.5">
                    Rebuild Timeline
                  </p>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
                    {impact.rebuildAdvice}
                  </p>
                </div>
              </div>
            </div>

            {/* Optional AI Dynamic Commentary */}
            {aiCommentary && (
              <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-black/5 dark:border-white/5 text-xs text-zinc-700 dark:text-zinc-300 italic mb-4">
                "{aiCommentary}"
              </div>
            )}

            {/* Destination Info */}
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1 mb-5">
              <span>Intended Action:</span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                {destinationType === 'transfer' 
                  ? `Transfer to ${destinationName || 'Account'}` 
                  : `Expense: ${note || 'Uncategorized'}`}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3.5 px-4 rounded-2xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-sm transition-all active:scale-[0.96] touch-manipulation will-change-transform cursor-pointer"
              >
                Keep Savings Safe
              </button>

              <button
                type="button"
                onClick={onProceedToPin}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-black text-sm transition-all shadow-md active:scale-[0.96] flex items-center justify-center gap-2 touch-manipulation will-change-transform cursor-pointer"
              >
                <span>Proceed to PIN Handshake</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
