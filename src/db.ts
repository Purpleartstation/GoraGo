import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import type { CollectionReference, DocumentData } from 'firebase/firestore';
import { db as firestoreDb } from './firebase';

export type AccountType = 'bank' | 'ewallet' | 'cash';
export type TransactionType = 'income' | 'expense' | 'transfer';
export type RuleFrequency = 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'custom';
export type BillStatus = 'upcoming' | 'due-soon' | 'overdue' | 'paid';

export interface User {
  id: string;
  name: string;
  avatar?: string;
  hasPin: boolean;
  pin?: string;
  email?: string;
  password?: string;
  householdId?: string;
}

export interface Household {
  id: string;
  name: string;
  type: 'solo' | 'partner' | 'family';
  memberIds: string[];
}

export interface Account {
  id: string;
  householdId: string;
  ownerId: string | null; // null if shared
  name: string;
  type: AccountType;
  institution: string;
  balance: number;
  color: string;
  icon?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  type: 'income' | 'expense' | 'transfer';
  color?: string;
  householdId: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId?: string;
  amount: number;
  type: TransactionType;
  note: string;
  date: number; // timestamp
  recurringRuleId?: string;
  targetAccountId?: string; // for transfers
  householdId: string;
}

export interface RecurringRule {
  id: string;
  accountId: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId?: string;
  amount: number;
  frequency: RuleFrequency;
  nextRunDate: number;
  variableAmountFlag: boolean;
  note: string;
  targetAccountId?: string; // for transfers
  householdId: string;
}

export interface Bill {
  id: string;
  name: string;
  accountId: string;
  amount: number;
  dueDay: number; // 1-31 — used for monthly mode
  dueType?: 'monthly' | 'specific'; // monthly = auto-recur on same day, specific = custom list of dates
  specificDates?: number[]; // list of timestamps; used when dueType === 'specific'
  status: BillStatus;
  recurringRuleId?: string;
  lastPaidDate?: number;
  timesRecurred?: number;
  householdId: string;
}

export interface Debt {
  id: string;
  name: string;
  lender: string;
  originalAmount: number;
  remainingBalance: number;
  interestRate?: number;
  installmentAmount: number;
  dueDay: number; // 1-31
  payoffStrategy: 'snowball' | 'avalanche';
  householdId: string;
}

export interface NotificationMsg {
  id: string;
  userId: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: number;
}

// Export Firestore instance as db to minimize import changes
export const db = firestoreDb;

const createCollection = <T = DocumentData>(path: string) => {
  return collection(db, path) as CollectionReference<T>;
};

// Collection helpers with typed refs
export const collections = {
  users: createCollection<User>('users'),
  households: createCollection<Household>('households'),
  accounts: createCollection<Account>('accounts'),
  categories: createCollection<Category>('categories'),
  transactions: createCollection<Transaction>('transactions'),
  recurringRules: createCollection<RecurringRule>('recurringRules'),
  bills: createCollection<Bill>('bills'),
  debts: createCollection<Debt>('debts'),
  notifications: createCollection<NotificationMsg>('notifications'),
};

// Create or update a user profile from Google Auth
export async function ensureUserProfile(firebaseUser: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): Promise<User> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    // User exists, return their data
    return userSnap.data() as User;
  }
  
  // New user — create profile
  const newUser: User = {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || 'User',
    email: firebaseUser.email || '',
    avatar: firebaseUser.photoURL || '',
    hasPin: false,
  };
  await setDoc(userRef, newUser);
  return newUser;
}

// Create a new household and assign the user to it
export async function createHousehold(userId: string, householdName: string): Promise<string> {
  const householdId = 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  
  await setDoc(doc(db, 'households', householdId), {
    id: householdId,
    name: householdName,
    type: 'partner',
    memberIds: [userId],
  });
  
  // Update user with householdId
  await setDoc(doc(db, 'users', userId), { householdId }, { merge: true });
  
  // Seed default categories for this household
  await ensureDefaultCategories(householdId);
  
  return householdId;
}

// Join an existing household by its ID
export async function joinHousehold(userId: string, householdId: string): Promise<boolean> {
  const householdRef = doc(db, 'households', householdId);
  const householdSnap = await getDoc(householdRef);
  
  if (!householdSnap.exists()) {
    return false; // Household not found
  }
  
  const household = householdSnap.data() as Household;
  
  // Add user to household members if not already there
  if (!household.memberIds.includes(userId)) {
    household.memberIds.push(userId);
    await setDoc(householdRef, { memberIds: household.memberIds }, { merge: true });
  }
  
  // Update user with householdId
  await setDoc(doc(db, 'users', userId), { householdId }, { merge: true });
  
  // Also ensure default categories exist for them just in case
  await ensureDefaultCategories(householdId);
  
  return true;
}

// Seed default expense/income categories
export async function ensureDefaultCategories(householdId: string) {
  const cats = [
    { id: `cat_food_${householdId}`, name: 'Food', icon: 'utensils', type: 'expense', color: '#F59E0B', householdId },
    { id: `cat_transpo_${householdId}`, name: 'Transport', icon: 'bus', type: 'expense', color: '#3B82F6', householdId },
    { id: `cat_bills_${householdId}`, name: 'Bills', icon: 'receipt', type: 'expense', color: '#EF4444', householdId },
    { id: `cat_salary_${householdId}`, name: 'Salary', icon: 'briefcase', type: 'income', color: '#10B981', householdId },
    { id: `cat_transfer_${householdId}`, name: 'Transfer', icon: 'arrow-right-left', type: 'transfer', color: '#818CF8', householdId },
    { id: `cat_shopping_${householdId}`, name: 'Shopping', icon: 'shopping-bag', type: 'expense', color: '#EC4899', householdId },
    { id: `cat_entertainment_${householdId}`, name: 'Entertainment', icon: 'film', type: 'expense', color: '#8B5CF6', householdId },
    { id: `cat_health_${householdId}`, name: 'Health', icon: 'heart', type: 'expense', color: '#EF4444', householdId },
  ];
  
  for (const cat of cats) {
    const ref = doc(db, 'categories', cat.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, cat);
    }
  }
}

import { getDocs, query, where, writeBatch } from 'firebase/firestore';

export async function wipeHouseholdData(householdId: string) {
  if (!householdId) return;
  const collectionsToWipe = ['transactions', 'bills', 'debts', 'categories', 'accounts', 'recurringRules'];
  
  const batch = writeBatch(db);
  let opCount = 0;

  for (const collName of collectionsToWipe) {
    const q = query(collection(db, collName), where('householdId', '==', householdId));
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(d => {
      batch.delete(d.ref);
      opCount++;
    });
  }
  
  if (opCount > 0) {
    await batch.commit();
  }
  
  // re-seed categories after wipe
  await ensureDefaultCategories(householdId);
}
