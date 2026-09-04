/**
 * Security and Local Profile Storage Engine for GoraGo
 * Optimized for iOS WebApp / PWA and Standalone Mobile usage.
 * Persists user credentials, encrypted/hashed PINs, and local session in IndexedDB & LocalStorage.
 */

export interface SecurityProfile {
  userId: string;
  name: string;
  email: string;
  pinHash: string;
  hasPin: boolean;
  isGoogleBound: boolean;
  linkedGoogleEmail?: string;
  householdId?: string;
  avatar?: string;
  updatedAt: number;
}

const DB_NAME = 'gorago_security_db';
const DB_VERSION = 1;
const STORE_NAME = 'security_profile';
const PROFILE_KEY = 'active_profile';

// Quick synchronous localStorage cache keys for instant UI hydration without layout shift
const LS_KEYS = {
  HAS_PIN: 'gorago_has_pin',
  PIN_HASH: 'gorago_pin_hash',
  USER_ID: 'gorago_current_user_id',
  USER_NAME: 'gorago_user_name',
  USER_EMAIL: 'gorago_user_email',
  IS_GOOGLE: 'gorago_is_google_bound',
  SESSION_UNLOCKED: 'gorago_session_unlocked',
};

/**
 * SHA-256 Hash with salt for secure local PIN verification
 */
export async function hashPin(pin: string, salt: string = 'gorago_secure_pwa_salt_ph'): Promise<string> {
  const combined = `${salt}:${pin.trim()}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback
    }
  }

  // Fallback hashing for older runtimes
  let hash = 5381;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 33) ^ combined.charCodeAt(i);
  }
  return 'h_' + (hash >>> 0).toString(16);
}

/**
 * Open or initialize IndexedDB
 */
function openSecurityDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Synchronous check for returning user with PIN
 */
export function getSyncSecurityState(): {
  hasPin: boolean;
  userId: string;
  name: string;
  email: string;
  pinHash: string;
  isUnlocked: boolean;
} {
  if (typeof window === 'undefined') {
    return { hasPin: false, userId: '', name: '', email: '', pinHash: '', isUnlocked: false };
  }

  const hasPin = localStorage.getItem(LS_KEYS.HAS_PIN) === 'true';
  const pinHash = localStorage.getItem(LS_KEYS.PIN_HASH) || '';
  const userId = localStorage.getItem(LS_KEYS.USER_ID) || '';
  const name = localStorage.getItem(LS_KEYS.USER_NAME) || '';
  const email = localStorage.getItem(LS_KEYS.USER_EMAIL) || '';
  const isUnlocked = sessionStorage.getItem(LS_KEYS.SESSION_UNLOCKED) === 'true';

  return {
    hasPin: hasPin && !!pinHash,
    userId,
    name,
    email,
    pinHash,
    isUnlocked,
  };
}

/**
 * Save profile and encrypted PIN to both IndexedDB and LocalStorage
 */
export async function saveLocalSecurityProfile(
  profile: Omit<SecurityProfile, 'updatedAt'>
): Promise<void> {
  const fullProfile: SecurityProfile = {
    ...profile,
    updatedAt: Date.now(),
  };

  // 1. Sync to LocalStorage immediately
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LS_KEYS.HAS_PIN, String(fullProfile.hasPin));
      localStorage.setItem(LS_KEYS.PIN_HASH, fullProfile.pinHash);
      localStorage.setItem(LS_KEYS.USER_ID, fullProfile.userId);
      localStorage.setItem(LS_KEYS.USER_NAME, fullProfile.name);
      localStorage.setItem(LS_KEYS.USER_EMAIL, fullProfile.email);
      localStorage.setItem(LS_KEYS.IS_GOOGLE, String(fullProfile.isGoogleBound));
      if (fullProfile.householdId) {
        localStorage.setItem('gorago_householdId', fullProfile.householdId);
      }
    } catch (e) {
      console.warn('LocalStorage save warning:', e);
    }
  }

  // 2. Persist to IndexedDB
  try {
    const db = await openSecurityDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = { id: PROFILE_KEY, ...fullProfile };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB save warning (cached in LocalStorage):', err);
  }
}

/**
 * Retrieve security profile from IndexedDB with fallback to LocalStorage
 */
export async function getLocalSecurityProfile(): Promise<SecurityProfile | null> {
  try {
    const db = await openSecurityDB();
    const result = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(PROFILE_KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (result) {
      const { id, ...profile } = result;
      return profile as SecurityProfile;
    }
  } catch (err) {
    console.warn('IndexedDB read failed, falling back to LocalStorage:', err);
  }

  // Fallback to LocalStorage
  const sync = getSyncSecurityState();
  if (sync.hasPin && sync.userId) {
    return {
      userId: sync.userId,
      name: sync.name || 'GoraGo User',
      email: sync.email || '',
      pinHash: sync.pinHash,
      hasPin: true,
      isGoogleBound: localStorage.getItem(LS_KEYS.IS_GOOGLE) === 'true',
      updatedAt: Date.now(),
    };
  }

  return null;
}

/**
 * Verify an entered 4-digit PIN against stored hash or direct PIN
 */
export async function verifySecurityPin(enteredPin: string): Promise<boolean> {
  const cleanPin = enteredPin.trim();
  if (cleanPin.length !== 4) return false;

  const enteredHash = await hashPin(cleanPin);

  // Check from LocalStorage first for instant response
  const storedHash = localStorage.getItem(LS_KEYS.PIN_HASH);
  if (storedHash && storedHash === enteredHash) {
    setSessionUnlocked(true);
    return true;
  }

  // Check from IndexedDB
  const profile = await getLocalSecurityProfile();
  if (profile?.pinHash && profile.pinHash === enteredHash) {
    // Sync to LocalStorage if missing
    localStorage.setItem(LS_KEYS.PIN_HASH, profile.pinHash);
    localStorage.setItem(LS_KEYS.HAS_PIN, 'true');
    setSessionUnlocked(true);
    return true;
  }

  return false;
}

/**
 * Update the 4-digit PIN for the active profile
 */
export async function updateLocalSecurityPin(newPin: string): Promise<void> {
  const pinHash = await hashPin(newPin.trim());
  const existing = await getLocalSecurityProfile();

  const updated: Omit<SecurityProfile, 'updatedAt'> = {
    userId: existing?.userId || localStorage.getItem(LS_KEYS.USER_ID) || 'u_local_' + Date.now(),
    name: existing?.name || localStorage.getItem(LS_KEYS.USER_NAME) || 'GoraGo User',
    email: existing?.email || localStorage.getItem(LS_KEYS.USER_EMAIL) || '',
    pinHash,
    hasPin: true,
    isGoogleBound: existing?.isGoogleBound ?? (localStorage.getItem(LS_KEYS.IS_GOOGLE) === 'true'),
    linkedGoogleEmail: existing?.linkedGoogleEmail,
    householdId: existing?.householdId || localStorage.getItem('gorago_householdId') || 'h_sample',
    avatar: existing?.avatar,
  };

  await saveLocalSecurityProfile(updated);
  setSessionUnlocked(true);
}

/**
 * Session unlock state helpers
 */
export function setSessionUnlocked(unlocked: boolean): void {
  if (typeof window === 'undefined') return;
  if (unlocked) {
    sessionStorage.setItem(LS_KEYS.SESSION_UNLOCKED, 'true');
  } else {
    sessionStorage.removeItem(LS_KEYS.SESSION_UNLOCKED);
  }
}

export function isSessionUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(LS_KEYS.SESSION_UNLOCKED) === 'true';
}

/**
 * Lock the app immediately (forces PIN screen)
 */
export function lockAppNow(): void {
  setSessionUnlocked(false);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('gorago_lock_app'));
  }
}

/**
 * Reset security profile (e.g. for complete logout or account switch)
 */
export async function clearLocalSecurityProfile(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LS_KEYS.HAS_PIN);
    localStorage.removeItem(LS_KEYS.PIN_HASH);
    localStorage.removeItem(LS_KEYS.USER_ID);
    localStorage.removeItem(LS_KEYS.USER_NAME);
    localStorage.removeItem(LS_KEYS.USER_EMAIL);
    localStorage.removeItem(LS_KEYS.IS_GOOGLE);
    sessionStorage.removeItem(LS_KEYS.SESSION_UNLOCKED);
  }

  try {
    const db = await openSecurityDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(PROFILE_KEY);
  } catch (err) {
    console.warn('Error clearing IndexedDB security store:', err);
  }
}
