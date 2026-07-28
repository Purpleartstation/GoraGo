import { useState } from 'react';
import {
  signInWithPopup,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Wallet, Copy, Check, AlertCircle, UserCheck, Mail, Lock, User as UserIcon, ArrowRight } from 'lucide-react';

export default function AuthScreen() {
  const [activeTab, setActiveTab] = useState<'email' | 'google'>('email');
  const [isSignUp, setIsSignUp] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'unauthorized-domain' | 'anonymous-disabled' | 'email-disabled' | 'generic' | null>(null);
  const [copied, setCopied] = useState(false);

  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage(null);
    setErrorType(null);

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google login failed:', error);
      const errCode = error?.code || '';
      const errStr = error?.message || String(error);

      if (errCode === 'auth/unauthorized-domain' || errStr.includes('unauthorized-domain')) {
        setErrorType('unauthorized-domain');
        setErrorMessage(`Domain "${currentDomain}" is not added to Authorized Domains in Firebase Console.`);
      } else {
        setErrorType('generic');
        setErrorMessage(error?.message || 'Google Sign-In failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    setErrorMessage(null);
    setErrorType(null);

    try {
      await signInAnonymously(auth);
    } catch (error: any) {
      console.error('Guest login failed:', error);
      const errCode = error?.code || '';
      const errStr = error?.message || String(error);

      if (errCode === 'auth/admin-restricted-operation' || errStr.includes('admin-restricted-operation')) {
        setErrorType('anonymous-disabled');
        setErrorMessage('Anonymous authentication is disabled in Firebase Console.');
      } else {
        setErrorType('generic');
        setErrorMessage(error?.message || 'Guest login failed. Please try again.');
      }
    } finally {
      setGuestLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setErrorMessage(null);
    setErrorType(null);

    try {
      if (isSignUp) {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName.trim()) {
          await updateProfile(userCred.user, { displayName: displayName.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Email auth failed:', error);
      const errCode = error?.code || '';
      const errStr = error?.message || String(error);

      if (errCode === 'auth/operation-not-allowed' || errStr.includes('operation-not-allowed')) {
        setErrorType('email-disabled');
        setErrorMessage('Email/Password provider is disabled in Firebase Console.');
      } else if (errCode === 'auth/user-not-found' || errCode === 'auth/wrong-password' || errCode === 'auth/invalid-credential') {
        setErrorType('generic');
        setErrorMessage('Invalid email or password. If you do not have an account, click "Sign up".');
      } else if (errCode === 'auth/email-already-in-use') {
        setErrorType('generic');
        setErrorMessage('An account with this email already exists. Try signing in instead.');
      } else if (errCode === 'auth/weak-password') {
        setErrorType('generic');
        setErrorMessage('Password should be at least 6 characters.');
      } else {
        setErrorType('generic');
        setErrorMessage(error?.message || 'Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDomain = () => {
    navigator.clipboard.writeText(currentDomain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center p-6 text-center transition-colors duration-300">
      <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-purple-500/25">
        <Wallet className="text-white" size={32} />
      </div>
      <h1 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tight mb-2">GoraGo</h1>
      <p className="text-zinc-600 dark:text-zinc-400 font-medium mb-8 max-w-[280px] text-sm">
        Track your finances, sync with your partner in real-time.
      </p>

      {/* Error & Setup Helper Notice */}
      {errorMessage && (
        <div className="w-full max-w-sm mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 rounded-2xl text-left text-sm text-red-800 dark:text-red-200 space-y-3 shadow-sm">
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400 font-semibold">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>
              {errorType === 'unauthorized-domain' && 'Firebase Authorized Domain Required'}
              {errorType === 'anonymous-disabled' && 'Enable Anonymous Auth in Firebase'}
              {errorType === 'email-disabled' && 'Enable Email/Password in Firebase'}
              {errorType === 'generic' && 'Authentication Error'}
            </span>
          </div>

          <p className="text-xs text-red-700 dark:text-red-300/90 leading-relaxed">
            {errorMessage}
          </p>

          {errorType === 'unauthorized-domain' && (
            <div className="pt-2 border-t border-red-200 dark:border-red-500/20 space-y-2">
              <p className="text-xs text-zinc-700 dark:text-zinc-300">
                To fix Google Sign-In, add this domain to <strong>Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains</strong>:
              </p>
              
              <div className="flex items-center justify-between gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded-xl">
                <code className="text-xs font-mono text-purple-600 dark:text-purple-400 truncate">{currentDomain}</code>
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-medium flex items-center gap-1 shrink-0 transition-colors"
                >
                  {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Auth Container */}
      <div className="w-full max-w-sm space-y-4">
        {/* Toggle Mode Tabs */}
        <div className="grid grid-cols-2 p-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'email'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Email / Password
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('google')}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'google'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            Google Sign-In
          </button>
        </div>

        {/* Email / Password Form */}
        {activeTab === 'email' && (
          <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
            {isSignUp && (
              <div>
                <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-1">Your Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-3.5 text-zinc-400 dark:text-zinc-500" size={18} />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Smith"
                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white pl-10 pr-4 py-3 rounded-2xl focus:outline-none focus:border-purple-500 text-sm shadow-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-1">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 text-zinc-400 dark:text-zinc-500" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white pl-10 pr-4 py-3 rounded-2xl focus:outline-none focus:border-purple-500 text-sm shadow-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 text-zinc-400 dark:text-zinc-500" size={18} />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white pl-10 pr-4 py-3 rounded-2xl focus:outline-none focus:border-purple-500 text-sm shadow-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || guestLoading}
              className="w-full h-12 mt-2 bg-purple-600 hover:bg-purple-500 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-500/25 active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMessage(null);
                  setErrorType(null);
                }}
                className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline transition-colors"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        )}

        {/* Google Sign In */}
        {activeTab === 'google' && (
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || guestLoading}
              className="w-full h-14 px-6 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-3 shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>Sign in with Google</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200 dark:border-zinc-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-zinc-950 px-2 text-zinc-400 font-bold">Or</span>
          </div>
        </div>

        {/* Guest Sign-In */}
        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={loading || guestLoading}
          className="w-full h-12 px-6 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-700 dark:text-zinc-300 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm disabled:opacity-50"
        >
          {guestLoading ? (
            <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <UserCheck size={18} className="text-purple-600 dark:text-purple-400" />
              <span>Continue as Guest</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
