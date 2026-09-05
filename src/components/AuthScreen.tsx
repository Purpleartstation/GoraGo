import { useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
  Wallet,
  Check,
  AlertCircle,
  Mail,
  User as UserIcon,
  ArrowRight,
  ShieldCheck,
  Delete,
  Sparkles,
  ChevronLeft,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  saveLocalSecurityProfile,
  hashPin,
  setSessionUnlocked,
} from '../utils/securityStore';
import { ensureUserProfile, updateUserProfile } from '../db';

interface AuthScreenProps {
  onComplete?: () => void;
  initialStep?: 'onboarding' | 'set_pin';
  prefillUser?: {
    id: string;
    name: string;
    email: string;
    isGoogle?: boolean;
  };
}

export default function AuthScreen({
  onComplete,
  initialStep = 'onboarding',
  prefillUser,
}: AuthScreenProps) {
  // Current screen mode
  const [step, setStep] = useState<'onboarding' | 'set_pin'>(initialStep);
  const [authMethod, setAuthMethod] = useState<'google' | 'manual'>('google');
  const [showExistingLogin, setShowExistingLogin] = useState(false);

  // Manual Registration state
  const [name, setName] = useState(prefillUser?.name || '');
  const [email, setEmail] = useState(prefillUser?.email || '');
  const [password, setPassword] = useState('');

  // PIN creation state
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create');
  const [createdPin, setCreatedPin] = useState('');
  const [confirmedPin, setConfirmedPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isPinSuccess, setIsPinSuccess] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Pending user information
  const [activeUser, setActiveUser] = useState<{
    id: string;
    name: string;
    email: string;
    isGoogle: boolean;
  } | null>(prefillUser || null);

  // Status & error states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Google Sign-In Flow
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userName = user.displayName || user.email?.split('@')[0] || 'Google User';
      const userEmail = user.email || '';

      const pendingProfile = {
        id: user.uid,
        name: userName,
        email: userEmail,
        isGoogle: true,
      };

      setActiveUser(pendingProfile);

      // Create or update remote/local user profile
      try {
        await ensureUserProfile(user);
      } catch (e) {
        console.warn('ensureUserProfile non-fatal:', e);
      }

      // Immediately route to "Set Your 4-Digit Passcode"
      setStep('set_pin');
      setPinStep('create');
      setCreatedPin('');
      setConfirmedPin('');
    } catch (error: any) {
      console.error('Google login failed:', error);
      const errCode = error?.code || '';
      if (errCode === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : '';
        setErrorMessage(`Domain "${domain}" is not in Firebase Authorized Domains.`);
      } else {
        setErrorMessage(error?.message || 'Google Sign-In failed. Try manual registration.');
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Manual Registration Flow
  const handleManualRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setErrorMessage('Please enter your name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      let uid = 'u_manual_' + Date.now().toString(36);

      // Try Firebase anonymous or email/password registration if supported
      try {
        if (password && password.length >= 6) {
          const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          uid = cred.user.uid;
          await updateProfile(cred.user, { displayName: cleanName });
        } else {
          const cred = await signInAnonymously(auth);
          uid = cred.user.uid;
          await updateProfile(cred.user, { displayName: cleanName });
        }
      } catch (authErr) {
        console.warn('Firebase backend notice (proceeding with local security profile):', authErr);
      }

      const pendingProfile = {
        id: uid,
        name: cleanName,
        email: cleanEmail,
        isGoogle: false,
      };

      setActiveUser(pendingProfile);

      // Initialize local user in db
      try {
        await ensureUserProfile({
          uid,
          displayName: cleanName,
          email: cleanEmail,
          photoURL: null,
        });
      } catch (e) {
        // ignore
      }

      // Immediately route to "Set Your 4-Digit Passcode"
      setStep('set_pin');
      setPinStep('create');
      setCreatedPin('');
      setConfirmedPin('');
    } catch (error: any) {
      console.error('Manual registration error:', error);
      setErrorMessage(error?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Existing Email/Password Login
  const handleExistingLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = cred.user;
      setActiveUser({
        id: u.uid,
        name: u.displayName || u.email?.split('@')[0] || 'User',
        email: u.email || '',
        isGoogle: false,
      });

      // Route to PIN setup
      setStep('set_pin');
      setPinStep('create');
      setCreatedPin('');
      setConfirmedPin('');
    } catch (error: any) {
      setErrorMessage('Invalid email or password. You can also use Manual Registration above.');
    } finally {
      setLoading(false);
    }
  };

 // Finalize and save PIN to IndexedDB & settings
const handleFinalizePin = useCallback(async (finalPin: string) => {
  setIsSavingPin(true);
  setIsPinSuccess(true);
  try {
    const pinH = await hashPin(finalPin);
    const userId = activeUser?.id || 'u_local_' + Date.now();
    const userName = activeUser?.name || 'GoraGo User';
    const userEmail = activeUser?.email || '';
    const isGoogle = activeUser?.isGoogle || false;

    // Save PIN hash to Firestore so Device 2 recognizes it on login
    if (auth.currentUser?.uid) {
      try {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          pinHash: pinH,
          hasPin: true,
        });
      } catch (err) {
        console.error('Failed to sync PIN to Firestore:', err);
      }
    }

    // 1. Save to IndexedDB & LocalStorage security engine
    await saveLocalSecurityProfile({
      userId,
      name: userName,
      email: userEmail,
      pinHash: pinH,
      hasPin: true,
      isGoogleBound: isGoogle,
      linkedGoogleEmail: isGoogle ? userEmail : undefined,
      householdId: 'h_sample',
    });

      // 2. Update user profile in local store & firestore
      await updateUserProfile(userId, {
        name: userName,
        email: userEmail,
        pin: finalPin,
        pinHash: pinH,
        hasPin: true,
        isGoogleBound: isGoogle,
      });

      // 3. Mark session as unlocked
      setSessionUnlocked(true);

      // 4. Complete and route
      setTimeout(() => {
        if (onComplete) {
          onComplete();
        } else {
          window.location.reload();
        }
      }, 500);
    } catch (err) {
      console.error('Failed to save security PIN:', err);
      setPinError('Failed to save passcode. Please try again.');
      setIsPinSuccess(false);
      setIsSavingPin(false);
    }
  }, [activeUser, onComplete]);

  // 4. PIN Keypad & Confirmation Logic
  const handlePinDigit = useCallback(
    (digit: string) => {
      if (isPinSuccess || isSavingPin) return;

      if (pinStep === 'create') {
        if (createdPin.length >= 4) return;
        const next = createdPin + digit;
        setCreatedPin(next);
        setPinError(null);

        if (next.length === 4) {
          // Transition to confirmation step
          setTimeout(() => {
            setPinStep('confirm');
          }, 250);
        }
      } else {
        if (confirmedPin.length >= 4) return;
        const next = confirmedPin + digit;
        setConfirmedPin(next);
        setPinError(null);

        if (next.length === 4) {
          // Check if confirmation matches
          if (next === createdPin) {
            handleFinalizePin(next);
          } else {
            setPinError('Passcodes do not match. Please try again.');
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try { navigator.vibrate?.([60, 60, 60]); } catch { /* ignore */ }
            }
            setTimeout(() => {
              setConfirmedPin('');
              setCreatedPin('');
              setPinStep('create');
              setPinError(null);
            }, 900);
          }
        }
      }
    },
    [createdPin, confirmedPin, pinStep, isPinSuccess, isSavingPin, handleFinalizePin]
  );

  const handlePinBackspace = useCallback(() => {
    if (isPinSuccess || isSavingPin) return;
    if (pinStep === 'create') {
      setCreatedPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmedPin((prev) => prev.slice(0, -1));
    }
    setPinError(null);
  }, [pinStep, isPinSuccess, isSavingPin]);

  // Physical keyboard support for PIN entry
  useEffect(() => {
    if (step !== 'set_pin') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handlePinDigit(e.key);
      } else if (e.key === 'Backspace') {
        handlePinBackspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, handlePinDigit, handlePinBackspace]);

  // iOS Keypad layout data
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

  const currentEnteredPin = pinStep === 'create' ? createdPin : confirmedPin;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Step 2 - Set Your 4-Digit Passcode Screen
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === 'set_pin') {
    return (
      <div className="fixed inset-0 z-[100] bg-zinc-950 text-white flex flex-col items-center justify-between px-6 pt-[env(safe-area-inset-top,32px)] pb-[env(safe-area-inset-bottom,28px)] overflow-hidden font-sans select-none">
        {/* Ambient background glow */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-fuchsia-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="w-full max-w-sm flex flex-col items-center pt-6 z-10 text-center">
          {/* Back button if in confirm step */}
          {pinStep === 'confirm' && (
            <button
              type="button"
              onClick={() => {
                setPinStep('create');
                setConfirmedPin('');
                setPinError(null);
              }}
              className="self-start mb-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-all"
            >
              <ChevronLeft size={14} />
              <span>Back</span>
            </button>
          )}

          <div className="relative mb-4 mt-2">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-purple-600 to-fuchsia-500 flex items-center justify-center shadow-xl shadow-purple-500/30 ring-1 ring-white/20">
              <ShieldCheck className="text-white" size={28} />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-zinc-950 flex items-center justify-center">
              <Check className="text-white" size={13} />
            </div>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight">
            {pinStep === 'create' ? 'Set Your 4-Digit Passcode' : 'Confirm Your Passcode'}
          </h2>
          <p className="text-xs text-zinc-400 font-medium mt-1 max-w-[280px]">
            {pinStep === 'create'
              ? 'Create a 4-digit security PIN for instant unlocking on this iPhone.'
              : `Please re-enter the 4 digits to confirm for ${activeUser?.name || 'your profile'}.`}
          </p>

          {/* 4 Animated Passcode Dots */}
          <div className="flex items-center justify-center gap-5 mt-7 mb-2">
            {[0, 1, 2, 3].map((index) => {
              const isFilled = currentEnteredPin.length > index;
              return (
                <motion.div
                  key={index}
                  animate={
                    pinError
                      ? { x: [-12, 12, -8, 8, -4, 4, 0] }
                      : isPinSuccess
                      ? { scale: [1, 1.25, 1] }
                      : {}
                  }
                  transition={{ duration: 0.35 }}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    isPinSuccess
                      ? 'bg-emerald-400 shadow-md shadow-emerald-400/50 scale-110'
                      : pinError
                      ? 'bg-rose-500 shadow-md shadow-rose-500/50'
                      : isFilled
                      ? 'bg-gradient-to-tr from-purple-500 to-fuchsia-500 scale-110 shadow-md shadow-purple-500/50 ring-2 ring-purple-400/40'
                      : 'bg-zinc-800 border border-zinc-700'
                  }`}
                />
              );
            })}
          </div>

          {/* Feedback Label */}
          <div className="h-6 flex items-center justify-center mt-2">
            {pinError ? (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs font-bold text-rose-400 flex items-center gap-1.5"
              >
                <AlertCircle size={13} />
                <span>{pinError}</span>
              </motion.p>
            ) : isPinSuccess ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs font-bold text-emerald-400 flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Passcode verified & saved!</span>
              </motion.p>
            ) : (
              <p className="text-[11px] text-zinc-500 font-medium">
                {pinStep === 'create' ? 'Step 1 of 2: Enter 4 digits' : 'Step 2 of 2: Confirm 4 digits'}
              </p>
            )}
          </div>
        </div>

        {/* iOS Numeric Keypad */}
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
                      whileTap={{ scale: 0.88 }}
                      type="button"
                      onClick={handlePinBackspace}
                      disabled={currentEnteredPin.length === 0 || isPinSuccess || isSavingPin}
                      className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 active:bg-white/10 transition-colors"
                    >
                      <Delete size={26} />
                    </motion.button>
                  );
                }

                return (
                  <motion.button
                    key={item.digit}
                    whileTap={{ scale: 0.9 }}
                    type="button"
                    onClick={() => handlePinDigit(item.digit)}
                    disabled={isPinSuccess || isSavingPin}
                    className="w-[72px] h-[72px] rounded-full bg-zinc-900/90 hover:bg-zinc-850 active:bg-purple-600/30 border border-white/5 active:border-purple-500/50 flex flex-col items-center justify-center shadow-lg transition-all"
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
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Step 1 - Onboarding / Account Creation Screen
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-between p-6 select-none font-sans relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Brand Hero */}
      <div className="w-full max-w-sm flex flex-col items-center pt-8 z-10 text-center">
        <div className="w-16 h-16 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-3xl flex items-center justify-center mb-4 shadow-xl shadow-purple-500/25 ring-1 ring-white/20">
          <Wallet className="text-white" size={30} />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold mb-2">
          <Sparkles size={12} />
          <span>Smart Finance & Real-Time Sync</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">GoraGo</h1>
        <p className="text-zinc-400 text-xs font-medium mt-1 max-w-[280px]">
          Create your profile to start tracking balances, bills, and sync with your partner.
        </p>
      </div>

      {/* Main Options Container */}
      <div className="w-full max-w-sm space-y-4 my-auto py-6 z-10">
        {/* Error message banner */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-left text-xs text-rose-300 font-medium flex items-start gap-2 shadow-sm">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Method Selector Tabs: Google vs Manual */}
        <div className="grid grid-cols-2 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-inner">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('google');
              setShowExistingLogin(false);
              setErrorMessage(null);
            }}
            className={`py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              authMethod === 'google' && !showExistingLogin
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Google Account</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('manual');
              setShowExistingLogin(false);
              setErrorMessage(null);
            }}
            className={`py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
              authMethod === 'manual' && !showExistingLogin
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>Manual Entry</span>
          </button>
        </div>

        {/* OPTION A: Google Sign-In */}
        {authMethod === 'google' && !showExistingLogin && (
          <div className="space-y-4 pt-1">
            <button
              type="button"
              id="google-onboard-btn"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full h-14 px-6 bg-zinc-900 hover:bg-zinc-850 active:bg-zinc-800 border border-zinc-800 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Continue with Google / Gmail</span>
                </>
              )}
            </button>
            <p className="text-[11px] text-zinc-500 text-center font-medium">
              Automatically binds your Google email, avatar, and Calendar sync.
            </p>
          </div>
        )}

        {/* OPTION B: Manual Registration */}
        {authMethod === 'manual' && !showExistingLogin && (
          <form onSubmit={handleManualRegister} className="space-y-3 text-left pt-1">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Your Full Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-3.5 text-zinc-500" size={17} />
                <input
                  type="text"
                  required
                  id="manual-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                  className="w-full bg-zinc-900 border border-zinc-800 text-white pl-10 pr-4 py-3 rounded-2xl focus:outline-none focus:border-purple-500 text-sm shadow-sm placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 text-zinc-500" size={17} />
                <input
                  type="email"
                  required
                  id="manual-email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. juan@example.com"
                  className="w-full bg-zinc-900 border border-zinc-800 text-white pl-10 pr-4 py-3 rounded-2xl focus:outline-none focus:border-purple-500 text-sm shadow-sm placeholder:text-zinc-600"
                />
              </div>
            </div>

            <button
              type="submit"
              id="manual-continue-btn"
              disabled={loading || !name.trim() || !email.trim()}
              className="w-full h-12 mt-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Continue to Set Passcode</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Existing User Login Accordion */}
        {showExistingLogin && (
          <form onSubmit={handleExistingLogin} className="space-y-3 text-left pt-1">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Registered Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full bg-zinc-900 border border-zinc-800 text-white px-4 py-3 rounded-2xl focus:outline-none focus:border-purple-500 text-sm placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-900 border border-zinc-800 text-white px-4 py-3 rounded-2xl focus:outline-none focus:border-purple-500 text-sm placeholder:text-zinc-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Sign In'}
            </button>
          </form>
        )}

        {/* Existing Account Toggle */}
        <div className="text-center pt-3 border-t border-zinc-850">
          <button
            type="button"
            onClick={() => {
              setShowExistingLogin(!showExistingLogin);
              setErrorMessage(null);
            }}
            className="text-xs font-bold text-zinc-400 hover:text-purple-400 transition-colors"
          >
            {showExistingLogin ? '← Return to New Account Registration' : 'Already have an existing password account? Sign In'}
          </button>
        </div>
      </div>

      {/* Footer info */}
      <div className="w-full max-w-sm text-center py-2 z-10">
        <p className="text-[11px] text-zinc-600 font-medium">
          Encrypted & securely stored on device using iOS WebApp standards.
        </p>
      </div>
    </div>
  );
}
