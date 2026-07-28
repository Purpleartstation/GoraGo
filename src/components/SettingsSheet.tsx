import { useState, useEffect } from 'react';
import { useDocumentData, useCollectionData } from 'react-firebase-hooks/firestore';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { db, collections, wipeHouseholdData } from '../db';
import type { User, Household } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import { User as UserIcon, Users, RefreshCw, CheckCircle2, UserPlus, AlertCircle, Trash2, Sun, Moon } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const currentUserId = useAppStore((state) => state.currentUserId);
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);

  // Fetch current user and household
  const [user] = useDocumentData<User>(
    currentUserId ? doc(collections.users, currentUserId) : null
  );
  const [household] = useDocumentData<Household>(
    currentHouseholdId ? doc(collections.households, currentHouseholdId) : null
  );
  const [allUsers] = useCollectionData<User>(collections.users);

  // Input states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');

  // Reset verification states
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPinInput, setResetPinInput] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Info messages
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [partnerStatus, setPartnerStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Populate fields
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPassword(user.password || '••••••••');
      setPin(user.pin || '');
    }
  }, [user]);

  // Ensure default data exists if user updates but some fields are missing
  useEffect(() => {
    const ensureUserData = async () => {
      if (user && (!user.email || !user.password || !user.pin)) {
        await updateDoc(doc(db, 'users', currentUserId), {
          email: user.email || 'juan@example.com',
          password: user.password || 'password123',
          pin: user.pin || '1234',
          hasPin: true
        });
      }
      // Also ensure Maria exists in db
      const mariaRef = doc(db, 'users', 'u2');
      const mariaSnap = await getDoc(mariaRef);
      if (!mariaSnap.exists()) {
        await setDoc(mariaRef, {
          id: 'u2',
          name: 'Maria Dela Cruz',
          email: 'maria@example.com',
          password: 'password123',
          hasPin: true,
          pin: '5678'
        });
      }
    };
    if (isOpen && user) {
      ensureUserData();
    }
  }, [isOpen, user, currentUserId]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await updateDoc(doc(db, 'users', currentUserId), {
        name,
        email,
        password: password === '••••••••' ? user?.password : password,
        pin,
        hasPin: pin.length > 0
      });
      setSaveStatus('Profile updated successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setSaveStatus('Error saving profile.');
    }
  };

  const handleConnectPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerEmail.trim() || !household) return;

    // Find user by email in the DB
    const foundUser = allUsers?.find(
      u => u.email?.toLowerCase() === partnerEmail.trim().toLowerCase()
    );

    if (!foundUser) {
      setPartnerStatus({
        type: 'error',
        text: 'User with this email not found. Try "maria@example.com"!'
      });
      return;
    }

    if (household.memberIds.includes(foundUser.id)) {
      setPartnerStatus({
        type: 'error',
        text: 'This user is already connected to your household.'
      });
      return;
    }

    // Update household members
    const updatedMembers = [...household.memberIds, foundUser.id];
    await updateDoc(doc(db, 'households', household.id), {
      memberIds: updatedMembers,
      type: 'partner'
    });

    setPartnerStatus({
      type: 'success',
      text: `${foundUser.name} has been connected to your household!`
    });
    setPartnerEmail('');
    setTimeout(() => setPartnerStatus(null), 4000);
  };

  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = user?.pin || '1234';
    if (resetPinInput.trim() !== correctPin) {
      setResetError('Incorrect security PIN. Please try again.');
      return;
    }
    if (!currentHouseholdId) {
      setResetError('No household ID found.');
      return;
    }

    try {
      setIsResetting(true);
      setResetError(null);
      await wipeHouseholdData(currentHouseholdId);
      setShowResetModal(false);
      setResetPinInput('');
      setIsResetting(false);
      alert('Household data wiped successfully.');
    } catch (err) {
      console.error('Failed to wipe data:', err);
      setResetError('Failed to reset data. Please try again.');
      setIsResetting(false);
    }
  };

  const handleDisconnectMember = async (memberId: string) => {
    if (!household || memberId === currentUserId) return;
    const confirmDisc = window.confirm('Are you sure you want to disconnect this partner?');
    if (!confirmDisc) return;

    const updatedMembers = household.memberIds.filter(id => id !== memberId);
    await updateDoc(doc(db, 'households', household.id), {
      memberIds: updatedMembers,
      type: updatedMembers.length > 1 ? 'partner' : 'solo'
    });
  };

  // Find partner detail
  const householdMembers = allUsers?.filter(u => household?.memberIds.includes(u.id)) || [];

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Account & Settings">
      <div className="space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar pb-6">
        
        {/* Appearance & Color Theme Switcher */}
        <div className="bg-black/5 dark:bg-zinc-900/60 border border-black/10 dark:border-white/5 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sun size={15} className="text-purple-600 dark:text-fuchsia-400" />
            <h4 className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">Appearance & Theme</h4>
          </div>
          <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-normal">
            Toggle between Light Mode and Dark Mode to experience the vibrant Purple & Magenta theme adaptation.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={() => setThemeMode('light')}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                themeMode === 'light'
                  ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-md'
                  : 'bg-black/5 dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Sun size={14} />
              <span>Light Mode</span>
            </button>
            <button
              onClick={() => setThemeMode('dark')}
              className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                themeMode === 'dark'
                  ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-md'
                  : 'bg-black/5 dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Moon size={14} />
              <span>Dark Mode</span>
            </button>
          </div>
        </div>

        {/* Simulation Switcher (Husband / Wife Demo Toggle) */}
        <div className="bg-black/5 dark:bg-zinc-900/60 border border-black/10 dark:border-white/5 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw size={15} className="text-purple-600 dark:text-fuchsia-400 animate-pulse" />
            <h4 className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">Simulate Partner (Demo Mode)</h4>
          </div>
          <p className="text-[12px] text-zinc-600 dark:text-zinc-400 leading-normal">
            Switch between Juan (Husband) and Maria (Wife) to see how updates instantly reflect on both devices!
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={() => setCurrentUser('u1')}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                currentUserId === 'u1'
                  ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-black shadow-md'
                  : 'bg-black/5 dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Juan (Husband)
            </button>
            <button
              onClick={() => setCurrentUser('u2')}
              className={`py-2 rounded-xl text-xs font-bold transition-all ${
                currentUserId === 'u2'
                  ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-black shadow-md'
                  : 'bg-black/5 dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Maria (Wife)
            </button>
          </div>
        </div>

        {/* Profile Settings Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex items-center gap-2 pl-1">
            <UserIcon size={15} className="text-zinc-500 dark:text-zinc-400" />
            <h4 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">My Profile</h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1 block mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-black/5 dark:bg-zinc-900/50 border border-black/10 dark:border-white/5 rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Name"
                required
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1 block mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-black/5 dark:bg-zinc-900/50 border border-black/10 dark:border-white/5 rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="email@example.com"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1 block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-black/5 dark:bg-zinc-900/50 border border-black/10 dark:border-white/5 rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Password"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1 block mb-1">Security PIN</label>
                <input
                  type="text"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-black/5 dark:bg-zinc-900/50 border border-black/10 dark:border-white/5 rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-bold text-sm text-center focus:outline-none focus:ring-2 focus:ring-purple-500 tracking-widest"
                  placeholder="PIN"
                />
              </div>
            </div>
          </div>

          {saveStatus && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={14} />
              {saveStatus}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-black text-sm rounded-xl transition-all shadow-md active:scale-[0.98]"
          >
            Update Profile Information
          </button>
        </form>

        {/* Live Partner Sharing Settings */}
        <div className="space-y-4 pt-4 border-t border-black/10 dark:border-white/5">
          <div className="flex items-center gap-2 pl-1">
            <Users size={15} className="text-zinc-500 dark:text-zinc-400" />
            <h4 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">Connected Partners</h4>
          </div>

          <div className="space-y-3">
            {/* List of current members */}
            <div className="space-y-2">
              {householdMembers.map(member => (
                <div key={member.id} className="flex justify-between items-center p-3 bg-black/5 dark:bg-zinc-900/40 rounded-xl border border-black/10 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-600 dark:text-fuchsia-300 flex items-center justify-center font-bold text-xs ring-1 ring-purple-500/30">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-200">
                        {member.name} {member.id === currentUserId && <span className="text-[10px] text-zinc-500 font-medium">(You)</span>}
                      </p>
                      <p className="text-[10px] text-zinc-500 font-medium">{member.email}</p>
                    </div>
                  </div>
                  {member.id !== currentUserId && (
                    <button
                      onClick={() => handleDisconnectMember(member.id)}
                      className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 transition-all"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Invite Partner Form */}
            <form onSubmit={handleConnectPartner} className="space-y-2 mt-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  value={partnerEmail}
                  onChange={e => setPartnerEmail(e.target.value)}
                  placeholder="Enter partner's email (e.g. maria@example.com)"
                  className="flex-1 bg-black/5 dark:bg-zinc-900/50 border border-black/10 dark:border-white/5 rounded-xl px-4 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="submit"
                  disabled={!partnerEmail.trim()}
                  className="px-4 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white disabled:opacity-30 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md"
                >
                  <UserPlus size={14} />
                  Connect
                </button>
              </div>

              {partnerStatus && (
                <div className={`p-3 border rounded-xl flex items-center gap-2 text-xs font-bold ${
                  partnerStatus.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                }`}>
                  {partnerStatus.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {partnerStatus.text}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-4 pt-4 border-t border-rose-500/10 mt-6">
          <div className="flex items-center gap-2 pl-1">
            <AlertCircle size={15} className="text-rose-500" />
            <h4 className="text-[11px] font-black text-rose-500 uppercase tracking-widest">Danger Zone</h4>
          </div>

          <div className="space-y-3">
            {!showResetModal ? (
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(true);
                  setResetPinInput('');
                  setResetError(null);
                }}
                className="w-full flex items-center justify-between p-4 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 rounded-2xl transition-all group"
              >
                <div className="text-left">
                  <p className="text-sm font-bold text-rose-500 mb-0.5">Reset Household Data</p>
                  <p className="text-[10px] font-medium text-rose-500/70">Wipe all transactions, bills, and accounts</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center group-hover:bg-rose-500/20 transition-colors">
                  <Trash2 size={16} className="text-rose-500" />
                </div>
              </button>
            ) : (
              <form onSubmit={handleExecuteReset} className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">Confirm Security PIN</p>
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-300">
                  Enter your 4-digit security PIN to permanently erase all household data.
                </p>
                <input
                  type="password"
                  maxLength={4}
                  value={resetPinInput}
                  onChange={e => setResetPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter PIN (e.g. 1234)"
                  className="w-full bg-white dark:bg-zinc-900 border border-rose-500/30 rounded-xl px-4 py-2.5 text-center text-zinc-900 dark:text-zinc-100 font-bold text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-500"
                  autoFocus
                  required
                />
                {resetError && (
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{resetError}</p>
                )}
                <button
                  type="submit"
                  disabled={isResetting || resetPinInput.length < 4}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                  {isResetting ? 'Wiping Data...' : 'Confirm & Wipe All Data'}
                </button>
              </form>
            )}

            <button
              onClick={() => signOut(auth)}
              className="w-full py-3.5 bg-black/5 dark:bg-zinc-900 border border-black/10 dark:border-white/5 hover:bg-black/10 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-sm rounded-xl transition-all shadow-sm active:scale-[0.98]"
            >
              Sign Out
            </button>
          </div>
        </div>

      </div>
    </BottomSheet>
  );
}
