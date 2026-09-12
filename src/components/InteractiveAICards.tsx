import React, { useState, useMemo } from 'react';
import { Target, TrendingUp, CreditCard, PieChart, ShoppingBag, ArrowRight, Zap, CheckCircle2, AlertCircle, ShieldAlert, Sparkles, Check, Edit2, AlertTriangle, CheckCircle } from 'lucide-react';
import { useSafeCollectionData, saveTransaction, saveGoal } from '../db';
import type { Account, Category, Transaction, Goal, GoalCategory } from '../db';
import { useAppStore } from '../store';

export interface InteractiveWidgetData {
  type: 'savings_simulator' | 'debt_payoff' | 'budget_breakdown' | 'purchase_feasibility' | 'cashflow_comparison' | 'transaction_confirmation' | 'goal_creation_handshake';
  title: string;
  description?: string;
  params?: {
    targetAmount?: number;
    monthlyContribution?: number;
    costToEvaluate?: number;
    extraPayment?: number;
    needs?: number;
    wants?: number;
    savings?: number;
    monthlySurplus?: number;
    goalTitle?: string;
    targetDate?: string;
    category?: string;
    paydayBreakdown?: number;
    monthlyBreakdown?: number;
    feasibilityRating?: 'High' | 'Moderate' | 'Challenging' | 'Aggressive';
    stagedTransaction?: {
      note: string;
      amount: number;
      type: 'expense' | 'income';
      categoryId: string;
      accountId?: string;
    };
  };
}

interface WidgetProps {
  widget: InteractiveWidgetData;
  financialSummary?: {
    totalMoney?: number;
    totalDebt?: number;
    totalBillsMonthly?: number;
    debts?: Array<{ name: string; lender?: string; totalAmount?: number; remainingAmount?: number }>;
    cashFlow?: {
      monthly?: { inflow?: number; outflow?: number; net?: number };
    };
  };
  onSendQuery: (prompt: string) => void;
  onApplyGoalToRoadmap?: (goal: number) => void;
}

export function InteractiveAICard({ widget, financialSummary, onSendQuery, onApplyGoalToRoadmap }: WidgetProps) {
  const safeSummary = {
    totalMoney: financialSummary?.totalMoney ?? 0,
    totalDebt: financialSummary?.totalDebt ?? 0,
    totalBillsMonthly: financialSummary?.totalBillsMonthly ?? 0,
    debts: financialSummary?.debts ?? [],
    cashFlow: {
      monthly: {
        inflow: financialSummary?.cashFlow?.monthly?.inflow ?? 0,
        outflow: financialSummary?.cashFlow?.monthly?.outflow ?? 0,
        net: financialSummary?.cashFlow?.monthly?.net ?? 0
      }
    }
  };

  switch (widget.type) {
    case 'goal_creation_handshake':
      return (
        <GoalCreationHandshakeWidget
          widget={widget}
          financialSummary={safeSummary}
          onSendQuery={onSendQuery}
        />
      );
    case 'savings_simulator':
      return (
        <SavingsSimulatorWidget
          widget={widget}
          financialSummary={safeSummary}
          onSendQuery={onSendQuery}
          onApplyGoalToRoadmap={onApplyGoalToRoadmap}
        />
      );
    case 'debt_payoff':
      return (
        <DebtPayoffWidget
          widget={widget}
          financialSummary={safeSummary}
          onSendQuery={onSendQuery}
        />
      );
    case 'budget_breakdown':
      return (
        <BudgetBreakdownWidget
          widget={widget}
          financialSummary={safeSummary}
          onSendQuery={onSendQuery}
        />
      );
    case 'purchase_feasibility':
      return (
        <PurchaseFeasibilityWidget
          widget={widget}
          financialSummary={safeSummary}
          onSendQuery={onSendQuery}
        />
      );
    case 'cashflow_comparison':
      return (
        <CashflowComparisonWidget
          widget={widget}
          financialSummary={safeSummary}
          onSendQuery={onSendQuery}
        />
      );
    case 'transaction_confirmation':
      return (
        <TransactionConfirmationWidget
          widget={widget}
          onSendQuery={onSendQuery}
        />
      );
    default:
      return null;
  }
}

// ─── 0. Interactive Goal Creation Handshake Widget ───────────────────────────
function GoalCreationHandshakeWidget({
  widget,
  financialSummary,
  onSendQuery
}: WidgetProps) {
  const currentHouseholdId = useAppStore((s) => s.currentHouseholdId);
  const initialTitle = widget.params?.goalTitle || widget.title || "Target Savings Goal";
  const initialTarget = widget.params?.targetAmount || 50000;
  const initialDate = widget.params?.targetDate || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return d.toISOString().split('T')[0];
  })();

  const [title, setTitle] = useState(initialTitle);
  const [targetAmount, setTargetAmount] = useState<number>(initialTarget);
  const [targetDate, setTargetDate] = useState<string>(initialDate);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);

  // Compute payday & monthly requirements
  const { monthsRemaining, paydaysRemaining, perPayday, perMonth, feasibilityRating } = useMemo(() => {
    const now = new Date();
    const target = new Date(targetDate);
    const diffMonths = Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()));
    const paydays = Math.max(2, diffMonths * 2);
    const monthlyReq = Math.ceil(targetAmount / diffMonths);
    const paydayReq = Math.ceil(targetAmount / paydays);

    const monthlySurplus = Math.max(1000, financialSummary.cashFlow.monthly.net || 15000);
    const ratio = monthlyReq / monthlySurplus;

    let rating: 'High' | 'Moderate' | 'Challenging' | 'Aggressive' = 'High';
    if (ratio <= 0.4) rating = 'High';
    else if (ratio <= 0.7) rating = 'Moderate';
    else if (ratio <= 1.0) rating = 'Challenging';
    else rating = 'Aggressive';

    return {
      monthsRemaining: diffMonths,
      paydaysRemaining: paydays,
      perPayday: paydayReq,
      perMonth: monthlyReq,
      feasibilityRating: rating
    };
  }, [targetAmount, targetDate, financialSummary]);

  const handleCreateGoal = async () => {
    setIsSaving(true);
    try {
      const newGoal: Goal = {
        id: `goal_${Date.now()}`,
        householdId: currentHouseholdId || 'h_sample',
        title: title.trim() || 'New Savings Goal',
        category: (widget.params?.category as GoalCategory) || 'purchase',
        targetAmount: targetAmount,
        currentAmount: 0,
        targetDate: targetDate,
        status: 'active',
        createdAt: Date.now(),
        scheduleFrequency: 'bimonthly',
        scheduleAmount: perPayday,
        color: '#EC4899',
        icon: 'target',
        aiBreakdown: {
          requiredDaily: Math.ceil(perMonth / 30),
          requiredWeekly: Math.ceil(perMonth / 4),
          requiredMonthly: perMonth,
          requiredBiMonthly: perPayday,
          feasibilityScore: feasibilityRating === 'High' ? 95 : feasibilityRating === 'Moderate' ? 80 : 60,
          feasibilityRating: feasibilityRating,
          advice: `Tabi ng ₱${perPayday.toLocaleString()} kada 15th at 30th na sahod. Ang iyong Emergency Fund at fixed bills ay mananatiling 100% protektado.`,
          scheduleProposed: `₱${perPayday.toLocaleString()} every Payday (15th & 30th)`,
          activeTip: 'Auto-reminder set for your upcoming payday cycles.'
        },
        deposits: []
      };

      await saveGoal(newGoal);
      setIsSaved(true);
    } catch (err) {
      console.error("Failed to auto-create goal:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isSaved) {
    return (
      <div className="mt-2.5 p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-2xl space-y-2.5 animate-in fade-in duration-300">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
            <CheckCircle size={18} />
          </div>
          <div>
            <h5 className="font-black text-xs text-emerald-950 dark:text-emerald-100">✨ Savings Goal Created!</h5>
            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-semibold">{title} • ₱{targetAmount.toLocaleString()}</p>
          </div>
        </div>
        <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed bg-white/70 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-emerald-500/20">
          Nai-save na sa iyong Dashboard! Magse-set si GoraGo CFO ng payday alerts tuwing <strong>15th at 30th</strong> para sa iyong <strong>₱{perPayday.toLocaleString()}</strong> allocation.
        </p>
        <button
          type="button"
          onClick={() => onSendQuery(`Show my financial goals and next milestone`)}
          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
        >
          <Sparkles size={13} />
          <span>View Goals & Progress</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2.5 p-3.5 sm:p-4 bg-gradient-to-br from-pink-50/90 to-purple-50/90 dark:from-pink-950/40 dark:to-purple-950/40 border border-pink-300/60 dark:border-pink-500/40 rounded-3xl space-y-3 shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Target size={16} />
          </div>
          <div className="min-w-0">
            <h5 className="font-black text-xs text-zinc-900 dark:text-white truncate">{title}</h5>
            <p className="text-[10px] text-pink-700 dark:text-pink-300 font-medium truncate">
              Target Date: {new Date(targetDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} ({monthsRemaining} mos)
            </p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
          feasibilityRating === 'High' 
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' 
            : feasibilityRating === 'Moderate'
            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
            : 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30'
        }`}>
          {feasibilityRating} Feasibility
        </span>
      </div>

      {/* Payday Breakdown Stat Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white/80 dark:bg-zinc-900/70 p-2.5 rounded-2xl border border-pink-200/60 dark:border-pink-500/20 shadow-xs text-center">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">Every 15th & 30th</span>
          <span className="text-sm font-black text-pink-600 dark:text-pink-400 tabular-nums">
            ₱{perPayday.toLocaleString()}
          </span>
          <span className="text-[9px] text-zinc-500 dark:text-zinc-400 block mt-0.5">{paydaysRemaining} paydays</span>
        </div>
        <div className="bg-white/80 dark:bg-zinc-900/70 p-2.5 rounded-2xl border border-purple-200/60 dark:border-purple-500/20 shadow-xs text-center">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 block mb-0.5">Monthly Total</span>
          <span className="text-sm font-black text-purple-600 dark:text-purple-400 tabular-nums">
            ₱{perMonth.toLocaleString()}
          </span>
          <span className="text-[9px] text-zinc-500 dark:text-zinc-400 block mt-0.5">Across {monthsRemaining} months</span>
        </div>
      </div>

      {/* Buffer Guarantee Note */}
      <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">
        <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>Safety Net & Fixed Bills remain 100% protected and untouched.</span>
      </div>

      {/* Optional Customizer Collapse */}
      {isCustomizing && (
        <div className="bg-white/90 dark:bg-zinc-900/90 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2.5 animate-in slide-in-from-top-2 duration-200">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">
              Goal Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>
          <div>
            <div className="flex justify-between text-[10px] font-black uppercase text-zinc-500 dark:text-zinc-400 mb-1">
              <span>Target Amount</span>
              <span className="text-pink-600 dark:text-pink-400">₱{targetAmount.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="5000"
              max="1000000"
              step="5000"
              value={targetAmount}
              onChange={(e) => setTargetAmount(Number(e.target.value))}
              className="w-full accent-pink-600 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block mb-1">
              Target Completion Date
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={isSaving}
          onClick={handleCreateGoal}
          className="flex-1 py-2.5 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-pink-500/20 active:scale-95 transition-all cursor-pointer"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Sparkles size={14} />
              <span>✨ Yes, Create Savings Goal Now!</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setIsCustomizing(!isCustomizing)}
          className="px-3 py-2.5 bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-pink-200 dark:border-zinc-700 rounded-2xl text-xs font-bold flex items-center justify-center transition-all cursor-pointer shadow-xs"
          title="Tweak amount or date"
        >
          <Edit2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── 1. Savings Simulator Widget ─────────────────────────────────────────────
function SavingsSimulatorWidget({
  widget,
  financialSummary,
  onSendQuery,
  onApplyGoalToRoadmap
}: WidgetProps) {
  const initialTarget = widget.params?.targetAmount || 30000;
  const initialMonthly = widget.params?.monthlyContribution || Math.max(2000, Math.round((financialSummary.cashFlow.monthly.net || 10000) * 0.4));

  const [targetAmount, setTargetAmount] = useState<number>(initialTarget);
  const [monthlySavings, setMonthlySavings] = useState<number>(initialMonthly);

  const monthsToGoal = Math.max(1, Math.ceil(targetAmount / Math.max(500, monthlySavings)));
  const targetDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToGoal);
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }, [monthsToGoal]);

  const surplusRatio = useMemo(() => {
    const surplus = financialSummary.cashFlow.monthly.net || 15000;
    if (surplus <= 0) return 100;
    return Math.min(100, Math.round((monthlySavings / surplus) * 100));
  }, [monthlySavings, financialSummary]);

  return (
    <div className="mt-2.5 p-3.5 sm:p-4 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 rounded-2xl space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
            <Target size={15} />
          </div>
          <div>
            <h5 className="font-black text-xs text-purple-950 dark:text-purple-100">{widget.title}</h5>
            <p className="text-[10px] text-purple-700/80 dark:text-purple-300/80">{widget.description || "Interactive Savings & Goal Planner"}</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-200/70 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 rounded-full">
          Live Model
        </span>
      </div>

      {/* Sliders */}
      <div className="space-y-2.5 pt-1">
        <div>
          <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-zinc-600 dark:text-zinc-300">Savings Target:</span>
            <span className="text-purple-600 dark:text-purple-400 font-black">₱{targetAmount.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min="5000"
            max="250000"
            step="5000"
            value={targetAmount}
            onChange={(e) => setTargetAmount(Number(e.target.value))}
            className="w-full accent-purple-600 cursor-pointer h-1.5 bg-purple-200 dark:bg-purple-900 rounded-lg"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-zinc-600 dark:text-zinc-300">Monthly Contribution:</span>
            <span className="text-purple-600 dark:text-purple-400 font-black">₱{monthlySavings.toLocaleString()}/mo</span>
          </div>
          <input
            type="range"
            min="1000"
            max="30000"
            step="1000"
            value={monthlySavings}
            onChange={(e) => setMonthlySavings(Number(e.target.value))}
            className="w-full accent-purple-600 cursor-pointer h-1.5 bg-purple-200 dark:bg-purple-900 rounded-lg"
          />
        </div>
      </div>

      {/* Live Calculated Stats */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-purple-100 dark:border-purple-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Timeline</span>
          <span className="text-xs sm:text-sm font-black text-purple-700 dark:text-purple-300">{monthsToGoal} mos</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-purple-100 dark:border-purple-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Reach By</span>
          <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">{targetDate}</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-purple-100 dark:border-purple-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Surplus Used</span>
          <span className="text-xs sm:text-sm font-black text-zinc-800 dark:text-zinc-200">{surplusRatio}%</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          type="button"
          onClick={() => onSendQuery(`I want to save ₱${targetAmount.toLocaleString()} by putting aside ₱${monthlySavings.toLocaleString()} per month. How can I stay on track?`)}
          className="flex-1 py-1.5 px-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
        >
          <Sparkles size={13} />
          <span>Ask AI to Build Plan</span>
        </button>
        {onApplyGoalToRoadmap && (
          <button
            type="button"
            onClick={() => onApplyGoalToRoadmap(targetAmount)}
            className="py-1.5 px-2.5 bg-white dark:bg-zinc-900 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-[11px] font-bold hover:bg-purple-100 dark:hover:bg-purple-950 transition-all flex items-center gap-1"
          >
            <span>Set in Roadmap</span>
            <ArrowRight size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 2. Debt Payoff Accelerator Widget ────────────────────────────────────────
function DebtPayoffWidget({
  widget,
  financialSummary,
  onSendQuery
}: WidgetProps) {
  const [strategy, setStrategy] = useState<'snowball' | 'avalanche'>('snowball');
  const [extraPayment, setExtraPayment] = useState<number>(widget.params?.extraPayment || 2000);

  const debts = financialSummary.debts || [];
  const totalDebt = financialSummary.totalDebt || 0;
  const baseMonthly = Math.max(1500, Math.round(totalDebt / 12));
  const acceleratedMonthly = baseMonthly + extraPayment;

  const standardMonths = Math.max(1, Math.ceil(totalDebt / baseMonthly));
  const acceleratedMonths = Math.max(1, Math.ceil(totalDebt / acceleratedMonthly));
  const monthsSaved = Math.max(0, standardMonths - acceleratedMonths);
  const estimatedInterestSaved = Math.round(monthsSaved * (totalDebt * 0.015));

  // Ordered debts based on selected strategy
  const sortedDebts = [...debts].sort((a, b) => {
    if (strategy === 'snowball') {
      return (a.remainingAmount || a.totalAmount || 0) - (b.remainingAmount || b.totalAmount || 0);
    }
    return (b.remainingAmount || b.totalAmount || 0) - (a.remainingAmount || a.totalAmount || 0);
  });

  return (
    <div className="mt-2.5 p-3.5 sm:p-4 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-2xl space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-sm">
            <CreditCard size={15} />
          </div>
          <div>
            <h5 className="font-black text-xs text-rose-950 dark:text-rose-100">{widget.title}</h5>
            <p className="text-[10px] text-rose-700/80 dark:text-rose-300/80">Total Debt: ₱{totalDebt.toLocaleString()}</p>
          </div>
        </div>
        <div className="flex bg-rose-200/70 dark:bg-rose-900/60 p-0.5 rounded-lg text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setStrategy('snowball')}
            className={`px-2 py-0.5 rounded-md transition-all ${strategy === 'snowball' ? 'bg-white dark:bg-zinc-900 text-rose-600 shadow-xs' : 'text-rose-800 dark:text-rose-300'}`}
          >
            Snowball
          </button>
          <button
            type="button"
            onClick={() => setStrategy('avalanche')}
            className={`px-2 py-0.5 rounded-md transition-all ${strategy === 'avalanche' ? 'bg-white dark:bg-zinc-900 text-rose-600 shadow-xs' : 'text-rose-800 dark:text-rose-300'}`}
          >
            Avalanche
          </button>
        </div>
      </div>

      {/* Extra Monthly Payment Slider */}
      <div>
        <div className="flex justify-between text-xs font-bold mb-1">
          <span className="text-zinc-600 dark:text-zinc-300">Extra Monthly Payment:</span>
          <span className="text-rose-600 dark:text-rose-400 font-black">+₱{extraPayment.toLocaleString()}/mo</span>
        </div>
        <input
          type="range"
          min="500"
          max="10000"
          step="500"
          value={extraPayment}
          onChange={(e) => setExtraPayment(Number(e.target.value))}
          className="w-full accent-rose-600 cursor-pointer h-1.5 bg-rose-200 dark:bg-rose-900 rounded-lg"
        />
      </div>

      {/* Accelerated Payoff Results */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-rose-100 dark:border-rose-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Debt-Free In</span>
          <span className="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-300">{acceleratedMonths} mos</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-rose-100 dark:border-rose-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Time Saved</span>
          <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">{monthsSaved} mos</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-rose-100 dark:border-rose-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Est. Interest Saved</span>
          <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">₱{estimatedInterestSaved.toLocaleString()}</span>
        </div>
      </div>

      {/* Target Priority Order */}
      {sortedDebts.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-bold text-zinc-500 uppercase">Payoff Priority ({strategy}):</span>
          <div className="space-y-1">
            {sortedDebts.slice(0, 3).map((d, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] bg-white dark:bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-rose-100 dark:border-rose-900/40">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-4 h-4 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{d.name}</span>
                </div>
                <span className="font-black text-rose-600 dark:text-rose-400 shrink-0">
                  ₱{(d.remainingAmount ?? d.totalAmount ?? 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => onSendQuery(`I want to use the ${strategy} strategy with an extra ₱${extraPayment.toLocaleString()}/mo to pay off my ₱${totalDebt.toLocaleString()} debt. Give me a step-by-step payoff plan.`)}
        className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
      >
        <Zap size={14} />
        <span>Generate {strategy.toUpperCase()} Step-by-Step Schedule</span>
      </button>
    </div>
  );
}

// ─── 3. 50/30/20 Budget Breakdown Widget ──────────────────────────────────────
function BudgetBreakdownWidget({
  widget,
  financialSummary,
  onSendQuery
}: WidgetProps) {
  const [needsPct, setNeedsPct] = useState<number>(widget.params?.needs || 50);
  const [wantsPct, setWantsPct] = useState<number>(widget.params?.wants || 30);
  const savingsPct = Math.max(0, 100 - needsPct - wantsPct);

  const monthlyIncome = Math.max(25000, financialSummary.cashFlow.monthly.inflow || 40000);
  const needsAmt = Math.round(monthlyIncome * (needsPct / 100));
  const wantsAmt = Math.round(monthlyIncome * (wantsPct / 100));
  const savingsAmt = Math.round(monthlyIncome * (savingsPct / 100));

  return (
    <div className="mt-2.5 p-3.5 sm:p-4 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <PieChart size={15} />
          </div>
          <div>
            <h5 className="font-black text-xs text-indigo-950 dark:text-indigo-100">{widget.title}</h5>
            <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80">Monthly Base Income: ₱{monthlyIncome.toLocaleString()}</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-200/70 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 rounded-full">
          Custom Matrix
        </span>
      </div>

      {/* Multi-Segment Visual Bar */}
      <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden flex shadow-inner">
        <div style={{ width: `${needsPct}%` }} className="bg-blue-500 h-full transition-all" title={`Needs: ${needsPct}%`} />
        <div style={{ width: `${wantsPct}%` }} className="bg-amber-500 h-full transition-all" title={`Wants: ${wantsPct}%`} />
        <div style={{ width: `${savingsPct}%` }} className="bg-emerald-500 h-full transition-all" title={`Savings: ${savingsPct}%`} />
      </div>

      {/* Allocation Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/40">
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 block">Needs ({needsPct}%)</span>
          <span className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white">₱{needsAmt.toLocaleString()}</span>
          <span className="text-[9px] text-zinc-400 block mt-0.5">Rent, food, utilities</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/40">
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">Wants ({wantsPct}%)</span>
          <span className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white">₱{wantsAmt.toLocaleString()}</span>
          <span className="text-[9px] text-zinc-400 block mt-0.5">Dining, leisure</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">Savings ({savingsPct}%)</span>
          <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">₱{savingsAmt.toLocaleString()}</span>
          <span className="text-[9px] text-zinc-400 block mt-0.5">Emergency & goals</span>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-2 pt-1 text-xs">
        <div>
          <div className="flex justify-between font-bold mb-1">
            <span className="text-zinc-600 dark:text-zinc-300">Needs Ratio:</span>
            <span className="text-blue-600 font-bold">{needsPct}%</span>
          </div>
          <input
            type="range"
            min="30"
            max="70"
            step="5"
            value={needsPct}
            onChange={(e) => setNeedsPct(Number(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer h-1.5 bg-blue-200 dark:bg-blue-900 rounded-lg"
          />
        </div>
        <div>
          <div className="flex justify-between font-bold mb-1">
            <span className="text-zinc-600 dark:text-zinc-300">Wants Ratio:</span>
            <span className="text-amber-600 font-bold">{wantsPct}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="50"
            step="5"
            value={wantsPct}
            onChange={(e) => setWantsPct(Number(e.target.value))}
            className="w-full accent-amber-600 cursor-pointer h-1.5 bg-amber-200 dark:bg-amber-900 rounded-lg"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSendQuery(`Based on my ${needsPct}% Needs (₱${needsAmt.toLocaleString()}), ${wantsPct}% Wants (₱${wantsAmt.toLocaleString()}), and ${savingsPct}% Savings (₱${savingsAmt.toLocaleString()}), how do my actual expenses match up?`)}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
      >
        <Sparkles size={14} />
        <span>Compare with My Real Transactions</span>
      </button>
    </div>
  );
}

// ─── 4. Purchase Feasibility & Safety Check Widget ───────────────────────────
function PurchaseFeasibilityWidget({
  widget,
  financialSummary,
  onSendQuery
}: WidgetProps) {
  const initialCost = widget.params?.costToEvaluate || 15000;
  const [cost, setCost] = useState<number>(initialCost);

  const totalMoney = financialSummary.totalMoney || 0;
  const monthlySurplus = Math.max(1000, financialSummary.cashFlow.monthly.net || 1000);
  const remainingCash = totalMoney - cost;
  const monthsToRecover = (cost / monthlySurplus).toFixed(1);
  const cashBufferPct = Math.round((cost / Math.max(1, totalMoney)) * 100);

  let status: { label: string; color: string; icon: any; advice: string };
  if (cashBufferPct <= 25 && cost <= monthlySurplus * 1.5) {
    status = {
      label: 'Safe to Purchase',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300',
      icon: CheckCircle2,
      advice: 'You have enough cash reserves to absorb this purchase without depleting emergency buffers.'
    };
  } else if (cashBufferPct <= 50 && cost <= monthlySurplus * 3) {
    status = {
      label: 'Moderate Stretch',
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300',
      icon: AlertCircle,
      advice: `This will take ~${monthsToRecover} months of surplus to recover. Consider saving up for 2 months first.`
    };
  } else {
    status = {
      label: 'High Risk / Unadvisable',
      color: 'text-rose-600 bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300',
      icon: ShieldAlert,
      advice: 'This will severely deplete your liquid cash reserves or emergency fund. Not recommended right now.'
    };
  }

  const StatusIcon = status.icon;

  return (
    <div className="mt-2.5 p-3.5 sm:p-4 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
            <ShoppingBag size={15} />
          </div>
          <div>
            <h5 className="font-black text-xs text-emerald-950 dark:text-emerald-100">{widget.title}</h5>
            <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80">Current Money: ₱{totalMoney.toLocaleString()}</p>
          </div>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${status.color}`}>
          <StatusIcon size={12} />
          <span>{status.label}</span>
        </div>
      </div>

      {/* Cost Slider */}
      <div>
        <div className="flex justify-between text-xs font-bold mb-1">
          <span className="text-zinc-600 dark:text-zinc-300">Purchase Price:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-black">₱{cost.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min="1000"
          max="100000"
          step="1000"
          value={cost}
          onChange={(e) => setCost(Number(e.target.value))}
          className="w-full accent-emerald-600 cursor-pointer h-1.5 bg-emerald-200 dark:bg-emerald-900 rounded-lg"
        />
      </div>

      {/* Impact Indicators */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-emerald-100 dark:border-emerald-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Remaining Cash</span>
          <span className={`text-xs sm:text-sm font-black ${remainingCash < 0 ? 'text-red-500' : 'text-zinc-900 dark:text-white'}`}>
            ₱{remainingCash.toLocaleString()}
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-emerald-100 dark:border-emerald-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Cash Impact</span>
          <span className="text-xs sm:text-sm font-black text-amber-600 dark:text-amber-400">{cashBufferPct}% of liquid</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2 rounded-xl text-center border border-emerald-100 dark:border-emerald-900/50 shadow-xs">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">Recovery Time</span>
          <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">{monthsToRecover} mos</span>
        </div>
      </div>

      <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed bg-white/80 dark:bg-zinc-900/80 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
        💡 {status.advice}
      </p>

      <button
        type="button"
        onClick={() => onSendQuery(`Can I afford to buy an item worth ₱${cost.toLocaleString()} right now without messing up my savings?`)}
        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
      >
        <Sparkles size={14} />
        <span>Ask AI: Best Timing & Strategy</span>
      </button>
    </div>
  );
}

// ─── 5. Cashflow Comparison & Expense Cut Simulator ──────────────────────────
function CashflowComparisonWidget({
  widget,
  financialSummary,
  onSendQuery
}: WidgetProps) {
  const [cutPct, setCutPct] = useState<number>(15);
  const monthlyInflow = Math.max(30000, financialSummary.cashFlow.monthly.inflow || 45000);
  const monthlyOutflow = Math.max(15000, financialSummary.cashFlow.monthly.outflow || 30000);
  const currentSurplus = monthlyInflow - monthlyOutflow;

  const monthlySavingsBoost = Math.round(monthlyOutflow * (cutPct / 100));
  const newSurplus = currentSurplus + monthlySavingsBoost;
  const oneYearCompounded = newSurplus * 12;

  return (
    <div className="mt-2.5 p-3.5 sm:p-4 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl space-y-3 shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-sm">
            <TrendingUp size={15} />
          </div>
          <div>
            <h5 className="font-black text-xs text-amber-950 dark:text-amber-100">{widget.title}</h5>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80">Monthly Outflow: ₱{monthlyOutflow.toLocaleString()}</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 rounded-full">
          Surplus Boost
        </span>
      </div>

      {/* Discretionary Cut Slider */}
      <div>
        <div className="flex justify-between text-xs font-bold mb-1">
          <span className="text-zinc-600 dark:text-zinc-300">Trim Spending by:</span>
          <span className="text-amber-600 dark:text-amber-400 font-black">-{cutPct}% (-₱{monthlySavingsBoost.toLocaleString()}/mo)</span>
        </div>
        <input
          type="range"
          min="5"
          max="35"
          step="5"
          value={cutPct}
          onChange={(e) => setCutPct(Number(e.target.value))}
          className="w-full accent-amber-600 cursor-pointer h-1.5 bg-amber-200 dark:bg-amber-900 rounded-lg"
        />
      </div>

      {/* Dynamic Results */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50 text-center">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">New Monthly Surplus</span>
          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">₱{newSurplus.toLocaleString()}/mo</span>
          <span className="text-[9px] text-emerald-500 font-bold block">+₱{monthlySavingsBoost.toLocaleString()} more</span>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50 text-center">
          <span className="text-[9px] uppercase font-bold text-zinc-400 block">1-Year Accumulated</span>
          <span className="text-sm font-black text-purple-600 dark:text-purple-400">₱{oneYearCompounded.toLocaleString()}</span>
          <span className="text-[9px] text-zinc-400 block">Annual wealth booster</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSendQuery(`If I cut my monthly expenses by ${cutPct}% (saving ₱${monthlySavingsBoost.toLocaleString()}/mo), what specific categories should I reduce first?`)}
        className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
      >
        <Sparkles size={14} />
        <span>Analyze Expense Categories to Cut</span>
      </button>
    </div>
  );
}

// ─── 6. Transaction Confirmation Widget ──────────────────────────────────────
function TransactionConfirmationWidget({
  widget,
  onSendQuery
}: {
  widget: InteractiveWidgetData;
  onSendQuery: (prompt: string) => void;
}) {
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const [allAccounts] = useSafeCollectionData<Account>(null, 'accounts');
  const [allCategories] = useSafeCollectionData<Category>(null, 'categories');

  const staged = widget.params?.stagedTransaction;
  const initialNote = staged?.note || 'Transaction';
  const initialAmount = staged?.amount || 0;
  const initialType = staged?.type || 'expense';
  const initialCategoryId = staged?.categoryId || 'cat_food';
  const initialAccountId = staged?.accountId || '';

  const [note, setNote] = useState(initialNote);
  const [amount, setAmount] = useState(initialAmount);
  const [type, setType] = useState<'expense' | 'income'>(initialType);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [accountId, setAccountId] = useState(initialAccountId);

  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const accounts = useMemo(() => allAccounts || [], [allAccounts]);
  const categories = useMemo(() => allCategories || [], [allCategories]);

  const selectedAccountName = useMemo(() => {
    return accounts.find(a => a.id === accountId)?.name || 'None Selected';
  }, [accounts, accountId]);

  const selectedCategoryName = useMemo(() => {
    return categories.find(c => c.id === categoryId)?.name || 'Uncategorized';
  }, [categories, categoryId]);

  const handleConfirm = async () => {
    if (!accountId) {
      setErrorMsg('Please select an account first.');
      return;
    }
    setErrorMsg('');

    try {
      const newTx: Transaction = {
        id: `tx_gora_${Date.now()}`,
        householdId: currentHouseholdId || 'h_sample',
        accountId,
        categoryId,
        amount: Number(amount),
        type,
        note,
        date: Date.now()
      };

      await saveTransaction(newTx);
      setIsConfirmed(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save transaction.');
    }
  };

  if (isConfirmed) {
    return (
      <div className="mt-2.5 p-4 sm:p-5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 rounded-3xl text-center space-y-3.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] animate-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
          <CheckCircle2 size={24} />
        </div>
        <div>
          <h5 className="font-black text-sm text-emerald-950 dark:text-emerald-100">Transaction Recorded!</h5>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">
            Added <span className="font-bold">₱{Number(amount).toLocaleString()}</span> for <span className="font-bold">"{note}"</span> under <span className="font-bold">{selectedCategoryName}</span> using <span className="font-bold">{selectedAccountName}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSendQuery("Show my recent transactions")}
          className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm shadow-emerald-500/20"
        >
          <span>View Transactions List</span>
          <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2.5 p-4 sm:p-5 bg-gradient-to-br from-[#F5F7FA] to-[#E4E8F0] dark:from-zinc-900 dark:to-zinc-800/80 border border-white/60 dark:border-white/10 rounded-3xl space-y-4 shadow-md shadow-zinc-200/50 dark:shadow-black/40 relative overflow-hidden shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)]">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
            <CreditCard size={16} />
          </div>
          <div>
            <h5 className="font-black text-xs text-zinc-950 dark:text-zinc-100">AI Staged Transaction</h5>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Review details before updating your ledger</p>
          </div>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 rounded-full flex items-center gap-1 shrink-0">
          <Sparkles size={8} />
          GoraGo CFO
        </span>
      </div>

      {isEditing ? (
        /* Edit Mode View */
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Description</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
              placeholder="e.g. Starbucks Coffee"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Amount (₱)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-black tabular-nums"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'expense' | 'income')}
                className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
              >
                <option value="expense">Expense (-)</option>
                <option value="income">Income (+)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-400 block mb-1">Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500 font-bold"
              >
                <option value="">Select Account</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (₱{a.balance.toLocaleString()})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={() => {
                setNote(initialNote);
                setAmount(initialAmount);
                setType(initialType);
                setCategoryId(initialCategoryId);
                setAccountId(initialAccountId);
                setIsEditing(false);
              }}
              className="px-3.5 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold active:scale-95 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Normal Display Mode */
        <div className="space-y-3.5">
          {/* Main Card Specs */}
          <div className="bg-white dark:bg-zinc-950/50 rounded-2xl p-3.5 border border-white/40 dark:border-zinc-800 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Payee/Note</p>
                <p className="font-bold text-base text-zinc-900 dark:text-zinc-100 mt-0.5">{note}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Amount</p>
                <p className={`font-black text-lg tabular-nums mt-0.5 ${type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {type === 'expense' ? '-' : '+'}₱{amount.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
              <div>
                <p className="text-[9px] font-bold text-zinc-400 uppercase">Category</p>
                <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-lg">
                  {selectedCategoryName}
                </span>
              </div>
              <div>
                <p className="text-[9px] font-bold text-zinc-400 uppercase">Payment Source</p>
                <span className={`inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-lg ${
                  accountId ? 'text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800' : 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20'
                }`}>
                  {selectedAccountName}
                </span>
              </div>
            </div>
          </div>

          {/* Account Selection Pill Box (if no account is specified) */}
          {!accountId && accounts.length > 0 && (
            <div className="space-y-1.5 animate-in slide-in-from-bottom-2 duration-200">
              <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 block">Where did this pay from?</span>
              <div className="flex flex-wrap gap-1.5">
                {accounts.map(acc => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setAccountId(acc.id);
                      setErrorMsg('');
                    }}
                    className="text-[10px] font-black bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-purple-500 dark:hover:border-purple-500 hover:text-purple-600 dark:hover:text-purple-400 px-3 py-1.5 rounded-xl cursor-pointer shadow-sm transition-all text-zinc-700 dark:text-zinc-300"
                  >
                    {acc.name.replace(' Checking', '').replace(' Wallet', '').replace(' on Hand', '')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMsg && (
            <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <AlertTriangle size={11} />
              {errorMsg}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md shadow-purple-500/10"
            >
              <Check size={14} />
              <span>Confirm & Add</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-4 py-2.5 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              <Edit2 size={13} />
              <span>Edit</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
