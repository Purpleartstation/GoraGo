import { useState, useMemo } from 'react';
import type { Account, Bill, Transaction } from '../db';
import { saveBill } from '../db';
import {
  detectRecurringPayments,
  dismissSubscriptionId,
  restoreDismissedSubscription,
  getDismissedSubscriptionIds,
  buildBillFromDetected,
  type DetectedSubscription,
} from '../utils/recurringDetector';
import {
  Sparkles,
  CheckCircle2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  Layers,
  History,
  Check,
  Undo2,
} from 'lucide-react';
import HelpTooltip from './HelpTooltip';

interface DetectedSubscriptionsCardProps {
  transactions: Transaction[];
  bills: Bill[];
  accounts: Account[];
  householdId: string;
  onTrackedSuccess?: (subscriptionName: string, amount: number) => void;
}

export default function DetectedSubscriptionsCard({
  transactions,
  bills,
  accounts,
  householdId,
  onTrackedSuccess,
}: DetectedSubscriptionsCardProps) {
  const [windowDays, setWindowDays] = useState<30 | 60 | 90>(90);
  const [dismissedList, setDismissedList] = useState<string[]>(() => getDismissedSubscriptionIds());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Account map for easy label lookup
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((acc) => map.set(acc.id, acc.name));
    return map;
  }, [accounts]);

  // Run detection rule engine
  const allDetected = useMemo(() => {
    return detectRecurringPayments(transactions, bills, {
      windowDays,
      minOccurrences: 2,
      confidenceThreshold: 0.65,
      dismissedIds: [], // We filter manually so we can offer restore
      includeTracked: true,
    });
  }, [transactions, bills, windowDays]);

  // Active untracked and non-dismissed subscriptions
  const activeDetected = useMemo(() => {
    return allDetected.filter(
      (sub) => !sub.isAlreadyTracked && !dismissedList.includes(sub.id)
    );
  }, [allDetected, dismissedList]);

  // Dismissed subscriptions
  const dismissedSubs = useMemo(() => {
    return allDetected.filter((sub) => dismissedList.includes(sub.id));
  }, [allDetected, dismissedList]);

  // Already tracked
  const trackedSubs = useMemo(() => {
    return allDetected.filter((sub) => sub.isAlreadyTracked);
  }, [allDetected]);

  // Total potential monthly spend for active untracked
  const totalMonthlySpend = useMemo(() => {
    return activeDetected.reduce((sum, item) => sum + item.lastAmount, 0);
  }, [activeDetected]);

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dismissSubscriptionId(id);
    setDismissedList(getDismissedSubscriptionIds());
  };

  const handleRestore = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    restoreDismissedSubscription(id);
    setDismissedList(getDismissedSubscriptionIds());
  };

  const handleTrackAsBill = async (sub: DetectedSubscription, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingId(sub.id);

    try {
      const newBill = buildBillFromDetected(sub, householdId);
      await saveBill(newBill as Bill);

      setSuccessMsg(`Added "${sub.name}" to Bills!`);
      if (onTrackedSuccess) {
        onTrackedSuccess(sub.name, sub.lastAmount);
      }
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Failed to convert detected subscription to bill:', err);
    } finally {
      setAddingId(null);
    }
  };

  // If there are no detected items at all and no dismissed items
  if (allDetected.length === 0) {
    return null;
  }

  return (
    <div
      id="detected-subscriptions-card"
      className="p-5 bg-[#F0F4F8] dark:bg-[#2D3748] rounded-3xl border border-amber-400/50 dark:border-amber-500/30 shadow-md shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] relative overflow-hidden space-y-4 transition-all"
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-amber-400/15 dark:bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />

      {/* Header */}
      <div className="flex items-start justify-between gap-2 relative z-10">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="p-1.5 rounded-xl bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-400/30 shrink-0">
              <Sparkles size={16} />
            </span>
            <h2 className="text-sm font-black text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-1 truncate">
              Detected Subscriptions
              <HelpTooltip
                title="Actual Budget Rule Engine"
                text="Analyzes past transaction descriptions, frequency intervals, and amount regularity over 30 to 90 days to automatically detect recurring services and bills."
              />
            </h2>
            {activeDetected.length > 0 && (
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-400/25 text-amber-900 dark:text-amber-200 border border-amber-400/40 shrink-0 whitespace-nowrap">
                {activeDetected.length} found
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2">
            {activeDetected.length > 0
              ? `Rule engine identified ~₱${totalMonthlySpend.toLocaleString()}/mo in recurring payments not yet in your bills list.`
              : 'All detected recurring expenses in this period are already tracked or dismissed.'}
          </p>
        </div>

        {/* Window Selector */}
        <div className="flex items-center bg-white/70 dark:bg-zinc-800/80 border border-black/5 dark:border-white/10 p-1 rounded-2xl text-[10px] font-black shrink-0 shadow-xs">
          {[30, 60, 90].map((days) => (
            <button
              key={days}
              id={`window-btn-${days}`}
              onClick={() => setWindowDays(days as any)}
              className={`px-2.5 py-1 rounded-xl transition-all ${
                windowDays === days
                  ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Success notification banner */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">{successMsg}</span>
        </div>
      )}

      {/* Detected Subscriptions List */}
      <div className="space-y-3 relative z-10">
        {activeDetected.map((sub) => {
          const isExpanded = expandedId === sub.id;
          const accountName = accountMap.get(sub.accountId) || 'Account';

          return (
            <div
              key={sub.id}
              id={`detected-sub-${sub.id}`}
              className="p-3.5 bg-white/80 dark:bg-zinc-900/60 rounded-2xl border border-white/80 dark:border-white/10 shadow-xs transition-all hover:border-amber-400/50 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5)] dark:shadow-none"
            >
              {/* Top Row: Name & Badges on Left, Price on Right */}
              <div className="flex items-start justify-between gap-3 relative z-10">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-base text-zinc-900 dark:text-zinc-100 truncate">
                      {sub.name}
                    </span>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-black/5 dark:border-white/10 uppercase shrink-0 whitespace-nowrap">
                      {sub.frequencyLabel}
                    </span>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shrink-0 whitespace-nowrap">
                      {sub.confidencePercentage}% match
                    </span>
                    {sub.isVariable && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0 whitespace-nowrap">
                        Variable
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 truncate">
                    Paid from <span className="font-semibold text-zinc-700 dark:text-zinc-300">{accountName}</span> · Est. next {new Date(sub.estimatedNextDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </p>
                </div>

                {/* Amount on Right with zero overlap */}
                <div className="text-right shrink-0">
                  <p className="font-black text-lg text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap leading-tight">
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 mr-0.5">₱</span>
                    {sub.lastAmount.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-black whitespace-nowrap tracking-wider">
                    per cycle
                  </p>
                </div>
              </div>

              {/* Bottom Action Row: Recurrence info on Left, Track & Dismiss on Right */}
              <div className="flex items-center justify-between gap-2 pt-2.5 mt-2.5 border-t border-black/5 dark:border-white/5 relative z-10">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 italic truncate pr-2">
                  {sub.reasoning}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Track Button (44px min touch target) */}
                  <button
                    id={`track-sub-${sub.id}`}
                    onClick={(e) => handleTrackAsBill(sub, e)}
                    disabled={addingId === sub.id}
                    className="min-h-[40px] px-3.5 py-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-amber-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50 shrink-0 whitespace-nowrap cursor-pointer border border-white/60 shadow-[inset_0_2px_3px_rgba(255,255,255,0.6)]"
                    title="Add to active Bills tracking"
                  >
                    {addingId === sub.id ? (
                      <span className="animate-spin text-xs">↻</span>
                    ) : (
                      <Plus size={14} strokeWidth={3} />
                    )}
                    Track
                  </button>

                  {/* Dismiss Button (44px touch target) */}
                  <button
                    id={`dismiss-sub-${sub.id}`}
                    onClick={(e) => handleDismiss(sub.id, e)}
                    className="min-w-[40px] min-h-[40px] rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center active:scale-95 transition-all shrink-0 cursor-pointer"
                    title="Dismiss this suggestion"
                    aria-label="Dismiss suggestion"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Collapsible rule proof / matched transactions */}
              <div className="pt-2 mt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="truncate pr-2 italic">
                  {sub.reasoning}
                </span>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                  className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline shrink-0"
                >
                  <History size={11} />
                  {isExpanded ? 'Hide' : `${sub.occurrenceCount} Txns`}
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Expanded transaction breakdown */}
              {isExpanded && (
                <div className="mt-2.5 pt-2 border-t border-dashed border-black/10 dark:border-white/10 space-y-1.5 animate-in fade-in duration-150">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Rule Evidence from Last {windowDays} Days:
                  </p>
                  <div className="space-y-1">
                    {sub.transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-black/5 dark:bg-white/5 font-mono"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Calendar size={11} className="text-zinc-500 shrink-0" />
                          <span className="text-zinc-600 dark:text-zinc-300">
                            {new Date(tx.date).toLocaleDateString('en-PH', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400 truncate max-w-[140px]">
                            {tx.note}
                          </span>
                        </div>
                        <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                          ₱{tx.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* All tracked empty state notice */}
        {activeDetected.length === 0 && (
          <div className="p-4 text-center rounded-2xl bg-white/40 dark:bg-zinc-900/30 border border-black/5 dark:border-white/5 text-xs text-zinc-500 space-y-1">
            <Check size={18} className="mx-auto text-emerald-500 mb-1" />
            <p className="font-bold text-zinc-700 dark:text-zinc-300">
              All detected subscriptions are monitored!
            </p>
            <p className="text-[11px]">
              The background rule engine checked {transactions.length} transactions across the last {windowDays} days.
            </p>
          </div>
        )}
      </div>

      {/* Footer controls: Tracked count & Dismissed drawer */}
      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-black/5 dark:border-white/10 relative z-10">
        <div className="flex items-center gap-2">
          {trackedSubs.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
              <Layers size={12} />
              {trackedSubs.length} already in Bills
            </span>
          )}
        </div>

        {dismissedSubs.length > 0 && (
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="text-[10px] font-bold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 underline flex items-center gap-1"
          >
            {showDismissed ? 'Hide dismissed' : `View ${dismissedSubs.length} dismissed`}
          </button>
        )}
      </div>

      {/* Dismissed items list */}
      {showDismissed && dismissedSubs.length > 0 && (
        <div className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 space-y-2 animate-in fade-in duration-150">
          <p className="text-[10px] font-black uppercase text-zinc-500">
            Dismissed Subscriptions
          </p>
          <div className="space-y-1.5">
            {dismissedSubs.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-2 rounded-xl bg-white/60 dark:bg-zinc-900/40 text-xs"
              >
                <div>
                  <p className="font-bold text-zinc-800 dark:text-zinc-200">{sub.name}</p>
                  <p className="text-[10px] text-zinc-500">₱{sub.lastAmount.toLocaleString()} · {sub.frequencyLabel}</p>
                </div>
                <button
                  onClick={(e) => handleRestore(sub.id, e)}
                  className="px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[10px] font-bold flex items-center gap-1"
                >
                  <Undo2 size={11} /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
