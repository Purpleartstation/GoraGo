import type { Transaction } from '../db';

export interface EmergencyImpactAnalysis {
  withdrawAmount: number;
  currentBalance: number;
  newBalance: number;
  percentDropped: number;
  dailyBurnRate: number;
  daysBefore: number;
  daysAfter: number;
  daysLost: number;
  monthlySurplus: number;
  monthsToRebuild: number | null;
  daysToRebuild: number | null;
  warningHeadline: string;
  criticalAlert: string | null;
  rebuildAdvice: string;
  aiCommentary?: string;
}

export function computeEmergencyImpact(params: {
  currentBalance: number;
  withdrawAmount: number;
  transactions?: Transaction[];
  monthlyInflow?: number;
  monthlyOutflow?: number;
  note?: string;
}): EmergencyImpactAnalysis {
  const { currentBalance, withdrawAmount, transactions = [], monthlyInflow = 45000, monthlyOutflow = 30000 } = params;

  // 1. Calculate realistic daily burn rate from past 30 days expenses
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const past30dExpenses = transactions.filter(t => t.type === 'expense' && t.date >= thirtyDaysAgo);
  const totalPast30dExpense = past30dExpenses.reduce((sum, t) => sum + t.amount, 0);

  // Use past 30 days expense or fallback to monthly outflow baseline
  const effectiveMonthlyExpense = totalPast30dExpense > 0 ? totalPast30dExpense : Math.max(1000, monthlyOutflow);
  const dailyBurnRate = Math.max(10, Math.round(effectiveMonthlyExpense / 30));

  // 2. Compute safety net days
  const daysBefore = Math.floor(currentBalance / dailyBurnRate);
  const newBalance = Math.max(0, currentBalance - withdrawAmount);
  const daysAfter = Math.floor(newBalance / dailyBurnRate);
  const daysLost = Math.max(1, daysBefore - daysAfter);

  const percentDropped = currentBalance > 0 ? Math.round((withdrawAmount / currentBalance) * 100) : 100;

  // 3. Compute rebuild capability based on monthly surplus
  const past30dIncomes = transactions.filter(t => t.type === 'income' && t.date >= thirtyDaysAgo);
  const totalPast30dInflow = past30dIncomes.reduce((sum, t) => sum + t.amount, 0);
  const effectiveInflow = totalPast30dInflow > 0 ? totalPast30dInflow : Math.max(1000, monthlyInflow);

  const monthlySurplus = effectiveInflow - effectiveMonthlyExpense;
  let monthsToRebuild: number | null = null;
  let daysToRebuild: number | null = null;

  if (monthlySurplus > 0) {
    monthsToRebuild = Math.round((withdrawAmount / monthlySurplus) * 10) / 10;
    daysToRebuild = Math.ceil(withdrawAmount / (monthlySurplus / 30));
  }

  // 4. Formulate the required warning headline
  const formattedAmount = `₱${withdrawAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const warningHeadline = `⚠️ Warning from GoraGo CFO: Withdrawing ${formattedAmount} from your Emergency Fund will reduce your financial safety net by ${daysLost} ${daysLost === 1 ? 'day' : 'days'} of living expenses. Are you sure you want to proceed?`;

  // 5. Check if balance drops significantly or hits ₱0
  let criticalAlert: string | null = null;
  if (newBalance === 0) {
    criticalAlert = `🚨 CRITICAL SAFETY NET DEPLETION: This withdrawal completely drains your Emergency Fund to ₱0! You will have 0 days of living expense cushion left against unexpected job loss, accidents, or urgent repairs.`;
  } else if (percentDropped >= 75) {
    criticalAlert = `🚨 HEAVY DRAIN: You are depleting ${percentDropped}% of your safety reserves. Your remaining cushion is only ${daysAfter} days.`;
  } else if (percentDropped >= 50) {
    criticalAlert = `⚠️ SEVERE DROP: You are cutting your emergency cushion in half (${percentDropped}% drop), leaving just ${daysAfter} days of runway.`;
  } else if (daysAfter < 15) {
    criticalAlert = `⚠️ LOW BUFFER ALERT: Your remaining emergency buffer will cover less than 15 days (${daysAfter} days) of essential living expenses.`;
  }

  // 6. Direct rebuild warning
  let rebuildAdvice = '';
  if (monthlySurplus > 0 && monthsToRebuild !== null) {
    const timeStr = monthsToRebuild >= 1 ? `${monthsToRebuild} months` : `${daysToRebuild} days`;
    rebuildAdvice = `At your current savings rate (~₱${Math.round(monthlySurplus).toLocaleString()}/mo), it will take approximately ${timeStr} of disciplined saving to rebuild this ${formattedAmount} buffer.`;
  } else {
    rebuildAdvice = `You currently have zero or negative monthly surplus (~₱${Math.round(monthlySurplus).toLocaleString()}/mo). Without trimming other expenses or increasing income, rebuilding this ${formattedAmount} safety net will take extended time or require debt.`;
  }

  return {
    withdrawAmount,
    currentBalance,
    newBalance,
    percentDropped,
    dailyBurnRate,
    daysBefore,
    daysAfter,
    daysLost,
    monthlySurplus,
    monthsToRebuild,
    daysToRebuild,
    warningHeadline,
    criticalAlert,
    rebuildAdvice
  };
}

export async function fetchAIEmergencyImpact(params: {
  currentBalance: number;
  withdrawAmount: number;
  monthlyOutflow?: number;
  monthlyInflow?: number;
  note?: string;
  category?: string;
}): Promise<Partial<EmergencyImpactAnalysis>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('/api/ai-emergency-warning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.debug('AI emergency impact fetch skipped/timed out, using local CFO calculation', err);
  }
  return {};
}
