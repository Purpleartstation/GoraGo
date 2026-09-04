import React from 'react';
import { useOnlineStatus } from '../utils/usePWAInstall';
import { WifiOff, Database } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="offline-banner"
      className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-full bg-zinc-900/90 dark:bg-zinc-800/90 backdrop-blur-md text-amber-400 text-xs font-semibold shadow-xl border border-amber-500/30 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-none"
    >
      <WifiOff size={14} className="text-amber-400 animate-pulse" />
      <span className="text-zinc-100">Offline Mode</span>
      <span className="text-zinc-400 text-[11px] flex items-center gap-1 font-normal border-l border-zinc-700 pl-2">
        <Database size={11} className="text-emerald-400" /> Local cache active
      </span>
    </div>
  );
};
