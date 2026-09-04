export interface FinancialHealthBreakdown {
  score: number; // 0 - 100
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D';
  runwayMonths: number;
  runwayScore: number; // max 30
  budgetAdherenceScore: number; // max 30
  debtBurdenScore: number; // max 25
  savingsRateScore: number; // max 15
  savingsRatePercent: number;
  spendingVelocityDaily: number;
  statusHeadline: string;
  cfoVerdict: string;
  topRecommendations: Array<{
    title: string;
    action: string;
    impact: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export function calculateFinancialHealthScore(params: {
  liquidMoney: number;
  monthlyOutflow: number;
  monthlyInflow: number;
  totalDebt: number;
  sevenDaySpend: number;
  unpaidBillsCount: number;
}): FinancialHealthBreakdown {
  const { liquidMoney, monthlyOutflow, monthlyInflow, totalDebt, sevenDaySpend, unpaidBillsCount } = params;

  // Zero State: When the entire ledger is wiped and starting from 0
  const isZeroState = liquidMoney === 0 && monthlyOutflow === 0 && monthlyInflow === 0 && totalDebt === 0 && sevenDaySpend === 0 && unpaidBillsCount === 0;

  if (isZeroState) {
    return {
      score: 0,
      grade: 'D',
      runwayMonths: 0,
      runwayScore: 0,
      budgetAdherenceScore: 0,
      debtBurdenScore: 0,
      savingsRateScore: 0,
      savingsRatePercent: 0,
      spendingVelocityDaily: 0,
      statusHeadline: 'Fresh Ledger (0 Records)',
      cfoVerdict: 'All financial records and AI memories have been wiped clean. Add your first bank/e-wallet account and log your initial income or expense to start CFO analytics.',
      topRecommendations: [
        {
          title: 'Add Initial Cash / Bank Account',
          action: 'Record your current bank, GCash, or Maya balance in Accounts to start tracking liquid runway.',
          impact: 'Establishes initial capital reserve baseline',
          priority: 'high'
        },
        {
          title: 'Set Up Monthly Income & Bills',
          action: 'Register regular bills and salary income to enable Prophet cash flow projections.',
          impact: 'Unlocks 30-day projection & anomaly alerts',
          priority: 'medium'
        }
      ]
    };
  }

  const effectiveMonthlyExpense = Math.max(1000, monthlyOutflow || 30000);
  const effectiveMonthlyInflow = Math.max(1000, monthlyInflow || 45000);
  const monthlySurplus = effectiveMonthlyInflow - effectiveMonthlyExpense;


  // 1. Cash Buffer / Runway Score (Max 30 pts)
  // 3+ months = 30 pts, 2 months = 23 pts, 1 month = 15 pts, 0.5 month = 8 pts, 0 = 0
  const runwayMonths = Math.round((liquidMoney / effectiveMonthlyExpense) * 10) / 10;
  let runwayScore = 0;
  if (runwayMonths >= 3) runwayScore = 30;
  else if (runwayMonths >= 2) runwayScore = 24;
  else if (runwayMonths >= 1) runwayScore = 18;
  else if (runwayMonths >= 0.5) runwayScore = 10;
  else runwayScore = Math.max(0, Math.round(runwayMonths * 15));

  // 2. Budget Adherence & Spending Velocity Score (Max 30 pts)
  // 7-day velocity compared to expected weekly budget (monthlyExpense / 4.3)
  const expectedWeeklyBudget = effectiveMonthlyExpense / 4.3;
  const weeklyVariance = expectedWeeklyBudget - sevenDaySpend;
  let budgetAdherenceScore = 20;

  if (weeklyVariance >= 0) {
    // Under budget
    budgetAdherenceScore = Math.min(30, 24 + Math.round((weeklyVariance / expectedWeeklyBudget) * 6));
  } else {
    // Over budget pace
    const overPercent = Math.abs(weeklyVariance) / expectedWeeklyBudget;
    budgetAdherenceScore = Math.max(5, Math.round(20 - overPercent * 15));
  }

  // Deduct slightly for overdue/unpaid bills
  if (unpaidBillsCount > 3) budgetAdherenceScore = Math.max(5, budgetAdherenceScore - 4);

  // 3. Debt Burden Score (Max 25 pts)
  // Low debt relative to net worth / liquid money & surplus
  let debtBurdenScore = 25;
  if (totalDebt === 0) {
    debtBurdenScore = 25;
  } else {
    const debtToLiquidRatio = totalDebt / Math.max(1, liquidMoney);
    if (debtToLiquidRatio < 0.3) debtBurdenScore = 22;
    else if (debtToLiquidRatio < 0.8) debtBurdenScore = 17;
    else if (debtToLiquidRatio < 1.5) debtBurdenScore = 12;
    else debtBurdenScore = Math.max(4, Math.round(25 - debtToLiquidRatio * 8));
  }

  // 4. Savings Rate Score (Max 15 pts)
  const savingsRatePercent = Math.max(0, Math.round((monthlySurplus / effectiveMonthlyInflow) * 100));
  let savingsRateScore = 0;
  if (savingsRatePercent >= 25) savingsRateScore = 15;
  else if (savingsRatePercent >= 20) savingsRateScore = 13;
  else if (savingsRatePercent >= 10) savingsRateScore = 9;
  else if (savingsRatePercent > 0) savingsRateScore = 5;
  else savingsRateScore = 0;

  // Total Score (0-100)
  const totalScore = Math.min(100, Math.max(10, Math.round(runwayScore + budgetAdherenceScore + debtBurdenScore + savingsRateScore)));

  let grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' = 'B';
  if (totalScore >= 90) grade = 'A+';
  else if (totalScore >= 82) grade = 'A';
  else if (totalScore >= 74) grade = 'B+';
  else if (totalScore >= 65) grade = 'B';
  else if (totalScore >= 50) grade = 'C';
  else grade = 'D';

  const dailyVelocity = Math.round(sevenDaySpend / 7);

  // Status and Verdict
  let statusHeadline = 'Stable Financial Foundation';
  let cfoVerdict = `Your cash buffer gives you ${runwayMonths} months of runway with a ${savingsRatePercent}% savings rate. Maintain your current daily velocity of ₱${dailyVelocity.toLocaleString()}/day.`;

  if (totalScore >= 85) {
    statusHeadline = 'Optimal Capital Allocation';
    cfoVerdict = `Outstanding financial posture. You hold ${runwayMonths} months of liquid cushion and a strong +${savingsRatePercent}% monthly cash surplus. Ready for accelerated investments or large asset milestones.`;
  } else if (totalScore < 60) {
    statusHeadline = 'Liquidity & Burn Rate Attention Needed';
    cfoVerdict = `CFO Warning: With ${runwayMonths} months of liquid runway and ₱${totalDebt.toLocaleString()} in active debt, prioritize cutting discretionary spending by ₱1,500/week to reinforce emergency reserves.`;
  }

  // Prioritized Recommendations
  const topRecommendations: FinancialHealthBreakdown['topRecommendations'] = [];

  if (runwayMonths < 3) {
    topRecommendations.push({
      title: 'Build 3-Month Emergency Cushion',
      action: `Boost liquid reserves from ₱${liquidMoney.toLocaleString()} to ₱${Math.round(effectiveMonthlyExpense * 3).toLocaleString()}`,
      impact: `+${Math.round(3 - runwayMonths)} mos security buffer`,
      priority: 'high'
    });
  }

  if (totalDebt > 0) {
    topRecommendations.push({
      title: 'Accelerate Debt Elimination',
      action: `Apply ₱${Math.max(1500, Math.round(monthlySurplus * 0.4)).toLocaleString()}/mo extra towards smallest credit balance`,
      impact: 'Save finance interest & free up cash flow',
      priority: totalDebt > liquidMoney ? 'high' : 'medium'
    });
  }

  if (savingsRatePercent < 20) {
    topRecommendations.push({
      title: 'Optimize Monthly Discretionary Spend',
      action: 'Cap dining out & food delivery to boost savings rate towards the 20% benchmark',
      impact: `+₱${Math.max(2000, Math.round(effectiveMonthlyExpense * 0.1)).toLocaleString()}/mo surplus`,
      priority: 'medium'
    });
  } else {
    topRecommendations.push({
      title: 'High-Yield Digital Savings Deployment',
      action: 'Sweep excess checking balance above 1-month expenses into 4-6% p.a. digital banks',
      impact: 'Maximize passive interest on cash',
      priority: 'low'
    });
  }

  return {
    score: totalScore,
    grade,
    runwayMonths,
    runwayScore,
    budgetAdherenceScore,
    debtBurdenScore,
    savingsRateScore,
    savingsRatePercent,
    spendingVelocityDaily: dailyVelocity,
    statusHeadline,
    cfoVerdict,
    topRecommendations
  };
}
