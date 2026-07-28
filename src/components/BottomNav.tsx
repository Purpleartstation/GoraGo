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
    <div className="fixed bottom-safe-bottom left-4 right-4 z-40 mb-4">
      <nav className="flex justify-around items-center h-[72px] px-2 bg-zinc-900/80 backdrop-blur-2xl border border-zinc-800/50 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
        {navItems.map((item) => {
          if (item.isFab) {
            return (
              <div key="fab" className="flex flex-col items-center justify-center w-16 relative">
                <button
                  className="absolute -top-7 w-14 h-14 bg-zinc-100 text-zinc-900 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:scale-105 active:scale-95 transition-all duration-300 ring-4 ring-background-dark"
                  onClick={() => toggleAddMenu(true)}
                  aria-label="Add new entry"
                >
                  <item.icon size={28} strokeWidth={2.5} />
                </button>
                <span className="text-[10px] font-bold text-zinc-400 mt-[28px]">
                  Add
                </span>
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center w-14 h-full gap-1 transition-all duration-300',
                  isActive
                    ? 'text-zinc-100 scale-110'
                    : 'text-zinc-500 hover:text-zinc-300'
                )
              }
            >
              <item.icon size={22} strokeWidth={2} />
              <span className="text-[9px] font-bold tracking-wide">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
