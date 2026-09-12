import type { Account, Bill, Debt, Transaction } from '../db';

export interface ForecastPoint {
  date: Date;
  dateStr: string;
  dayName: string;
  dayIndex: number;
  projectedBalance: number;
  upperBound: number;
  lowerBound: number;
  dailyInflow: number;
  dailyOutflow: number;
  netDaily: number;
  events: Array<{
    name: string;
    type: 'bill' | 'debt' | 'salary' | 'anomaly';
    amount: number;
  }>;
  isAnomaly?: boolean;
  anomalyReason?: string;
  isLowBalanceWarning?: boolean;
}

export interface SpendingAnomaly {
  id: string;
  date: Date;
  dateStr: string;
  title: string;
  description: string;
  amount: number;
  severity: 'high' | 'medium' | 'info';
  type: 'projected_cluster' | 'historical_spike' | 'balance_dip';
}

export interface ProphetForecastResult {
  points: ForecastPoint[];
  startingBalance: number;
  endingBalance: number;
  minProjectedBalance: { amount: number; dateStr: string; dayIndex: number };
  maxProjectedBalance: { amount: number; dateStr: string; dayIndex: number };
  netChange: number;
  anomalies: SpendingAnomaly[];
  weeklySeasonality: { day: string; factor: number }[];
  dailyBurnRate: number;
  dailyIncomeRate: number;
  safeBufferAmount: number;
  deficitRiskDays: number;
}

/**
 * Time-series forecast using Facebook Prophet decomposable model principles:
 * y(t) = Trend(t) + WeeklySeasonality(t) + ScheduledEvents(t) + Uncertainty(t)
 */
export function generateProphetCashFlowForecast(
  accounts: Account[],
  bills: Bill[],
  debts: Debt[],
  transactions: Transaction[],
  forecastDays: number = 30
): ProphetForecastResult {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // 0. Zero State: When all data is wiped and starting fresh from 0
  const isZeroState = 
    (accounts.length === 0 || accounts.every(a => (Number(a.balance) || 0) === 0)) && 
    bills.length === 0 && 
    debts.length === 0 && 
    transactions.length === 0;
  if (isZeroState) {
    const zeroPoints: ForecastPoint[] = [];
    for (let t = 0; t <= forecastDays; t++) {
      const curDate = new Date(now.getTime() + t * 86400000);
      const dateStr = t === 0 ? 'Today' : curDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dayName = curDate.toLocaleDateString('en-US', { weekday: 'short' });
      zeroPoints.push({
        date: curDate,
        dateStr,
        dayName,
        dayIndex: t,
        projectedBalance: 0,
        upperBound: 0,
        lowerBound: 0,
        dailyInflow: 0,
        dailyOutflow: 0,
        netDaily: 0,
        events: []
      });
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      points: zeroPoints,
      startingBalance: 0,
      endingBalance: 0,
      minProjectedBalance: { amount: 0, dateStr: 'Today', dayIndex: 0 },
      maxProjectedBalance: { amount: 0, dateStr: 'Today', dayIndex: 0 },
      netChange: 0,
      anomalies: [],
      weeklySeasonality: dayNames.map(name => ({ day: name, factor: 0 })),
      dailyBurnRate: 0,
      dailyIncomeRate: 0,
      safeBufferAmount: 0,
      deficitRiskDays: 0
    };
  }

  // 1. Current liquid balance
  const startingBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

  // 2. Analyze historical transactions (last 60 days)
  const sixtyDaysAgo = now.getTime() - 60 * 24 * 60 * 60 * 1000;
  const validTxs = transactions.filter(t => !t.id.endsWith('_in') && (t.date || 0) >= sixtyDaysAgo);

  const historicalExpenses = validTxs.filter(t => t.type === 'expense');
  const historicalIncomes = validTxs.filter(t => t.type === 'income');

  // Detect Historical Anomalies (> 2.5 sigma from mean expense)
  const anomalies: SpendingAnomaly[] = [];
  if (historicalExpenses.length >= 3) {
    const amounts = historicalExpenses.map(e => e.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    historicalExpenses.forEach(tx => {
      if (tx.amount > mean + 2.0 * Math.max(stdDev, 1000) && tx.amount >= 2000) {
        anomalies.push({
          id: `hist_${tx.id}`,
          date: new Date(tx.date),
          dateStr: new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          title: `Historical Outlier: ${tx.note || 'Expense'}`,
          description: `Logged ₱${tx.amount.toLocaleString()} which is significantly higher than your average expense (₱${Math.round(mean).toLocaleString()}).`,
          amount: tx.amount,
          severity: tx.amount > mean + 3.0 * stdDev ? 'high' : 'medium',
          type: 'historical_spike'
        });
      }
    });
  }

  // Calculate day-of-week seasonality (0 = Sun, 6 = Sat)
  const dayOfWeekExpenseSum = [0, 0, 0, 0, 0, 0, 0];
  const dayOfWeekCount = [0, 0, 0, 0, 0, 0, 0];

  historicalExpenses.forEach(tx => {
    const dow = new Date(tx.date).getDay();
    dayOfWeekExpenseSum[dow] += tx.amount;
    dayOfWeekCount[dow] += 1;
  });

  const totalHistoricalExpense = historicalExpenses.reduce((s, e) => s + e.amount, 0);
  const totalDaysSampled = Math.max(14, Math.min(60, Math.ceil((Date.now() - sixtyDaysAgo) / 86400000)));
  const baseDailyDiscretionary = Math.max(150, Math.round(totalHistoricalExpense / totalDaysSampled));

  // Compute seasonality factors: ratio of weekday spending vs overall daily mean
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const overallAvg = baseDailyDiscretionary;
  const weeklySeasonality = dayNames.map((name, dow) => {
    if (dayOfWeekCount[dow] > 0) {
      const dowAvg = dayOfWeekExpenseSum[dow] / dayOfWeekCount[dow];
      const factor = overallAvg > 0 ? (dowAvg - overallAvg) / overallAvg : 0;
      return { day: name, factor: Math.max(-0.5, Math.min(0.8, factor)) };
    }
    // Default weekend spike model if sparse data
    const defaultFactor = dow === 5 || dow === 6 ? 0.35 : dow === 0 ? 0.15 : -0.1;
    return { day: name, factor: defaultFactor };
  });

  // Calculate average daily income and detect payroll cadence
  const totalHistoricalIncome = historicalIncomes.reduce((s, i) => s + i.amount, 0);
  const detectedBiMonthlySalary = historicalIncomes.find(i => (i.note || '').toLowerCase().includes('salary') || i.amount >= 15000);
  const estimatedPaycheck = detectedBiMonthlySalary ? detectedBiMonthlySalary.amount : Math.max(12000, Math.round(totalHistoricalIncome / 2) || 20000);
  const dailyIncomeRate = Math.round((estimatedPaycheck * 2) / 30);

  // Uncertainty parameter (sigma of daily residuals)
  const dailySigma = Math.max(350, Math.round(baseDailyDiscretionary * 0.4));

  // Minimum safety buffer (e.g. 15% of initial balance or ₱10,000)
  const safeBufferAmount = Math.max(5000, Math.round(startingBalance * 0.15));

  // 3. Forward 30-Day Prophet Decomposition
  const points: ForecastPoint[] = [];
  let runningBalance = startingBalance;
  let minBal = { amount: startingBalance, dateStr: 'Today', dayIndex: 0 };
  let maxBal = { amount: startingBalance, dateStr: 'Today', dayIndex: 0 };
  let deficitDaysCount = 0;

  for (let t = 0; t <= forecastDays; t++) {
    const curDate = new Date(now.getTime() + t * 86400000);
    const dom = curDate.getDate();
    const dow = curDate.getDay();
    const dateStr = t === 0 ? 'Today' : curDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayName = curDate.toLocaleDateString('en-US', { weekday: 'short' });

    let dailyInflow = 0;
    let dailyOutflow = 0;
    const events: ForecastPoint['events'] = [];

    if (t > 0) {
      // Seasonal Discretionary Spending
      const seasonalOffset = weeklySeasonality[dow].factor;
      const seasonalDailySpend = Math.max(80, Math.round(baseDailyDiscretionary * (1 + seasonalOffset)));
      dailyOutflow += seasonalDailySpend;

      // Scheduled Bills Event Component
      bills.forEach(bill => {
        let isDueToday = false;
        if (bill.dueType === 'specific' && bill.specificDates) {
          isDueToday = bill.specificDates.some(ts => {
            const d = new Date(ts);
            return d.getFullYear() === curDate.getFullYear() && d.getMonth() === curDate.getMonth() && d.getDate() === dom;
          });
        } else {
          // Monthly due day
          const lastDayOfCurMonth = new Date(curDate.getFullYear(), curDate.getMonth() + 1, 0).getDate();
          const targetDay = Math.min(bill.dueDay, lastDayOfCurMonth);
          isDueToday = dom === targetDay;
        }

        if (isDueToday) {
          dailyOutflow += bill.amount;
          events.push({
            name: bill.name,
            type: 'bill',
            amount: bill.amount
          });
        }
      });

      // Scheduled Loan Installments Event Component
      debts.forEach(debt => {
        if (debt.remainingBalance > 0) {
          const lastDayOfCurMonth = new Date(curDate.getFullYear(), curDate.getMonth() + 1, 0).getDate();
          const targetDay = Math.min(debt.dueDay || 1, lastDayOfCurMonth);
          if (dom === targetDay) {
            const installment = Math.min(debt.installmentAmount, debt.remainingBalance);
            dailyOutflow += installment;
            events.push({
              name: `${debt.name} (Loan)`,
              type: 'debt',
              amount: installment
            });
          }
        }
      });

      // Scheduled Income Event Component (Semi-Monthly standard: 15th and end of month)
      const lastDayOfCurMonth = new Date(curDate.getFullYear(), curDate.getMonth() + 1, 0).getDate();
      if (dom === 15 || dom === lastDayOfCurMonth) {
        dailyInflow += estimatedPaycheck;
        events.push({
          name: 'Payroll / Inflow',
          type: 'salary',
          amount: estimatedPaycheck
        });
      }

      runningBalance = runningBalance + dailyInflow - dailyOutflow;
    }

    // Uncertainty Cone (expanding confidence interval: 1.64 * sigma * sqrt(t))
    const uncertaintyMargin = Math.round(1.64 * dailySigma * Math.sqrt(t + 1));
    const upperBound = runningBalance + uncertaintyMargin;
    const lowerBound = Math.max(0, runningBalance - uncertaintyMargin);

    if (runningBalance < minBal.amount) {
      minBal = { amount: runningBalance, dateStr, dayIndex: t };
    }
    if (runningBalance > maxBal.amount) {
      maxBal = { amount: runningBalance, dateStr, dayIndex: t };
    }

    if (lowerBound < safeBufferAmount) {
      deficitDaysCount++;
    }

    // Identify Projected Anomalies (Clustered bills or low buffer)
    let isAnomaly = false;
    let anomalyReason: string | undefined;

    const scheduledBillTotal = events.filter(e => e.type === 'bill' || e.type === 'debt').reduce((s, e) => s + e.amount, 0);
    if (scheduledBillTotal >= baseDailyDiscretionary * 3 && events.length >= 2) {
      isAnomaly = true;
      anomalyReason = `High outflow cluster: ₱${scheduledBillTotal.toLocaleString()} due across ${events.length} obligations`;
      
      anomalies.push({
        id: `proj_cluster_${t}`,
        date: curDate,
        dateStr,
        title: `Bill Cluster on ${dateStr}`,
        description: `${events.length} bills & loan installments fall on this single day (₱${scheduledBillTotal.toLocaleString()} total). Ensure sufficient liquid funds in advance.`,
        amount: scheduledBillTotal,
        severity: scheduledBillTotal > 10000 ? 'high' : 'medium',
        type: 'projected_cluster'
      });
    }

    const isLowBalanceWarning = runningBalance <= safeBufferAmount;
    if (isLowBalanceWarning && t > 0 && !anomalies.some(a => a.type === 'balance_dip')) {
      anomalies.push({
        id: `proj_dip_${t}`,
        date: curDate,
        dateStr,
        title: `Liquidity Reserve Alert on ${dateStr}`,
        description: `Projected balance touches ₱${Math.round(runningBalance).toLocaleString()}, dipping below your recommended ₱${safeBufferAmount.toLocaleString()} emergency threshold.`,
        amount: runningBalance,
        severity: runningBalance < safeBufferAmount * 0.5 ? 'high' : 'medium',
        type: 'balance_dip'
      });
    }

    points.push({
      date: curDate,
      dateStr,
      dayName,
      dayIndex: t,
      projectedBalance: Math.round(runningBalance),
      upperBound,
      lowerBound,
      dailyInflow,
      dailyOutflow,
      netDaily: dailyInflow - dailyOutflow,
      events,
      isAnomaly,
      anomalyReason,
      isLowBalanceWarning
    });
  }

  return {
    points,
    startingBalance,
    endingBalance: points[points.length - 1]?.projectedBalance || startingBalance,
    minProjectedBalance: minBal,
    maxProjectedBalance: maxBal,
    netChange: (points[points.length - 1]?.projectedBalance || startingBalance) - startingBalance,
    anomalies: anomalies.slice(0, 6), // Top prioritized anomalies
    weeklySeasonality,
    dailyBurnRate: baseDailyDiscretionary,
    dailyIncomeRate,
    safeBufferAmount,
    deficitRiskDays: deficitDaysCount
  };
}
