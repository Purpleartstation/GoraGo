import { useState, useEffect, useMemo } from 'react';
import {
  useSafeDocumentData,
  useSafeCollectionData,
  updateUserProfile,
  updateHousehold,
  wipeHouseholdData,
  wipeAllUserData,
  linkGoogleEmail,
  mergeLocalAndRemoteData,
  createHousehold,
  getHouseholdPairingCode,
  pairHouseholdByCodeOrEmail,
  unpairHouseholdMember,
  localStore,
} from '../db';
import type { User, Household, Bill, Debt } from '../db';
import { useAppStore } from '../store';
import BottomSheet from './BottomSheet';
import ConfirmModal from './ConfirmModal';
import { useTranslation } from 'react-i18next';
import { triggerHaptic } from '../utils/haptics';
import { playSound } from '../utils/soundFX';
import {
  Users,
  CheckCircle2,
  UserPlus,
  AlertCircle,
  Trash2,
  Sun,
  Moon,
  Sparkles,
  Calendar,
  Languages,
  Shield,
  RefreshCw,
  Sliders,
  Bell,
  Check,
  X,
  Mail,
  KeyRound,
  Delete,
  Lock,
  Send,
  Volume2,
  Zap,
  Copy,
  Link,
  UserMinus,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, onSnapshot, getDoc, collection, query, where } from '../lib/supabase';
import {
  connectGoogleCalendar,
  getCalendarToken,
  disconnectGoogleCalendar,
  syncAllToGoogleCalendar,
} from '../utils/googleCalendar';
import { sendPartnerNotification } from '../utils/partnerNotification';
import { lockAppNow } from '../utils/securityStore';
import { motion, AnimatePresence } from 'framer-motion';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'profile' | 'sync' | 'preferences' | 'danger';

export default function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const { t, i18n } = useTranslation();
  const currentUserId = useAppStore((state) => state.currentUserId);
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const aiCategorizationEnabled = useAppStore((state) => state.aiCategorizationEnabled);
  const setAiCategorizationEnabled = useAppStore((state) => state.setAiCategorizationEnabled);
  const hapticsEnabled = useAppStore((state) => state.hapticsEnabled);
  const setHapticsEnabled = useAppStore((state) => state.setHapticsEnabled);
  const soundEffectsEnabled = useAppStore((state) => state.soundEffectsEnabled);
  const setSoundEffectsEnabled = useAppStore((state) => state.setSoundEffectsEnabled);

  // Active Tab
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Fetch current user, household, bills, and debts
  const [user] = useSafeDocumentData<User>(null, 'users', currentUserId);
  const [household] = useSafeDocumentData<Household>(null, 'households', currentHouseholdId);
  const [allUsers] = useSafeCollectionData<User>(null, 'users');
  const [bills] = useSafeCollectionData<Bill>(null, 'bills');
  const [debts] = useSafeCollectionData<Debt>(null, 'debts');

  // Profile Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [manualGoogleEmail, setManualGoogleEmail] = useState('');
  const [isLinkingEmail, setIsLinkingEmail] = useState(false);
  const [emailLinkSuccess, setEmailLinkSuccess] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Keypad PIN Modal State
  const [pinModalMode, setPinModalMode] = useState<'app_pin' | 'ef_pin' | null>(null);
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [pinBuffer, setPinBuffer] = useState('');
  const [firstPinBuffer, setFirstPinBuffer] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Google Calendar Integration States
  const [calendarConnected, setCalendarConnected] = useState<boolean>(!!getCalendarToken());
  const [isConnectingCalendar, setIsConnectingCalendar] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);
  const [calendarRemindersEnabled, setCalendarRemindersEnabled] = useState(true);

  // Partner Sync States
  const [householdPairingCode, setHouseholdPairingCode] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [partnerCodeOrEmailInput, setPartnerCodeOrEmailInput] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [partnerStatus, setPartnerStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSendingTestAlert, setIsSendingTestAlert] = useState(false);
  const [testAlertSuccess, setTestAlertSuccess] = useState<string | null>(null);

  // Live Connected Members via Real-Time onSnapshot
  interface LiveHouseholdMember {
    id: string;
    name: string;
    email: string;
    avatar?: string;
    isCurrentUser: boolean;
    pairingCode?: string;
  }
  const [liveMembers, setLiveMembers] = useState<LiveHouseholdMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  useEffect(() => {
    if (!currentHouseholdId) return;

    // 1. Fetch & ensure unique Household Pairing Code
    getHouseholdPairingCode(currentHouseholdId, currentUserId).then(code => {
      if (code) setHouseholdPairingCode(code);
    });

    setIsLoadingMembers(true);

    let currentValidMemberIds = new Set<string>();
    if (currentUserId) currentValidMemberIds.add(currentUserId);

    const memberDocUnsubs: Record<string, () => void> = {};

    const updateMemberInList = (uData: Partial<User> & { id: string }) => {
      if (!uData.id) return;

      if (currentValidMemberIds.size > 0 && !currentValidMemberIds.has(uData.id)) {
        setLiveMembers(prev => prev.filter(m => m.id !== uData.id));
        return;
      }

      const isCurrent = uData.id === currentUserId;
      const realName = (uData as any)?.displayName 
        || (uData as any)?.fullName 
        || uData.name 
        || (isCurrent ? (auth.currentUser?.displayName || user?.name || 'You') : (uData.email ? uData.email.split('@')[0] : 'Connected Partner'));
      
      const realAvatar = (uData as any)?.photoURL 
        || uData.avatar 
        || (isCurrent ? (auth.currentUser?.photoURL || user?.avatar) : undefined);

      const realEmail = uData.email 
        || (uData as any)?.linkedGoogleEmail 
        || (isCurrent ? (auth.currentUser?.email || user?.email || 'Your Account') : '');

      setLiveMembers(prev => {
        const next = [...prev];
        const idx = next.findIndex(m => m.id === uData.id);
        const item: LiveHouseholdMember = {
          id: uData.id,
          name: realName,
          email: realEmail,
          avatar: realAvatar,
          isCurrentUser: isCurrent,
          pairingCode: uData.pairingCode,
        };
        if (idx >= 0) {
          next[idx] = item;
        } else {
          next.push(item);
        }
        // Strict deduplication by UID
        const dedupedMap = new Map<string, LiveHouseholdMember>();
        for (const m of next) {
          if (!currentValidMemberIds.size || currentValidMemberIds.has(m.id)) {
            dedupedMap.set(m.id, m);
          }
        }
        return Array.from(dedupedMap.values()).sort((a, b) => (a.isCurrentUser ? -1 : b.isCurrentUser ? 1 : 0));
      });
    };

    // 2. Real-time Firestore listener on household document
    const hhDocRef = doc(db, 'households', currentHouseholdId);
    const unsubHh = onSnapshot(hhDocRef, async (hhSnap) => {
      let rawMemberIds: string[] = [];
      if (hhSnap.exists()) {
        const hhData = hhSnap.data() as Household;
        if (hhData.pairingCode && hhData.pairingCode.startsWith('GORA-')) {
          setHouseholdPairingCode(hhData.pairingCode);
        }
        rawMemberIds = [
          ...(Array.isArray(hhData.memberIds) ? hhData.memberIds : []),
          ...(Array.isArray((hhData as any).members) ? (hhData as any).members.map((m: any) => typeof m === 'string' ? m : (m?.id || m?.uid)) : [])
        ];
      }
      if (currentUserId) {
        rawMemberIds.push(currentUserId);
      }
      
      // Deduplicate member UIDs
      const uniqueIds = Array.from(new Set(rawMemberIds.filter(Boolean)));
      currentValidMemberIds = new Set(uniqueIds);

      // Cleanup listeners for members that are no longer in this household
      Object.keys(memberDocUnsubs).forEach(uid => {
        if (!currentValidMemberIds.has(uid)) {
          if (memberDocUnsubs[uid]) memberDocUnsubs[uid]();
          delete memberDocUnsubs[uid];
        }
      });

      // Optimistically prune disconnected members from live state
      setLiveMembers(prev => prev.filter(m => currentValidMemberIds.has(m.id)));

      // For every member UID, listen to users/{uid} in real time
      for (const mId of uniqueIds) {
        if (!memberDocUnsubs[mId]) {
          const uDocRef = doc(db, 'users', mId);
          memberDocUnsubs[mId] = onSnapshot(uDocRef, (uSnap) => {
            if (uSnap.exists()) {
              const uData = { id: mId, ...uSnap.data() } as User;
              localStore.users[mId] = uData;
              updateMemberInList(uData);
            } else {
              const cached = localStore.users[mId] || { 
                id: mId, 
                name: mId === currentUserId ? (auth.currentUser?.displayName || user?.name || 'You') : 'Connected Partner', 
                email: mId === currentUserId ? (auth.currentUser?.email || user?.email || '') : '',
                hasPin: false 
              };
              updateMemberInList(cached);
            }
          }, (err) => {
            console.warn(`User doc listener notice for ${mId}:`, err);
            const cached = localStore.users[mId] || { 
              id: mId, 
              name: mId === currentUserId ? (auth.currentUser?.displayName || user?.name || 'You') : 'Connected Partner', 
              email: mId === currentUserId ? (auth.currentUser?.email || user?.email || '') : '',
              hasPin: false 
            };
            updateMemberInList(cached);
          });
        }
      }

      setIsLoadingMembers(false);
    }, (err) => {
      console.warn("Real-time household listener notice:", err);
      setIsLoadingMembers(false);
    });

    // 3. Real-time Firestore listener on users collection with matching householdId
    const usersQ = query(collection(db, 'users'), where('householdId', '==', currentHouseholdId));
    const unsubUsers = onSnapshot(usersQ, (usersSnap) => {
      const usersData = usersSnap.docs.map(d => d.data() as User);
      usersData.forEach(u => {
        localStore.users[u.id] = u;
        if (currentValidMemberIds.size === 0 || currentValidMemberIds.has(u.id)) {
          updateMemberInList(u);
        }
      });
    }, (err) => {
      console.warn("Real-time users listener notice:", err);
    });

    return () => {
      unsubHh();
      unsubUsers();
      Object.values(memberDocUnsubs).forEach(u => u());
    };
  }, [currentHouseholdId, currentUserId, user]);

  // Danger Zone States
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPinInput, setResetPinInput] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  // Populate fields
  useEffect(() => {
    if (user && isOpen) {
      setName(user.name || '');
      setEmail(user.email || '');
      setManualGoogleEmail(user.linkedGoogleEmail || '');
      setCalendarConnected(!!getCalendarToken());
    }
  }, [isOpen, user]);

  // Handle Google Calendar Connection
  const handleConnectCalendar = async () => {
    setIsConnectingCalendar(true);
    setSyncResult(null);
    try {
      await connectGoogleCalendar();
      setCalendarConnected(true);
    } catch (err: any) {
      console.error('Failed to connect calendar:', err);
      setSyncResult({ success: false, message: 'OAuth authorization was cancelled or failed.' });
    } finally {
      setIsConnectingCalendar(false);
    }
  };

  const handleDisconnectCalendar = () => {
    disconnectGoogleCalendar();
    setCalendarConnected(false);
    setSyncResult({ success: true, message: 'Google Calendar disconnected.' });
  };

  // Batch Sync All to Google Calendar
  const handleSyncAllToGoogleCalendar = async () => {
    if (!calendarConnected) {
      setSyncResult({ success: false, message: 'Please connect Google Calendar first.' });
      return;
    }

    setIsSyncingCalendar(true);
    setSyncResult(null);

    try {
      const activeBills = bills || [];
      const activeDebts = debts || [];
      const savingsGoals = [
        {
          name: 'Emergency Fund (Safety Net) 3-Month Target',
          targetAmount: 50000,
          targetDate: '2026-12-31',
        },
      ];

      const res = await syncAllToGoogleCalendar(activeBills, activeDebts, savingsGoals);

      if (res.success) {
        setSyncResult({
          success: true,
          message: `Successfully synced ${res.syncedCount} event(s) to your Google Calendar! (Bills, Loan Schedules & Goals)`,
        });
      } else {
        setSyncResult({
          success: false,
          message: res.error || 'Failed to sync with Google Calendar.',
        });
      }
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err?.message || 'Sync encountered an error.',
      });
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  // Save Profile Name & General Info
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await updateUserProfile(currentUserId || 'u_default', {
        name: name.trim(),
        email: email.trim(),
      });
      setSaveStatus('Profile updated successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setSaveStatus('Error saving profile.');
    }
  };

  // Link Target Gmail/Email
  const handleLinkTargetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualGoogleEmail.trim() || !manualGoogleEmail.includes('@')) {
      setEmailLinkSuccess('Please enter a valid email address.');
      return;
    }

    try {
      setIsLinkingEmail(true);
      await linkGoogleEmail(currentUserId || 'u_default', manualGoogleEmail.trim());
      setEmailLinkSuccess('Google/Sync email linked successfully!');
      setTimeout(() => setEmailLinkSuccess(null), 4000);
    } catch (err) {
      setEmailLinkSuccess('Failed to link email. Please try again.');
    } finally {
      setIsLinkingEmail(false);
    }
  };

  // Keypad Operations
  const openPinModal = (mode: 'app_pin' | 'ef_pin') => {
    setPinModalMode(mode);
    setPinStep('enter');
    setPinBuffer('');
    setFirstPinBuffer('');
    setPinError(null);
    setPinSuccess(false);
  };

  const closePinModal = () => {
    setPinModalMode(null);
    setPinBuffer('');
    setFirstPinBuffer('');
    setPinError(null);
    setPinSuccess(false);
  };

  const handleKeypadPress = (digit: string) => {
    if (pinSuccess) return;
    if (pinBuffer.length >= 4) return;
    const newBuf = pinBuffer + digit;
    setPinBuffer(newBuf);

    if (newBuf.length === 4) {
      if (pinStep === 'enter') {
        // Move to confirm step
        setTimeout(() => {
          setFirstPinBuffer(newBuf);
          setPinBuffer('');
          setPinStep('confirm');
          setPinError(null);
        }, 200);
      } else if (pinStep === 'confirm') {
        // Validate match
        if (newBuf === firstPinBuffer) {
          handleSavePin(newBuf);
        } else {
          setPinError('PINs do not match. Please try again.');
          setTimeout(() => {
            setPinBuffer('');
            setPinStep('enter');
            setFirstPinBuffer('');
            setPinError(null);
          }, 1200);
        }
      }
    }
  };

  const handleKeypadBackspace = () => {
    if (pinSuccess) return;
    setPinBuffer(prev => prev.slice(0, -1));
    setPinError(null);
  };

  const handleKeypadClear = () => {
    if (pinSuccess) return;
    setPinBuffer('');
    setPinError(null);
  };

  const handleSavePin = async (finalPin: string) => {
    if (!pinModalMode) return;
    try {
      if (pinModalMode === 'app_pin') {
        await updateUserProfile(currentUserId || 'u_default', {
          pin: finalPin,
          hasPin: true,
        });
      } else {
        await updateUserProfile(currentUserId || 'u_default', {
          emergencyFundPin: finalPin,
        });
      }
      setPinSuccess(true);
      setTimeout(() => {
        closePinModal();
      }, 1000);
    } catch (err) {
      console.error('Failed to update PIN:', err);
      setPinError('Failed to save PIN.');
    }
  };

  // Copy Household Code
  const handleCopyHouseholdCode = () => {
    if (!householdPairingCode) return;
    navigator.clipboard.writeText(householdPairingCode);
    setCopiedCode(true);
    triggerHaptic('success');
    playSound('tap');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // Pair Household via Code or Email
  const handlePairHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerCodeOrEmailInput.trim() || !currentUserId) return;

    setIsPairing(true);
    setPartnerStatus(null);

    try {
      const res = await pairHouseholdByCodeOrEmail(currentUserId, partnerCodeOrEmailInput.trim());

      if (res.success) {
        setPartnerStatus({
          type: 'success',
          text: res.message,
        });
        setPartnerCodeOrEmailInput('');
        if (res.householdId) {
          useAppStore.getState().setCurrentHousehold(res.householdId);
        }
      } else {
        setPartnerStatus({
          type: 'error',
          text: res.message,
        });
      }
    } catch (err: any) {
      setPartnerStatus({
        type: 'error',
        text: err?.message || 'Failed to pair household.',
      });
    } finally {
      setIsPairing(false);
    }
  };

  // Send Test Partner Notification
  const handleSendTestPartnerAlert = async () => {
    if (!household || (household.memberIds || []).length <= 1) {
      setTestAlertSuccess('No connected partner found in your household.');
      return;
    }

    const otherMemberId = household.memberIds.find(id => id !== currentUserId);
    if (!otherMemberId) {
      setTestAlertSuccess('No connected partner found in your household.');
      return;
    }

    // Lookup partner with multi-layer fallback (live state -> collection cache -> localStore -> Firestore doc)
    let partner: any = liveMembers.find(m => m.id === otherMemberId) 
      || allUsers?.find(u => u.id === otherMemberId) 
      || (localStore.users[otherMemberId] as any);

    if (!partner?.email && !partner?.linkedGoogleEmail) {
      try {
        const uSnap = await getDoc(doc(db, 'users', otherMemberId));
        if (uSnap.exists()) {
          partner = uSnap.data() as User;
        }
      } catch (e) {
        console.warn('Failed to query partner user doc:', e);
      }
    }

    const targetPartnerEmail = partner?.email 
      || partner?.linkedGoogleEmail 
      || (partner?.name ? `${partner.name.toLowerCase().replace(/\s+/g, '')}@gorago.app` : null)
      || `partner_${otherMemberId.slice(0, 6)}@gorago.app`;

    const senderEmail = user?.email 
      || auth.currentUser?.email 
      || user?.linkedGoogleEmail 
      || (currentUserId ? localStore.users[currentUserId]?.email : null)
      || 'user@gorago.app';

    const senderName = user?.name 
      || auth.currentUser?.displayName 
      || (currentUserId ? localStore.users[currentUserId]?.name : null) 
      || 'Your Partner';

    setIsSendingTestAlert(true);
    setTestAlertSuccess(null);

    try {
      const res = await sendPartnerNotification({
        senderName,
        senderEmail,
        partnerEmail: targetPartnerEmail,
        eventType: 'transaction',
        title: 'Dinner & Groceries Sync Test',
        amount: 1250,
        action: 'logged',
        note: 'GoraGo real-time connected partner test alert',
      });

      if (res.success) {
        setTestAlertSuccess(`Test email successfully dispatched to ${targetPartnerEmail}!`);
      } else {
        setTestAlertSuccess(`Notice: ${res.error || 'Alert triggered'}`);
      }
      setTimeout(() => setTestAlertSuccess(null), 5000);
    } catch (err: any) {
      setTestAlertSuccess(`Error: ${err?.message || 'Failed to dispatch alert'}`);
    } finally {
      setIsSendingTestAlert(false);
    }
  };

  // Listen for unpair events from local or remote broadcast to force UI refresh
  useEffect(() => {
    const handleUnpairEvent = (e: any) => {
      const unpMemberId = e.detail?.memberId;
      if (unpMemberId) {
        setLiveMembers(prev => prev.filter(m => m.id !== unpMemberId));
        if (localStore.users[unpMemberId]) {
          delete localStore.users[unpMemberId];
        }
      }
    };
    window.addEventListener('gorago_member_unpaired', handleUnpairEvent);
    return () => window.removeEventListener('gorago_member_unpaired', handleUnpairEvent);
  }, []);

  // Disconnect Partner
  const handleDisconnectMember = async (memberId: string) => {
    const targetHhId = currentHouseholdId || household?.id;
    if (!targetHhId || memberId === currentUserId) return;
    const confirmDisc = window.confirm('Are you sure you want to unpair this partner? Real-time sync between your accounts will stop.');
    if (!confirmDisc) return;

    try {
      // Optimistically update live members and clear localStore entry for instant UI feedback
      setLiveMembers(prev => prev.filter(m => m.id !== memberId));
      if (localStore.users[memberId]) {
        delete localStore.users[memberId];
      }

      await unpairHouseholdMember(targetHhId, memberId);
      
      setPartnerStatus({
        type: 'success',
        text: 'Partner successfully unpaired and moved to a fresh independent workspace.'
      });
      setTimeout(() => setPartnerStatus(null), 4000);
    } catch (err: any) {
      setPartnerStatus({
        type: 'error',
        text: err?.message || 'Failed to unpair partner.'
      });
    }
  };

  // Execute Full Application Reset (Danger Zone)
  const handleConfirmWipeAllData = async () => {
    const targetHouseholdId = currentHouseholdId || 'h_sample';
    try {
      setIsResetting(true);
      setResetError(null);
      
      // 1. Thorough Local, IndexedDB, and Firestore erasure
      await wipeAllUserData(targetHouseholdId);
      
      // 2. Reset authentication/session state or re-initialize clean workspace
      useAppStore.getState().resetStore();
      
      setIsConfirmModalOpen(false);
      setShowResetModal(false);
      setResetPinInput('');
      setIsResetting(false);

      // 3. Light page reload to guarantee a fresh, clean application start
      window.location.reload();
    } catch (err: any) {
      console.error('Failed to wipe data:', err);
      setResetError(err?.message || 'Failed to reset data. Please try again.');
      setIsResetting(false);
    }
  };

  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const correctPin = user?.pin || '1234';
    if (resetPinInput.trim() !== correctPin) {
      setResetError('Incorrect security PIN. Please enter your 4-digit PIN.');
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const activeMembers = useMemo(() => {
    const rawIds = Array.from(new Set([
      ...(Array.isArray(household?.memberIds) ? household.memberIds : []),
      ...(Array.isArray((household as any)?.members) ? (household as any).members.map((m: any) => typeof m === 'string' ? m : (m?.id || m?.uid)) : []),
      ...(currentUserId ? [currentUserId] : [])
    ].filter(Boolean)));

    const validSet = new Set(rawIds);

    // Filter liveMembers strictly by validSet
    const filteredLive = liveMembers.filter(m => validSet.has(m.id));

    const list = filteredLive.length > 0
      ? filteredLive
      : rawIds.map((memberId) => {
          const foundUser = allUsers?.find(u => u.id === memberId) || (memberId === currentUserId ? user : localStore.users[memberId]);
          const isCurrent = memberId === currentUserId;
          const realName = (foundUser as any)?.displayName 
            || (foundUser as any)?.fullName 
            || foundUser?.name 
            || (isCurrent ? (auth.currentUser?.displayName || user?.name || 'You') : (foundUser?.email ? foundUser.email.split('@')[0] : 'Connected Partner'));
          const realAvatar = (foundUser as any)?.photoURL 
            || foundUser?.avatar 
            || (isCurrent ? (auth.currentUser?.photoURL || user?.avatar) : undefined);
          const realEmail = foundUser?.email 
            || (foundUser as any)?.linkedGoogleEmail 
            || (isCurrent ? (auth.currentUser?.email || user?.email || 'Your Account') : '');

          return {
            id: memberId,
            name: realName,
            email: realEmail,
            avatar: realAvatar,
            isCurrentUser: isCurrent,
            pairingCode: foundUser?.pairingCode,
          };
        });

    const dedupedMap = new Map<string, LiveHouseholdMember>();
    for (const m of list) {
      if (validSet.has(m.id) && !dedupedMap.has(m.id)) {
        dedupedMap.set(m.id, m);
      }
    }
    return Array.from(dedupedMap.values()).sort((a, b) => (a.isCurrentUser ? -1 : b.isCurrentUser ? 1 : 0));
  }, [liveMembers, household?.memberIds, (household as any)?.members, currentUserId, allUsers, user]);
  const householdMembers = activeMembers;
  const isGoogleBound = user?.isGoogleBound || user?.email?.toLowerCase().endsWith('@gmail.com');

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={t('settings.title', 'Settings & Preferences')}>
      <div className="space-y-6 pb-6">

        {/* Tab Navigation Pill Bar */}
        <div className="flex bg-black/5 dark:bg-zinc-900/80 p-1.5 rounded-2xl gap-1 border border-black/5 dark:border-white/5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            id="tab-profile"
            onClick={() => {
              triggerHaptic('medium');
              playSound('snap');
              setActiveTab('profile');
            }}
            className={`flex-1 min-w-[90px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'profile'
                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Shield size={14} />
            <span>Profile</span>
          </button>

          <button
            type="button"
            id="tab-sync"
            onClick={() => {
              triggerHaptic('medium');
              playSound('snap');
              setActiveTab('sync');
            }}
            className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'sync'
                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <RefreshCw size={14} />
            <span>Sync & Integrations</span>
          </button>

          <button
            type="button"
            id="tab-preferences"
            onClick={() => {
              triggerHaptic('medium');
              playSound('snap');
              setActiveTab('preferences');
            }}
            className={`flex-1 min-w-[95px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'preferences'
                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Sliders size={14} />
            <span>Preferences</span>
          </button>

          <button
            type="button"
            id="tab-danger"
            onClick={() => {
              triggerHaptic('medium');
              playSound('snap');
              setActiveTab('danger');
            }}
            className={`flex-1 min-w-[85px] py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'danger'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-rose-600/70 hover:text-rose-600'
            }`}
          >
            <AlertCircle size={14} />
            <span>Danger</span>
          </button>
        </div>

        {/* ─── TAB 1: Profile & Security ────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div className="space-y-6 animate-fadeIn">
            {/* User Card Header */}
            <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-purple-500/10 via-fuchsia-500/5 to-transparent border border-purple-500/20 rounded-2xl">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center text-white font-black text-xl shadow-md">
                {name.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-zinc-900 dark:text-zinc-100 truncate">{name || 'GoraGo User'}</h3>
                  {isGoogleBound && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                      <Check size={11} /> Google Bound
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 truncate">{email || 'No email bound'}</p>
                <p className="text-[10px] text-purple-600 dark:text-fuchsia-400 font-semibold mt-0.5">Household: {household?.name || 'My Household'}</p>
              </div>
            </div>

            {/* Profile Form */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1 block mb-1">Full Name</label>
                  <input
                    type="text"
                    id="profile-fullname-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-black/5 dark:bg-zinc-900/50 border border-black/10 dark:border-white/5 rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Your Full Name"
                    required
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pl-1 block mb-1">Account Email</label>
                  <input
                    type="email"
                    id="profile-email-input"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-black/5 dark:bg-zinc-900/50 border border-black/10 dark:border-white/5 rounded-xl px-4 py-3 text-zinc-900 dark:text-zinc-100 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="name@example.com"
                    required
                  />
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
                id="save-profile-btn"
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-black text-xs rounded-xl shadow-md transition-all active:scale-[0.98]"
              >
                Save Profile Changes
              </button>
            </form>

            {/* Google Sync Email Linking & Calendar Binding Card */}
            <div className="p-4 bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-purple-600 dark:text-fuchsia-400" />
                <h4 className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                  Google Account & Calendar Binding
                </h4>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Automatically links calendar schedules, upcoming bill reminders, and partner notifications to your target Google email.
              </p>

              {isGoogleBound ? (
                <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <div>
                      <p className="text-xs font-black text-emerald-700 dark:text-emerald-400">Google Account Linked</p>
                      <p className="text-[10px] text-emerald-600/80">{user?.linkedGoogleEmail || user?.email}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                </div>
              ) : (
                <form onSubmit={handleLinkTargetEmail} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      id="target-gmail-input"
                      value={manualGoogleEmail}
                      onChange={e => setManualGoogleEmail(e.target.value)}
                      placeholder="Enter target Gmail (e.g. you@gmail.com)"
                      className="flex-1 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-zinc-900 dark:text-zinc-100 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="submit"
                      disabled={isLinkingEmail || !manualGoogleEmail.trim()}
                      className="px-4 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs rounded-xl shadow-sm hover:opacity-90 disabled:opacity-40 transition-all"
                    >
                      {isLinkingEmail ? 'Linking...' : 'Link Gmail'}
                    </button>
                  </div>
                  {emailLinkSuccess && (
                    <p className="text-[11px] font-bold text-purple-600 dark:text-fuchsia-400">{emailLinkSuccess}</p>
                  )}
                </form>
              )}

              {/* Calendar Sync Verification Status Row */}
              <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                calendarConnected 
                  ? 'bg-emerald-500/10 border-emerald-500/20' 
                  : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                <div className="flex items-center gap-2.5">
                  <Calendar size={16} className={calendarConnected ? 'text-emerald-500' : 'text-amber-500'} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-black ${calendarConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        {calendarConnected ? 'Calendar Sync Active' : 'Calendar Reminders Pending'}
                      </p>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        calendarConnected ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}>
                        {calendarConnected ? 'Verified' : 'Connect'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {calendarConnected 
                        ? 'Automated reminders active for upcoming bills, loan schedules & savings goals' 
                        : 'Authorize Google Calendar to enable automated bill and loan reminders'}
                    </p>
                  </div>
                </div>
                {!calendarConnected ? (
                  <button
                    type="button"
                    onClick={handleConnectCalendar}
                    disabled={isConnectingCalendar}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg shadow-sm transition-all whitespace-nowrap"
                  >
                    {isConnectingCalendar ? 'Authorizing...' : 'Authorize'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSyncAllToGoogleCalendar}
                    disabled={isSyncingCalendar}
                    className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] rounded-lg transition-all whitespace-nowrap flex items-center gap-1"
                  >
                    <RefreshCw size={11} className={isSyncingCalendar ? 'animate-spin' : ''} />
                    Sync Now
                  </button>
                )}
              </div>
            </div>

            {/* Interactive PIN Security Section */}
            <div className="p-4 bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2">
                <Lock size={15} className="text-purple-600 dark:text-fuchsia-400" />
                <h4 className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                  Security PIN Management
                </h4>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Secure your sensitive transactions, emergency fund access, and household resets using 4-digit PINs.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* App Security PIN */}
                <div className="p-3 bg-white dark:bg-zinc-900/60 border border-black/5 dark:border-white/5 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">App Security PIN</p>
                    <p className="text-[10px] text-zinc-500 font-medium">
                      {user?.pin ? 'Status: Configured (••••)' : 'Status: Not configured'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {user?.pin && (
                      <button
                        type="button"
                        id="lock-app-btn"
                        onClick={() => {
                          onClose();
                          lockAppNow();
                        }}
                        className="px-2.5 py-1.5 bg-black/5 hover:bg-black/10 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                        title="Lock app immediately to test PIN screen"
                      >
                        <Lock size={12} />
                        Lock
                      </button>
                    )}
                    <button
                      type="button"
                      id="set-app-pin-btn"
                      onClick={() => openPinModal('app_pin')}
                      className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-fuchsia-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                    >
                      <KeyRound size={12} />
                      {user?.pin ? 'Update' : 'Set PIN'}
                    </button>
                  </div>
                </div>

                {/* Emergency Fund PIN */}
                <div className="p-3 bg-white dark:bg-zinc-900/60 border border-black/5 dark:border-white/5 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">Emergency Fund PIN</p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                      {user?.emergencyFundPin ? 'Status: Protected (••••)' : 'Status: Not configured'}
                    </p>
                  </div>
                  <button
                    type="button"
                    id="set-ef-pin-btn"
                    onClick={() => openPinModal('ef_pin')}
                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                  >
                    <KeyRound size={12} />
                    {user?.emergencyFundPin ? 'Update' : 'Set EF PIN'}
                  </button>
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              type="button"
              id="sign-out-btn"
              onClick={() => signOut(auth)}
              className="w-full py-3 bg-black/5 dark:bg-zinc-900 border border-black/10 dark:border-white/5 hover:bg-black/10 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98]"
            >
              Sign Out of GoraGo
            </button>
          </div>
        )}

        {/* ─── TAB 2: Sync & Integrations ───────────────────────────────────────── */}
        {activeTab === 'sync' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Google Calendar Section */}
            <div className="p-4 bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-2 shadow-sm border border-black/5">
                    <svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Google Calendar Integration</h4>
                    <p className="text-[11px] text-zinc-500">Sync bills, loan deadlines & savings schedules</p>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black flex items-center gap-1 ${
                  calendarConnected
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20'
                }`}>
                  {calendarConnected ? '● Connected' : '○ Not Linked'}
                </span>
              </div>

              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Connect your Google account to automatically push recurring bill reminders, debt payoff schedules, and emergency fund milestone dates to your primary Google Calendar.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                {!calendarConnected ? (
                  <button
                    type="button"
                    id="connect-calendar-btn"
                    onClick={handleConnectCalendar}
                    disabled={isConnectingCalendar}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Calendar size={14} />
                    {isConnectingCalendar ? 'Authorizing Google...' : 'Connect Google Calendar'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      id="sync-all-calendar-btn"
                      onClick={handleSyncAllToGoogleCalendar}
                      disabled={isSyncingCalendar}
                      className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <RefreshCw size={14} className={isSyncingCalendar ? 'animate-spin' : ''} />
                      {isSyncingCalendar ? 'Syncing All Schedules...' : 'Sync All Bills & Loans Now'}
                    </button>
                    <button
                      type="button"
                      id="disconnect-calendar-btn"
                      onClick={handleDisconnectCalendar}
                      className="py-3 px-4 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition-all"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>

              {/* Reminders Toggle Option */}
              {calendarConnected && (
                <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <Bell size={14} className="text-purple-600 dark:text-fuchsia-400" />
                    <div>
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">1-Day Advance Reminders</p>
                      <p className="text-[10px] text-zinc-500">Email & push alerts 24 hours before bill/loan due date</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCalendarRemindersEnabled(!calendarRemindersEnabled)}
                    className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                      calendarRemindersEnabled ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                        calendarRemindersEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Sync Result Feedback */}
              {syncResult && (
                <div className={`p-3 border rounded-xl flex items-center gap-2 text-xs font-bold ${
                  syncResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                }`}>
                  {syncResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                  <span>{syncResult.message}</span>
                </div>
              )}
            </div>

            {/* Connected Partners Section */}
            <div className="p-4 bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-600 dark:text-fuchsia-400 flex items-center justify-center font-bold">
                    <Users size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Connected Partners Real-Time Sync</h4>
                    <p className="text-[11px] text-zinc-500">Instant balance updates & bidirectional pairing</p>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-600 dark:text-fuchsia-400 border border-purple-500/25">
                  ● Live Channel Active
                </span>
              </div>

              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                When either partner logs a transaction, pays a bill, or adjusts account funds, changes are synchronized immediately across all active screens and devices.
              </p>

              {/* 1. Unique Household Pairing Code Display Card */}
              <div className="p-3.5 bg-gradient-to-r from-purple-900/20 via-indigo-900/20 to-fuchsia-900/20 border border-purple-500/30 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-purple-500/20 text-purple-600 dark:text-fuchsia-400 flex items-center justify-center font-bold">
                      <KeyRound size={13} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">Household Pairing Code</p>
                      <p className="text-[10px] text-zinc-500">Share this unique ID with your partner</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    ● Active Code
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2.5 bg-white dark:bg-zinc-950 border border-purple-500/25 rounded-xl shadow-xs">
                  <div className="font-mono text-sm sm:text-base font-black tracking-wider text-purple-700 dark:text-fuchsia-300 select-all px-2.5 py-1.5 bg-purple-50 dark:bg-zinc-900 rounded-lg text-center sm:text-left break-all">
                    {householdPairingCode || 'GORA-8X92-KL41'}
                  </div>
                  <button
                    type="button"
                    id="copy-household-code-btn"
                    onClick={handleCopyHouseholdCode}
                    className="min-h-[44px] px-4 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] shrink-0"
                  >
                    {copiedCode ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}
                    <span>{copiedCode ? 'Copied to Clipboard!' : '📋 Copy Code'}</span>
                  </button>
                </div>
              </div>

              {/* 2. Live Connected Household Member List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider pl-0.5 flex items-center gap-1.5">
                    <Users size={12} className="text-purple-600 dark:text-fuchsia-400" />
                    <span>Live Connected Members ({householdMembers.length})</span>
                  </p>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Real-Time Channel Active
                  </span>
                </div>

                {isLoadingMembers && householdMembers.length === 0 ? (
                  <div className="p-4 bg-white dark:bg-zinc-900/80 rounded-xl border border-black/5 dark:border-white/5 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-purple-600" />
                    <span>Synchronizing household members...</span>
                  </div>
                ) : (
                  householdMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-black/5 dark:border-white/5 shadow-xs transition-all hover:border-purple-500/20"
                    >
                      <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt={member.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500/30 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 via-indigo-600 to-fuchsia-600 text-white flex items-center justify-center font-black text-xs ring-2 ring-purple-500/30 shadow-xs shrink-0">
                            {member.name ? member.name.charAt(0).toUpperCase() : 'P'}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                              {member.name}
                            </p>
                            {member.id === currentUserId ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-purple-500/15 text-purple-600 dark:text-fuchsia-300 rounded border border-purple-500/20">
                                You (Active Device)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded border border-emerald-500/20">
                                Partner (Connected)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 font-medium truncate">{member.email || 'No email attached'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">
                              🟢 Real-Time Synced & Online
                            </span>
                          </div>
                        </div>
                      </div>

                      {member.id !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => handleDisconnectMember(member.id)}
                          className="w-full sm:w-auto min-h-[38px] text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] shrink-0"
                        >
                          <UserMinus size={14} />
                          Unpair
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* 3. Pair via Code Input Form */}
              <form onSubmit={handlePairHousehold} className="space-y-2.5 pt-3 border-t border-black/5 dark:border-white/5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5 block">
                  Pair via Household Code or Partner Email
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5 w-full">
                  <input
                    type="text"
                    id="partner-code-input"
                    value={partnerCodeOrEmailInput}
                    onChange={e => setPartnerCodeOrEmailInput(e.target.value)}
                    placeholder="Paste Code (e.g. GORA-8X92-KL41) or Email"
                    className="w-full sm:flex-1 min-h-[44px] bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 uppercase placeholder:normal-case font-medium transition-all"
                  />
                  <button
                    type="submit"
                    id="pair-household-btn"
                    disabled={!partnerCodeOrEmailInput.trim() || isPairing}
                    className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-purple-600 via-purple-700 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98] shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    {isPairing ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Pairing...</span>
                      </>
                    ) : (
                      <>
                        <Link size={15} />
                        <span>🔗 Pair Household</span>
                      </>
                    )}
                  </button>
                </div>

                {partnerStatus && (
                  <div className={`p-3 border rounded-xl flex items-center gap-2 text-xs font-bold ${
                    partnerStatus.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                  }`}>
                    {partnerStatus.type === 'success' ? <CheckCircle2 size={15} className="shrink-0" /> : <AlertCircle size={15} className="shrink-0" />}
                    <span>{partnerStatus.text}</span>
                  </div>
                )}
              </form>

              {/* Test Alert Dispatcher */}
              {householdMembers.length > 1 && (
                <div className="pt-2">
                  <button
                    type="button"
                    id="test-partner-alert-btn"
                    onClick={handleSendTestPartnerAlert}
                    disabled={isSendingTestAlert}
                    className="w-full min-h-[44px] py-2.5 px-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-fuchsia-400 border border-purple-500/20 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <Send size={14} className={isSendingTestAlert ? 'animate-bounce' : ''} />
                    {isSendingTestAlert ? 'Dispatching Test Email...' : 'Send Test Partner Sync Alert'}
                  </button>
                  {testAlertSuccess && (
                    <p className="text-[10px] font-bold text-purple-600 dark:text-fuchsia-400 mt-1.5 text-center">
                      {testAlertSuccess}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── TAB 3: Preferences & Theme ───────────────────────────────────────── */}
        {activeTab === 'preferences' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Language Switcher */}
            <div className="bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Languages size={15} className="text-purple-600 dark:text-fuchsia-400" />
                <h4 className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                  {t('settings.language', 'Language')}
                </h4>
              </div>
              <p className="text-[11px] text-zinc-500">
                Choose your preferred interface language (English or Tagalog).
              </p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  id="lang-en-btn"
                  onClick={() => {
                    i18n.changeLanguage('en');
                    localStorage.setItem('i18nextLng', 'en');
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                    i18n.language === 'en'
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                      : 'bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span>English</span>
                </button>
                <button
                  type="button"
                  id="lang-tl-btn"
                  onClick={() => {
                    i18n.changeLanguage('tl');
                    localStorage.setItem('i18nextLng', 'tl');
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                    i18n.language === 'tl'
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                      : 'bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <span>Tagalog</span>
                </button>
              </div>
            </div>

            {/* Appearance & Color Theme Switcher */}
            <div className="bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sun size={15} className="text-purple-600 dark:text-fuchsia-400" />
                <h4 className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                  Appearance & Theme
                </h4>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Toggle between Light Mode and Dark Mode with GoraGo's purple & magenta accent palette.
              </p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  id="theme-light-btn"
                  onClick={() => setThemeMode('light')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                    themeMode === 'light'
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                      : 'bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Sun size={14} />
                  <span>Light Mode</span>
                </button>
                <button
                  type="button"
                  id="theme-dark-btn"
                  onClick={() => setThemeMode('dark')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                    themeMode === 'dark'
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                      : 'bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Moon size={14} />
                  <span>Dark Mode</span>
                </button>
              </div>
            </div>

            {/* AI Categorization Settings */}
            <div className="bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-purple-600 dark:text-fuchsia-400" />
                  <h4 className="text-[11px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">
                    AI Auto-Categorization
                  </h4>
                </div>
                <button
                  type="button"
                  id="ai-categorization-toggle"
                  onClick={() => setAiCategorizationEnabled(!aiCategorizationEnabled)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer ${
                    aiCategorizationEnabled ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                      aiCategorizationEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Uses Gemini intelligence to automatically categorize expenses and transaction notes (e.g. "Jollibee" → Dining, "Meralco" → Utilities).
              </p>
            </div>

            {/* App Preferences: Haptics & Sound FX */}
            <div className="bg-black/5 dark:bg-zinc-900/40 border border-black/10 dark:border-white/5 rounded-2xl p-4 space-y-4">
              <h4 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Sliders size={13} className="text-purple-600 dark:text-fuchsia-400" />
                App Preferences
              </h4>

              {/* Haptics Switch */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5 max-w-[75%]">
                  <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Zap size={14} className="text-amber-500 shrink-0" />
                    Enable Haptic Feedback
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Vibrate on tab switches, keypad buttons, and success/error events.
                  </span>
                </div>
                <button
                  type="button"
                  id="haptic-feedback-toggle"
                  onClick={() => {
                    const nextVal = !hapticsEnabled;
                    setHapticsEnabled(nextVal);
                    triggerHaptic('medium');
                    playSound('snap');
                  }}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer shrink-0 ${
                    hapticsEnabled ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                      hapticsEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Sound Effects Switch */}
              <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                <div className="flex flex-col gap-0.5 max-w-[75%]">
                  <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Volume2 size={14} className="text-blue-500 shrink-0" />
                    Enable Sound Effects
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    Play real-time synthesized audio chimes, pops, and clicks.
                  </span>
                </div>
                <button
                  type="button"
                  id="sound-effects-toggle"
                  onClick={() => {
                    const nextVal = !soundEffectsEnabled;
                    setSoundEffectsEnabled(nextVal);
                    // Temporarily allow feedback to play once right after turning it on
                    if (nextVal) {
                      setTimeout(() => {
                        // Play a happy success arpeggio or simple pop
                        try {
                          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                          const osc = ctx.createOscillator();
                          const gain = ctx.createGain();
                          osc.connect(gain);
                          gain.connect(ctx.destination);
                          osc.frequency.setValueAtTime(600, ctx.currentTime);
                          gain.gain.setValueAtTime(0.1, ctx.currentTime);
                          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                          osc.start();
                          osc.stop(ctx.currentTime + 0.1);
                        } catch (err) {}
                      }, 50);
                    }
                    triggerHaptic('medium');
                    playSound('snap');
                  }}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer shrink-0 ${
                    soundEffectsEnabled ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                      soundEffectsEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 4: Danger Zone ───────────────────────────────────────────────── */}
        {activeTab === 'danger' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 pl-0.5">
                <AlertCircle size={16} className="text-rose-600 dark:text-rose-400" />
                <h4 className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">
                  Danger Zone & Application Reset
                </h4>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                Permanently wipes all accounts, transactions, bills, loan records, Analytics Insights, and GoraGo CFO Memory for this household.
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  id="open-reset-modal-btn"
                  onClick={() => {
                    setResetError(null);
                    setIsConfirmModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl transition-all group"
                >
                  <div className="text-left">
                    <p className="text-xs font-black text-rose-600 dark:text-rose-400">Delete All Data</p>
                    <p className="text-[10px] text-rose-500/80">Permanently erase accounts, transactions, and savings goals</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center group-hover:bg-rose-500/30 transition-colors">
                    <Trash2 size={16} className="text-rose-600 dark:text-rose-400" />
                  </div>
                </button>

                {!showResetModal ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetModal(true);
                      setResetPinInput('');
                      setResetError(null);
                    }}
                    className="w-full text-center py-2 text-[11px] font-bold text-rose-500/70 hover:text-rose-500 underline"
                  >
                    Authorize via Security PIN instead
                  </button>
                ) : (
                  <form onSubmit={handleExecuteReset} className="p-4 bg-white dark:bg-zinc-900 border border-rose-500/40 rounded-xl space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">Confirm Security PIN</p>
                      <button
                        type="button"
                        onClick={() => setShowResetModal(false)}
                        className="text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Enter your 4-digit security PIN to authorize permanent deletion.
                    </p>
                    <input
                      type="password"
                      id="danger-reset-pin-input"
                      maxLength={4}
                      value={resetPinInput}
                      onChange={e => setResetPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full bg-black/5 dark:bg-zinc-800 border border-rose-500/30 rounded-xl px-4 py-3 text-center text-zinc-900 dark:text-zinc-100 font-black text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-500"
                      autoFocus
                      required
                    />
                    {resetError && (
                      <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{resetError}</p>
                    )}
                    <button
                      type="submit"
                      id="confirm-wipe-btn"
                      disabled={isResetting || resetPinInput.length < 4}
                      className="w-full py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      {isResetting ? 'Wiping All Records...' : 'Authorize Permanent Wipe'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        title="Delete All Data"
        message="Are you sure? This will permanently delete all your accounts, transactions, and savings goals."
        confirmLabel="Yes, Delete Everything"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmWipeAllData}
        onCancel={() => setIsConfirmModalOpen(false)}
      />

      {/* ─── Interactive Numeric Keypad PIN Modal ─────────────────────────────── */}
      <AnimatePresence>
        {pinModalMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-black/10 dark:border-white/10 space-y-5"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-fuchsia-400 flex items-center justify-center">
                    <KeyRound size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                      {pinModalMode === 'app_pin' ? 'App Security PIN' : 'Emergency Fund PIN'}
                    </h4>
                    <p className="text-[10px] text-zinc-500">
                      {pinStep === 'enter' ? 'Step 1: Enter 4 digits' : 'Step 2: Re-enter to confirm'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closePinModal}
                  className="w-7 h-7 rounded-full bg-black/5 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Dot Indicators */}
              <div className="flex justify-center items-center gap-3 py-2">
                {[0, 1, 2, 3].map((idx) => {
                  const isFilled = pinBuffer.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                        pinSuccess
                          ? 'bg-emerald-500 scale-110'
                          : isFilled
                          ? 'bg-purple-600 scale-110 shadow-sm'
                          : 'bg-black/10 dark:bg-zinc-700'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Status or Error */}
              <div className="min-h-[20px] text-center">
                {pinSuccess ? (
                  <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <Check size={14} /> PIN Saved Successfully!
                  </p>
                ) : pinError ? (
                  <p className="text-[11px] font-bold text-rose-500">{pinError}</p>
                ) : (
                  <p className="text-[10px] text-zinc-500">
                    {pinStep === 'enter' ? 'Choose a memorable 4-digit code' : 'Repeat the PIN to verify'}
                  </p>
                )}
              </div>

              {/* 3x4 Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleKeypadPress(digit)}
                    className="h-12 rounded-2xl bg-black/5 dark:bg-zinc-800/80 hover:bg-black/10 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black text-lg transition-all active:scale-90"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleKeypadClear}
                  className="h-12 rounded-2xl bg-black/5 dark:bg-zinc-800/80 hover:bg-black/10 dark:hover:bg-zinc-700 text-zinc-500 font-bold text-xs transition-all active:scale-90"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="h-12 rounded-2xl bg-black/5 dark:bg-zinc-800/80 hover:bg-black/10 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-black text-lg transition-all active:scale-90"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleKeypadBackspace}
                  className="h-12 rounded-2xl bg-black/5 dark:bg-zinc-800/80 hover:bg-black/10 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 flex items-center justify-center transition-all active:scale-90"
                >
                  <Delete size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </BottomSheet>
  );
}
