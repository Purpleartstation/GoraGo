import { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, getDocs, query, where, writeBatch, onSnapshot } from 'firebase/firestore';
import type { CollectionReference, DocumentData } from 'firebase/firestore';
import { db as firestoreDb } from './firebase';
import { useSyncExternalStore, useCallback } from 'react';
import { getCalendarToken, createMonthlyRecurringEvent, updateCalendarEvent, deleteCalendarEvent } from './utils/googleCalendar';
import { sendPartnerNotification } from './utils/partnerNotification';
import {
  saveLocalSecurityProfile,
  getLocalSecurityProfile,
  verifySecurityPin,
  updateLocalSecurityPin,
  lockAppNow,
  getSyncSecurityState,
  hashPin,
  clearLocalSecurityProfile,
  isSessionUnlocked,
  setSessionUnlocked,
} from './utils/securityStore';
export type { SecurityProfile } from './utils/securityStore';
export {
  saveLocalSecurityProfile,
  getLocalSecurityProfile,
  verifySecurityPin,
  updateLocalSecurityPin,
  lockAppNow,
  getSyncSecurityState,
  hashPin,
  clearLocalSecurityProfile,
  isSessionUnlocked,
  setSessionUnlocked,
};

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
  pinHash?: string;
  email?: string;
  password?: string;
  householdId?: string;
  emergencyFundPin?: string;
  linkedGoogleEmail?: string;
  isGoogleBound?: boolean;
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
  ownerId: string | null;
  name: string;
  type: AccountType;
  institution: string;
  balance: number;
  color: string;
  icon?: string;
  isSystemDefault?: boolean;
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
  groceryListId?: string;
  groceryItems?: GroceryListItem[];
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
  endType?: string;
  targetAccountId?: string;
  householdId: string;
}

export interface Bill {
  id: string;
  name: string;
  accountId: string;
  amount: number;
  dueDay: number; // 1-31
  dueType?: 'monthly' | 'specific';
  specificDates?: number[];
  status: BillStatus;
  isVariableAmount?: boolean;
  variableAmountFlag?: boolean;
  recurringRuleId?: string;
  lastPaidDate?: number;
  timesRecurred?: number;
  householdId: string;
  googleCalendarEventId?: string;
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
  googleCalendarEventId?: string;
}

export interface NotificationMsg {
  id: string;
  userId: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: number;
}

export interface GroceryItem {
  id: string;
  householdId: string;
  name: string;
  lastUnitPrice: number;
  storeName?: string;
  lastUpdatedDate: number;
  category?: string;
}

export interface GroceryListItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceEstimate: number;
  actualUnitPrice?: number;
  storeName?: string;
  isPurchased?: boolean;
}

export interface GroceryList {
  id: string;
  householdId: string;
  title: string;
  status: 'active' | 'completed';
  items: GroceryListItem[];
  estimatedTotal: number;
  actualTotal?: number;
  createdAt: number;
  completedAt?: number;
  fundingAccountId?: string;
  receiptScanDate?: number;
  storeName?: string;
}

export interface GoalDeposit {
  id: string;
  amount: number;
  date: number; // timestamp
  sourceAccountId: string;
  sourceAccountName?: string;
  note?: string;
}

export type GoalCategory = 'savings' | 'purchase' | 'emergency_fund' | 'debt_payoff' | 'investment' | 'travel' | 'education' | 'other';

export interface Goal {
  id: string;
  householdId: string;
  title: string;
  category: GoalCategory;
  description?: string;
  targetDate: string; // YYYY-MM-DD
  targetAmount: number;
  currentAmount: number;
  initialDeposit?: number;
  linkedAccountId?: string;
  color?: string;
  icon?: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: number;
  completedAt?: number;
  scheduleFrequency?: 'daily' | 'weekly' | 'bimonthly' | 'monthly';
  scheduleAmount?: number;
  reminderBillId?: string;
  aiBreakdown?: {
    requiredDaily: number;
    requiredWeekly: number;
    requiredMonthly: number;
    requiredBiMonthly: number;
    feasibilityScore: number;
    feasibilityRating: 'High' | 'Moderate' | 'Challenging' | 'Aggressive';
    advice: string;
    scheduleProposed: string;
    activeTip: string;
  };
  deposits: GoalDeposit[];
}

// Export Firestore instance as db
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
  groceryItems: createCollection<GroceryItem>('groceryItems'),
  groceryLists: createCollection<GroceryList>('groceryLists'),
  goals: createCollection<Goal>('goals'),
};

// ─── Default Sample Data (Philippine Peso) ──────────────────────────────────
export const DEFAULT_EMERGENCY_FUND_ACCOUNT: Account = {
  id: 'acc_system_ef',
  householdId: 'h_sample',
  ownerId: null,
  name: 'Emergency Fund',
  type: 'bank',
  institution: 'GoraGo Safety Net',
  balance: 0,
  color: '#F59E0B',
  icon: 'shield-check',
  isSystemDefault: true,
};

const defaultAccounts: Account[] = [
  DEFAULT_EMERGENCY_FUND_ACCOUNT,
  { id: 'acc_1', householdId: 'h_sample', ownerId: null, name: 'BPI Checking', type: 'bank', institution: 'Bank of the Philippine Islands', balance: 45000, color: '#1e40af', icon: 'landmark' },
  { id: 'acc_2', householdId: 'h_sample', ownerId: null, name: 'GCash Wallet', type: 'ewallet', institution: 'Globe Fintech', balance: 12500, color: '#007DFE', icon: 'smartphone' },
  { id: 'acc_3', householdId: 'h_sample', ownerId: null, name: 'Cash on Hand', type: 'cash', institution: 'Physical Cash', balance: 3200, color: '#10B981', icon: 'wallet' },
  { id: 'acc_4', householdId: 'h_sample', ownerId: null, name: 'Maya Savings', type: 'ewallet', institution: 'Maya Philippines', balance: 28000, color: '#065f46', icon: 'smartphone' },
];

const defaultBills: Bill[] = [
  { id: 'bill_1', householdId: 'h_sample', name: 'Meralco Electricity', accountId: 'acc_1', amount: 3800, dueDay: 15, dueType: 'monthly', status: 'upcoming' },
  { id: 'bill_2', householdId: 'h_sample', name: 'PLDT Fiber Internet', accountId: 'acc_1', amount: 1699, dueDay: 20, dueType: 'monthly', status: 'upcoming' },
  { id: 'bill_3', householdId: 'h_sample', name: 'Condo Association Dues', accountId: 'acc_2', amount: 2500, dueDay: 28, dueType: 'monthly', status: 'due-soon' },
  { id: 'bill_4', householdId: 'h_sample', name: 'Manila Water', accountId: 'acc_1', amount: 850, dueDay: 8, dueType: 'monthly', status: 'upcoming' },
];

const defaultDebts: Debt[] = [
  { id: 'debt_1', householdId: 'h_sample', name: 'BDO Credit Card', lender: 'BDO Unibank', originalAmount: 25000, remainingBalance: 18500, interestRate: 3.0, installmentAmount: 3000, dueDay: 25, payoffStrategy: 'avalanche' },
  { id: 'debt_2', householdId: 'h_sample', name: 'SSS Salary Loan', lender: 'Social Security System', originalAmount: 15000, remainingBalance: 10000, interestRate: 10.0, installmentAmount: 1200, dueDay: 10, payoffStrategy: 'snowball' },
  { id: 'debt_3', householdId: 'h_sample', name: 'Pag-IBIG Multi-Purpose Loan', lender: 'HDMF Pag-IBIG', originalAmount: 30000, remainingBalance: 22000, interestRate: 10.5, installmentAmount: 1800, dueDay: 15, payoffStrategy: 'snowball' },
];

const defaultCategories: Category[] = [
  { id: 'cat_groceries', householdId: 'h_sample', name: 'Groceries', icon: 'shopping-cart', type: 'expense', color: '#10B981' },
  { id: 'cat_shopping', householdId: 'h_sample', name: 'Shopping', icon: 'shopping-bag', type: 'expense', color: '#EC4899' },
  { id: 'cat_food', householdId: 'h_sample', name: 'Food & Dining', icon: 'utensils', type: 'expense', color: '#F59E0B' },
  { id: 'cat_transpo', householdId: 'h_sample', name: 'Transport & Commute', icon: 'bus', type: 'expense', color: '#3B82F6' },
  { id: 'cat_bills', householdId: 'h_sample', name: 'Bills & Utilities', icon: 'receipt', type: 'expense', color: '#EF4444' },
  { id: 'cat_health', householdId: 'h_sample', name: 'Health & Medical', icon: 'heart', type: 'expense', color: '#8B5CF6' },
  { id: 'cat_salary', householdId: 'h_sample', name: 'Salary & Income', icon: 'briefcase', type: 'income', color: '#10B981' },
  { id: 'cat_freelance', householdId: 'h_sample', name: 'Freelance & Side Hustle', icon: 'laptop', type: 'income', color: '#059669' },
];

const defaultTransactions: Transaction[] = [
  { id: 'tx_1', householdId: 'h_sample', accountId: 'acc_1', categoryId: 'cat_salary', amount: 35000, type: 'income', note: 'Bi-monthly Salary', date: Date.now() - 86400000 * 3 },
  { id: 'tx_2', householdId: 'h_sample', accountId: 'acc_2', categoryId: 'cat_food', amount: 1250, type: 'expense', note: 'GrabFood delivery', date: Date.now() - 86400000 * 2 },
  { id: 'tx_3', householdId: 'h_sample', accountId: 'acc_1', categoryId: 'cat_transpo', amount: 450, type: 'expense', note: 'Gas & Express Tollways', date: Date.now() - 86400000 },
  { 
    id: 'tx_4', 
    householdId: 'h_sample', 
    accountId: 'acc_1', 
    categoryId: 'cat_groceries', 
    amount: 3420, 
    type: 'expense', 
    note: 'SM Supermarket Groceries', 
    date: Date.now() - 43200000,
    groceryItems: [
      { id: 'gli_s1', name: 'Jasmine Rice 5kg', quantity: 1, unitPriceEstimate: 295, actualUnitPrice: 295, storeName: 'SM Supermarket' },
      { id: 'gli_s2', name: 'Fresh Milk 1L', quantity: 3, unitPriceEstimate: 98, actualUnitPrice: 98, storeName: 'SM Supermarket' },
      { id: 'gli_s3', name: 'Chicken Breast 2kg', quantity: 2, unitPriceEstimate: 240, actualUnitPrice: 245, storeName: 'SM Supermarket' },
      { id: 'gli_s4', name: 'Large Eggs 12s', quantity: 2, unitPriceEstimate: 115, actualUnitPrice: 115, storeName: 'SM Supermarket' },
      { id: 'gli_s5', name: 'Cooking Oil 1L', quantity: 2, unitPriceEstimate: 85, actualUnitPrice: 85, storeName: 'SM Supermarket' },
      { id: 'gli_s6', name: 'Instant Coffee 200g', quantity: 2, unitPriceEstimate: 180, actualUnitPrice: 180, storeName: 'SM Supermarket' },
      { id: 'gli_s7', name: 'White Onions 1kg', quantity: 2, unitPriceEstimate: 120, actualUnitPrice: 120, storeName: 'SM Supermarket' },
      { id: 'gli_s8', name: 'Garlic 500g', quantity: 2, unitPriceEstimate: 65, actualUnitPrice: 65, storeName: 'SM Supermarket' },
      { id: 'gli_s9', name: 'Pork Chops 1kg', quantity: 2, unitPriceEstimate: 280, actualUnitPrice: 285, storeName: 'SM Supermarket' },
      { id: 'gli_s10', name: 'Pantry Toiletries', quantity: 1, unitPriceEstimate: 336, actualUnitPrice: 336, storeName: 'SM Supermarket' }
    ]
  },
  // Historical recurring transactions for 30-90 day detector analysis
  { id: 'tx_sub_nf_1', householdId: 'h_sample', accountId: 'acc_1', categoryId: 'cat_bills', amount: 549, type: 'expense', note: 'NETFLIX.COM PAYMENT #9281', date: Date.now() - 86400000 * 28 },
  { id: 'tx_sub_nf_2', householdId: 'h_sample', accountId: 'acc_1', categoryId: 'cat_bills', amount: 549, type: 'expense', note: 'NETFLIX.COM PAYMENT #4102', date: Date.now() - 86400000 * 58 },
  { id: 'tx_sub_sp_1', householdId: 'h_sample', accountId: 'acc_2', categoryId: 'cat_bills', amount: 149, type: 'expense', note: 'SPOTIFY AB PREM 08/26', date: Date.now() - 86400000 * 25 },
  { id: 'tx_sub_sp_2', householdId: 'h_sample', accountId: 'acc_2', categoryId: 'cat_bills', amount: 149, type: 'expense', note: 'SPOTIFY AB PREM 07/26', date: Date.now() - 86400000 * 55 },
  { id: 'tx_sub_sp_3', householdId: 'h_sample', accountId: 'acc_2', categoryId: 'cat_bills', amount: 149, type: 'expense', note: 'SPOTIFY AB PREM 06/26', date: Date.now() - 86400000 * 85 },
  { id: 'tx_sub_ai_1', householdId: 'h_sample', accountId: 'acc_1', categoryId: 'cat_bills', amount: 1150, type: 'expense', note: 'OPENAI *CHATGPT SUBSCRIPTION', date: Date.now() - 86400000 * 30 },
  { id: 'tx_sub_ai_2', householdId: 'h_sample', accountId: 'acc_1', categoryId: 'cat_bills', amount: 1150, type: 'expense', note: 'OPENAI *CHATGPT SUBSCRIPTION', date: Date.now() - 86400000 * 60 },
];

const defaultGroceryItems: GroceryItem[] = [
  { id: 'gi_1', householdId: 'h_sample', name: 'Jasmine Rice 5kg', lastUnitPrice: 295, storeName: 'SM Supermarket', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Pantry' },
  { id: 'gi_2', householdId: 'h_sample', name: 'Fresh Milk 1L', lastUnitPrice: 98, storeName: 'Puregold', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Dairy' },
  { id: 'gi_3', householdId: 'h_sample', name: 'Large Eggs 12s', lastUnitPrice: 115, storeName: 'Robinsons', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Fresh Produce' },
  { id: 'gi_4', householdId: 'h_sample', name: 'Chicken Breast 1kg', lastUnitPrice: 240, storeName: 'SM Supermarket', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Meat & Poultry' },
  { id: 'gi_5', householdId: 'h_sample', name: 'Cooking Oil 1L', lastUnitPrice: 85, storeName: 'Puregold', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Pantry' },
  { id: 'gi_6', householdId: 'h_sample', name: 'White Onions 1kg', lastUnitPrice: 120, storeName: 'Local Market', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Fresh Produce' },
  { id: 'gi_7', householdId: 'h_sample', name: 'Garlic 500g', lastUnitPrice: 65, storeName: 'Local Market', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Fresh Produce' },
  { id: 'gi_8', householdId: 'h_sample', name: 'Instant Coffee 200g', lastUnitPrice: 180, storeName: 'SM Supermarket', lastUpdatedDate: Date.now() - 86400000 * 5, category: 'Beverage' },
];

const defaultGroceryLists: GroceryList[] = [
  {
    id: 'glist_sample_1',
    householdId: 'h_sample',
    title: 'Weekly Family Groceries',
    status: 'active',
    items: [
      { id: 'gli_1', name: 'Jasmine Rice 5kg', quantity: 1, unitPriceEstimate: 295, storeName: 'SM Supermarket' },
      { id: 'gli_2', name: 'Fresh Milk 1L', quantity: 2, unitPriceEstimate: 98, storeName: 'Puregold' },
      { id: 'gli_3', name: 'Large Eggs 12s', quantity: 1, unitPriceEstimate: 115, storeName: 'Robinsons' },
      { id: 'gli_4', name: 'Chicken Breast 1kg', quantity: 2, unitPriceEstimate: 240, storeName: 'SM Supermarket' },
      { id: 'gli_5', name: 'Cooking Oil 1L', quantity: 1, unitPriceEstimate: 85, storeName: 'Puregold' },
    ],
    estimatedTotal: 1171,
    createdAt: Date.now() - 86400000 * 2,
    storeName: 'SM Supermarket',
  }
];

const defaultGoals: Goal[] = [
  {
    id: 'goal_sample_ef',
    householdId: 'h_sample',
    title: 'Emergency Fund Buffer (3 Months)',
    category: 'emergency_fund',
    description: 'Liquid safety cushion in Maya/BPI for unforeseen family emergencies',
    targetDate: '2026-12-31',
    targetAmount: 50000,
    currentAmount: 20000,
    color: '#F59E0B',
    icon: 'shield-check',
    status: 'active',
    createdAt: Date.now() - 30 * 86400000,
    scheduleFrequency: 'bimonthly',
    scheduleAmount: 2500,
    aiBreakdown: {
      requiredDaily: 254,
      requiredWeekly: 1778,
      requiredMonthly: 7692,
      requiredBiMonthly: 3846,
      feasibilityScore: 92,
      feasibilityRating: 'High',
      advice: 'Targeting ₱7,692/month uses only ~25% of your monthly surplus. This is very sustainable.',
      scheduleProposed: 'Deposit ₱3,846 every 15th and 30th',
      activeTip: 'Deposit ₱254 today or ₱3,846 on your 15th payroll to stay ahead of schedule!',
    },
    deposits: [
      { id: 'dep_1', amount: 10000, date: Date.now() - 25 * 86400000, sourceAccountId: 'acc_1', sourceAccountName: 'BPI Checking', note: 'Initial Goal Allocation' },
      { id: 'dep_2', amount: 5000, date: Date.now() - 15 * 86400000, sourceAccountId: 'acc_4', sourceAccountName: 'Maya Savings', note: 'Mid-month Payroll Transfer' },
      { id: 'dep_3', amount: 5000, date: Date.now() - 3 * 86400000, sourceAccountId: 'acc_2', sourceAccountName: 'GCash Wallet', note: 'Side Hustle Savings' },
    ]
  },
  {
    id: 'goal_sample_trip',
    householdId: 'h_sample',
    title: 'Japan Winter Holiday 2027',
    category: 'travel',
    description: 'Flights, accommodations, and JR Pass for Tokyo and Hokkaido trip',
    targetDate: '2027-01-15',
    targetAmount: 75000,
    currentAmount: 22500,
    color: '#8B5CF6',
    icon: 'plane',
    status: 'active',
    createdAt: Date.now() - 20 * 86400000,
    scheduleFrequency: 'monthly',
    scheduleAmount: 5000,
    aiBreakdown: {
      requiredDaily: 395,
      requiredWeekly: 2763,
      requiredMonthly: 11932,
      requiredBiMonthly: 5966,
      feasibilityScore: 88,
      feasibilityRating: 'Moderate',
      advice: 'Saving ₱5,966 every 15th & 30th protects your travel fund without needing credit cards.',
      scheduleProposed: 'Deposit ₱5,966 every 15th and 30th',
      activeTip: 'Lock in ₱5,966 on payday to keep this trip 100% debt-free!',
    },
    deposits: [
      { id: 'dep_t1', amount: 15000, date: Date.now() - 18 * 86400000, sourceAccountId: 'acc_1', sourceAccountName: 'BPI Checking', note: 'Bonus Allocation' },
      { id: 'dep_t2', amount: 7500, date: Date.now() - 5 * 86400000, sourceAccountId: 'acc_4', sourceAccountName: 'Maya Savings', note: 'Monthly Goal Deposit' },
    ]
  }
];

// ─── Reactive Local Store Engine ─────────────────────────────────────────────
interface LocalDataStore {
  accounts: Account[];
  bills: Bill[];
  debts: Debt[];
  categories: Category[];
  transactions: Transaction[];
  recurringRules: RecurringRule[];
  groceryItems: GroceryItem[];
  groceryLists: GroceryList[];
  goals: Goal[];
  users: Record<string, User>;
  usersList: User[];
  households: Record<string, Household>;
  householdsList: Household[];
  docMap: Record<string, any>;
}

function rebuildCachedStructures(store: Partial<LocalDataStore>): void {
  store.usersList = Object.values(store.users || {});
  store.householdsList = Object.values(store.households || {});
  
  const map: Record<string, any> = {};
  (store.accounts || []).forEach(a => { map[`accounts:${a.id}`] = a; });
  (store.bills || []).forEach(b => { map[`bills:${b.id}`] = b; });
  (store.debts || []).forEach(d => { map[`debts:${d.id}`] = d; });
  (store.categories || []).forEach(c => { map[`categories:${c.id}`] = c; });
  (store.transactions || []).forEach(t => { map[`transactions:${t.id}`] = t; });
  (store.recurringRules || []).forEach(r => { map[`recurringRules:${r.id}`] = r; });
  (store.groceryItems || []).forEach(gi => { map[`groceryItems:${gi.id}`] = gi; });
  (store.groceryLists || []).forEach(gl => { map[`groceryLists:${gl.id}`] = gl; });
  (store.goals || []).forEach(g => { map[`goals:${g.id}`] = g; });
  Object.values(store.users || {}).forEach(u => { map[`users:${u.id}`] = u; });
  Object.values(store.households || {}).forEach(h => { map[`households:${h.id}`] = h; });
  store.docMap = map;
}

function loadInitialStore(): LocalDataStore {
  if (typeof window === 'undefined') {
    const s: Partial<LocalDataStore> = {
      accounts: defaultAccounts,
      bills: defaultBills,
      debts: defaultDebts,
      categories: defaultCategories,
      transactions: defaultTransactions,
      recurringRules: [],
      groceryItems: defaultGroceryItems,
      groceryLists: defaultGroceryLists,
      goals: defaultGoals,
      users: {},
      households: {},
    };
    rebuildCachedStructures(s);
    return s as LocalDataStore;
  }

  const isWiped = localStorage.getItem('gorago_is_wiped') === 'true';

  const getItem = <T>(key: string, def: T): T => {
    try {
      const raw = localStorage.getItem(`gorago_${key}`);
      if (raw !== null) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return isWiped ? ([] as unknown as T) : def;
  };

  const initialTransactions = isWiped 
    ? getItem<Transaction[]>('transactions', [])
    : getItem<Transaction[]>('transactions', defaultTransactions);

  const initialCategories = isWiped
    ? getItem<Category[]>('categories', [])
    : getItem<Category[]>('categories', defaultCategories);

  let loadedAccounts = isWiped ? getItem<Account[]>('accounts', []) : getItem<Account[]>('accounts', defaultAccounts);
  // Ensure Emergency Fund account always exists and has system default flags
  const efIndex = loadedAccounts.findIndex(a => a.isSystemDefault || a.id === 'acc_system_ef');
  if (efIndex === -1) {
    loadedAccounts = [{ ...DEFAULT_EMERGENCY_FUND_ACCOUNT, householdId: 'h_sample', balance: 0 }, ...loadedAccounts];
    if (typeof window !== 'undefined') localStorage.setItem('gorago_accounts', JSON.stringify(loadedAccounts));
  } else {
    loadedAccounts[efIndex] = {
      ...DEFAULT_EMERGENCY_FUND_ACCOUNT,
      ...loadedAccounts[efIndex],
      isSystemDefault: true,
    };
  }

  const s: Partial<LocalDataStore> = {
    accounts: loadedAccounts,
    bills: isWiped ? getItem('bills', []) : getItem('bills', defaultBills),
    debts: isWiped ? getItem('debts', []) : getItem('debts', defaultDebts),
    categories: initialCategories,
    transactions: initialTransactions,
    recurringRules: getItem('recurringRules', []),
    groceryItems: isWiped ? getItem('groceryItems', []) : getItem('groceryItems', defaultGroceryItems),
    groceryLists: isWiped ? getItem('groceryLists', []) : getItem('groceryLists', defaultGroceryLists),
    goals: isWiped ? getItem('goals', []) : getItem('goals', defaultGoals),
    users: getItem('users', {}),
    households: getItem('households', {}),
  };
  rebuildCachedStructures(s);
  return s as LocalDataStore;
}

let localStore: LocalDataStore = loadInitialStore();
const listeners = new Set<() => void>();

// Real-time cross-tab and cross-window sync channel for connected partners
const partnerBroadcastChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('gorago_partner_sync')
  : null;

if (partnerBroadcastChannel) {
  partnerBroadcastChannel.onmessage = (event) => {
    if (event.data?.type === 'GORAGO_SYNC_PULSE') {
      try {
        localStore = loadInitialStore();
        rebuildCachedStructures(localStore);
        listeners.forEach(fn => fn());
      } catch (err) {
        console.warn('Sync pulse error:', err);
      }
    }
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('gorago_')) {
      try {
        localStore = loadInitialStore();
        rebuildCachedStructures(localStore);
        listeners.forEach(fn => fn());
      } catch (err) {
        console.warn('Storage sync error:', err);
      }
    }
  });
}

/**
 * Dispatches real-time partner sync event across tabs/windows and
 * automatically triggers an email notification to connected partners.
 */
export function notifyConnectedPartners(
  householdId: string,
  eventType: 'transaction' | 'bill' | 'loan' | 'transfer' | 'account',
  title: string,
  amount?: number,
  action: 'created' | 'updated' | 'paid' | 'transferred' | 'withdrawn' | 'deposited' = 'created',
  note?: string
): void {
  if (typeof window === 'undefined') return;

  // 1. Broadcast immediate pulse to partner tabs/windows
  partnerBroadcastChannel?.postMessage({
    type: 'GORAGO_SYNC_PULSE',
    householdId,
    timestamp: Date.now(),
  });

  // 2. Identify household and partner members for email alerts
  const household = localStore.households[householdId];
  if (!household || !household.memberIds || household.memberIds.length <= 1) return;

  // Retrieve current active user
  const currentUserId = localStorage.getItem('gorago_current_user_id') || '';
  const currentUser = localStore.users[currentUserId] || Object.values(localStore.users)[0];
  const senderName = currentUser?.name || 'Your Partner';
  const senderEmail = currentUser?.email || 'user@gorago.app';

  // Send automatic email notification to each connected partner
  household.memberIds.forEach((memberId) => {
    if (memberId !== currentUserId) {
      const partner = localStore.users[memberId];
      if (partner?.email) {
        sendPartnerNotification({
          senderName,
          senderEmail,
          partnerEmail: partner.email,
          eventType,
          title,
          amount,
          action,
          note,
        });

        // Add in-app notification entry
        const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const notif: NotificationMsg = {
          id: notifId,
          userId: memberId,
          message: `${senderName} ${action} ${eventType}: "${title}"${amount !== undefined ? ` (₱${amount.toLocaleString()})` : ''}`,
          type: eventType,
          read: false,
          createdAt: Date.now(),
        };

        try {
          setDoc(doc(db, 'notifications', notifId), notif);
        } catch {
          // ignore
        }
      }
    }
  });
}

function notifyStoreChange() {
  rebuildCachedStructures(localStore);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('gorago_accounts', JSON.stringify(localStore.accounts));
      localStorage.setItem('gorago_bills', JSON.stringify(localStore.bills));
      localStorage.setItem('gorago_debts', JSON.stringify(localStore.debts));
      localStorage.setItem('gorago_categories', JSON.stringify(localStore.categories));
      localStorage.setItem('gorago_transactions', JSON.stringify(localStore.transactions));
      localStorage.setItem('gorago_recurringRules', JSON.stringify(localStore.recurringRules));
      localStorage.setItem('gorago_groceryItems', JSON.stringify(localStore.groceryItems));
      localStorage.setItem('gorago_groceryLists', JSON.stringify(localStore.groceryLists));
      localStorage.setItem('gorago_goals', JSON.stringify(localStore.goals));
      localStorage.setItem('gorago_users', JSON.stringify(localStore.users));
      localStorage.setItem('gorago_households', JSON.stringify(localStore.households));
    } catch {
      // quota or private browsing
    }
    partnerBroadcastChannel?.postMessage({
      type: 'GORAGO_SYNC_PULSE',
      timestamp: Date.now(),
    });
  }
  listeners.forEach(fn => fn());
}

function subscribeToStore(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

const EMPTY_COLLECTION: any[] = Object.freeze([]);

function getCollectionSnapshot(collectionName: string): any[] {
  if (collectionName === 'accounts') return localStore.accounts;
  if (collectionName === 'bills') return localStore.bills;
  if (collectionName === 'debts') return localStore.debts;
  if (collectionName === 'categories') return localStore.categories;
  if (collectionName === 'transactions') return localStore.transactions;
  if (collectionName === 'recurringRules') return localStore.recurringRules;
  if (collectionName === 'groceryItems') return localStore.groceryItems;
  if (collectionName === 'groceryLists') return localStore.groceryLists;
  if (collectionName === 'goals') return localStore.goals;
  if (collectionName === 'users') return localStore.usersList;
  if (collectionName === 'households') return localStore.householdsList;
  return EMPTY_COLLECTION;
}

function getDocumentSnapshot(collectionName: string, docId?: string | null): any {
  if (!docId) return undefined;
  return localStore.docMap[`${collectionName}:${docId}`];
}

let syncUnsubscribes: (() => void)[] = [];
let currentSyncHouseholdId: string | null = null;

export function enableRealtimeSync(householdId: string) {
  if (currentSyncHouseholdId === householdId) return; // Already syncing this household
  
  // Unsubscribe from previous household listeners if any
  syncUnsubscribes.forEach(unsub => unsub());
  syncUnsubscribes = [];
  currentSyncHouseholdId = householdId;

  if (typeof window === 'undefined') return;

  const collectionsToSync = [
    { name: 'accounts', ref: collections.accounts },
    { name: 'bills', ref: collections.bills },
    { name: 'debts', ref: collections.debts },
    { name: 'categories', ref: collections.categories },
    { name: 'transactions', ref: collections.transactions },
    { name: 'recurringRules', ref: collections.recurringRules },
    { name: 'groceryItems', ref: collections.groceryItems },
    { name: 'groceryLists', ref: collections.groceryLists },
    { name: 'goals', ref: collections.goals },
  ];

  collectionsToSync.forEach(({ name, ref }) => {
    // Basic query for items matching householdId
    // Some models like accounts/categories might use householdId, some might use other fields, 
    // but in this data model, all those collections have `householdId`.
    const q = query(ref, where('householdId', '==', householdId));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      // Direct assignment into localStore based on collection name
      (localStore as any)[name] = data;
      notifyStoreChange();
    }, (error) => {
      console.warn(`Realtime sync error for ${name}:`, error);
    });
    
    syncUnsubscribes.push(unsub);
  });
}

// ─── Universal Safe Reactive Hooks ──────────────────────────────────────────

/**
 * Universal hook that reads from reactive store with zero permission errors
 * and strictly caches snapshots to eliminate React render loops.
 */
export function useSafeCollectionData<T>(_queryRef: any, collectionName: string): [T[], boolean, any] {
  const getSnapshot = useCallback(() => {
    return getCollectionSnapshot(collectionName) as unknown as T[];
  }, [collectionName]);

  const storeData = useSyncExternalStore(
    subscribeToStore,
    getSnapshot,
    getSnapshot
  );

  return [storeData, false, undefined];
}

/**
 * Universal hook for reading a single document safely
 */
export function useSafeDocumentData<T>(_docRef: any, collectionName: string, docId?: string | null): [T | undefined, boolean, any] {
  const getSnapshot = useCallback(() => {
    return getDocumentSnapshot(collectionName, docId) as unknown as T | undefined;
  }, [collectionName, docId]);

  const item = useSyncExternalStore(
    subscribeToStore,
    getSnapshot,
    getSnapshot
  );

  return [item, false, undefined];
}

// ─── CRUD Operations with Instant Reactive Persistence ──────────────────────

export async function saveAccount(account: Account): Promise<void> {
  const idx = localStore.accounts.findIndex(a => a.id === account.id);
  if (idx >= 0) {
    localStore.accounts[idx] = account;
  } else {
    localStore.accounts = [account, ...localStore.accounts];
  }
  notifyStoreChange();
  notifyConnectedPartners(account.householdId, 'account', account.name, account.balance, 'updated');

  try {
    await setDoc(doc(db, 'accounts', account.id), account);
  } catch (err: any) {
    console.warn("Firestore sync notice (saved locally):", err?.message || err);
  }
}

export async function deleteAccount(accountId: string): Promise<void> {
  const targetAcc = localStore.accounts.find(a => a.id === accountId);
  if (targetAcc?.isSystemDefault || accountId === 'acc_system_ef') {
    // Preserve the system emergency fund and reset its balance to 0 instead of deleting
    targetAcc.balance = 0;
    notifyStoreChange();
    try {
      await setDoc(doc(db, 'accounts', accountId), { ...targetAcc, balance: 0 }, { merge: true });
    } catch {
      // ignore
    }
    return;
  }

  localStore.accounts = localStore.accounts.filter(a => a.id !== accountId);
  localStore.transactions = localStore.transactions.filter(t => t.accountId !== accountId && t.targetAccountId !== accountId);
  notifyStoreChange();

  try {
    const txQuery = query(collections.transactions, where('accountId', '==', accountId));
    const txSnap = await getDocs(txQuery);
    const batch = writeBatch(db);
    txSnap.forEach((d) => {
      batch.delete(d.ref);
    });
    batch.delete(doc(db, 'accounts', accountId));
    await batch.commit();
  } catch (err: any) {
    console.warn("Firestore sync notice (deleted locally):", err?.message || err);
  }
}

export async function saveTransaction(transaction: Transaction): Promise<void> {
  // Update account balance
  const account = localStore.accounts.find(a => a.id === transaction.accountId);
  let newBalance = account?.balance;
  if (account) {
    if (transaction.type === 'income') {
      account.balance += transaction.amount;
    } else if (transaction.type === 'expense') {
      account.balance -= transaction.amount;
    }
    newBalance = account.balance;
  }

  // Insert or update transaction
  const idx = localStore.transactions.findIndex(t => t.id === transaction.id);
  if (idx >= 0) {
    localStore.transactions[idx] = transaction;
  } else {
    localStore.transactions = [transaction, ...localStore.transactions];
  }
  notifyStoreChange();
  notifyConnectedPartners(
    transaction.householdId,
    'transaction',
    transaction.note || 'Transaction',
    transaction.amount,
    transaction.type === 'expense' ? 'logged' : 'recorded',
    transaction.note
  );

  try {
    await setDoc(doc(db, 'transactions', transaction.id), transaction);
    if (account && newBalance !== undefined) {
      await updateDoc(doc(db, 'accounts', transaction.accountId), { balance: newBalance });
    }
  } catch (err: any) {
    console.warn("Firestore sync notice (saved locally):", err?.message || err);
  }
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const tx = localStore.transactions.find(t => t.id === transactionId);
  if (tx) {
    // Revert account balance
    const account = localStore.accounts.find(a => a.id === tx.accountId);
    let newBalance = account?.balance;
    if (account) {
      if (tx.type === 'income') {
        account.balance -= tx.amount;
      } else if (tx.type === 'expense') {
        account.balance += tx.amount;
      }
      newBalance = account.balance;
    }

    localStore.transactions = localStore.transactions.filter(t => t.id !== transactionId);
    notifyStoreChange();

    try {
      await deleteDoc(doc(db, 'transactions', transactionId));
      if (account && newBalance !== undefined) {
        await updateDoc(doc(db, 'accounts', tx.accountId), { balance: newBalance });
      }
    } catch (err: any) {
      console.warn("Firestore sync notice (deleted locally):", err?.message || err);
    }
  }
}

export async function saveTransfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  note?: string,
  householdId?: string
): Promise<void> {
  const fromAcc = localStore.accounts.find(a => a.id === fromAccountId);
  const toAcc = localStore.accounts.find(a => a.id === toAccountId);

  if (fromAcc) fromAcc.balance -= amount;
  if (toAcc) toAcc.balance += amount;

  const groupId = `transfer_${Date.now()}`;
  const transferNote = note || `Transfer ${fromAcc?.name || 'Account'} → ${toAcc?.name || 'Account'}`;
  const hid = householdId || 'h_sample';

  const txOut: Transaction = {
    id: `${groupId}_out`,
    accountId: fromAccountId,
    categoryId: `cat_transfer_${hid}`,
    targetAccountId: toAccountId,
    amount,
    type: 'transfer',
    note: `${transferNote} (Out)`,
    date: Date.now(),
    householdId: hid,
  };

  const txIn: Transaction = {
    id: `${groupId}_in`,
    accountId: toAccountId,
    categoryId: `cat_transfer_${hid}`,
    targetAccountId: fromAccountId,
    amount,
    type: 'transfer',
    note: `${transferNote} (In)`,
    date: Date.now(),
    householdId: hid,
  };

  localStore.transactions = [txOut, txIn, ...localStore.transactions];
  notifyStoreChange();
  notifyConnectedPartners(hid, 'transfer', transferNote, amount, 'transferred');

  try {
    if (fromAcc) await updateDoc(doc(db, 'accounts', fromAccountId), { balance: fromAcc.balance });
    if (toAcc) await updateDoc(doc(db, 'accounts', toAccountId), { balance: toAcc.balance });
    await setDoc(doc(db, 'transactions', `${groupId}_out`), txOut);
    await setDoc(doc(db, 'transactions', `${groupId}_in`), txIn);
  } catch (err: any) {
    console.warn("Firestore sync notice (transfer saved locally):", err?.message || err);
  }
}

export async function saveBill(bill: Bill, recurringRule?: RecurringRule): Promise<void> {
  const hasToken = !!getCalendarToken();
  if (hasToken) {
    if (!bill.googleCalendarEventId && (bill.dueType === 'monthly' || !bill.dueType)) {
      const eventId = await createMonthlyRecurringEvent(`Pay ${bill.name} Bill`, bill.amount, bill.dueDay);
      if (eventId) bill.googleCalendarEventId = eventId;
    } else if (bill.googleCalendarEventId) {
      await updateCalendarEvent(bill.googleCalendarEventId, `Pay ${bill.name} Bill`, bill.amount, false);
    }
  }

  const idx = localStore.bills.findIndex(b => b.id === bill.id);
  if (idx >= 0) {
    localStore.bills[idx] = bill;
  } else {
    localStore.bills = [bill, ...localStore.bills];
  }

  if (recurringRule) {
    const rIdx = localStore.recurringRules.findIndex(r => r.id === recurringRule.id);
    if (rIdx >= 0) {
      localStore.recurringRules[rIdx] = recurringRule;
    } else {
      localStore.recurringRules = [recurringRule, ...localStore.recurringRules];
    }
  }

  notifyStoreChange();
  notifyConnectedPartners(bill.householdId, 'bill', bill.name, bill.amount, 'updated');

  try {
    if (recurringRule) {
      await setDoc(doc(db, 'recurringRules', recurringRule.id), recurringRule);
    }
    await setDoc(doc(db, 'bills', bill.id), bill);
  } catch (err: any) {
    console.warn("Firestore sync notice (bill saved locally):", err?.message || err);
  }
}

export async function deleteBill(billId: string): Promise<void> {
  const bill = localStore.bills.find(b => b.id === billId);
  const ruleId = bill?.recurringRuleId;

  if (bill?.googleCalendarEventId) {
    await deleteCalendarEvent(bill.googleCalendarEventId);
  }

  localStore.bills = localStore.bills.filter(b => b.id !== billId);
  if (ruleId) {
    localStore.recurringRules = localStore.recurringRules.filter(r => r.id !== ruleId);
  }
  notifyStoreChange();

  try {
    if (ruleId) {
      await deleteDoc(doc(db, 'recurringRules', ruleId));
    }
    await deleteDoc(doc(db, 'bills', billId));
  } catch (err: any) {
    console.warn("Firestore sync notice (bill deleted locally):", err?.message || err);
  }
}

export async function payBill(billId: string, customAmount?: number, accountId?: string): Promise<{ success: boolean; error?: string }> {
  const bill = localStore.bills.find(b => b.id === billId);
  if (!bill) return { success: false, error: 'Bill not found' };

  const payAmount = customAmount !== undefined && !isNaN(customAmount) && customAmount > 0 ? customAmount : bill.amount;
  const targetAccountId = accountId || bill.accountId;
  const account = localStore.accounts.find(a => a.id === targetAccountId);

  if (account && account.balance < payAmount) {
    return { success: false, error: `Insufficient funds in ${account.name}` };
  }

  if (account) {
    account.balance -= payAmount;
  }

  const txId = `tx_${Date.now()}`;
  const tx: Transaction = {
    id: txId,
    accountId: targetAccountId,
    categoryId: 'cat_bills',
    amount: payAmount,
    type: 'expense',
    note: `Paid ${bill.name} Bill`,
    date: Date.now(),
    householdId: bill.householdId,
  };
  localStore.transactions = [tx, ...localStore.transactions];

  bill.status = 'paid';
  bill.lastPaidDate = Date.now();
  bill.timesRecurred = (bill.timesRecurred || 0) + 1;

  if (bill.googleCalendarEventId) {
    await updateCalendarEvent(bill.googleCalendarEventId, `Pay ${bill.name} Bill`, bill.amount, true);
  }

  notifyStoreChange();
  notifyConnectedPartners(bill.householdId, 'bill', bill.name, payAmount, 'paid');

  try {
    if (account) {
      await updateDoc(doc(db, 'accounts', targetAccountId), { balance: account.balance });
    }
    await setDoc(doc(db, 'transactions', txId), tx);
    await updateDoc(doc(db, 'bills', billId), {
      status: 'paid',
      lastPaidDate: Date.now(),
      timesRecurred: bill.timesRecurred,
    });
  } catch (err: any) {
    console.warn("Firestore sync notice (bill paid locally):", err?.message || err);
  }

  return { success: true };
}

export async function saveDebt(debt: Debt): Promise<void> {
  const hasToken = !!getCalendarToken();
  if (hasToken) {
    if (!debt.googleCalendarEventId) {
      const eventId = await createMonthlyRecurringEvent(`Loan Payment: ${debt.name}`, debt.installmentAmount, debt.dueDay, `Remaining balance: ₱${debt.remainingBalance.toLocaleString()}`);
      if (eventId) debt.googleCalendarEventId = eventId;
    } else {
      await updateCalendarEvent(debt.googleCalendarEventId, `Loan Payment: ${debt.name}`, debt.installmentAmount, debt.remainingBalance <= 0);
    }
  }

  const idx = localStore.debts.findIndex(d => d.id === debt.id);
  if (idx >= 0) {
    localStore.debts[idx] = debt;
  } else {
    localStore.debts = [debt, ...localStore.debts];
  }
  notifyStoreChange();
  notifyConnectedPartners(debt.householdId, 'loan', debt.name, debt.installmentAmount, 'updated');

  try {
    await setDoc(doc(db, 'debts', debt.id), debt);
  } catch (err: any) {
    console.warn("Firestore sync notice (loan saved locally):", err?.message || err);
  }
}

export async function deleteDebt(debtId: string): Promise<void> {
  const debt = localStore.debts.find(d => d.id === debtId);
  if (debt?.googleCalendarEventId) {
    await deleteCalendarEvent(debt.googleCalendarEventId);
  }

  localStore.debts = localStore.debts.filter(d => d.id !== debtId);
  notifyStoreChange();

  try {
    await deleteDoc(doc(db, 'debts', debtId));
  } catch (err: any) {
    console.warn("Firestore sync notice (loan deleted locally):", err?.message || err);
  }
}

export async function payDebt(debtId: string, amount: number, accountId?: string): Promise<{ success: boolean; error?: string }> {
  const debt = localStore.debts.find(d => d.id === debtId);
  if (!debt) return { success: false, error: 'Loan not found' };

  const targetAcc = accountId 
    ? localStore.accounts.find(a => a.id === accountId)
    : (localStore.accounts.find(a => a.balance >= amount) || localStore.accounts[0]);

  if (targetAcc && targetAcc.balance < amount) {
    return { success: false, error: `Insufficient funds in ${targetAcc.name}` };
  }

  if (targetAcc) {
    targetAcc.balance -= amount;
  }

  debt.remainingBalance = Math.max(0, debt.remainingBalance - amount);

  const txId = `tx_${Date.now()}`;
  const tx: Transaction = {
    id: txId,
    accountId: targetAcc?.id || 'acc_1',
    categoryId: 'cat_bills',
    amount,
    type: 'expense',
    note: `Payment for ${debt.name} Loan`,
    date: Date.now(),
    householdId: debt.householdId,
  };
  localStore.transactions = [tx, ...localStore.transactions];

  if (debt.googleCalendarEventId) {
    await updateCalendarEvent(debt.googleCalendarEventId, `Loan Payment: ${debt.name}`, debt.installmentAmount, debt.remainingBalance <= 0);
  }

  notifyStoreChange();
  notifyConnectedPartners(debt.householdId, 'loan', debt.name, amount, 'paid');

  try {
    if (targetAcc) {
      await updateDoc(doc(db, 'accounts', targetAcc.id), { balance: targetAcc.balance });
    }
    await updateDoc(doc(db, 'debts', debt.id), { remainingBalance: debt.remainingBalance });
    await setDoc(doc(db, 'transactions', txId), tx);
  } catch (err: any) {
    console.warn("Firestore sync notice (loan payment recorded locally):", err?.message || err);
  }

  return { success: true };
}

export async function saveCategory(category: Category): Promise<void> {
  const idx = localStore.categories.findIndex(c => c.id === category.id);
  if (idx >= 0) {
    localStore.categories[idx] = category;
  } else {
    localStore.categories = [...localStore.categories, category];
  }
  notifyStoreChange();

  try {
    await setDoc(doc(db, 'categories', category.id), category);
  } catch (err: any) {
    console.warn("Firestore sync notice (category saved locally):", err?.message || err);
  }
}

export async function updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
  const existing = localStore.users[userId] || { id: userId, name: 'User', hasPin: false };
  
  if (data.pin && data.pin.length === 4) {
    try {
      const pinH = await hashPin(data.pin);
      data.pinHash = pinH;
      data.hasPin = true;
      await saveLocalSecurityProfile({
        userId,
        name: data.name || existing.name || 'User',
        email: data.email || existing.email || '',
        pinHash: pinH,
        hasPin: true,
        isGoogleBound: data.isGoogleBound ?? existing.isGoogleBound ?? false,
        linkedGoogleEmail: data.linkedGoogleEmail || existing.linkedGoogleEmail,
        householdId: data.householdId || existing.householdId || 'h_sample',
        avatar: data.avatar || existing.avatar,
      });
    } catch (e) {
      console.warn('Security profile sync warning:', e);
    }
  }

  localStore.users[userId] = { ...existing, ...data };
  notifyStoreChange();

  try {
    await updateDoc(doc(db, 'users', userId), data);
  } catch (err: any) {
    console.warn("Firestore sync notice (user updated locally):", err?.message || err);
  }
}

export async function updateHousehold(householdId: string, data: Partial<Household>): Promise<void> {
  const existing = localStore.households[householdId] || { id: householdId, name: 'Household', type: 'partner', memberIds: [] };
  localStore.households[householdId] = { ...existing, ...data };
  notifyStoreChange();

  try {
    await updateDoc(doc(db, 'households', householdId), data);
  } catch (err: any) {
    console.warn("Firestore sync notice (household updated locally):", err?.message || err);
  }
}

// User Profile & Household initialization
export async function ensureUserProfile(firebaseUser: { uid: string; displayName: string | null; email: string | null; photoURL: string | null; providerData?: any[] }): Promise<User> {
  let existing = localStore.users[firebaseUser.uid];
  const isGoogle = firebaseUser.email?.toLowerCase().endsWith('@gmail.com') ||
    firebaseUser.providerData?.some(p => p?.providerId === 'google.com');

  if (existing) {
    let changed = false;
    // Automatically bind profile email address to the logged-in user's Google account email
    if (firebaseUser.email && existing.email !== firebaseUser.email) {
      existing.email = firebaseUser.email;
      changed = true;
    }
    if (isGoogle && !existing.isGoogleBound) {
      existing.isGoogleBound = true;
      changed = true;
    }
    if (changed) {
      notifyStoreChange();
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          email: existing.email,
          isGoogleBound: existing.isGoogleBound,
        });
      } catch {
        // ignore
      }
    }
    return existing;
  }

  const newUser: User = {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || 'Juan Dela Cruz',
    email: firebaseUser.email || 'juan@example.com',
    avatar: firebaseUser.photoURL || '',
    hasPin: false,
    householdId: 'h_sample',
    isGoogleBound: !!isGoogle,
  };

  localStore.users[firebaseUser.uid] = newUser;
  notifyStoreChange();

  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data() as User;
      localStore.users[firebaseUser.uid] = data;
      notifyStoreChange();
      return data;
    }
    await setDoc(userRef, newUser);
  } catch (err: any) {
    console.warn("Firestore user fetch notice (using local profile):", err?.message || err);
  }

  return newUser;
}

export async function linkGoogleEmail(userId: string, targetEmail: string): Promise<void> {
  const user = localStore.users[userId];
  if (!user) return;
  user.linkedGoogleEmail = targetEmail.trim();
  user.isGoogleBound = true;
  notifyStoreChange();

  try {
    await updateDoc(doc(db, 'users', userId), {
      linkedGoogleEmail: targetEmail.trim(),
      isGoogleBound: true,
    });
  } catch (err: any) {
    console.warn("Firestore link email notice:", err?.message || err);
  }
}

export async function createHousehold(userId: string, householdName: string): Promise<string> {
  const householdId = 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const newHousehold: Household = {
    id: householdId,
    name: householdName,
    type: 'partner',
    memberIds: [userId],
  };

  localStore.households[householdId] = newHousehold;
  if (localStore.users[userId]) {
    localStore.users[userId].householdId = householdId;
  }
  notifyStoreChange();

  try {
    await setDoc(doc(db, 'households', householdId), newHousehold);
    await setDoc(doc(db, 'users', userId), { householdId }, { merge: true });
    await ensureDefaultCategories(householdId);
  } catch (err: any) {
    console.warn("Firestore household notice (created locally):", err?.message || err);
  }

  return householdId;
}

export async function joinHousehold(userId: string, householdId: string): Promise<boolean> {
  const hh = localStore.households[householdId];
  if (hh) {
    if (!hh.memberIds.includes(userId)) {
      hh.memberIds.push(userId);
    }
    if (localStore.users[userId]) {
      localStore.users[userId].householdId = householdId;
    }
    notifyStoreChange();
    return true;
  }

  try {
    const householdRef = doc(db, 'households', householdId);
    const householdSnap = await getDoc(householdRef);
    if (householdSnap.exists()) {
      const remoteHh = householdSnap.data() as Household;
      if (!remoteHh.memberIds.includes(userId)) {
        remoteHh.memberIds.push(userId);
        await setDoc(householdRef, { memberIds: remoteHh.memberIds }, { merge: true });
      }
      await setDoc(doc(db, 'users', userId), { householdId }, { merge: true });
      localStore.households[householdId] = remoteHh;
      notifyStoreChange();
      return true;
    }
  } catch (err: any) {
    console.warn("Firestore join notice:", err?.message || err);
  }

  return true;
}

export async function ensureDefaultCategories(householdId: string): Promise<void> {
  for (const cat of defaultCategories) {
    const item: Category = { ...cat, id: `${cat.id}_${householdId}`, householdId };
    saveCategory(item);
  }
}

// ─── Grocery Store Helpers ──────────────────────────────────────────────────

export async function saveGroceryItem(item: GroceryItem): Promise<void> {
  const idx = localStore.groceryItems.findIndex(g => g.id === item.id);
  if (idx >= 0) {
    const updated = [...localStore.groceryItems];
    updated[idx] = item;
    localStore.groceryItems = updated;
  } else {
    localStore.groceryItems = [item, ...localStore.groceryItems];
  }
  notifyStoreChange();

  try {
    await setDoc(doc(db, 'groceryItems', item.id), item);
  } catch (err: any) {
    console.warn("Firestore sync notice (grocery item saved locally):", err?.message || err);
  }
}

export async function deleteGroceryItem(itemId: string): Promise<void> {
  localStore.groceryItems = localStore.groceryItems.filter(g => g.id !== itemId);
  notifyStoreChange();

  try {
    await deleteDoc(doc(db, 'groceryItems', itemId));
  } catch (err: any) {
    console.warn("Firestore sync notice (grocery item deleted locally):", err?.message || err);
  }
}

export async function saveGroceryList(list: GroceryList): Promise<void> {
  const idx = localStore.groceryLists.findIndex(l => l.id === list.id);
  if (idx >= 0) {
    const updated = [...localStore.groceryLists];
    updated[idx] = list;
    localStore.groceryLists = updated;
  } else {
    localStore.groceryLists = [list, ...localStore.groceryLists];
  }
  notifyStoreChange();

  try {
    await setDoc(doc(db, 'groceryLists', list.id), list);
  } catch (err: any) {
    console.warn("Firestore sync notice (grocery list saved locally):", err?.message || err);
  }
}

export async function deleteGroceryList(listId: string): Promise<void> {
  localStore.groceryLists = localStore.groceryLists.filter(l => l.id !== listId);
  notifyStoreChange();

  try {
    await deleteDoc(doc(db, 'groceryLists', listId));
  } catch (err: any) {
    console.warn("Firestore sync notice (grocery list deleted locally):", err?.message || err);
  }
}

export async function updateGroceryPricesFromReceipt(
  scannedItems: { name: string; unitPrice: number; storeName?: string }[],
  householdId: string = 'h_sample'
): Promise<void> {
  if (!scannedItems || scannedItems.length === 0) return;

  const now = Date.now();
  scannedItems.forEach((scanned, index) => {
    if (!scanned.name || typeof scanned.unitPrice !== 'number' || scanned.unitPrice <= 0) return;

    const cleanName = scanned.name.trim();
    const existing = localStore.groceryItems.find(g =>
      g.name.toLowerCase() === cleanName.toLowerCase() ||
      cleanName.toLowerCase().includes(g.name.toLowerCase()) ||
      g.name.toLowerCase().includes(cleanName.toLowerCase())
    );

    if (existing) {
      existing.lastUnitPrice = scanned.unitPrice;
      if (scanned.storeName) existing.storeName = scanned.storeName;
      existing.lastUpdatedDate = now;
      const idx = localStore.groceryItems.findIndex(g => g.id === existing.id);
      if (idx >= 0) localStore.groceryItems[idx] = existing;
    } else {
      const newItem: GroceryItem = {
        id: `gi_${now}_${index}`,
        householdId,
        name: cleanName,
        lastUnitPrice: scanned.unitPrice,
        storeName: scanned.storeName || 'Supermarket',
        lastUpdatedDate: now,
        category: 'Groceries'
      };
      localStore.groceryItems.push(newItem);
    }
  });

  notifyStoreChange();
}

export async function completeGroceryList(
  listId: string,
  accountId: string,
  actualTotal: number,
  storeName?: string
): Promise<void> {
  const list = localStore.groceryLists.find(l => l.id === listId);
  if (!list) return;

  list.status = 'completed';
  list.fundingAccountId = accountId;
  list.actualTotal = actualTotal;
  list.completedAt = Date.now();
  if (storeName) list.storeName = storeName;

  // Ensure "Groceries" category exists in categories so it's always standardized & easily filtered
  const hid = list.householdId || 'h_sample';
  let targetCategory = localStore.categories.find(c =>
    (c.householdId === hid || !c.householdId) &&
    (c.id === 'cat_groceries' ||
      c.id === `cat_groceries_${hid}` ||
      c.name.toLowerCase() === 'groceries' ||
      c.name.toLowerCase() === 'weekly groceries')
  );

  if (!targetCategory) {
    targetCategory = {
      id: `cat_groceries_${hid}`,
      householdId: hid,
      name: 'Groceries',
      icon: 'shopping-cart',
      type: 'expense',
      color: '#10B981'
    };
    await saveCategory(targetCategory);
  } else if (targetCategory.name !== 'Groceries') {
    targetCategory.name = 'Groceries';
    await saveCategory(targetCategory);
  }

  const categoryId = targetCategory.id;
  const newTx: Transaction = {
    id: `tx_grocery_${Date.now()}`,
    accountId,
    categoryId,
    amount: actualTotal,
    type: 'expense',
    note: `Grocery Shopping: ${list.title}${list.storeName ? ` (${list.storeName})` : ''}`,
    date: Date.now(),
    householdId: hid,
    groceryListId: list.id,
    groceryItems: list.items
  };

  // Deduct account balance and record transaction
  await saveTransaction(newTx);

  // Update unit prices in memory store for all items
  const itemsToUpdate = list.items.map(item => ({
    name: item.name,
    unitPrice: item.actualUnitPrice || item.unitPriceEstimate,
    storeName: list.storeName || item.storeName
  }));
  await updateGroceryPricesFromReceipt(itemsToUpdate, list.householdId);

  await saveGroceryList(list);
}

export async function saveGoal(goal: Goal): Promise<void> {
  const idx = localStore.goals.findIndex(g => g.id === goal.id);
  if (idx >= 0) {
    const updated = [...localStore.goals];
    updated[idx] = goal;
    localStore.goals = updated;
  } else {
    localStore.goals = [goal, ...localStore.goals];
  }
  notifyStoreChange();
  notifyConnectedPartners(goal.householdId, 'savings goal', goal.title, goal.targetAmount, 'created/updated');

  try {
    await setDoc(doc(db, 'goals', goal.id), goal);
  } catch (err: any) {
    console.warn("Firestore sync notice (goal saved locally):", err?.message || err);
  }
}

export async function deleteGoal(goalId: string): Promise<void> {
  const goal = localStore.goals.find(g => g.id === goalId);
  localStore.goals = localStore.goals.filter(g => g.id !== goalId);
  
  // If this goal had a linked reminder bill, clean it up
  if (goal?.reminderBillId) {
    localStore.bills = localStore.bills.filter(b => b.id !== goal.reminderBillId);
    try {
      await deleteDoc(doc(db, 'bills', goal.reminderBillId));
    } catch {
      // ignore
    }
  }

  notifyStoreChange();

  try {
    await deleteDoc(doc(db, 'goals', goalId));
  } catch (err: any) {
    console.warn("Firestore sync notice (goal deleted locally):", err?.message || err);
  }
}

export async function depositToGoal(
  goalId: string,
  amount: number,
  sourceAccountId: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const goal = localStore.goals.find(g => g.id === goalId);
  if (!goal) return { success: false, error: 'Goal not found' };

  const sourceAccount = localStore.accounts.find(a => a.id === sourceAccountId);
  if (!sourceAccount) return { success: false, error: 'Source account not found' };

  if (sourceAccount.balance < amount) {
    return { success: false, error: `Insufficient funds in ${sourceAccount.name} (Balance: ₱${sourceAccount.balance.toLocaleString()})` };
  }

  // Deduct from source account
  sourceAccount.balance -= amount;

  // Credit goal
  goal.currentAmount += amount;
  if (goal.currentAmount >= goal.targetAmount && goal.status === 'active') {
    goal.status = 'completed';
    goal.completedAt = Date.now();
  }

  const depositId = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const depositRecord: GoalDeposit = {
    id: depositId,
    amount,
    date: Date.now(),
    sourceAccountId,
    sourceAccountName: sourceAccount.name,
    note: note || `Deposit towards ${goal.title}`,
  };

  goal.deposits = [depositRecord, ...(goal.deposits || [])];

  // Log an associated transaction for ledger transparency
  const txId = `tx_goal_${Date.now()}`;
  const tx: Transaction = {
    id: txId,
    accountId: sourceAccountId,
    categoryId: 'cat_savings',
    amount,
    type: 'expense',
    note: `Goal Deposit: ${goal.title}${note ? ` (${note})` : ''}`,
    date: Date.now(),
    householdId: goal.householdId,
  };
  localStore.transactions = [tx, ...localStore.transactions];

  notifyStoreChange();
  notifyConnectedPartners(goal.householdId, 'savings goal', goal.title, amount, 'deposited into', note);

  try {
    await updateDoc(doc(db, 'accounts', sourceAccountId), { balance: sourceAccount.balance });
    await setDoc(doc(db, 'goals', goal.id), goal);
    await setDoc(doc(db, 'transactions', txId), tx);
  } catch (err: any) {
    console.warn("Firestore sync notice (goal deposit saved locally):", err?.message || err);
  }

  return { success: true };
}

export async function wipeHouseholdData(householdId: string): Promise<void> {
  const targetId = householdId || 'h_sample';
  const shouldRemove = (hid?: string) => !hid || hid === targetId || (targetId === 'h_sample' && hid === 'h_sample');

  // Preserve the system-default Emergency Fund account and reset its balance to 0.00
  const existingEf = localStore.accounts.find(a => (a.isSystemDefault || a.id === 'acc_system_ef'));
  const preservedEf: Account = existingEf
    ? {
        ...DEFAULT_EMERGENCY_FUND_ACCOUNT,
        ...existingEf,
        householdId: targetId,
        balance: 0,
        isSystemDefault: true,
      }
    : {
        ...DEFAULT_EMERGENCY_FUND_ACCOUNT,
        householdId: targetId,
        balance: 0,
      };

  // Filter out other custom accounts belonging to this wiped household, while keeping preserved Emergency Fund
  const otherHouseholdAccounts = localStore.accounts.filter(a => !shouldRemove(a.householdId) && !a.isSystemDefault && a.id !== 'acc_system_ef');
  localStore.accounts = [preservedEf, ...otherHouseholdAccounts];

  localStore.bills = localStore.bills.filter(b => !shouldRemove(b.householdId));
  localStore.debts = localStore.debts.filter(d => !shouldRemove(d.householdId));
  localStore.transactions = localStore.transactions.filter(t => !shouldRemove(t.householdId));
  localStore.categories = localStore.categories.filter(c => !shouldRemove(c.householdId));
  localStore.recurringRules = localStore.recurringRules.filter(r => !shouldRemove(r.householdId));
  localStore.groceryItems = localStore.groceryItems.filter(g => !shouldRemove(g.householdId));
  localStore.groceryLists = localStore.groceryLists.filter(l => !shouldRemove(l.householdId));
  localStore.goals = localStore.goals.filter(g => !shouldRemove(g.householdId));

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('gorago_is_wiped', 'true');
      localStorage.removeItem('ai_categorization_history');
      localStorage.removeItem('gorago_dismissed_subscriptions');
      localStorage.removeItem('gora_ai_chat_history');
      localStorage.removeItem('gora_ai_last_briefing');
      localStorage.removeItem('gora_ai_custom_prompts');
      localStorage.setItem('gora_ai_financial_goals_v1', JSON.stringify([]));
      localStorage.setItem('gora_ai_user_memories_v1', JSON.stringify([]));
      localStorage.removeItem('gorago_ai_cat');
      localStorage.setItem('gorago_accounts', JSON.stringify(localStore.accounts));
      localStorage.setItem('gorago_bills', JSON.stringify(localStore.bills));
      localStorage.setItem('gorago_debts', JSON.stringify(localStore.debts));
      localStorage.setItem('gorago_categories', JSON.stringify(localStore.categories));
      localStorage.setItem('gorago_transactions', JSON.stringify(localStore.transactions));
      localStorage.setItem('gorago_recurringRules', JSON.stringify(localStore.recurringRules));
      localStorage.setItem('gorago_groceryItems', JSON.stringify(localStore.groceryItems));
      localStorage.setItem('gorago_groceryLists', JSON.stringify(localStore.groceryLists));
      localStorage.setItem('gorago_goals', JSON.stringify(localStore.goals));
      localStorage.removeItem('user_grocery_preferred_stores');
      window.dispatchEvent(new CustomEvent('gorago_data_wiped'));
    } catch {
      // ignore
    }
  }

  notifyStoreChange();

  try {
    const collectionsToClean = [
      'bills',
      'debts',
      'transactions',
      'recurringRules',
      'categories',
      'groceryItems',
      'groceryLists',
      'goals',
    ];
    for (const colName of collectionsToClean) {
      const q = query(collection(db, colName), where('householdId', '==', targetId));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    // Delete custom accounts for this household but keep/update the Emergency Fund document
    const accQ = query(collection(db, 'accounts'), where('householdId', '==', targetId));
    const accSnap = await getDocs(accQ);
    if (!accSnap.empty) {
      const batch = writeBatch(db);
      accSnap.forEach(d => {
        if (d.id !== 'acc_system_ef') {
          batch.delete(d.ref);
        }
      });
      await batch.commit();
    }
    await setDoc(doc(db, 'accounts', preservedEf.id), preservedEf, { merge: true });
  } catch (err: any) {
    console.warn("Firestore wipe notice (wiped locally):", err?.message || err);
  }
}
