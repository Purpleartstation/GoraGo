import React, { useState } from 'react';
import BottomSheet from './BottomSheet';
import { useSafeCollectionData, saveGoal, saveBill, depositToGoal } from '../db';
import type { Account, Transaction, GoalCategory, Goal } from '../db';
import { calculateGoalPlan } from '../utils/goalPlanner';
import type { GoalAIPlan } from '../utils/goalPlanner';
import { Target, Sparkles, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Plane, ShoppingBag, GraduationCap, TrendingUp, HelpCircle } from 'lucide-react';

interface GoalCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoalCreated?: (goal: Goal) => void;
}

const CATEGORIES: { id: GoalCategory; label: string; icon: any; color: string }[] = [
  { id: 'savings', label: 'General Savings', icon: Target, color: '#3B82F6' },
  { id: 'emergency_fund', label: 'Emergency Fund', icon: ShieldCheck, color: '#F59E0B' },
  { id: 'travel', label: 'Travel & Vacay', icon: Plane, color: '#8B5CF6' },
  { id: 'purchase', label: 'Major Purchase', icon: ShoppingBag, color: '#EC4899' },
  { id: 'education', label: 'Education / Upskilling', icon: GraduationCap, color: '#10B981' },
  { id: 'investment', label: 'Investment Seed', icon: TrendingUp, color: '#06B6D4' },
  { id: 'other', label: 'Custom Goal', icon: HelpCircle, color: '#64748B' },
];

export default function GoalCreationModal({ isOpen, onClose, onGoalCreated }: GoalCreationModalProps) {
  const [accounts = []] = useSafeCollectionData<Account>(null, 'accounts');
  const [transactions = []] = useSafeCollectionData<Transaction>(null, 'transactions');

  // Form State
  const [step, setStep] = useState<'input' | 'ai_preview'>('input');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<GoalCategory>('savings');
  const [description, setDescription] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split('T')[0];
  });
  const [initialDeposit, setInitialDeposit] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(() => accounts[0]?.id || '');
  const [createReminderBill, setCreateReminderBill] = useState(true);
  const selectedScheduleFreq: 'daily' | 'weekly' | 'bimonthly' | 'monthly' = 'bimonthly';

  // Calculated AI Plan
  const [aiPlan, setAiPlan] = useState<GoalAIPlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derive initial account safely
  const activeAccountId = selectedAccountId || accounts[0]?.id || '';

  const handleReset = () => {
    setStep('input');
    setTitle('');
    setCategory('savings');
    setDescription('');
    setTargetAmount('');
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    setTargetDate(d.toISOString().split('T')[0]);
    setInitialDeposit('');
    setCreateReminderBill(true);
    setAiPlan(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const amountNum = parseFloat(targetAmount.replace(/,/g, ''));
    if (!title.trim()) {
      setErrorMessage('Please enter a goal title.');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMessage('Please enter a valid target amount.');
      return;
    }
    if (!targetDate) {
      setErrorMessage('Please pick a target completion date.');
      return;
    }

    const initDepNum = parseFloat(initialDeposit.replace(/,/g, '')) || 0;
    if (initDepNum > 0 && selectedAccountId) {
      const acc = accounts.find(a => a.id === selectedAccountId);
      if (acc && acc.balance < initDepNum) {
        setErrorMessage(`Initial deposit exceeds ${acc.name} balance (₱${acc.balance.toLocaleString()}).`);
        return;
      }
    }

    // Generate Gora AI CFO breakdown
    const plan = calculateGoalPlan({
      title: title.trim(),
      category,
      targetAmount: amountNum,
      targetDate,
      initialDeposit: initDepNum,
      transactions: transactions || [],
    });

    setAiPlan(plan);
    setStep('ai_preview');
  };

  const handleConfirmAndSave = async () => {
    if (!aiPlan) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const amountNum = parseFloat(targetAmount.replace(/,/g, ''));
      const initDepNum = parseFloat(initialDeposit.replace(/,/g, '')) || 0;
      const selectedCat = CATEGORIES.find(c => c.id === category);

      const goalId = `goal_${Date.now()}`;
      let reminderBillId: string | undefined;

      // 1. If user opted for automatic bill / payday reminders schedule
      if (createReminderBill && aiPlan.requiredBiMonthly > 0) {
        reminderBillId = `bill_goal_${Date.now()}`;
        const autoBill = {
          id: reminderBillId,
          householdId: 'h_sample',
          name: `🎯 Goal Savings: ${title.trim()} (Payday Allocation)`,
          accountId: activeAccountId || accounts[0]?.id || 'acc_1',
          amount: Math.round(aiPlan.requiredBiMonthly),
          dueDay: 15,
          dueType: 'monthly' as const,
          status: 'upcoming' as const,
        };
        await saveBill(autoBill);
      }

      // 2. Formulate Goal record
      const newGoal: Goal = {
        id: goalId,
        householdId: 'h_sample',
        title: title.trim(),
        category,
        description: description.trim() || undefined,
        targetDate,
        targetAmount: amountNum,
        currentAmount: 0,
        initialDeposit: initDepNum > 0 ? initDepNum : undefined,
        linkedAccountId: activeAccountId || undefined,
        color: selectedCat?.color || '#8B5CF6',
        icon: selectedCat?.id || 'target',
        status: 'active',
        createdAt: Date.now(),
        scheduleFrequency: selectedScheduleFreq,
        scheduleAmount: selectedScheduleFreq === 'bimonthly' ? aiPlan.requiredBiMonthly :
                        selectedScheduleFreq === 'monthly' ? aiPlan.requiredMonthly :
                        selectedScheduleFreq === 'weekly' ? aiPlan.requiredWeekly : aiPlan.requiredDaily,
        reminderBillId,
        aiBreakdown: {
          requiredDaily: aiPlan.requiredDaily,
          requiredWeekly: aiPlan.requiredWeekly,
          requiredMonthly: aiPlan.requiredMonthly,
          requiredBiMonthly: aiPlan.requiredBiMonthly,
          feasibilityScore: aiPlan.feasibilityScore,
          feasibilityRating: aiPlan.feasibilityRating,
          advice: aiPlan.advice,
          scheduleProposed: aiPlan.scheduleProposed,
          activeTip: `Deposit ₱${aiPlan.requiredBiMonthly.toLocaleString()} every 15th & 30th to reach your ₱${amountNum.toLocaleString()} goal on time.`,
        },
        deposits: [],
      };

      await saveGoal(newGoal);

      // 3. Process initial deposit if requested
      if (initDepNum > 0 && activeAccountId) {
        await depositToGoal(goalId, initDepNum, activeAccountId, 'Initial Goal Funding');
      }

      if (onGoalCreated) {
        onGoalCreated(newGoal);
      }

      handleClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to save goal. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const feasibilityColors = {
    High: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    Moderate: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    Challenging: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    Aggressive: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={step === 'input' ? 'Create Financial Goal' : 'Gora AI Plan & Feasibility'}>
      {errorMessage && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {step === 'input' ? (
        <form onSubmit={handleAnalyze} className="space-y-4">
          {/* Goal Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Goal Title
            </label>
            <div className="relative">
              <input
                type="text"
                id="goal-title-input"
                required
                placeholder="e.g. Japan Holiday, Emergency Fund, New MacBook"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => {
                const IconComponent = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-400 ring-1 ring-purple-500'
                        : 'bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700/50 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                    >
                      <IconComponent size={14} />
                    </div>
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Amount & Target Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                Target Amount (₱)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">₱</span>
                <input
                  type="number"
                  id="goal-target-amount-input"
                  required
                  min="100"
                  step="100"
                  placeholder="50,000"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-zinc-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                Target Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  id="goal-target-date-input"
                  required
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-zinc-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Initial Deposit (Optional) */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Initial Seed Deposit (Optional)</span>
              <span className="text-[10px] uppercase font-semibold text-zinc-400">Jumpstart</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <input
                  type="number"
                  id="goal-initial-deposit-input"
                  min="0"
                  step="100"
                  placeholder="Deposit ₱0"
                  value={initialDeposit}
                  onChange={(e) => setInitialDeposit(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <select
                  id="goal-source-account-select"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} (₱{acc.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Note or Purpose (Optional)
            </label>
            <input
              type="text"
              id="goal-description-input"
              placeholder="e.g. Budgeting for flights, Airbnb, and pocket money"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-zinc-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Submit / Analyze Button */}
          <button
            type="submit"
            id="goal-analyze-plan-button"
            className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <Sparkles size={18} />
            <span>Analyze with Gora AI</span>
            <ArrowRight size={18} />
          </button>
        </form>
      ) : (
        /* Step 2: AI Breakdown & Feasibility Assessment Preview */
        <div className="space-y-4">
          {aiPlan && (
            <>
              {/* Feasibility Assessment Header Card */}
              <div className="p-4 bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent rounded-2xl border border-purple-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white">Gora AI CFO Feasibility</h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{aiPlan.daysRemaining} days remaining</p>
                    </div>
                  </div>
                  <div className={`px-2.5 py-1 rounded-full border text-xs font-bold ${feasibilityColors[aiPlan.feasibilityRating]}`}>
                    {aiPlan.feasibilityRating} Feasibility ({aiPlan.feasibilityScore}%)
                  </div>
                </div>

                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium bg-white/60 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                  {aiPlan.advice}
                </p>
              </div>

              {/* Required Deposit Breakdown Grid */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Required Savings Pace
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-center">
                    <span className="block text-[10px] font-bold text-zinc-400 uppercase">Daily</span>
                    <span className="text-sm font-extrabold text-zinc-900 dark:text-white">₱{aiPlan.requiredDaily.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-center">
                    <span className="block text-[10px] font-bold text-zinc-400 uppercase">Weekly</span>
                    <span className="text-sm font-extrabold text-zinc-900 dark:text-white">₱{aiPlan.requiredWeekly.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-purple-500/10 dark:bg-purple-500/15 rounded-xl border border-purple-500/30 text-center">
                    <span className="block text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">Semi-Monthly (15th/30th)</span>
                    <span className="text-sm font-extrabold text-purple-700 dark:text-purple-300">₱{aiPlan.requiredBiMonthly.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-center">
                    <span className="block text-[10px] font-bold text-zinc-400 uppercase">Monthly</span>
                    <span className="text-sm font-extrabold text-zinc-900 dark:text-white">₱{aiPlan.requiredMonthly.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Automatic Bill / Reminders Schedule Proposal */}
              <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/70 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    id="goal-auto-bill-checkbox"
                    checked={createReminderBill}
                    onChange={(e) => setCreateReminderBill(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-zinc-300 dark:border-zinc-700"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white">
                        Auto-Schedule Payday Reminder in Bills
                      </span>
                      <span className="text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded font-bold">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Adds an automated ₱{aiPlan.requiredBiMonthly.toLocaleString()} reminder to your Bills calendar every 15th and 30th payroll.
                    </p>
                  </div>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className="flex-1 py-3 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold rounded-xl text-xs transition-colors"
                >
                  Adjust Details
                </button>
                <button
                  type="button"
                  id="goal-confirm-save-button"
                  disabled={isSubmitting}
                  onClick={handleConfirmAndSave}
                  className="flex-2 py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  <span>{isSubmitting ? 'Activating Goal...' : 'Activate Financial Goal'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
