import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from './firebase';
import { ensureUserProfile } from './db';
import { useAppStore } from './store';
import Layout from './components/Layout';
import Home from './pages/Home';
import Accounts from './pages/Accounts';
import BillsDebts from './pages/BillsDebts';
import Insights from './pages/Insights';
import Tracker from './pages/Tracker';
import AuthScreen from './components/AuthScreen';
import SetupScreen from './components/SetupScreen';

function App() {
  const [firebaseUser, authLoading] = useAuthState(auth);
  const [profileLoading, setProfileLoading] = useState(true);
  
  const currentHouseholdId = useAppStore(s => s.currentHouseholdId);
  const setCurrentUser = useAppStore(s => s.setCurrentUser);
  const setCurrentHousehold = useAppStore(s => s.setCurrentHousehold);

  useEffect(() => {
    async function loadProfile() {
      if (!firebaseUser) {
        setProfileLoading(false);
        return;
      }
      
      try {
        const userProfile = await ensureUserProfile(firebaseUser);
        setCurrentUser(userProfile.id);
        if (userProfile.householdId) {
          setCurrentHousehold(userProfile.householdId);
        } else {
          setCurrentHousehold('');
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
      } finally {
        setProfileLoading(false);
      }
    }
    
    loadProfile();
  }, [firebaseUser, setCurrentUser, setCurrentHousehold]);

  if (authLoading || (firebaseUser && profileLoading)) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!firebaseUser) {
    return <AuthScreen />;
  }
  
  if (!currentHouseholdId) {
    return <SetupScreen userId={firebaseUser.uid} userName={firebaseUser.displayName || 'User'} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="tracker" element={<Tracker />} />
        <Route path="bills" element={<BillsDebts />} />
        <Route path="insights" element={<Insights />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
