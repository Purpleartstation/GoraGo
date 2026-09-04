import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '../utils/scrollLock';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  // Lock background scrolling on iOS Safari & Standalone PWA when open
  useBodyScrollLock(isOpen);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with GPU Acceleration */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-[70] backdrop-blur-sm transform-gpu [backface-visibility:hidden] will-change-[opacity]"
          />
          
          {/* Outer flex container for responsive positioning (bottom on mobile, centered on sm+) */}
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
            {/* Native Spring & GPU Accelerated Bottom Sheet */}
            <motion.div
              initial={{ y: '100%', opacity: 0.5, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '100%', opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="pointer-events-auto w-full max-w-lg bg-[#F0F4F8] dark:bg-[#2D3748] text-zinc-900 dark:text-zinc-100 rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl border border-white/80 dark:border-white/10 shadow-[inset_0_2px_4px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_1px_2px_rgba(255,255,255,0.08)] max-h-[90dvh] sm:max-h-[840px] flex flex-col transition-colors duration-300 transform-gpu [backface-visibility:hidden] will-change-transform touch-manipulation"
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0.04, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 450) {
                  onClose();
                }
              }}
            >
              {/* Drag Handle (Mobile only) */}
              <div 
                className="w-full flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing shrink-0 sm:hidden touch-none select-none"
                aria-label="Drag down to close"
              >
                <div className="w-12 h-1.5 bg-zinc-300/90 dark:bg-zinc-600/90 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/10 shrink-0">
                <h2 className="text-xl font-black tracking-tight select-none">{title}</h2>
                <button 
                  type="button"
                  onClick={onClose}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-90 transition-transform duration-100 shrink-0 cursor-pointer shadow-sm border border-black/5 dark:border-white/5 touch-manipulation will-change-transform"
                  aria-label="Close sheet"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Content with Native iOS Momentum Scrolling */}
              <div className="p-5 sm:p-6 overflow-y-auto no-scrollbar pb-[calc(40px+env(safe-area-inset-bottom,20px))] flex-1 -webkit-overflow-scrolling-touch overscroll-y-contain">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
