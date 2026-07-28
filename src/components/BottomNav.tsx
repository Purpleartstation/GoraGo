import { NavLink } from 'react-router-dom';
import { Home, Wallet, Plus, FileText, Activity } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore } from '../store';

export default function BottomNav() {
  const toggleAddMenu = useAppStore((state) => state.toggleAddMenu);

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/accounts', icon: Wallet, label: 'Accounts' },
    { to: '#add', icon: Plus, label: 'Add', isFab: true },
    { to: '/tracker', icon: Activity, label: 'Tracker' },
    { to: '/bills', icon: FileText, label: 'Bills' },
  ];

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[90%] max-w-[380px] z-30">
      <nav className="flex justify-around items-center h-[64px] px-3 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-2xl border border-white/40 dark:border-white/10 rounded-full shadow-lg dark:shadow-[0_15px_35px_rgba(0,0,0,0.6)] text-zinc-800 dark:text-zinc-100 transition-colors duration-300">
        {navItems.map((item) => {
          if (item.isFab) {
            return (
              <button
                key="fab"
                onClick={() => toggleAddMenu(true)}
                aria-label="Add entry"
                className="w-12 h-12 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(217,70,239,0.4)] hover:scale-105 active:scale-95 transition-all duration-200 shrink-0"
              >
                <item.icon size={26} strokeWidth={2.8} />
              </button>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={({ isActive }) =>
                clsx(
                  'relative flex items-center justify-center w-11 h-11 rounded-full transition-all duration-200',
                  isActive
                    ? 'text-purple-600 dark:text-fuchsia-400 scale-110 bg-purple-500/15 dark:bg-fuchsia-500/20 shadow-[0_0_15px_rgba(217,70,239,0.25)]'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
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

