import { type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'success' | 'info';
}

export default function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'info',
}: ConfirmModalProps) {
  const icons: Record<string, ReactNode> = {
    danger: <AlertTriangle size={24} className="text-rose-400" />,
    success: <CheckCircle size={24} className="text-emerald-400" />,
    info: <Info size={24} className="text-zinc-400" />,
  };

  const confirmBg: Record<string, string> = {
    danger: 'bg-rose-500 hover:bg-rose-400 text-white',
    success: 'bg-emerald-500 hover:bg-emerald-400 text-white',
    info: 'bg-zinc-100 hover:bg-white text-zinc-950',
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/70 z-[100] backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[101] max-w-sm mx-auto"
          >
            <div className="bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
              {/* Top bar */}
              <div className="flex items-start justify-between p-6 pb-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-2 rounded-xl bg-zinc-800 ring-1 ring-white/5 shrink-0">
                    {icons[variant]}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-zinc-100 leading-tight">{title}</h3>
                    <p className="text-[13px] text-zinc-400 font-medium mt-1.5 leading-relaxed">{message}</p>
                  </div>
                </div>
                <button
                  onClick={onCancel}
                  className="ml-2 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/5 mx-6" />

              {/* Actions */}
              <div className="flex gap-2.5 p-5">
                <button
                  onClick={onCancel}
                  className="flex-1 py-3 rounded-xl bg-zinc-800 border border-white/5 text-zinc-300 font-bold text-sm hover:bg-zinc-700 transition-colors active:scale-[0.98]"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={onConfirm}
                  className={`flex-1 py-3 rounded-xl font-black text-sm transition-colors active:scale-[0.98] shadow-sm ${confirmBg[variant]}`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
