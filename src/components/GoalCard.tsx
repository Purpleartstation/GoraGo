import React from 'react';
import type { Goal } from '../db';
import { evaluateGoalPace } from '../utils/goalPlanner';
import { Target, ShieldCheck, Plane, ShoppingBag, GraduationCap, TrendingUp, Sparkles, Clock, ChevronRight, CheckCircle2 } from 'lucide-react';

interface GoalCardProps {
  goal: Goal;
  onClick: () => void;
  onQuickDeposit?: (e: React.MouseEvent) => void;
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

export default function GoalCard({ goal, onClick, onQuickDeposit }: GoalCardProps) {
  const currentAmt = goal.currentAmount || 0;
  const targetAmt = goal.targetAmount || 1;
  const progressPercent = Math.min(100, Math.round((currentAmt / targetAmt) * 100));
  const isCompleted = goal.status === 'completed' || currentAmt >= targetAmt;

  const pacing = evaluateGoalPace(goal);
  const IconComponent = CATEGORY_ICONS[goal.category] || Target;

  return (
    <div
      onClick={onClick}
      className="p-4 bg-white dark:bg-zinc-900/90 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-sm hover:border-purple-500/40 dark:hover:border-purple-500/40 transition-all cursor-pointer group space-y-3.5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
            style={{ backgroundColor: goal.color || '#8B5CF6' }}
          >
            <IconComponent size={20} />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              {goal.category.replace('_', ' ')}
            </span>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white leading-tight group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              {goal.title}
            </h4>
          </div>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
            isCompleted 
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
          }`}>
            {isCompleted ? '100% Done' : `${progressPercent}%`}
          </span>
          <span className="text-[10px] text-zinc-400 mt-0.5 flex items-center gap-1">
            <Clock size={10} />
            {isCompleted ? 'Goal Achieved' : pacing.isOverdue ? 'Due' : `${pacing.daysRemaining}d left`}
          </span>
        </div>
      </div>

      {/* Amounts and Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-extrabold text-zinc-900 dark:text-white text-base">
            ₱{currentAmt.toLocaleString()}
          </span>
          <span className="font-semibold text-zinc-400 text-xs">
            Target: ₱{targetAmt.toLocaleString()}
          </span>
        </div>

        <div className="relative w-full h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: goal.color || '#8B5CF6',
            }}
          />
        </div>
      </div>

      {/* Gora AI Micro-Tip / Coaching Pill */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60 text-[11px]">
        <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 font-medium truncate mr-2">
          <Sparkles size={13} className="text-purple-500 shrink-0" />
          <span className="truncate">
            {isCompleted
              ? 'Target achieved! Funds ready for allocation.'
              : pacing.suggestedNextDeposit > 0
              ? `Next deposit: ₱${pacing.suggestedNextDeposit.toLocaleString()} on 15th payday`
              : pacing.advice}
          </span>
        </div>

        <div className="flex items-center text-purple-600 dark:text-purple-400 font-bold text-xs shrink-0 group-hover:translate-x-0.5 transition-transform">
          <span>Details</span>
          <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}
