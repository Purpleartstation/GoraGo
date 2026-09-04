import { NavLink } from 'react-router-dom';
import { Home, Wallet, Plus, FileText, TrendingUp, Sparkles, ShoppingCart } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { triggerHaptic } from '../utils/haptics';
import { playSound } from '../utils/soundFX';

export default function BottomNav() {
  const { t } = useTranslation();
  const toggleAddMenu = useAppStore((state) => state.toggleAddMenu);
  const isGoraAiOpen = useAppStore((state) => state.isGoraAiOpen);
  const setGoraAiOpen = useAppStore((state) => state.setGoraAiOpen);

  const navItems = [
    { to: '/', icon: Home, label: t('nav.home', 'Home') },
    { to: '/accounts', icon: Wallet, label: t('nav.accounts', 'Accounts') },
    { to: '/groceries', icon: ShoppingCart, label: t('nav.grocery', 'Groceries') },
    { to: '#add', icon: Plus, label: t('common.add', 'Add'), isFab: true },
    { to: '#ai', icon: Sparkles, label: 'GoraGo CFO', isAi: true },
    { to: '/bills', icon: FileText, label: t('nav.bills', 'Bills') },
    { to: '/insights', icon: TrendingUp, label: t('nav.insights', 'Insights') },
  ];

  return (
    <div className="absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 w-[95%] max-w-[420px] z-30 pointer-events-auto pb-[env(safe-area-inset-bottom,0px)] select-none">
      <nav id="bottom-nav-bar" className="flex justify-around items-center h-[66px] px-2 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-2xl border border-white/40 dark:border-white/10 rounded-full shadow-lg dark:shadow-[0_15px_35px_rgba(0,0,0,0.6)] text-zinc-800 dark:text-zinc-100 transition-all duration-300 transform-gpu [backface-visibility:hidden]">
        {navItems.map((item) => {
          if (item.isFab) {
            return (
              <button
                type="button"
                key="fab"
                onClick={() => {
                  triggerHaptic('light');
                  playSound('pop');
                  if (isGoraAiOpen) setGoraAiOpen(false);
                  toggleAddMenu(true);
                }}
                aria-label="Add entry"
                className="w-12 h-12 bg-gradient-to-tr from-purple-600 via-indigo-600 to-fuchsia-500 text-white rounded-full flex items-center justify-center shadow-md shadow-purple-500/30 hover:scale-105 active:scale-90 transition-transform duration-100 shrink-0 border border-white/50 cursor-pointer shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] touch-manipulation will-change-transform"
              >
                <item.icon size={22} strokeWidth={2.8} />
              </button>
            );
          }

          if (item.isAi) {
            return (
              <button
                type="button"
                key="gora-ai"
                onClick={() => {
                  triggerHaptic('light');
                  playSound('pop');
                  setGoraAiOpen(!isGoraAiOpen);
                }}
                aria-label="GoraGo CFO Assistant"
                title="GoraGo CFO Assistant"
                className={clsx(
                  'relative flex items-center justify-center w-11 h-11 rounded-full transition-transform duration-100 active:scale-90 cursor-pointer shrink-0 touch-manipulation will-change-transform',
                  isGoraAiOpen
                    ? 'text-white scale-105 bg-gradient-to-tr from-purple-600 to-fuchsia-500 shadow-md shadow-purple-500/30 border border-white/40'
                    : 'text-purple-600 dark:text-fuchsia-400 hover:scale-105 hover:bg-white/60 dark:hover:bg-white/10'
                )}
              >
                <item.icon size={20} strokeWidth={2.4} />
                <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-400 ring-1 ring-white dark:ring-zinc-900 animate-pulse" />
              </button>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              onClick={() => {
                triggerHaptic('light');
                playSound('pop');
                if (isGoraAiOpen) setGoraAiOpen(false);
              }}
              className={({ isActive }) =>
                clsx(
                  'relative flex items-center justify-center w-11 h-11 rounded-full transition-transform duration-100 active:scale-90 shrink-0 touch-manipulation will-change-transform',
                  isActive
                    ? 'text-purple-600 dark:text-fuchsia-400 scale-105 bg-white/90 dark:bg-zinc-800/80 shadow-md shadow-zinc-300/40 dark:shadow-black/40 border border-white/80 dark:border-white/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.9)]'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white/40 dark:hover:bg-white/5'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} className="transition-transform duration-100" />
                  {isActive && (
                    <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.8)]" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

