import React, { useState } from 'react';
import BottomSheet from './BottomSheet';
import { depositToGoal, deleteGoal, useSafeCollectionData } from '../db';
import type { Goal, Account } from '../db';
import { evaluateGoalPace } from '../utils/goalPlanner';
import { Target, Sparkles, Plus, Trash2, TrendingUp, ArrowUpRight, ShieldCheck, Plane, ShoppingBag, GraduationCap, Clock } from 'lucide-react';

interface GoalDetailsSheetProps {
  goal: Goal | null;
  isOpen: boolean;
  onClose: () => void;
  onGoalUpdated?: () => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  savings: Target,
  emergency_fund: ShieldCheck,
  travel: Plane,
  purchase: ShoppingBag,
  education: GraduationCap,
  investment: TrendingUp,
  other: Target,
};

export default function GoalDetailsSheet({ goal, isOpen, onClose, onGoalUpdated }: GoalDetailsSheetProps) {
  const [accounts = []] = useSafeCollectionData<Account>(null, 'accounts');
  
  const [depositAmount, setDepositAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(() => accounts[0]?.id || '');
  const [depositNote, setDepositNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Set default account if needed
  React.useEffect(() => {
    if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  if (!goal) return null;

  const currentAmt = goal.currentAmount || 0;
  const targetAmt = goal.targetAmount || 1;
  const progressPercent = Math.min(100, Math.round((currentAmt / targetAmt) * 100));
  const isCompleted = goal.status === 'completed' || currentAmt >= targetAmt;

  // Real-time Gora AI Coaching analysis
  const pacing = evaluateGoalPace(goal);
  const IconComponent = CATEGORY_ICONS[goal.category] || Target;

  const handleQuickAdd = (amt: number) => {
    setDepositAmount(amt.toString());
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const amountNum = parseFloat(depositAmount.replace(/,/g, ''));
    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage('Please enter a valid deposit amount.');
      return;
    }
    if (!selectedAccountId) {
      setErrorMessage('Please select a funding account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await depositToGoal(goal.id, amountNum, selectedAccountId, depositNote.trim() || undefined);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to deposit to goal.');
      } else {
        setSuccessMessage(`Successfully deposited ₱${amountNum.toLocaleString()}!`);
        setDepositAmount('');
        setDepositNote('');
        if (onGoalUpdated) onGoalUpdated();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error executing deposit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteGoal(goal.id);
      if (onGoalUpdated) onGoalUpdated();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete goal.');
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={goal.title}>
      <div className="space-y-4">
        {/* Messages */}
        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {successMessage}
          </div>
        )}

        {/* Progress & Milestone Overview */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/80 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                style={{ backgroundColor: goal.color || '#8B5CF6' }}
              >
                <IconComponent size={20} />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  {goal.category.replace('_', ' ')}
                </span>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">
                  ₱{currentAmt.toLocaleString()}
                  <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400 ml-1">
                    of ₱{targetAmt.toLocaleString()}
                  </span>
                </h3>
              </div>
            </div>

            <div className="text-right">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                isCompleted 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
                  : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
              }`}>
                {isCompleted ? 'Completed 🎉' : `${progressPercent}% Achieved`}
              </span>
              <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center justify-end gap-1">
                <Clock size={12} />
                {pacing.isOverdue ? 'Target date reached' : `${pacing.daysRemaining} days left`}
              </p>
            </div>
          </div>

          {/* Animated Multi-milestone Progress Bar */}
          <div className="space-y-1">
            <div className="relative w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: goal.color || '#8B5CF6',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-zinc-400 px-0.5">
              <span>₱0 (0%)</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>₱{targetAmt.toLocaleString()} (100%)</span>
            </div>
          </div>
        </div>

        {/* Gora AI Real-Time Coaching Card */}
        <div className="p-3.5 bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent rounded-2xl border border-purple-500/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
              <Sparkles size={16} />
              <span>Gora AI Financial Coach</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
              pacing.status === 'ahead' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
              pacing.status === 'on_track' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
              pacing.status === 'completed' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
              'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            }`}>
              {pacing.status === 'ahead' ? '🚀 Ahead of Schedule' :
               pacing.status === 'on_track' ? '🎯 On Track' :
               pacing.status === 'completed' ? '🎉 Goal Achieved' : '⚠️ Action Recommended'}
            </span>
          </div>
          <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed">
            {pacing.advice}
          </p>
          {pacing.suggestedNextDeposit > 0 && !isCompleted && (
            <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 p-2 rounded-xl border border-purple-500/20 flex items-center justify-between">
              <span>Next Recommended Allocation:</span>
              <span className="font-bold">₱{pacing.suggestedNextDeposit.toLocaleString()} (Payroll 15th/30th)</span>
            </div>
          )}
        </div>

        {/* Deposit Funds Form */}
        {!isCompleted && (
          <form onSubmit={handleDeposit} className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                Deposit Into Goal
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">Quick Transfer</span>
            </div>

            {/* Quick Amount Pills */}
            <div className="flex flex-wrap gap-1.5">
              {[500, 1000, 2500, 5000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleQuickAdd(amt)}
                  className="px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:border-purple-500 transition-colors active:scale-95"
                >
                  +₱{amt.toLocaleString()}
                </button>
              ))}
              {pacing.suggestedNextDeposit > 0 && (
                <button
                  type="button"
                  onClick={() => handleQuickAdd(pacing.suggestedNextDeposit)}
                  className="px-2.5 py-1 bg-purple-500/15 border border-purple-500/30 rounded-lg text-xs font-bold text-purple-700 dark:text-purple-300 hover:bg-purple-500/25 transition-colors active:scale-95"
                >
                  AI Match (+₱{pacing.suggestedNextDeposit.toLocaleString()})
                </button>
              )}
            </div>

            {/* Amount and Source Account */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">₱</span>
                <input
                  type="number"
                  id="goal-deposit-amount-input"
                  min="1"
                  step="10"
                  placeholder="Deposit Amount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <select
                id="goal-deposit-source-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (₱{acc.balance.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              id="goal-deposit-note-input"
              placeholder="Deposit note (e.g. Mid-month 15th payday allocation)"
              value={depositNote}
              onChange={(e) => setDepositNote(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            <button
              type="submit"
              id="goal-submit-deposit-button"
              disabled={isSubmitting}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Plus size={16} />
              <span>{isSubmitting ? 'Processing Deposit...' : 'Confirm Deposit'}</span>
            </button>
          </form>
        )}

        {/* Deposit History Log */}
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Deposit History ({goal.deposits?.length || 0})
          </span>

          {(!goal.deposits || goal.deposits.length === 0) ? (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700/50 text-center text-xs text-zinc-500">
              No deposits recorded yet. Make your first deposit above!
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {goal.deposits.map((dep) => (
                <div
                  key={dep.id}
                  className="p-2.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={14} />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-zinc-900 dark:text-white block leading-tight">
                        +₱{dep.amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {dep.sourceAccountName || 'Account'} • {new Date(dep.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {dep.note && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 italic max-w-[140px] truncate">
                      {dep.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger Zone: Delete Goal */}
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 text-xs font-semibold text-zinc-500 hover:text-rose-500 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Trash2 size={14} />
              <span>Delete Goal</span>
            </button>
          ) : (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2 text-center">
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Are you sure you want to remove this financial goal?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="goal-delete-confirm-button"
                  onClick={handleDelete}
                  className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 rounded-lg text-xs font-bold text-white shadow-sm"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
