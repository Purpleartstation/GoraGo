import type { Bill, Transaction } from '../db';

export interface DetectedSubscription {
  id: string;
  name: string;
  rawDescriptions: string[];
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'quarterly';
  frequencyLabel: string;
  averageAmount: number;
  lastAmount: number;
  minAmount: number;
  maxAmount: number;
  isVariable: boolean;
  confidence: number; // 0.0 to 1.0
  confidencePercentage: number; // 0 to 100
  intervalDays: number;
  lastDate: number;
  estimatedNextDate: number;
  dueDay: number; // 1 to 31
  occurrenceCount: number;
  accountId: string;
  categoryId?: string;
  transactions: Array<{
    id: string;
    amount: number;
    date: number;
    note: string;
    accountId: string;
  }>;
  reasoning: string;
  isAlreadyTracked: boolean;
  matchedBillId?: string;
}

export interface RecurringDetectorOptions {
  windowDays?: number; // 30 to 90 days (default: 90)
  minOccurrences?: number; // default: 2
  confidenceThreshold?: number; // default: 0.65
  dismissedIds?: string[];
  includeTracked?: boolean; // whether to return already tracked bills as well
}

const DISMISSED_STORAGE_KEY = 'gorago_dismissed_subscriptions';

export function getDismissedSubscriptionIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function dismissSubscriptionId(id: string): void {
  try {
    const current = getDismissedSubscriptionIds();
    if (!current.includes(id)) {
      localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...current, id]));
    }
  } catch (err) {
    console.warn('Failed to save dismissed subscription:', err);
  }
}

export function restoreDismissedSubscription(id: string): void {
  try {
    const current = getDismissedSubscriptionIds();
    localStorage.setItem(
      DISMISSED_STORAGE_KEY,
      JSON.stringify(current.filter((item) => item !== id))
    );
  } catch (err) {
    console.warn('Failed to restore dismissed subscription:', err);
  }
}

/**
 * Normalizes transaction note/description into a clean canonical payee name
 * following rule-engine principles from actualbudget/actual.
 */
export function normalizePayee(raw: string): string {
  if (!raw) return 'Unknown Merchant';
  let str = raw.trim();

  // Common known service aliases and branded recurring merchants
  const lower = str.toLowerCase();
  if (lower.includes('netflix')) return 'Netflix';
  if (lower.includes('spotify')) return 'Spotify';
  if (lower.includes('youtube') || lower.includes('google*youtube')) return 'YouTube Premium';
  if (lower.includes('disney')) return 'Disney+';
  if (lower.includes('hbo') || lower.includes('max')) return 'HBO GO / Max';
  if (lower.includes('prime video') || lower.includes('amazon prime')) return 'Amazon Prime Video';
  if (lower.includes('chatgpt') || lower.includes('openai')) return 'ChatGPT Plus';
  if (lower.includes('canva')) return 'Canva Pro';
  if (lower.includes('icloud') || lower.includes('apple.com/bill') || lower.includes('itunes')) return 'Apple iCloud & Services';
  if (lower.includes('google one') || lower.includes('google *storage') || lower.includes('google cloud')) return 'Google One';
  if (lower.includes('github')) return 'GitHub';
  if (lower.includes('adobe')) return 'Adobe Creative Cloud';
  if (lower.includes('microsoft') || lower.includes('msft') || lower.includes('office 365')) return 'Microsoft 365';
  if (lower.includes('playstation') || lower.includes('psn')) return 'PlayStation Plus';
  if (lower.includes('xbox') || lower.includes('game pass')) return 'Xbox Game Pass';
  if (lower.includes('nintendo')) return 'Nintendo Switch Online';
  if (lower.includes('anytime fitness')) return 'Anytime Fitness';
  if (lower.includes('fitness first')) return 'Fitness First';
  if (lower.includes('gym')) return 'Gym Membership';
  if (lower.includes('meralco')) return 'Meralco Electricity';
  if (lower.includes('manila water')) return 'Manila Water';
  if (lower.includes('maynilad')) return 'Maynilad Water';
  if (lower.includes('pldt')) return 'PLDT Home Fiber';
  if (lower.includes('converge')) return 'Converge ICT';
  if (lower.includes('globe telecom') || lower.includes('globe postpaid')) return 'Globe Postpaid';
  if (lower.includes('smart communications') || lower.includes('smart postpaid')) return 'Smart Postpaid';

  // Rule cleaning: strip transaction prefixes and reference noise
  str = str.replace(/\b(payment to|pymt\*|card payment to|autopay|auto-debit|direct debit|pos txn|pos purchase|pos|debit memo|sub to|billing for|recurring pymt|sub charge)\b/gi, '');
  str = str.replace(/\b(gcash payment to|gcash to|maya payment to|bpi expressonline|bdo online)\b/gi, '');
  
  // Rule cleaning: strip invoice/order/reference numbers (e.g., INV-9923, #12345, TXN9028, REF: 18293)
  str = str.replace(/(ref|txn|inv|invoice|pos|auth|id|order|bill|acct|acc|no|account)\s*[:#-]?\s*[a-z0-9]+/gi, '');
  str = str.replace(/#[0-9a-z_-]+/gi, '');
  str = str.replace(/\b[0-9a-f]{6,}\b/gi, ''); // hash strings
  str = str.replace(/\b\d{4,}\b/g, ''); // long numbers

  // Rule cleaning: strip date tokens (e.g., 08/24, 2026-09-01, Sep 2026)
  str = str.replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, '');
  str = str.replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{2,4}\b/gi, '');

  // Rule cleaning: strip corporate/location noise
  str = str.replace(/\b(inc|corp|corporation|ltd|llc|ph|philippines|manila|makati|quezon city|online|store|branch)\b/gi, '');

  // Clean remaining punctuation and whitespace
  str = str.replace(/[^\w\s&+-]/g, ' ');
  str = str.replace(/\s+/g, ' ').trim();

  if (!str || str.length < 2) {
    return raw.trim() || 'Recurring Payment';
  }

  // Capitalize words
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Predicts the next expected billing date based on the last transaction date,
 * recurrence frequency, and day-of-month rhythm.
 */
function calculateNextBillingDate(lastDate: number, frequency: 'monthly' | 'weekly' | 'biweekly' | 'quarterly', dueDay: number): number {
  const date = new Date(lastDate);
  const now = new Date();

  if (frequency === 'monthly') {
    // Target next month on dueDay
    let target = new Date(date.getFullYear(), date.getMonth() + 1, dueDay);
    while (target.getTime() <= now.getTime()) {
      target.setMonth(target.getMonth() + 1);
    }
    return target.getTime();
  }

  if (frequency === 'weekly') {
    let target = new Date(date.getTime() + 7 * 86400000);
    while (target.getTime() <= now.getTime()) {
      target = new Date(target.getTime() + 7 * 86400000);
    }
    return target.getTime();
  }

  if (frequency === 'biweekly') {
    let target = new Date(date.getTime() + 14 * 86400000);
    while (target.getTime() <= now.getTime()) {
      target = new Date(target.getTime() + 14 * 86400000);
    }
    return target.getTime();
  }

  // Quarterly
  let target = new Date(date.getFullYear(), date.getMonth() + 3, dueDay);
  while (target.getTime() <= now.getTime()) {
    target.setMonth(target.getMonth() + 3);
  }
  return target.getTime();
}

/**
 * Main Recurring Payment / Subscription Detector
 * Inspired by Actual Budget's rule matching and schedule discovery algorithms.
 */
export function detectRecurringPayments(
  transactions: Transaction[],
  existingBills: Bill[] = [],
  options: RecurringDetectorOptions = {}
): DetectedSubscription[] {
  const windowDays = options.windowDays || 90;
  const minOccurrences = options.minOccurrences || 2;
  const confidenceThreshold = options.confidenceThreshold || 0.65;
  const dismissedIds = options.dismissedIds || getDismissedSubscriptionIds();
  const includeTracked = options.includeTracked || false;

  const now = Date.now();
  const windowStart = now - windowDays * 86400000;

  // 1. Filter eligible expense transactions within the 30-90 day window
  const eligibleTransactions = (transactions || []).filter((tx) => {
    if (tx.type !== 'expense' && tx.amount <= 0) return false;
    return tx.date >= windowStart && tx.date <= now;
  });

  // 2. Group by normalized payee name
  const clusterMap: Record<string, Transaction[]> = {};
  for (const tx of eligibleTransactions) {
    const key = normalizePayee(tx.note || '');
    if (!clusterMap[key]) {
      clusterMap[key] = [];
    }
    clusterMap[key].push(tx);
  }

  const results: DetectedSubscription[] = [];

  // 3. Analyze each cluster using interval analysis & variance metrics
  for (const [payeeName, txs] of Object.entries(clusterMap)) {
    // Generate a deterministic slug ID
    const slugId = 'sub_' + payeeName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Skip if dismissed by user (unless user requested tracking check)
    if (dismissedIds.includes(slugId)) {
      continue;
    }

    // Sort chronologically ascending
    txs.sort((a, b) => a.date - b.date);

    const count = txs.length;

    // Check if this matches an existing bill
    const matchedBill = existingBills.find((bill) => {
      const billNorm = normalizePayee(bill.name);
      return (
        billNorm.toLowerCase() === payeeName.toLowerCase() ||
        bill.name.toLowerCase().includes(payeeName.toLowerCase()) ||
        payeeName.toLowerCase().includes(bill.name.toLowerCase())
      );
    });

    const isAlreadyTracked = Boolean(matchedBill);

    // Rule: Need at least minOccurrences OR (single occurrence if it's a known major subscription service)
    const isKnownSubscription = [
      'netflix', 'spotify', 'disney', 'youtube', 'chatgpt', 'icloud', 'google one',
      'canva', 'prime video', 'hbo', 'meralco', 'pldt', 'manila water', 'maynilad'
    ].some((k) => payeeName.toLowerCase().includes(k));

    if (count < minOccurrences && !isKnownSubscription) {
      continue;
    }

    // Calculate amounts
    const amounts = txs.map((t) => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / count;
    const lastAmount = amounts[amounts.length - 1];
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);

    // Variance ratio
    const amountSpread = maxAmount - minAmount;
    const varianceRatio = avgAmount > 0 ? amountSpread / avgAmount : 0;
    const isVariable = varianceRatio > 0.05;

    // Frequency and interval calculation
    let detectedFrequency: 'monthly' | 'weekly' | 'biweekly' | 'quarterly' = 'monthly';
    let frequencyLabel = 'Monthly';
    let avgIntervalDays = 30;
    let dueDay = new Date(txs[txs.length - 1].date).getDate();

    if (count >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < count; i++) {
        const diffDays = Math.round((txs[i].date - txs[i - 1].date) / 86400000);
        intervals.push(diffDays);
      }

      avgIntervalDays = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);

      if (avgIntervalDays >= 5 && avgIntervalDays <= 9) {
        detectedFrequency = 'weekly';
        frequencyLabel = 'Weekly';
      } else if (avgIntervalDays >= 12 && avgIntervalDays <= 16) {
        detectedFrequency = 'biweekly';
        frequencyLabel = 'Every 2 Weeks';
      } else if (avgIntervalDays >= 80 && avgIntervalDays <= 100) {
        detectedFrequency = 'quarterly';
        frequencyLabel = 'Quarterly';
      } else {
        detectedFrequency = 'monthly';
        frequencyLabel = `Monthly (Day ${dueDay})`;
      }
    } else {
      // Single occurrence of known subscription
      avgIntervalDays = 30;
      detectedFrequency = 'monthly';
      frequencyLabel = `Monthly (Day ${dueDay})`;
    }

    // Confidence Calculation (Actual Budget inspired scoring)
    let score = 0.70; // baseline

    // Interval consistency
    if (count >= 2) {
      if (Math.abs(avgIntervalDays - 30) <= 2 || Math.abs(avgIntervalDays - 7) <= 1 || Math.abs(avgIntervalDays - 14) <= 1) {
        score += 0.15;
      }
    }

    // Amount consistency
    if (amountSpread === 0) {
      score += 0.12; // identical exact charge every time
    } else if (varianceRatio <= 0.05) {
      score += 0.08;
    }

    // Number of occurrences bonus
    if (count >= 3) {
      score += 0.08;
    }

    // Recognized service bonus
    if (isKnownSubscription) {
      score += 0.10;
    }

    const confidence = Math.min(0.99, Math.max(0.5, score));
    const confidencePercentage = Math.round(confidence * 100);

    if (confidence < confidenceThreshold) {
      continue;
    }

    // Filter tracked if requested
    if (isAlreadyTracked && !includeTracked) {
      continue;
    }

    // Primary account used
    const accountCounts: Record<string, number> = {};
    for (const t of txs) {
      accountCounts[t.accountId] = (accountCounts[t.accountId] || 0) + 1;
    }
    const primaryAccountId = Object.entries(accountCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || txs[0]?.accountId || '';

    // Estimated next billing date
    const lastDate = txs[txs.length - 1].date;
    const estimatedNextDate = calculateNextBillingDate(lastDate, detectedFrequency, dueDay);

    // Build human-friendly explanation
    let reasoning = '';
    if (count >= 2) {
      reasoning = `Found ${count} charges averaging ₱${Math.round(avgAmount).toLocaleString()} spaced ~${avgIntervalDays} days apart (${confidencePercentage}% confidence).`;
    } else {
      reasoning = `Identified recurring subscription pattern for ${payeeName} (${confidencePercentage}% confidence).`;
    }

    results.push({
      id: slugId,
      name: payeeName,
      rawDescriptions: Array.from(new Set(txs.map((t) => t.note))),
      frequency: detectedFrequency,
      frequencyLabel,
      averageAmount: Math.round(avgAmount),
      lastAmount: Math.round(lastAmount),
      minAmount: Math.round(minAmount),
      maxAmount: Math.round(maxAmount),
      isVariable,
      confidence,
      confidencePercentage,
      intervalDays: avgIntervalDays,
      lastDate,
      estimatedNextDate,
      dueDay,
      occurrenceCount: count,
      accountId: primaryAccountId,
      categoryId: txs[txs.length - 1]?.categoryId,
      transactions: txs.map((t) => ({
        id: t.id,
        amount: t.amount,
        date: t.date,
        note: t.note,
        accountId: t.accountId,
      })),
      reasoning,
      isAlreadyTracked,
      matchedBillId: matchedBill?.id,
    });
  }

  // Sort by confidence descending, then by last amount
  return results.sort((a, b) => b.confidence - a.confidence || b.lastAmount - a.lastAmount);
}

/**
 * Converts a detected subscription into a new Bill payload ready for saveBill()
 */
export function buildBillFromDetected(
  detected: DetectedSubscription,
  householdId: string
): Omit<Bill, 'id'> & { id: string } {
  return {
    id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: detected.name,
    amount: detected.lastAmount || detected.averageAmount,
    accountId: detected.accountId,
    dueDay: detected.dueDay,
    dueType: 'monthly',
    status: 'upcoming',
    isVariableAmount: detected.isVariable,
    variableAmountFlag: detected.isVariable,
    householdId,
    timesRecurred: detected.occurrenceCount,
  };
}
