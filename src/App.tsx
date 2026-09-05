import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import {
  ensureUserProfile,
  enableRealtimeSync,
  getSyncSecurityState,
  getLocalSecurityProfile,
  isSessionUnlocked,
  mergeLocalAndRemoteData,
  syncUserProfile,
  joinHousehold,
  db,
} from './db';
import type { SecurityProfile } from './db';
import { useAppStore } from './store';
import Layout from './components/Layout';
import Home from './pages/Home';
import Accounts from './pages/Accounts';
import BillsDebts from './pages/BillsDebts';
import Insights from './pages/Insights';
import Tracker from './pages/Tracker';
import GroceryPlanner from './pages/GroceryPlanner';
import AuthScreen from './components/AuthScreen';
import SetupScreen from './components/SetupScreen';
import PinLockScreen from './components/PinLockScreen';

export default function App() {
  const [firebaseUser, authLoading] = useAuthState(auth);
  const [profileLoading, setProfileLoading] = useState(true);
// Listen for Auth changes & hydrate user profile from Firestore
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profileData = await syncUserProfile(user);
      if (profileData?.householdId) {
        useAppStore.getState().setCurrentHousehold(profileData.householdId);
      }
    }
  });

  return () => unsubscribe();
}, []);
  // Function to join a partner's household via pairing code
  const handleJoinHousehold = async (pairingCode: string) => {
    if (!firebaseUser) return;
    try {
      await joinHousehold(firebaseUser.uid, pairingCode);
      useAppStore.getState().setCurrentHousehold(pairingCode);
      alert('Successfully linked to partner household!');
    } catch (err) {
      console.error('Failed to join household:', err);
      alert('Failed to join household. Please check the code.');
    }
  };
  // Synchronous initial security state from LocalStorage to prevent flicker
  const initialSec = getSyncSecurityState();
  const [hasStoredPin, setHasStoredPin] = useState<boolean>(initialSec.hasPin);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(initialSec.isUnlocked);
  const [savedUserName, setSavedUserName] = useState<string>(initialSec.name || 'GoraGo User');
  const [savedUserEmail, setSavedUserEmail] = useState<string>(initialSec.email || '');
  const [securityProfile, setSecurityProfile] = useState<SecurityProfile | null>(null);

  const currentHouseholdId = useAppStore((s) => s.currentHouseholdId);
  const currentUserId = useAppStore((s) => s.currentUserId);
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const setCurrentHousehold = useAppStore((s) => s.setCurrentHousehold);
  const themeMode = useAppStore((s) => s.themeMode);

  // Apply theme mode
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (themeMode === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    }
  }, [themeMode]);

  // Load profile from IndexedDB on startup
  useEffect(() => {
    let isMounted = true;

    async function checkIndexedDbSecurity() {
      try {
        const prof = await getLocalSecurityProfile();
        if (prof && isMounted) {
          setSecurityProfile(prof);
          if (prof.hasPin && prof.pinHash) {
            setHasStoredPin(true);
          }
          if (prof.name) setSavedUserName(prof.name);
          if (prof.email) setSavedUserEmail(prof.email);
          if (prof.userId && !currentUserId) {
            setCurrentUser(prof.userId);
          }
          if (prof.householdId && !currentHouseholdId) {
            setCurrentHousehold(prof.householdId);
          }
        }
      } catch (err) {
        console.warn('Security profile IndexedDB hydration notice:', err);
      }
    }

    checkIndexedDbSecurity();

    return () => {
      isMounted = false;
    };
  }, [currentUserId, currentHouseholdId, setCurrentUser, setCurrentHousehold]);

  // Listen for immediate app lock event (e.g. from Settings "Lock App")
  useEffect(() => {
    const handleLock = () => {
      setIsUnlocked(false);
    };
    window.addEventListener('gorago_lock_app', handleLock);
    return () => window.removeEventListener('gorago_lock_app', handleLock);
  }, []);

  // Sync Firebase user profile & merge local guest data with cloud data on login
  useEffect(() => {
    async function loadProfile() {
      if (!firebaseUser) {
        setProfileLoading(false);
        return;
      }

      try {
        const userProfile = await ensureUserProfile(firebaseUser);
        setCurrentUser(userProfile.id);
        if (userProfile.name) setSavedUserName(userProfile.name);
        if (userProfile.email) setSavedUserEmail(userProfile.email);
        if (userProfile.hasPin) {
          setHasStoredPin(true);
        }
        if (userProfile.householdId) {
          const localHh = useAppStore.getState().currentHouseholdId || 'h_sample';
          if (localHh !== userProfile.householdId) {
            await mergeLocalAndRemoteData(localHh, userProfile.householdId);
          }
          setCurrentHousehold(userProfile.householdId);
        }
      } catch (err) {
        console.error('Failed to load user profile:', err);
      } finally {
        setProfileLoading(false);
      }
    }

    loadProfile();
  }, [firebaseUser, setCurrentUser, setCurrentHousehold]);

  // Real-time listener on User Profile in Firestore
  useEffect(() => {
    if (!firebaseUser) return;

    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const unsub = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const userProfile = snap.data() as any;
        setCurrentUser(userProfile.id);
        if (userProfile.name) setSavedUserName(userProfile.name);
        if (userProfile.email) setSavedUserEmail(userProfile.email);
        if (userProfile.hasPin) {
          setHasStoredPin(true);
        }
        if (userProfile.householdId) {
          setCurrentHousehold(userProfile.householdId);
        }
      }
    }, (err) => {
      console.warn("Real-time user profile sync error:", err);
    });

    return () => unsub();
  }, [firebaseUser, setCurrentUser, setCurrentHousehold]);

  // Enable real-time sync when household is active
  useEffect(() => {
    if (currentHouseholdId) {
      enableRealtimeSync(currentHouseholdId);
    }
  }, [currentHouseholdId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Returning User with Stored Security PIN: WebApp / PWA Keypad Lock Guard
  // ─────────────────────────────────────────────────────────────────────────────
  if (hasStoredPin && !isUnlocked) {
    return (
      <PinLockScreen
        userName={savedUserName}
        userEmail={savedUserEmail}
        isGoogleBound={securityProfile?.isGoogleBound}
        onUnlock={() => {
          setIsUnlocked(true);
        }}
        onSwitchAccount={() => {
          setHasStoredPin(false);
          setIsUnlocked(false);
          setSecurityProfile(null);
        }}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Loading State (Only if authenticating with Firebase and not already unlocked)
  // ─────────────────────────────────────────────────────────────────────────────
  if (authLoading || (firebaseUser && profileLoading && !isUnlocked)) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Initial Launch & Onboarding (First-time user or no PIN configured yet)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!firebaseUser && !hasStoredPin) {
    return (
      <AuthScreen
        onComplete={() => {
          setHasStoredPin(true);
          setIsUnlocked(true);
        }}
      />
    );
  }

  // If user signed into Firebase but hasn't set their 4-digit passcode yet
  if (firebaseUser && !hasStoredPin) {
    return (
      <AuthScreen
        initialStep="set_pin"
        prefillUser={{
          id: firebaseUser.uid,
          name: firebaseUser.displayName || 'GoraGo User',
          email: firebaseUser.email || '',
          isGoogle:
            firebaseUser.email?.toLowerCase().endsWith('@gmail.com') ||
            firebaseUser.providerData?.some((p) => p?.providerId === 'google.com'),
        }}
        onComplete={() => {
          setHasStoredPin(true);
          setIsUnlocked(true);
        }}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Household Setup (if unlocked but no household created or joined)
  // ─────────────────────────────────────────────────────────────────────────────
  const activeUserId = firebaseUser?.uid || securityProfile?.userId || currentUserId || 'u_default';
  const activeUserName = firebaseUser?.displayName || securityProfile?.name || savedUserName || 'User';

  if (!currentHouseholdId) {
    return <SetupScreen userId={activeUserId} userName={activeUserName} />;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Main Application Routes
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="tracker" element={<Tracker />} />
        <Route path="bills" element={<BillsDebts />} />
        <Route path="groceries" element={<GroceryPlanner />} />
        <Route path="insights" element={<Insights />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
