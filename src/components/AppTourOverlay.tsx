import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  ShieldCheck,
  TrendingUp,
  Target,
  Wallet,
  CheckCircle2,
  Settings,
  Plus
} from 'lucide-react';
import { useAppStore } from '../store';

export interface TourStep {
  id: string;
  featureKey: string;
  selector: string;
  title: string;
  tagline: string;
  description: string;
  route: string;
  icon: React.ElementType;
  accentColor: string;
  badge: string;
  quickTips: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'total-balance',
    featureKey: 'totalbalance',
    selector: '#home-total-balance-card',
    title: 'Spendable Cash & Total Balance',
    tagline: 'Your real-time daily spendable liquidity',
    description: 'Ito ang calculated real-time sum ng iyong mga regular bank accounts, GCash, Maya, at Cash on Hand. Nakahiwalay ito sa iyong Emergency Fund para malinaw ang pwedeng gastusin sa pang-araw-araw.',
    route: '/',
    icon: Wallet,
    accentColor: '#8B5CF6',
    badge: 'Spendable Liquidity',
    quickTips: [
      'Automatic sync sa lahat ng logged cash flows.',
      'Hindi nababawasan kapag nag-ipon sa Safety Net.',
      'Tap any account pill para ma-view ang specific balance.'
    ]
  },
  {
    id: 'safety-net',
    featureKey: 'safetynet',
    selector: '#home-safety-net-card',
    title: 'Non-Deletable Safety Net',
    tagline: 'Emergency reserve with 4-digit PIN lock',
    description: 'Ang iyong non-deletable crisis fund. Naka-lock sa 4-digit passcode at may smart AI impact warnings bago mag-withdraw para maiwasan ang impulse spending sa panahon ng emergencies.',
    route: '/',
    icon: ShieldCheck,
    accentColor: '#F59E0B',
    badge: 'PIN-Protected Buffer',
    quickTips: [
      'Hindi pwedeng i-delete (tanging balance reset lang kapag full wipe).',
      'Protektado ng 4-digit PIN na pwede mong i-reveal.',
      '1-Tap Deposit & Withdraw with real-time liquidity warnings.'
    ]
  },
  {
    id: 'cash-flow',
    featureKey: 'cashflow',
    selector: '#home-cashflow-card',
    title: 'Prophet 30-Day Cash Flow',
    tagline: 'Predictive liquidity & bill cluster outlook',
    description: 'Awtomatikong sinusuri ng Prophet AI ang iyong historical spending rhythm at upcoming recurring bills para i-forecast ang iyong balance at maiwasan ang payday shortages.',
    route: '/',
    icon: TrendingUp,
    accentColor: '#3B82F6',
    badge: 'Forward Forecast',
    quickTips: [
      'Predicts safe daily spending rate.',
      'Detects upcoming bill clusters bago pa mag-due.',
      'Alerts you if monthly surplus is trending down.'
    ]
  },
  {
    id: 'savings-goals',
    featureKey: 'goals',
    selector: '#home-goals-card',
    title: 'Financial Goals & Payday Planner',
    tagline: 'Automated savings for cars, travel & milestones',
    description: 'Mag-set ng target purchases o savings milestones! Awtomatikong kinakalkula ni GoraGo CFO kung magkano ang itatabi mo kada 15th at 30th na sahod nang hindi nasasagasaan ang bills o emergency fund.',
    route: '/',
    icon: Target,
    accentColor: '#EC4899',
    badge: 'Payday Savings',
    quickTips: [
      'Auto-split sa 15th & 30th payday allocations.',
      'Interactive Purchase Feasibility checking via AI chat.',
      '1-Click auto-goal creation from AI advice.'
    ]
  },
  {
    id: 'quick-action-setup',
    featureKey: 'quickaction',
    selector: '#bottom-nav-bar',
    title: 'Quick Action Menu & Account Setup',
    tagline: 'Manage your household accounts and track money',
    description: 'Dito mo pwedeng i-add ang iyong mga accounts o i-setup ang household budget gamit ang quick action menu (+) sa ibaba. Simulan na ang iyong pag-ipon at maging handa sa kinabukasan!',
    route: '/',
    icon: Plus,
    accentColor: '#10B981',
    badge: 'Quick Setup',
    quickTips: [
      'Tap (+) to instantly log expenses, income, and new accounts.',
      'Setup GCash, bank accounts, or digital wallets in 1-Click.',
      'Invite partner or household members in Settings.'
    ]
  }
];

export default function AppTourOverlay() {
  const isTourOpen = useAppStore((s) => s.isTourOpen);
  const currentTourStep = useAppStore((s) => s.currentTourStep);
  const tourTargetFeature = useAppStore((s) => s.tourTargetFeature);
  const closeAppTour = useAppStore((s) => s.closeAppTour);
  const setGoraAiOpen = useAppStore((s) => s.setGoraAiOpen);

  const location = useLocation();
  const navigate = useNavigate();

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const lastAdvanceTimeRef = React.useRef(0);

  // Determine current active index based on feature key or step
  const activeStep = useMemo(() => {
    if (tourTargetFeature) {
      const foundIdx = TOUR_STEPS.findIndex(
        (s) => s.featureKey.toLowerCase() === tourTargetFeature.toLowerCase() || s.id.toLowerCase() === tourTargetFeature.toLowerCase()
      );
      if (foundIdx !== -1) {
        return { step: TOUR_STEPS[foundIdx], index: foundIdx, isSingleFeature: false }; // set isSingleFeature to false to always enable sequential navigation
      }
    }
    const idx = Math.min(Math.max(0, currentTourStep), TOUR_STEPS.length - 1);
    return { step: TOUR_STEPS[idx], index: idx, isSingleFeature: false };
  }, [tourTargetFeature, currentTourStep]);

  const isFirstStep = activeStep.index === 0;
  const isLastStep = activeStep.index === TOUR_STEPS.length - 1;

  // Custom step movement handlers that always advance the sequence
  const handleNext = React.useCallback(() => {
    const now = Date.now();
    if (now - lastAdvanceTimeRef.current < 400) return;
    lastAdvanceTimeRef.current = now;

    if (isLastStep) {
      closeAppTour();
      setGoraAiOpen(true);
    } else {
      useAppStore.setState({ tourTargetFeature: null, currentTourStep: activeStep.index + 1 });
    }
  }, [isLastStep, activeStep.index, closeAppTour, setGoraAiOpen]);

  const handleBack = React.useCallback(() => {
    if (!isFirstStep) {
      useAppStore.setState({ tourTargetFeature: null, currentTourStep: activeStep.index - 1 });
    }
  }, [isFirstStep, activeStep.index]);

  // Sync route navigation if required
  useEffect(() => {
    if (!isTourOpen) return;
    if (location.pathname !== activeStep.step.route) {
      navigate(activeStep.step.route);
    }
  }, [isTourOpen, activeStep.step.route, location.pathname, navigate]);

  // Safe auto-scroll to active target element executed once when step or selector changes
  useEffect(() => {
    if (!isTourOpen) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(activeStep.step.selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [isTourOpen, activeStep.index, activeStep.step.selector]);

  // Track target bounding rect for spotlight
  useEffect(() => {
    if (!isTourOpen) {
      setTargetRect(null);
      return;
    }

    let timeoutId: any;

    const measureTarget = () => {
      const el = document.querySelector(activeStep.step.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
    };

    measureTarget();
    timeoutId = setTimeout(measureTarget, 250);

    const handleResizeOrScroll = () => {
      measureTarget();
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
    };
  }, [isTourOpen, activeStep.step.selector, location.pathname, activeStep.index]);

  // Attach event listener directly to the active highlighted DOM element
  useEffect(() => {
    if (!isTourOpen) return;

    const selector = activeStep.step.selector;
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) return;

    const handleElementClick = (event: MouseEvent) => {
      // Avoid reacting if clicking inside the dialog card itself
      const tourCard = document.getElementById('app-tour-dialog-card');
      if (tourCard && tourCard.contains(event.target as Node)) {
        return;
      }

      handleNext();
    };

    element.addEventListener('click', handleElementClick);

    return () => {
      element.removeEventListener('click', handleElementClick);
    };
  }, [isTourOpen, activeStep.index, activeStep.step.selector, handleNext]);

  // Set pointer-events-auto strictly on the highlighted element so users can interact with it naturally
  useEffect(() => {
    if (!isTourOpen) return;
    
    const el = document.querySelector(activeStep.step.selector) as HTMLElement | null;
    if (el) {
      const originalPointerEvents = el.style.pointerEvents;
      el.style.pointerEvents = 'auto';
      return () => {
        el.style.pointerEvents = originalPointerEvents;
      };
    }
  }, [isTourOpen, activeStep.index, activeStep.step.selector]);

  if (!isTourOpen) return null;

  const StepIcon = activeStep.step.icon;

  const triggerAddAccount = () => {
    closeAppTour();
    window.dispatchEvent(new CustomEvent('gorago_open_account_creation'));
  };

  const triggerOpenSettings = () => {
    closeAppTour();
    window.dispatchEvent(new CustomEvent('gorago_open_settings_sheet'));
  };

  const getTooltipPrompt = (stepId: string) => {
    switch (stepId) {
      case 'total-balance':
        return '👉 Tap Total Balance Card to view detailed daily spendable liquid cash!';
      case 'safety-net':
        return '👉 Tap Safety Net Card to unlock crisis fund options!';
      case 'cash-flow':
        return '👉 Tap Prophet AI to analyze your 30-day forecast!';
      case 'savings-goals':
        return '👉 Tap Financial Goals to view payday milestone targets!';
      case 'quick-action-setup':
        return '👉 Click the Add button (+) or trigger Handshake actions below!';
      default:
        return '👉 Tap the highlighted card to advance!';
    }
  };

  // Smart placement style based on target positions in viewport
  const getDialogStyle = () => {
    if (!targetRect) {
      // Elegant, fallback bottom placement
      return {
        position: 'absolute' as const,
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '380px',
        zIndex: 40,
      };
    }

    const margin = 16;
    const isTopHalf = targetRect.top <= window.innerHeight / 2;

    const cardWidth = Math.min(window.innerWidth - 32, 380);
    const targetCenter = targetRect.left + targetRect.width / 2;
    let leftPos = targetCenter - cardWidth / 2;
    // Clamp to 16px safe side padding
    leftPos = Math.max(16, Math.min(window.innerWidth - cardWidth - 16, leftPos));

    if (isTopHalf) {
      // Place BELOW the highlighted element
      return {
        position: 'absolute' as const,
        top: `${targetRect.bottom + margin}px`,
        left: `${leftPos}px`,
        width: `${cardWidth}px`,
        zIndex: 40,
      };
    } else {
      // Place ABOVE the highlighted element
      // Anchoring using "bottom" guarantees it grows upwards perfectly and never overlaps the target
      return {
        position: 'absolute' as const,
        bottom: `${window.innerHeight - targetRect.top + margin}px`,
        left: `${leftPos}px`,
        width: `${cardWidth}px`,
        zIndex: 40,
      };
    }
  };

  return (
    <div
      id="app-tour-overlay-container"
      className="fixed inset-0 z-40 pointer-events-none overflow-hidden transition-all duration-300"
      style={{ backgroundColor: targetRect ? 'transparent' : 'rgba(9, 12, 20, 0.75)' }}
    >
      {/* Visual Spotlight Cutout / Ring Indicator over Target Element */}
      {targetRect && (
        <div
          className="absolute rounded-[20px] pointer-events-none transition-all duration-300 ring-4 ring-purple-500/80 shadow-[0_0_50px_rgba(168,85,247,0.6)] animate-pulse"
          style={{
            top: `${targetRect.top - 6}px`,
            left: `${targetRect.left - 6}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
            boxShadow: '0 0 0 9999px rgba(9, 12, 20, 0.78), 0 0 30px rgba(168,85,247,0.8)',
            zIndex: 35
          }}
        />
      )}

      {/* Glassmorphic Tour Guide Card (Mobile-Optimized Smart Positioned Modal) */}
      <div
        id="app-tour-dialog-card"
        className="relative z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl rounded-3xl p-5 border border-purple-300/60 dark:border-purple-500/30 shadow-2xl text-zinc-900 dark:text-white transform-gpu animate-in fade-in zoom-in-95 duration-200 pointer-events-auto"
        style={getDialogStyle()}
      >
        {/* Click-Along Action Tooltip Banner inside the Dialog Card */}
        {targetRect && (
          <div className="mb-4 bg-purple-600 dark:bg-purple-950/80 text-white border border-purple-400/40 px-3.5 py-2.5 rounded-2xl shadow-md text-xs font-black animate-pulse flex items-center justify-center gap-2 text-center leading-snug">
            <span>{getTooltipPrompt(activeStep.step.id)}</span>
          </div>
        )}

        {/* Top Header Bar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ backgroundColor: activeStep.step.accentColor }}
            >
              <StepIcon size={18} />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/25">
                Tour Step {activeStep.index + 1} of {TOUR_STEPS.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            id="tour-close-btn"
            onClick={closeAppTour}
            className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            aria-label="Close tour"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Title & Tagline */}
        <div className="mb-2.5">
          <h3 className="text-base font-black text-zinc-900 dark:text-white tracking-tight">
            {activeStep.step.title}
          </h3>
          <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-0.5">
            {activeStep.step.tagline}
          </p>
        </div>

        {/* Description in Natural Taglish */}
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mb-3">
          {activeStep.step.description}
        </p>

        {/* Quick Functional Tips */}
        <div className="bg-slate-50 dark:bg-zinc-800/70 rounded-2xl p-3 mb-4 border border-zinc-200/70 dark:border-zinc-700/50 space-y-1.5 animate-fade-in">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
            ✨ GoraGo CFO Quick Guide:
          </span>
          {activeStep.step.quickTips.map((tip, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-300 leading-tight">
              <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
              <span>{tip}</span>
            </div>
          ))}
        </div>

        {/* Direct Action Handshake & Account Setup Integration (Only in Step 5/Last Step) */}
        {isLastStep && (
          <div className="flex flex-col gap-2 mb-4 p-3 bg-purple-500/10 dark:bg-purple-500/5 rounded-2xl border border-purple-500/20">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 block mb-1 text-center">
              🚀 Direct Setup Handshake
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="tour-add-account-btn"
                onClick={triggerAddAccount}
                className="px-3 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-black flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-sm cursor-pointer border border-white/10"
              >
                <span>🚀 Add Account</span>
              </button>
              <button
                type="button"
                id="tour-open-settings-btn"
                onClick={triggerOpenSettings}
                className="px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-black flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-sm cursor-pointer border border-zinc-200/80 dark:border-zinc-700/50"
              >
                <span>⚙️ Open Settings</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-200/70 dark:border-zinc-800/80">
          {!isFirstStep ? (
            <button
              type="button"
              id="tour-prev-btn"
              onClick={handleBack}
              className="px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              id="tour-skip-btn"
              onClick={closeAppTour}
              className="text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 px-2 py-1 transition-colors"
            >
              Skip Tour
            </button>
          )}

          <div className="flex items-center gap-2">
            {!isLastStep ? (
              <button
                type="button"
                id="tour-next-btn"
                onClick={handleNext}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-purple-500/20 active:scale-95 transition-all cursor-pointer animate-pulse"
              >
                <span>Next Step</span>
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                id="tour-finish-btn"
                onClick={handleNext}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-purple-500/30 active:scale-95 transition-all cursor-pointer"
              >
                <Sparkles size={14} />
                <span>Got it, Ask CFO!</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
