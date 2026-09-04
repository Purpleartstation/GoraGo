import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { useBodyScrollLock } from '../utils/scrollLock';
import { triggerHaptic } from '../utils/haptics';
import { playSound } from '../utils/soundFX';

interface SecurityPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  expectedPin?: string;
  title?: string;
  subtitle?: string;
  onSuccess: () => void;
}

export default function SecurityPinModal({
  isOpen,
  onClose,
  expectedPin,
  title = "Authorize Safety Net Action",
  subtitle = "Enter your 4-digit PIN to authorize this Emergency Fund transaction.",
  onSuccess
}: SecurityPinModalProps) {
  const [pin, setPin] = useState('');
  const [hasError, setHasError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setHasError(false);
      setIsSuccess(false);
    }
  }, [isOpen]);

  const verifyPin = useCallback((currentPin: string) => {
    // If user has set an EF PIN or standard PIN, check against it
    if (expectedPin) {
      if (currentPin === expectedPin) {
        setIsSuccess(true);
        triggerHaptic('success');
        playSound('success');
        setTimeout(() => {
          onSuccess();
        }, 400);
      } else {
        setHasError(true);
        triggerHaptic('warning');
        playSound('error');
        setTimeout(() => {
          setPin('');
          setHasError(false);
        }, 800);
      }
    } else {
      // If user hasn't set up an emergencyFundPin yet, accept the 4 digits as valid verification
      setIsSuccess(true);
      triggerHaptic('success');
      playSound('success');
      setTimeout(() => {
        onSuccess();
      }, 400);
    }
  }, [expectedPin, onSuccess]);

  const handleDigit = useCallback((digit: string) => {
    if (pin.length >= 4 || isSuccess) return;
    triggerHaptic('light');
    playSound('pop');
    const nextPin = pin + digit;
    setPin(nextPin);
    if (nextPin.length === 4) {
      verifyPin(nextPin);
    }
  }, [pin, isSuccess, verifyPin]);

  const handleBackspace = useCallback(() => {
    if (isSuccess) return;
    triggerHaptic('light');
    playSound('pop');
    setPin(prev => prev.slice(0, -1));
    setHasError(false);
  }, [isSuccess]);

  // Support physical keyboard entry
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleDigit, handleBackspace, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md transform-gpu [backface-visibility:hidden] will-change-[opacity]"
          />

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="relative w-full max-w-sm bg-[#F0F4F8] dark:bg-[#1E293B] text-zinc-900 dark:text-zinc-100 rounded-[2.5rem] p-6 shadow-2xl border border-white/80 dark:border-white/10 flex flex-col items-center z-10 transform-gpu [backface-visibility:hidden] will-change-transform touch-manipulation select-none"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-transform active:scale-90 touch-manipulation will-change-transform cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Icon */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
              isSuccess 
                ? 'bg-emerald-500 text-white' 
                : hasError 
                ? 'bg-rose-500 text-white' 
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            }`}>
              {isSuccess ? <CheckCircle2 size={28} /> : hasError ? <ShieldAlert size={28} /> : <Lock size={26} />}
            </div>

            <h3 className="text-lg font-black tracking-tight text-center">{title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center mt-1 mb-5 max-w-[260px]">
              {subtitle}
            </p>

            {/* PIN Indicator Dots */}
            <motion.div
              animate={hasError ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="flex justify-center gap-4 mb-6"
            >
              {[0, 1, 2, 3].map((index) => {
                const filled = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full transition-all duration-150 ${
                      filled
                        ? hasError
                          ? 'bg-rose-500 scale-110 shadow-sm'
                          : isSuccess
                          ? 'bg-emerald-500 scale-110 shadow-sm'
                          : 'bg-amber-500 scale-110 shadow-sm'
                        : 'border-2 border-zinc-300 dark:border-zinc-600 bg-transparent'
                    }`}
                  />
                );
              })}
            </motion.div>

            {/* Error Message */}
            {hasError && (
              <p className="text-xs font-bold text-rose-500 mb-4 animate-bounce">
                Incorrect PIN. Please try again.
              </p>
            )}

            {!expectedPin && (
              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mb-3 text-center bg-amber-500/10 px-3 py-1.5 rounded-xl">
                No Safety Net PIN set in settings. Enter any 4-digit code to authorize.
              </p>
            )}

            {/* Number Keypad */}
            <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px] mb-2 select-none">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigit(num)}
                  className="h-13 rounded-2xl bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 active:scale-90 active:bg-zinc-200 dark:active:bg-zinc-700 font-black text-xl text-zinc-900 dark:text-zinc-100 shadow-sm border border-black/5 dark:border-white/5 transition-transform duration-75 touch-manipulation will-change-transform cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handleDigit('0')}
                className="h-13 rounded-2xl bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 active:scale-90 active:bg-zinc-200 dark:active:bg-zinc-700 font-black text-xl text-zinc-900 dark:text-zinc-100 shadow-sm border border-black/5 dark:border-white/5 transition-transform duration-75 touch-manipulation will-change-transform cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Backspace"
                className="h-13 rounded-2xl bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 active:scale-90 active:bg-zinc-200 dark:active:bg-zinc-700 font-bold text-base text-zinc-600 dark:text-zinc-400 shadow-sm border border-black/5 dark:border-white/5 transition-transform duration-75 flex items-center justify-center touch-manipulation will-change-transform cursor-pointer"
              >
                ⌫
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
