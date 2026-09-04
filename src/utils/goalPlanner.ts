import type { Account, Bill, Debt, Transaction } from '../db';

export interface GoalCalculationInput {
  title: string;
  category: string;
  targetAmount: number;
  currentAmount?: number;
  initialDeposit?: number;
  targetDate: string; // YYYY-MM-DD
}

export interface GoalAIBreakdown {
  daysRemaining: number;
  monthsRemaining: number;
  weeksRemaining: number;
  bimonthlyPeriods: number; // 15th and 30th periods
  amountToSave: number;
  requiredDaily: number;
  requiredWeekly: number;
  requiredBiMonthly: number; // 15th & 30th
  requiredMonthly: number;
  monthlySurplusEstimate: number;
  savingsRateOfSurplus: number; // Percentage of monthly surplus needed
  feasibilityScore: number; // 0 to 100
  feasibilityRating: 'High' | 'Moderate' | 'Challenging' | 'Aggressive';
  feasibilityColor: string;
  scheduleProposed: string;
  cfoAdvice: string;
  advice: string;
  activeTip: string;
  paceStatus?: 'ahead' | 'on_track' | 'behind';
}

export type GoalAIPlan = GoalAIBreakdown;

export function calculateGoalPlan(
  input: GoalCalculationInput,
  context?: {
    accounts?: Account[];
    bills?: Bill[];
    debts?: Debt[];
    transactions?: Transaction[];
  }
): GoalAIBreakdown {
  const targetAmount = Math.max(100, Number(input.targetAmount) || 0);
  const initialDeposit = Math.max(0, Number(input.initialDeposit || input.currentAmount || 0));
  const amountToSave = Math.max(0, targetAmount - initialDeposit);

  // Time calculations
  const now = new Date();
  const targetDate = new Date(input.targetDate);
  // Set to end of target day
  targetDate.setHours(23, 59, 59, 999);
  
  const diffTime = Math.max(86400000, targetDate.getTime() - now.getTime());
  const daysRemaining = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  const weeksRemaining = Math.max(0.5, daysRemaining / 7);
  const monthsRemaining = Math.max(0.2, daysRemaining / 30.4375);
  const bimonthlyPeriods = Math.max(1, Math.round(monthsRemaining * 2));

  // Required deposit rates
  const requiredDaily = Math.ceil(amountToSave / daysRemaining);
  const requiredWeekly = Math.ceil(amountToSave / weeksRemaining);
  const requiredBiMonthly = Math.ceil(amountToSave / bimonthlyPeriods);
  const requiredMonthly = Math.ceil(amountToSave / monthsRemaining);

  // Cash flow & Surplus estimation from context
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  let fixedBills = 0;
  let debtPayments = 0;

  if (context?.bills && context.bills.length > 0) {
    fixedBills = context.bills.reduce((sum, b) => sum + (b.amount || 0), 0);
  } else {
    fixedBills = 8849; // Standard sample bills in PHP
  }

  if (context?.debts && context.debts.length > 0) {
    debtPayments = context.debts
      .filter(d => d.remainingBalance > 0)
      .reduce((sum, d) => sum + (d.installmentAmount || 0), 0);
  } else {
    debtPayments = 6000;
  }

  if (context?.transactions && context.transactions.length > 0) {
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const recentTx = context.transactions.filter(t => (t.date || 0) >= thirtyDaysAgo);
    const incomeTx = recentTx.filter(t => t.type === 'income');
    const expenseTx = recentTx.filter(t => t.type === 'expense');

    if (incomeTx.length > 0) {
      monthlyIncome = incomeTx.reduce((sum, t) => sum + t.amount, 0);
    } else {
      monthlyIncome = 55000; // Fallback typical income
    }

    if (expenseTx.length > 0) {
      monthlyExpenses = expenseTx.reduce((sum, t) => sum + t.amount, 0);
    } else {
      monthlyExpenses = fixedBills + debtPayments + 15000;
    }
  } else {
    monthlyIncome = 55000;
    monthlyExpenses = fixedBills + debtPayments + 15000;
  }

  const monthlySurplusEstimate = Math.max(3000, monthlyIncome - monthlyExpenses);
  const savingsRateOfSurplus = monthlySurplusEstimate > 0 
    ? Math.min(100, Math.round((requiredMonthly / monthlySurplusEstimate) * 100))
    : 100;

  // Feasibility Score calculation (0 - 100)
  let feasibilityScore = 95;
  let feasibilityRating: 'High' | 'Moderate' | 'Challenging' | 'Aggressive' = 'High';
  let feasibilityColor = 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/30';

  if (savingsRateOfSurplus <= 25) {
    feasibilityScore = 96;
    feasibilityRating = 'High';
    feasibilityColor = 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
  } else if (savingsRateOfSurplus <= 50) {
    feasibilityScore = 84;
    feasibilityRating = 'Moderate';
    feasibilityColor = 'text-purple-600 dark:text-purple-400 bg-purple-500/15 border-purple-500/30';
  } else if (savingsRateOfSurplus <= 85) {
    feasibilityScore = 62;
    feasibilityRating = 'Challenging';
    feasibilityColor = 'text-amber-600 dark:text-amber-400 bg-amber-500/15 border-amber-500/30';
  } else {
    feasibilityScore = Math.max(25, Math.min(45, 100 - savingsRateOfSurplus));
    feasibilityRating = 'Aggressive';
    feasibilityColor = 'text-rose-600 dark:text-rose-400 bg-rose-500/15 border-rose-500/30';
  }

  // Schedule proposal text
  const scheduleProposed = `Deposit ₱${requiredBiMonthly.toLocaleString()} every 15th and 30th (₱${requiredMonthly.toLocaleString()}/mo)`;

  // Intelligent CFO advice based on category and surplus
  let cfoAdvice = '';
  if (feasibilityRating === 'High') {
    cfoAdvice = `Targeting ₱${requiredMonthly.toLocaleString()}/month requires only ${savingsRateOfSurplus}% of your net monthly surplus (₱${monthlySurplusEstimate.toLocaleString()}). This is highly realistic and protects your everyday cash flow.`;
  } else if (feasibilityRating === 'Moderate') {
    cfoAdvice = `Allocating ₱${requiredMonthly.toLocaleString()}/month (${savingsRateOfSurplus}% of estimated surplus) is balanced. Automating ₱${requiredBiMonthly.toLocaleString()} on payroll days (15th/30th) will keep you steady.`;
  } else if (feasibilityRating === 'Challenging') {
    cfoAdvice = `This plan uses ${savingsRateOfSurplus}% of your current monthly surplus. To avoid cash crunches, consider trimming flexible food/shopping categories or extending your target date by 1-2 months.`;
  } else {
    cfoAdvice = `At ₱${requiredMonthly.toLocaleString()}/month, this is an aggressive sprint. You may need temporary side income or strict spending limits to achieve this without borrowing.`;
  }

  // Active contextual tip
  let activeTip = `Deposit ₱${requiredDaily.toLocaleString()} today or ₱${requiredBiMonthly.toLocaleString()} on pay day to stay on track!`;
  if (input.category === 'emergency_fund') {
    activeTip = `Keep this safety net in a high-yield Maya or digital bank account to earn daily interest!`;
  } else if (input.category === 'travel') {
    activeTip = `Locking in ₱${requiredWeekly.toLocaleString()}/week keeps your travel budget debt-free!`;
  } else if (input.category === 'debt_payoff') {
    activeTip = `Every extra ₱500 deposited directly slashes compounding monthly interest!`;
  }

  return {
    daysRemaining,
    monthsRemaining,
    weeksRemaining,
    bimonthlyPeriods,
    amountToSave,
    requiredDaily,
    requiredWeekly,
    requiredBiMonthly,
    requiredMonthly,
    monthlySurplusEstimate,
    savingsRateOfSurplus,
    feasibilityScore,
    feasibilityRating,
    feasibilityColor,
    scheduleProposed,
    cfoAdvice,
    advice: cfoAdvice,
    activeTip,
  };
}

/**
 * Real-time coaching evaluator comparing expected progress vs actual progress.
 */
export function evaluateGoalPace(
  goal: {
    createdAt: number;
    targetDate: string;
    targetAmount: number;
    currentAmount: number;
    scheduleAmount?: number;
    aiBreakdown?: {
      requiredBiMonthly?: number;
      advice?: string;
      cfoAdvice?: string;
    };
  }
): {
  pace: 'ahead' | 'on_track' | 'behind';
  expectedAmount: number;
  differenceAmount: number;
  percentageComplete: number;
  daysRemaining: number;
  isOverdue: boolean;
  suggestedNextDeposit: number;
  advice: string;
  headline: string;
  coachingTip: string;
} {
  const target = Math.max(1, goal.targetAmount);
  const current = Math.max(0, goal.currentAmount);
  const percentageComplete = Math.min(100, Math.round((current / target) * 100));

  const start = goal.createdAt || Date.now() - 86400000 * 7;
  const targetTime = new Date(goal.targetDate).getTime();
  const now = Date.now();
  const totalDuration = Math.max(86400000, targetTime - start);
  const elapsed = Math.max(0, now - start);
  const remainingMs = targetTime - now;
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
  const isOverdue = remainingMs < 0;

  const timeRatio = Math.min(1, elapsed / totalDuration);
  const expectedAmount = Math.round(target * timeRatio);
  const differenceAmount = current - expectedAmount;

  const suggestedNextDeposit = goal.scheduleAmount || goal.aiBreakdown?.requiredBiMonthly || Math.round(Math.max(0, target - current) / Math.max(1, Math.ceil(daysRemaining / 15)));
  const baseAdvice = goal.aiBreakdown?.advice || goal.aiBreakdown?.cfoAdvice || 'Keep up regular deposits on payday.';

  if (differenceAmount >= target * 0.05) {
    return {
      pace: 'ahead',
      expectedAmount,
      differenceAmount,
      percentageComplete,
      daysRemaining,
      isOverdue,
      suggestedNextDeposit,
      advice: baseAdvice,
      headline: 'Ahead of Schedule 🚀',
      coachingTip: `You've saved ₱${Math.abs(differenceAmount).toLocaleString()} more than expected at this point. Excellent momentum!`,
    };
  } else if (differenceAmount >= -target * 0.08) {
    return {
      pace: 'on_track',
      expectedAmount,
      differenceAmount,
      percentageComplete,
      daysRemaining,
      isOverdue,
      suggestedNextDeposit,
      advice: baseAdvice,
      headline: 'Right on Track 🎯',
      coachingTip: `Your savings rhythm matches your target deadline perfectly. Keep up the consistent cadence!`,
    };
  } else {
    return {
      pace: 'behind',
      expectedAmount,
      differenceAmount,
      percentageComplete,
      daysRemaining,
      isOverdue,
      suggestedNextDeposit,
      advice: baseAdvice,
      headline: 'Pace Adjustment Recommended ⚡',
      coachingTip: `You are approximately ₱${Math.abs(differenceAmount).toLocaleString()} behind target pace. A top-up or modest payroll deposit will realign your timeline!`,
    };
  }
}
