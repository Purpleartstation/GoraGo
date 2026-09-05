import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Delete, ShieldCheck, AlertCircle, RefreshCw, KeyRound, Mail, ArrowRight, X } from 'lucide-react';
import { verifySecurityPin, setSessionUnlocked, updateLocalSecurityPin, clearLocalSecurityProfile } from '../utils/securityStore';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useBodyScrollLock } from '../utils/scrollLock';

interface PinLockScreenProps {
  userName?: string;
  userEmail?: string;
  isGoogleBound?: boolean;
  onUnlock: () => void;
  onSwitchAccount?: () => void;
}

export default function PinLockScreen({
  userName = 'GoraGo User',
  userEmail,
  isGoogleBound,
  onUnlock,
  onSwitchAccount,
}: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Forgot PIN / Recovery Modal
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<'options' | 'google_verify' | 'set_new_pin' | 'email_verify'>('options');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newPinStep, setNewPinStep] = useState<'create' | 'confirm'>('create');
  const [isResetting, setIsResetting] = useState(false);

  // Lock body scrolling when recovery modal is open
  useBodyScrollLock(showRecoveryModal);

  const handleVerify = useCallback(async (candidatePin: string) => {
    setIsVerifying(true);
    setHasError(false);
    setErrorMessage(null);

    try {
      // 1. Try local verification
      let isValid = await verifySecurityPin(candidatePin);

      // 2. Fallback: If local check fails, check Firestore user profile on Device 2
      if (!isValid && auth.currentUser?.uid) {
        const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userSnap.exists() && userSnap.data()?.pinHash === candidatePin) {
          isValid = true;
        }
      }

      if (isValid) {
        setIsSuccess(true);
        setSessionUnlocked(true);
        setTimeout(() => {
          onUnlock();
        }, 300);
      } else {
        setHasError(true);
        setErrorMessage('Incorrect passcode. Please try again.');
        setTimeout(() => {
          setPin('');
          setHasError(false);
          setIsVerifying(false);
        }, 700);
      }
    } catch (err) {
      console.error('PIN verification error:', err);
      setHasError(true);
      setErrorMessage('Verification failed.');
      setIsVerifying(false);
    }
  }, [onUnlock]);

  // Digit press handler
  const handleDigit = useCallback((digit: string) => {
    if (isVerifying || isSuccess) return;
    if (pin.length >= 4) return;

    const next = pin + digit;
    setPin(next);

    if (next.length === 4) {
      handleVerify(next);
    }
  }, [pin, isVerifying, isSuccess, handleVerify]);

  // Backspace handler
  const handleBackspace = useCallback(() => {
    if (isVerifying || isSuccess) return;
    setPin((prev) => prev.slice(0, -1));
    setHasError(false);
    setErrorMessage(null);
  }, [isVerifying, isSuccess]);

  // Listen for physical keyboard input (useful on iPad or desktop preview)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showRecoveryModal) return;
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, showRecoveryModal]);

  // Recovery: Re-authenticate with Google
  const handleGoogleRecovery = async () => {
    setIsResetting(true);
    setRecoveryError(null);
    try {
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        setRecoveryStep('set_new_pin');
        setNewPin('');
        setConfirmPin('');
        setNewPinStep('create');
      }
    } catch (err: any) {
      console.error('Google recovery error:', err);
      setRecoveryError(err?.message || 'Google authorization failed. Try again.');
    } finally {
      setIsResetting(false);
    }
  };

  // Recovery: Save new PIN
  const handleSaveNewPin = async () => {
    if (newPin.length !== 4) {
      setRecoveryError('Passcode must be 4 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setRecoveryError('Passcodes do not match. Please re-enter.');
      setConfirmPin('');
      setNewPinStep('create');
      return;
    }

    setIsResetting(true);
    setRecoveryError(null);
    try {
      await updateLocalSecurityPin(newPin);
      setIsSuccess(true);
      setShowRecoveryModal(false);
      setTimeout(() => {
        onUnlock();
      }, 400);
    } catch (err: any) {
      setRecoveryError('Failed to save new PIN.');
    } finally {
      setIsResetting(false);
    }
  };

  // Recovery: Switch Account / Sign out completely
  const handleFullSignOut = async () => {
    try {
      await clearLocalSecurityProfile();
      await signOut(auth);
    } catch (e) {
      console.warn('Signout warning:', e);
    }
    if (onSwitchAccount) {
      onSwitchAccount();
    } else {
      window.location.reload();
    }
  };

  // iOS Keypad layout data (3x4 grid)
  const keypadRows = [
    [
      { digit: '1', letters: '' },
      { digit: '2', letters: 'A B C' },
      { digit: '3', letters: 'D E F' },
    ],
    [
      { digit: '4', letters: 'G H I' },
      { digit: '5', letters: 'J K L' },
      { digit: '6', letters: 'M N O' },
    ],
    [
      { digit: '7', letters: 'P Q R S' },
      { digit: '8', letters: 'T U V' },
      { digit: '9', letters: 'W X Y Z' },
    ],
    [
      { digit: 'empty', letters: '' },
      { digit: '0', letters: '+' },
      { digit: 'backspace', letters: '' },
    ],
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col items-center justify-between select-none px-6 pt-[env(safe-area-inset-top,32px)] pb-[env(safe-area-inset-bottom,28px)] overflow-hidden font-sans">
      {/* Background Ambient Glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-fuchsia-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header & Personalized Greeting */}
      <div className="w-full max-w-sm flex flex-col items-center pt-8 z-10">
        {/* App Crest */}
        <div className="relative mb-5">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-purple-500/30 ring-1 ring-white/20">
            <Lock className="text-white" size={26} />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-zinc-950 flex items-center justify-center">
            <ShieldCheck className="text-white" size={13} />
          </div>
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white mb-1">
          {userName}
        </h1>
        <p className="text-xs text-zinc-400 font-medium">
          {userEmail ? userEmail : 'Enter your 4-digit Passcode'}
        </p>

        {/* 4 Animated Passcode Dots */}
        <div className="flex items-center justify-center gap-5 mt-8 mb-2">
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index;
            return (
              <motion.div
                key={index}
                animate={
                  hasError
                    ? { x: [-12, 12, -8, 8, -4, 4, 0] }
                    : isSuccess
                    ? { scale: [1, 1.25, 1] }
                    : {}
                }
                transition={{ duration: 0.35 }}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isSuccess
                    ? 'bg-emerald-400 shadow-md shadow-emerald-400/50 scale-110'
                    : hasError
                    ? 'bg-rose-500 shadow-md shadow-rose-500/50'
                    : isFilled
                    ? 'bg-gradient-to-tr from-purple-500 to-fuchsia-500 scale-110 shadow-md shadow-purple-500/50 ring-2 ring-purple-400/40'
                    : 'bg-zinc-800 border border-zinc-700'
                }`}
              />
            );
          })}
        </div>

        {/* Error Feedback */}
        <div className="h-6 flex items-center justify-center mt-2">
          {errorMessage ? (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-bold text-rose-400 flex items-center gap-1.5"
            >
              <AlertCircle size={13} />
              <span>{errorMessage}</span>
            </motion.p>
          ) : (
            <p className="text-[11px] text-zinc-500 font-medium tracking-wide">
              Protected with local biometric and passcode security
            </p>
          )}
        </div>
      </div>

      {/* iOS-Style Numeric Keypad */}
      <div className="w-full max-w-[320px] pb-4 z-10">
        <div className="grid grid-cols-3 gap-y-4 gap-x-6 justify-items-center">
          {keypadRows.map((row, rIdx) =>
            row.map((item, cIdx) => {
              if (item.digit === 'empty') {
                return <div key={`empty-${rIdx}-${cIdx}`} className="w-[72px] h-[72px]" />;
              }

              if (item.digit === 'backspace') {
                return (
                  <motion.button
                    key="backspace"
                    id="keypad-backspace-btn"
                    whileTap={{ scale: 0.88 }}
                    type="button"
                    onClick={handleBackspace}
                    disabled={pin.length === 0 || isVerifying || isSuccess}
                    className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 active:bg-white/10 transition-colors touch-manipulation will-change-transform cursor-pointer"
                  >
                    <Delete size={26} />
                  </motion.button>
                );
              }

              return (
                <motion.button
                  key={item.digit}
                  id={`keypad-digit-${item.digit}`}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => handleDigit(item.digit)}
                  disabled={isVerifying || isSuccess}
                  className="w-[72px] h-[72px] rounded-full bg-zinc-900/90 hover:bg-zinc-850 active:bg-purple-600/30 border border-white/5 active:border-purple-500/50 flex flex-col items-center justify-center shadow-lg transition-all touch-manipulation will-change-transform cursor-pointer select-none"
                >
                  <span className="text-2xl font-semibold leading-none tracking-tight text-white">
                    {item.digit}
                  </span>
                  {item.letters && (
                    <span className="text-[9px] font-bold tracking-widest text-zinc-400 mt-1 uppercase">
                      {item.letters}
                    </span>
                  )}
                </motion.button>
              );
            })
          )}
        </div>

        {/* Forgot PIN Action Link */}
        <div className="flex items-center justify-center pt-6">
          <button
            type="button"
            id="forgot-pin-btn"
            onClick={() => {
              setShowRecoveryModal(true);
              setRecoveryStep('options');
              setRecoveryError(null);
            }}
            className="text-xs font-bold text-purple-400 hover:text-purple-300 py-2 px-4 rounded-xl hover:bg-white/5 transition-all touch-manipulation will-change-transform cursor-pointer active:scale-95"
          >
            Forgot PIN?
          </button>
        </div>
      </div>

      {/* ─── Forgot PIN / Account Recovery Modal ───────────────────────────────── */}
      <AnimatePresence>
        {showRecoveryModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setShowRecoveryModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md transform-gpu [backface-visibility:hidden] will-change-[opacity]"
            />

            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl z-10 text-left transform-gpu [backface-visibility:hidden] will-change-transform touch-manipulation"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                className="absolute top-5 right-5 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>

              {recoveryStep === 'options' && (
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <KeyRound size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Reset Security Passcode</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Verify your identity to set a new 4-digit passcode for {userName}.
                    </p>
                  </div>

                  {recoveryError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium">
                      {recoveryError}
                    </div>
                  )}

                  <div className="space-y-2.5 pt-2">
                    {/* Re-authenticate with Google */}
                    <button
                      type="button"
                      id="recovery-google-btn"
                      onClick={handleGoogleRecovery}
                      disabled={isResetting}
                      className="w-full p-3.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-2xl flex items-center gap-3 text-white font-bold text-xs shadow-sm transition-all"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      <div className="text-left flex-1">
                        <p className="font-bold">Verify via Google Sign-In</p>
                        <p className="text-[10px] text-zinc-400 font-normal">Fastest 1-tap recovery using your Google account</p>
                      </div>
                    </button>

                    {/* Email verification flow option */}
                    <button
                      type="button"
                      id="recovery-email-btn"
                      onClick={() => setRecoveryStep('set_new_pin')}
                      className="w-full p-3.5 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 rounded-2xl flex items-center gap-3 text-white font-bold text-xs shadow-sm transition-all"
                    >
                      <Mail size={18} className="text-purple-400" />
                      <div className="text-left flex-1">
                        <p className="font-bold">Reset Passcode Directly</p>
                        <p className="text-[10px] text-zinc-400 font-normal">Set a new passcode for this device</p>
                      </div>
                    </button>

                    {/* Switch Account */}
                    <button
                      type="button"
                      id="recovery-signout-btn"
                      onClick={handleFullSignOut}
                      className="w-full py-3 text-center text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors mt-2"
                    >
                      Sign In with a Different Account
                    </button>
                  </div>
                </div>
              )}

              {/* Set New PIN Step */}
              {recoveryStep === 'set_new_pin' && (
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      {newPinStep === 'create' ? 'Create New 4-Digit Passcode' : 'Confirm New Passcode'}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {newPinStep === 'create'
                        ? 'Enter a memorable 4-digit number.'
                        : 'Re-enter the 4 digits to confirm.'}
                    </p>
                  </div>

                  {recoveryError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium">
                      {recoveryError}
                    </div>
                  )}

                  <div className="py-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      autoFocus
                      value={newPinStep === 'create' ? newPin : confirmPin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        if (newPinStep === 'create') {
                          setNewPin(val);
                          if (val.length === 4) {
                            setTimeout(() => {
                              setNewPinStep('confirm');
                            }, 200);
                          }
                        } else {
                          setConfirmPin(val);
                        }
                      }}
                      placeholder="••••"
                      className="w-full text-center tracking-[1em] text-3xl font-black bg-zinc-950 border border-zinc-700 rounded-2xl py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewPinStep('create');
                        setNewPin('');
                        setConfirmPin('');
                        setRecoveryStep('options');
                      }}
                      className="flex-1 py-3 bg-zinc-800 text-zinc-300 font-bold text-xs rounded-xl hover:bg-zinc-700 transition-colors"
                    >
                      Back
                    </button>
                    {newPinStep === 'confirm' && (
                      <button
                        type="button"
                        id="save-new-pin-btn"
                        onClick={handleSaveNewPin}
                        disabled={confirmPin.length !== 4 || isResetting}
                        className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                      >
                        {isResetting ? 'Saving...' : 'Set Passcode'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
