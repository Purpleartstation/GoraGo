import React, { useState } from 'react';
import { usePWAInstall } from '../utils/usePWAInstall';
import { Download, Share, PlusSquare, X } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact', className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running inside standalone app, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop Install Flow
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className={
          variant === 'full'
            ? `w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm shadow-md shadow-violet-500/20 active:scale-[0.98] transition-all ${className}`
            : `flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/10 hover:bg-violet-600/20 text-violet-600 dark:text-violet-400 font-semibold text-xs border border-violet-500/20 active:scale-95 transition-all ${className}`
        }
      >
        <Download size={14} className="stroke-[2.5]" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari Flow
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'full'
              ? `w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 text-violet-600 dark:text-violet-300 font-semibold text-sm border border-violet-500/25 active:scale-[0.98] transition-all ${className}`
              : `flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/10 hover:bg-violet-600/20 text-violet-600 dark:text-violet-400 font-semibold text-xs border border-violet-500/20 active:scale-95 transition-all ${className}`
          }
        >
          <Download size={14} className="stroke-[2.5]" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-violet-600/20 flex items-center justify-center">
                    <Download size={16} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">Install GoraGo on iOS</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Add <strong>GoraGo</strong> to your iPhone / iPad Home Screen for a fullscreen native app experience with offline support:
              </p>

              <div className="space-y-2.5 bg-zinc-50 dark:bg-zinc-800/50 p-3.5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                    <Share size={12} />
                  </div>
                  <div>
                    <span className="font-bold text-zinc-900 dark:text-white">1. Tap Share</span> in Safari bottom bar.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                    <PlusSquare size={12} />
                  </div>
                  <div>
                    <span className="font-bold text-zinc-900 dark:text-white">2. Tap "Add to Home Screen"</span>.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-xs active:scale-[0.99] transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
