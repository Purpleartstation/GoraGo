import type { Category } from '../db';

export interface KeyMetric {
  label: string;
  value: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'emerald' | 'purple' | 'amber' | 'blue' | 'rose';
}

export interface ExecutedAction {
  tool: string;
  status: 'success' | 'failed' | 'pending';
  params?: Record<string, any>;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
}

export interface ChartData {
  title?: string;
  subtitle?: string;
  chartType?: 'bar' | 'pie' | 'area' | 'comparison';
  dataPoints: ChartDataPoint[];
  summaryText?: string;
}

export interface InteractiveWidget {
  type: 'goal_creation_handshake' | 'purchase_feasibility' | 'savings_simulator' | 'debt_payoff' | 'budget_breakdown' | 'cashflow_comparison' | 'transaction_confirmation';
  title: string;
  description: string;
  params: Record<string, any>;
}

export interface AIChatResponse {
  reply: string;
  keyMetrics?: KeyMetric[];
  executedAction?: ExecutedAction;
  chartData?: ChartData;
  interactiveWidget?: InteractiveWidget;
  quickFollowUps?: string[];
  isFallback?: boolean;
  errorCode?: string;
}

export interface CategorizeResult {
  categoryId: string;
  categoryName?: string;
  confidence: number;
  reasoning?: string;
}

export interface ReceiptScanResult {
  merchantName: string;
  totalAmount: number;
  dateStr?: string;
  categoryHint?: string;
  items?: Array<{ name: string; price: number; quantity?: number }>;
  confidence: number;
  rawText?: string;
}

/**
 * Helper to generate an offline, client-side fallback response if network or server is completely unreachable.
 */
function generateLocalCfoFallback(userText: string, financialData: any, noticeText?: string): AIChatResponse {
  const lower = (userText || '').toLowerCase();
  const totalMoney = typeof financialData?.totalMoney === 'number' ? financialData.totalMoney : 0;
  const totalDebt = typeof financialData?.totalDebt === 'number' ? financialData.totalDebt : 0;
  const monthlySurplus = typeof financialData?.cashFlow?.monthly?.net === 'number' ? financialData.cashFlow.monthly.net : 0;
  const expensesByCategory = financialData?.currentMonthExpensesByCategory || {};

  let executedAction: ExecutedAction | undefined = undefined;
  let chartData: ChartData | undefined = undefined;
  let widget: InteractiveWidget | undefined = undefined;

  // 1. Tour / navigation intent
  if (lower.includes('tour') || lower.includes('guide') || lower.includes('paano gamitin') || lower.includes('how do i use') || lower.includes('where is') || lower.includes('walkthrough')) {
    let feat = 'all';
    if (lower.includes('safety') || lower.includes('emergency')) feat = 'safetynet';
    else if (lower.includes('goal') || lower.includes('savings')) feat = 'goals';
    else if (lower.includes('forecast') || lower.includes('cashflow')) feat = 'cashflow';
    else if (lower.includes('bill') || lower.includes('loan')) feat = 'bills';
    executedAction = {
      tool: 'start_app_tour',
      status: 'success',
      params: { targetFeature: feat }
    };
  } else if (lower.includes('pin') || lower.includes('security code') || (lower.includes('update') && lower.includes('pin'))) {
    executedAction = {
      tool: 'open_security_pin_settings',
      status: 'success',
      params: {}
    };
  } else if ((lower.includes('deposit') || lower.includes('maghulog') || lower.includes('lagay')) && (lower.includes('safety') || lower.includes('emergency'))) {
    const amtMatch = lower.match(/\d+[\d,]*/);
    const amount = amtMatch ? parseInt(amtMatch[0].replace(/,/g, ''), 10) : 1000;
    executedAction = {
      tool: 'open_safety_net_deposit',
      status: 'success',
      params: { amount }
    };
  } else if ((lower.includes('withdraw') || lower.includes('kumuha')) && (lower.includes('safety') || lower.includes('emergency'))) {
    const amtMatch = lower.match(/\d+[\d,]*/);
    const amount = amtMatch ? parseInt(amtMatch[0].replace(/,/g, ''), 10) : 1000;
    executedAction = {
      tool: 'open_safety_net_withdraw',
      status: 'success',
      params: { amount }
    };
  } else if (lower.includes('chart') || lower.includes('breakdown') || lower.includes('spending')) {
    const points = Object.entries(expensesByCategory).map(([name, val]: [string, any], idx) => ({
      name,
      value: Number(val) || 0,
      color: ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#6366F1'][idx % 6]
    }));
    chartData = {
      title: "Category Spending Breakdown",
      subtitle: "Live monthly outflows in PHP",
      chartType: "bar",
      dataPoints: points.length > 0 ? points : [
        { name: 'Food & Dining', value: 8500, color: '#8B5CF6' },
        { name: 'Bills & Utilities', value: 6200, color: '#3B82F6' },
        { name: 'Groceries', value: 5400, color: '#10B981' },
        { name: 'Transport', value: 3100, color: '#F59E0B' }
      ],
      summaryText: "CFO Takeaway: Review non-essential categories to maximize your monthly surplus."
    };
  }

  // Interactive widget determination
  if (lower.includes('goal') || lower.includes('save for') || lower.includes('ipon') || lower.includes('target')) {
    const amtMatch = lower.match(/\d+[\d,]*/);
    const targetAmount = amtMatch ? parseInt(amtMatch[0].replace(/,/g, ''), 10) : 50000;
    widget = {
      type: 'goal_creation_handshake',
      title: 'Target Savings Goal Plan',
      description: `Plan your ₱${targetAmount.toLocaleString()} milestone with 15th & 30th payday allocations`,
      params: {
        goalTitle: 'Savings Milestone',
        targetAmount,
        paydayBreakdown: Math.round(targetAmount / 12),
        monthlyContribution: Math.round(targetAmount / 6)
      }
    };
  } else if (lower.includes('debt') || lower.includes('utang') || lower.includes('loan') || lower.includes('pay off')) {
    widget = {
      type: 'debt_payoff',
      title: 'Debt Payoff Acceleration',
      description: 'Simulate interest savings using the Snowball strategy',
      params: {
        extraPayment: 2000
      }
    };
  } else {
    widget = {
      type: 'savings_simulator',
      title: 'Interactive Savings Growth Simulator',
      description: 'Slide to adjust monthly contributions and watch your buffer grow',
      params: {
        targetAmount: 50000,
        monthlyContribution: Math.max(1000, Math.round(monthlySurplus * 0.3) || 3000)
      }
    };
  }

  const baseReply = `CFO Status: Your spendable balance is ₱${totalMoney.toLocaleString()} with a monthly cash surplus of ₱${monthlySurplus.toLocaleString()}${totalDebt > 0 ? ` and ₱${totalDebt.toLocaleString()} in active debts` : ''}. Let's keep your 20% savings buffer intact before taking on new liabilities.`;

  return {
    reply: noticeText ? `${noticeText}\n\n${baseReply}` : baseReply,
    keyMetrics: [
      { label: "Total Money", value: `₱${totalMoney.toLocaleString()}`, trend: "up", color: "emerald" },
      { label: "Monthly Surplus", value: `₱${monthlySurplus.toLocaleString()}`, trend: monthlySurplus >= 0 ? "up" : "down", color: "purple" },
      { label: "Active Debts", value: `₱${totalDebt.toLocaleString()}`, trend: totalDebt > 0 ? "down" : "neutral", color: "rose" }
    ],
    executedAction,
    chartData,
    interactiveWidget: widget,
    quickFollowUps: [
      "Show my spending breakdown chart",
      "Guide me around the app features",
      "How can I build my safety net faster?"
    ],
    isFallback: true
  };
}

/**
 * Calls the secure server-side Gemini Chat proxy with full fallback handling.
 * Automatically tries /api/ai/chat and falls back to /api/ai-chat.
 * Handles HTTP 429 (rate-limited), HTTP 403 (unauthorized/key missing), and network downtime gracefully.
 */
export async function askGoraAIChat(params: {
  message: string;
  financialData: any;
  chatHistory?: any[];
}): Promise<AIChatResponse> {
  const endpoints = ['/api/ai/chat', '/api/ai-chat'];
  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          message: params.message,
          financialData: params.financialData,
          chatHistory: params.chatHistory || []
        })
      });

      // Handle HTTP 429: Rate-limited
      if (response.status === 429) {
        let errJson: any = {};
        try { errJson = await response.json(); } catch (_) {}
        const notice = errJson.reply || "⚠️ Gora AI Traffic Notice: The AI service is currently busy or rate-limited. Serving instant CFO offline analysis from your live ledger:";
        return generateLocalCfoFallback(params.message, params.financialData, notice);
      }

      // Handle HTTP 403 or 401: Unauthorized / Missing or invalid Gemini API key
      if (response.status === 403 || response.status === 401) {
        let errJson: any = {};
        try { errJson = await response.json(); } catch (_) {}
        const notice = errJson.reply || "🔒 AI Service Notice: Server Gemini API key requires authorization. Running in offline CFO mode using your local financial ledger:";
        return generateLocalCfoFallback(params.message, params.financialData, notice);
      }

      // If endpoint not found (e.g. 404), try next endpoint alias
      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data && typeof data === 'object') {
        // Guarantee clean reply text
        if (!data.reply || typeof data.reply !== 'string' || !data.reply.trim()) {
          data.reply = "Mabuhay! Here is your GoraGo CFO status: Your financial ledger and active balances are loaded. Let me know if you would like me to guide you through the app features or analyze your spending!";
        }
        return data as AIChatResponse;
      }
    } catch (err: any) {
      lastError = err;
      // Continue to try fallback endpoint if available
    }
  }

  console.warn("AI Chat API call failed, applying client-side fallback:", lastError);
  return generateLocalCfoFallback(
    params.message,
    params.financialData,
    "💡 GoraGo CFO Offline Mode: Here is your immediate financial breakdown from your active ledger:"
  );
}

/**
 * Suggests transaction category via the server-side AI proxy.
 * If server is offline or fails, falls back to local heuristic matching.
 * Never calls Gemini directly from the client.
 */
export async function suggestCategoryWithAI(
  description: string,
  amount: number,
  type: 'income' | 'expense' | 'transfer',
  categories: Category[]
): Promise<CategorizeResult> {
  const endpoints = ['/api/ai/categorize', '/api/ai-categorize'];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, amount, type, categories }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.categoryId) {
          return {
            categoryId: data.categoryId,
            categoryName: data.categoryName,
            confidence: data.confidence || 0.85,
            reasoning: data.reasoning,
          };
        }
      }
    } catch (err) {
      // Try next endpoint
    }
  }

  // Local heuristic matching fallback
  const lowerDesc = (description || '').toLowerCase();
  const matching = categories.find(c => {
    const catName = c.name.toLowerCase();
    return lowerDesc.includes(catName) || catName.includes(lowerDesc);
  });

  if (matching) {
    return {
      categoryId: matching.id,
      categoryName: matching.name,
      confidence: 0.7,
      reasoning: "Matched by keyword heuristic.",
    };
  }

  const defaultCat = categories.find(c => c.type === type) || categories[0];
  return {
    categoryId: defaultCat ? defaultCat.id : 'cat_general',
    categoryName: defaultCat ? defaultCat.name : 'General',
    confidence: 0.4,
    reasoning: "Default fallback category.",
  };
}

/**
 * Scans a receipt image via the server-side AI proxy.
 */
export async function scanReceiptWithAI(base64Image: string): Promise<ReceiptScanResult> {
  const endpoints = ['/api/ai/receipt-scan', '/api/ai-receipt-scan'];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image })
      });

      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      // Try next endpoint
    }
  }

  throw new Error('Failed to scan receipt image via server AI proxy');
}

/**
 * Analyzes emergency fund withdrawal impact via the server-side AI proxy.
 */
export async function getEmergencyImpactWithAI(params: {
  currentBalance: number;
  withdrawAmount: number;
  monthlyOutflow?: number;
  monthlyInflow?: number;
  note?: string;
  category?: string;
}): Promise<any> {
  const endpoints = ['/api/ai/emergency-warning', '/api/ai-emergency-warning'];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      // Try next endpoint
    }
  }

  return {};
}

/**
 * Checks server-side AI status and health.
 */
export async function checkAIHealth(): Promise<{ aiConfigured: boolean; mode: string }> {
  try {
    const res = await fetch('/api/ai/health');
    if (res.ok) {
      const data = await res.json();
      return {
        aiConfigured: !!data.aiConfigured,
        mode: data.mode || 'unknown'
      };
    }
  } catch (_) {}
  return { aiConfigured: false, mode: 'offline' };
}
