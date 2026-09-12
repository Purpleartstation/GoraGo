import { supabase, collection, doc, setDoc, getDoc, updateDoc, deleteDoc, getDocs, query, where, writeBatch, onSnapshot, arrayRemove } from './lib/supabase';
import { useSyncExternalStore, useCallback, useEffect } from 'react';
import {
  getCalendarToken,
  setCalendarToken,
  createMonthlyRecurringEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  syncAllToGoogleCalendar,
  cleanupHouseholdCalendarEvents,
} from './utils/googleCalendar';
import { sendPartnerNotification } from './utils/partnerNotification';
import { useAppStore } from './store';
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
  displayName?: string;
  fullName?: string;
  avatar?: string;
  photoURL?: string;
  hasPin: boolean;
  pin?: string;
  pinHash?: string;
  email?: string;
  password?: string;
  householdId?: string;
  pairingCode?: string;
  emergencyFundPin?: string;
  linkedGoogleEmail?: string;
  isGoogleBound?: boolean;
  isSetupComplete?: boolean;
  googleCalendarAccessToken?: string;
  calendarSyncActive?: boolean;
  lastCalendarSync?: number;
}

export interface Household {
  id: string;
  name: string;
  type: 'solo' | 'partner' | 'family';
  memberIds: string[];
  members?: string[];
  pairingCode?: string;
  isSetupComplete?: boolean;
  emergencyFund?: {
    balance: number;
    targetAmount: number;
    updatedAt: number;
  };
  createdAt?: number;
  updatedAt?: number;
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

// Export Supabase instance as db
export const db = supabase;

const createCollection = <T = any>(path: string) => {
  return collection(db, path);
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

export let localStore: LocalDataStore = loadInitialStore();
export function getLocalStore(): LocalDataStore {
  return localStore;
}
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

  // Retrieve current active user with robust email fallbacks
  const currentUserId = localStorage.getItem('gorago_current_user_id') || auth.currentUser?.uid || '';
  const currentUser = localStore.users[currentUserId] || (currentUserId && auth.currentUser ? {
    id: currentUserId,
    name: auth.currentUser.displayName || 'User',
    email: auth.currentUser.email || '',
  } : Object.values(localStore.users)[0]);

  const senderName = currentUser?.name || auth.currentUser?.displayName || 'Your Partner';
  const senderEmail = auth.currentUser?.email 
    || currentUser?.email 
    || (currentUser as any)?.linkedGoogleEmail 
    || 'user@gorago.app';

  // Send automatic email notification to each connected partner
  household.memberIds.forEach(async (memberId) => {
    if (memberId !== currentUserId) {
      let partner = localStore.users[memberId];
      if (!partner?.email) {
        try {
          const uSnap = await getDoc(doc(db, 'users', memberId));
          if (uSnap.exists()) {
            partner = uSnap.data() as User;
            localStore.users[memberId] = partner;
          }
        } catch {
          // ignore
        }
      }

      const partnerEmail = partner?.email 
        || (partner as any)?.linkedGoogleEmail 
        || (partner as any)?.email 
        || (partner?.name ? `${partner.name.toLowerCase().replace(/\s+/g, '')}@gorago.app` : null)
        || `partner_${memberId.slice(0, 6)}@gorago.app`;

      if (partnerEmail) {
        sendPartnerNotification({
          senderName,
          senderEmail,
          partnerEmail,
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

export const saveLocalStoreToDisk = notifyStoreChange;

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
  if (!householdId || typeof window === 'undefined') return;
  if (currentSyncHouseholdId === householdId && syncUnsubscribes.length > 0) return; // Already syncing this household
  
  // Unsubscribe from previous household listeners if any
  syncUnsubscribes.forEach(unsub => {
    try { unsub(); } catch { /* ignore */ }
  });
  syncUnsubscribes = [];
  currentSyncHouseholdId = householdId;

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

  // 1. Listen to household document changes
  try {
    const hhUnsub = onSnapshot(doc(db, 'households', householdId), (hhSnap) => {
      if (hhSnap.exists()) {
        const hhData = hhSnap.data() as Household;
        localStore.households[householdId] = hhData;
        notifyStoreChange();
      }
    }, (error) => {
      console.warn("Realtime sync notice for household doc:", error);
    });
    syncUnsubscribes.push(hhUnsub);
  } catch (err) {
    console.warn("Failed to attach household doc snapshot listener:", err);
  }

  // 2. Listen to users sharing this householdId for real-time member updates
  try {
    const usersQ = query(collections.users, where('householdId', '==', householdId));
    const usersUnsub = onSnapshot(usersQ, (snapshot) => {
      snapshot.docs.forEach(docSnap => {
        const u = docSnap.data() as User;
        localStore.users[u.id] = u;
      });
      notifyStoreChange();
    }, (error) => {
      console.warn("Realtime sync notice for household users:", error);
    });
    syncUnsubscribes.push(usersUnsub);
  } catch (err) {
    console.warn("Failed to attach users snapshot listener:", err);
  }

  // 3. Listen to all household collections
  collectionsToSync.forEach(({ name, ref }) => {
    try {
      const q = query(ref, where('householdId', '==', householdId));
      
      const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data());
        
        // Remove old docs of this household or h_sample, keep other real households if any
        const currentList = ((localStore as any)[name] as any[]) || [];
        const cleanList = currentList.filter(d => d.householdId !== householdId && d.householdId !== 'h_sample');
        (localStore as any)[name] = [...cleanList, ...data];

        // Hydrate into Zustand store
        const store = useAppStore.getState();
        store.setHouseholdData({ [name]: data });

        if (name === 'accounts') {
          const ef = data.find((a: any) => a.isSystemDefault || a.id === 'acc_system_ef' || (a.id && a.id.startsWith('acc_ef_')));
          if (ef) {
            store.setHouseholdData({ emergencyFund: ef });
          }
        }

        notifyStoreChange();
      }, (error) => {
        console.warn(`Realtime sync error for ${name}:`, error);
      });
      
      syncUnsubscribes.push(unsub);
    } catch (err) {
      console.warn(`Failed to attach snapshot listener for ${name}:`, err);
    }
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

export async function touchHousehold(householdId?: string): Promise<void> {
  const hid = householdId || useAppStore.getState().currentHouseholdId;
  if (!hid) return;
  try {
    await updateDoc(doc(db, 'households', hid), { updatedAt: Date.now() });
  } catch {
    try {
      await setDoc(doc(db, 'households', hid), { id: hid, updatedAt: Date.now() }, { merge: true });
    } catch {
      // ignore
    }
  }
}

export async function saveAccount(account: Account): Promise<void> {
  const hid = account.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  account.householdId = hid;

  const idx = localStore.accounts.findIndex(a => a.id === account.id);
  if (idx >= 0) {
    localStore.accounts[idx] = account;
  } else {
    localStore.accounts = [account, ...localStore.accounts];
  }
  notifyStoreChange();
  notifyConnectedPartners(account.householdId, 'account', account.name, account.balance, 'updated');

  try {
    await setDoc(doc(db, 'accounts', account.id), account, { merge: true });
    await touchHousehold(hid);
  } catch (err: any) {
    console.warn("Firestore sync notice (saved locally):", err?.message || err);
  }
}

export async function deleteAccount(accountId: string): Promise<void> {
  const targetAcc = localStore.accounts.find(a => a.id === accountId);
  const hid = targetAcc?.householdId || useAppStore.getState().currentHouseholdId;

  if (targetAcc?.isSystemDefault || accountId === 'acc_system_ef' || accountId.startsWith('acc_ef_')) {
    // Preserve the system emergency fund and reset its balance to 0 instead of deleting
    targetAcc.balance = 0;
    notifyStoreChange();
    try {
      await setDoc(doc(db, 'accounts', accountId), { ...targetAcc, balance: 0 }, { merge: true });
      await touchHousehold(hid);
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
    await touchHousehold(hid);
  } catch (err: any) {
    console.warn("Firestore sync notice (deleted locally):", err?.message || err);
  }
}

export async function saveTransaction(transaction: Transaction): Promise<void> {
  const hid = transaction.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  transaction.householdId = hid;

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
    await setDoc(doc(db, 'transactions', transaction.id), transaction, { merge: true });
    if (account && newBalance !== undefined) {
      await updateDoc(doc(db, 'accounts', transaction.accountId), { balance: newBalance });
    }
    await touchHousehold(hid);
  } catch (err: any) {
    console.warn("Firestore sync notice (saved locally):", err?.message || err);
  }
}

export async function deleteTransaction(transactionId: string): Promise<void> {
  const tx = localStore.transactions.find(t => t.id === transactionId);
  if (tx) {
    const hid = tx.householdId || useAppStore.getState().currentHouseholdId;
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
      await touchHousehold(hid);
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
  const hid = householdId || fromAcc?.householdId || toAcc?.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';

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
    await setDoc(doc(db, 'transactions', `${groupId}_out`), txOut, { merge: true });
    await setDoc(doc(db, 'transactions', `${groupId}_in`), txIn, { merge: true });
    await touchHousehold(hid);
  } catch (err: any) {
    console.warn("Firestore sync notice (transfer saved locally):", err?.message || err);
  }
}

/**
 * Batch-syncs household bills, loan schedules, and savings goals directly
 * to Google Calendar for active user or connected partner.
 */
export async function autoSyncGoogleCalendarReminders(
  targetHouseholdId?: string,
  customToken?: string
): Promise<{ success: boolean; syncedCount: number; error?: string }> {
  const token = customToken || getCalendarToken();
  if (!token) {
    return { success: false, syncedCount: 0, error: 'Google Calendar is not connected. Please connect your Google Account.' };
  }

  const hid = targetHouseholdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  const billsToSync = localStore.bills.filter(b => b.householdId === hid);
  const debtsToSync = localStore.debts.filter(d => d.householdId === hid);
  const goalsToSync = localStore.goals.filter(g => g.householdId === hid);

  const fallbackGoal = {
    id: `ef_goal_${hid}`,
    title: 'Emergency Fund (Safety Net) 3-Month Target',
    targetAmount: 50000,
    currentAmount: localStore.households[hid]?.emergencyFund?.balance || 0,
  };
  const goalsList = goalsToSync.length > 0 ? goalsToSync : [fallbackGoal];

  try {
    const res = await syncAllToGoogleCalendar(billsToSync, debtsToSync, goalsList);
    if (res.success && Array.isArray(res.results)) {
      let hasChanges = false;
      for (const item of res.results) {
        if (!item.eventId) continue;
        if (item.type === 'bill') {
          const b = localStore.bills.find(x => x.id === item.id);
          if (b && b.googleCalendarEventId !== item.eventId) {
            b.googleCalendarEventId = item.eventId;
            hasChanges = true;
            try {
              await updateDoc(doc(db, 'bills', b.id), { googleCalendarEventId: item.eventId });
            } catch {}
          }
        } else if (item.type === 'debt') {
          const d = localStore.debts.find(x => x.id === item.id);
          if (d && d.googleCalendarEventId !== item.eventId) {
            d.googleCalendarEventId = item.eventId;
            hasChanges = true;
            try {
              await updateDoc(doc(db, 'debts', d.id), { googleCalendarEventId: item.eventId });
            } catch {}
          }
        }
      }
      if (hasChanges) {
        notifyStoreChange();
      }
    }

    const currentUid = useAppStore.getState().currentUserId;
    if (currentUid && localStore.users[currentUid]) {
      localStore.users[currentUid].calendarSyncActive = true;
      localStore.users[currentUid].lastCalendarSync = Date.now();
      try {
        await updateDoc(doc(db, 'users', currentUid), {
          calendarSyncActive: true,
          lastCalendarSync: Date.now(),
        });
      } catch {}
    }

    return res;
  } catch (err: any) {
    console.warn('autoSyncGoogleCalendarReminders error:', err);
    return { success: false, syncedCount: 0, error: err?.message || 'Sync failed' };
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

  // Cross-sync to household partner's Google Calendar if partner has linked their Google account
  const activeHh = localStore.households[bill.householdId];
  if (activeHh && Array.isArray(activeHh.memberIds)) {
    const currentUid = useAppStore.getState().currentUserId;
    for (const memberId of activeHh.memberIds) {
      if (memberId !== currentUid) {
        const partner = localStore.users[memberId];
        if (partner?.googleCalendarAccessToken) {
          try {
            await fetch('/api/calendar/create-event', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${partner.googleCalendarAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: `Pay ${bill.name} Bill`,
                amount: bill.amount,
                dueDay: bill.dueDay,
                note: `Shared Household Bill for ${bill.name}`,
              }),
            });
          } catch (_partnerCalErr) {
            // Non-blocking
          }
        }
      }
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
      await setDoc(doc(db, 'recurringRules', recurringRule.id), recurringRule, { merge: true });
    }
    await setDoc(doc(db, 'bills', bill.id), bill, { merge: true });
    await touchHousehold(bill.householdId);
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
    if (bill?.householdId) await touchHousehold(bill.householdId);
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
    await setDoc(doc(db, 'transactions', txId), tx, { merge: true });
    await updateDoc(doc(db, 'bills', billId), {
      status: 'paid',
      lastPaidDate: Date.now(),
      timesRecurred: bill.timesRecurred,
    });
    await touchHousehold(bill.householdId);
  } catch (err: any) {
    console.warn("Firestore sync notice (bill paid locally):", err?.message || err);
  }

  return { success: true };
}

export async function saveDebt(debt: Debt): Promise<void> {
  const hid = debt.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  debt.householdId = hid;

  const hasToken = !!getCalendarToken();
  if (hasToken) {
    if (!debt.googleCalendarEventId) {
      const eventId = await createMonthlyRecurringEvent(`Loan Payment: ${debt.name}`, debt.installmentAmount, debt.dueDay, `Remaining balance: ₱${debt.remainingBalance.toLocaleString()}`);
      if (eventId) debt.googleCalendarEventId = eventId;
    } else {
      await updateCalendarEvent(debt.googleCalendarEventId, `Loan Payment: ${debt.name}`, debt.installmentAmount, debt.remainingBalance <= 0);
    }
  }

  // Cross-sync to household partner's Google Calendar if partner has linked their Google account
  const activeHh = localStore.households[debt.householdId];
  if (activeHh && Array.isArray(activeHh.memberIds)) {
    const currentUid = useAppStore.getState().currentUserId;
    for (const memberId of activeHh.memberIds) {
      if (memberId !== currentUid) {
        const partner = localStore.users[memberId];
        if (partner?.googleCalendarAccessToken) {
          try {
            await fetch('/api/calendar/create-event', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${partner.googleCalendarAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: `Loan Payment: ${debt.name}`,
                amount: debt.installmentAmount,
                dueDay: debt.dueDay,
                note: `Shared Loan Payment for ${debt.name} (Lender: ${debt.lender || 'N/A'})`,
              }),
            });
          } catch (_partnerCalErr) {
            // Non-blocking
          }
        }
      }
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
    await setDoc(doc(db, 'debts', debt.id), debt, { merge: true });
    await touchHousehold(debt.householdId);
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
    if (debt?.householdId) await touchHousehold(debt.householdId);
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
    await setDoc(doc(db, 'transactions', txId), tx, { merge: true });
    await touchHousehold(debt.householdId);
  } catch (err: any) {
    console.warn("Firestore sync notice (loan payment recorded locally):", err?.message || err);
  }

  return { success: true };
}

export async function saveCategory(category: Category): Promise<void> {
  const hid = category.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  category.householdId = hid;

  const idx = localStore.categories.findIndex(c => c.id === category.id);
  if (idx >= 0) {
    localStore.categories[idx] = category;
  } else {
    localStore.categories = [...localStore.categories, category];
  }
  notifyStoreChange();

  try {
    await setDoc(doc(db, 'categories', category.id), category, { merge: true });
    await touchHousehold(hid);
  } catch (err: any) {
    console.warn("Firestore sync notice (category saved locally):", err?.message || err);
  }
}

export async function updateUserProfile(userId: string, data: Partial<User>): Promise<void> {
  const existing = localStore.users[userId] || { id: userId, name: 'User', hasPin: false };
  
  if (data.name && typeof window !== 'undefined') {
    try {
      localStorage.setItem('gorago_user_name', data.name);
    } catch {}
  }

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
  } else if (data.name) {
    // If name is changed without pin change, update local security profile name as well
    try {
      const currentSec = await getLocalSecurityProfile();
      if (currentSec && currentSec.userId === userId) {
        await saveLocalSecurityProfile({
          ...currentSec,
          name: data.name,
          email: data.email || currentSec.email,
        });
      }
    } catch {}
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

export async function hydrateHouseholdCollections(householdId: string): Promise<void> {
  if (!householdId) return;

  // 1. Fetch household document from Firestore
  try {
    const hhSnap = await getDoc(doc(db, 'households', householdId));
    if (hhSnap.exists()) {
      localStore.households[householdId] = hhSnap.data() as Household;
    }
  } catch (err) {
    console.warn("Notice: Hydration for household document skipped:", err);
  }

  // 2. Fetch all collections belonging to this household
  const collectionsToHydrate = [
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

  for (const { name, ref } of collectionsToHydrate) {
    try {
      const q = query(ref, where('householdId', '==', householdId));
      const snap = await getDocs(q);
      let remoteDocs = snap.docs.map(d => d.data());

      if (name === 'categories' && remoteDocs.length === 0) {
        await ensureDefaultCategories(householdId);
        const catQ = query(collections.categories, where('householdId', '==', householdId));
        const catSnap = await getDocs(catQ);
        remoteDocs = catSnap.docs.map(d => d.data());
      }

      if (name === 'accounts') {
        let efAcc = remoteDocs.find((a: any) => a.isSystemDefault || a.id === 'acc_system_ef' || (a.id && a.id.startsWith('acc_ef_')));
        if (!efAcc) {
          const efBalance = localStore.households[householdId]?.emergencyFund?.balance || 0;
          efAcc = {
            id: `acc_ef_${householdId}`,
            householdId,
            ownerId: null,
            name: 'Emergency Fund (Safety Net)',
            type: 'bank',
            institution: 'High-Yield Savings Reserve',
            balance: efBalance,
            color: '#8B5CF6',
            icon: 'shield-alert',
            isSystemDefault: true,
          };
          remoteDocs.unshift(efAcc);
          try {
            await setDoc(doc(db, 'accounts', efAcc.id), efAcc, { merge: true });
          } catch {
            // ignore
          }
        }
      }

      // Purge any lingering mock sample data (h_sample) and replace this household's docs
      const currentList = ((localStore as any)[name] as any[]) || [];
      const cleanList = currentList.filter((d: any) => d.householdId !== householdId && d.householdId !== 'h_sample');
      (localStore as any)[name] = [...cleanList, ...remoteDocs];
    } catch (e) {
      console.warn(`Notice: Hydration for collection ${name} skipped:`, e);
    }
  }

  // 3. Hydrate directly into Zustand store
  const store = useAppStore.getState();
  const currentAccounts = localStore.accounts.filter(a => a.householdId === householdId);
  const efAcc = currentAccounts.find(a => a.isSystemDefault || a.id === 'acc_system_ef' || a.id.startsWith('acc_ef_'));
  
  store.setHouseholdData({
    accounts: currentAccounts,
    transactions: localStore.transactions.filter(t => t.householdId === householdId),
    goals: localStore.goals.filter(g => g.householdId === householdId),
    debts: localStore.debts.filter(d => d.householdId === householdId),
    bills: localStore.bills.filter(b => b.householdId === householdId),
    categories: localStore.categories.filter(c => c.householdId === householdId),
    emergencyFund: efAcc || null,
  });

  notifyStoreChange();
}

// User Profile & Household initialization
export async function ensureUserProfile(firebaseUser: { uid: string; displayName: string | null; email: string | null; photoURL: string | null; providerData?: any[] }): Promise<User> {
  const isGoogle = firebaseUser.email?.toLowerCase().endsWith('@gmail.com') ||
    firebaseUser.providerData?.some(p => p?.providerId === 'google.com');

  const userRef = doc(db, 'users', firebaseUser.uid);
  let userSnap: any = null;
  try {
    userSnap = await getDoc(userRef);
  } catch (err) {
    console.warn("Firestore user fetch notice:", err);
  }

  let remoteUser: User | null = null;
  if (userSnap && userSnap.exists()) {
    remoteUser = userSnap.data() as User;
  } else if (firebaseUser.email) {
    // If not found by UID, search by email or linkedGoogleEmail
    try {
      const emailLower = firebaseUser.email.toLowerCase();
      const q = query(collections.users, where('email', '==', emailLower));
      const emailSnap = await getDocs(q);
      if (!emailSnap.empty) {
        remoteUser = emailSnap.docs[0].data() as User;
      } else {
        const q2 = query(collections.users, where('linkedGoogleEmail', '==', emailLower));
        const emailSnap2 = await getDocs(q2);
        if (!emailSnap2.empty) {
          remoteUser = emailSnap2.docs[0].data() as User;
        }
      }
    } catch (e) {
      console.warn("Email lookup notice:", e);
    }
  }

  // 1. Existing User in Firestore -> Retain Existing Cloud Data & Hydrate (DO NOT reset or overwrite with defaults)
  if (remoteUser) {
    const householdId = remoteUser.householdId || `h_${firebaseUser.uid}`;
    
    // Fetch household document
    const householdRef = doc(db, 'households', householdId);
    let householdData: Household | null = null;
    try {
      const hhSnap = await getDoc(householdRef);
      if (hhSnap.exists()) {
        householdData = hhSnap.data() as Household;
      }
    } catch (err) {
      console.warn("Firestore household fetch notice:", err);
    }

    const pairingCode = (remoteUser.pairingCode && remoteUser.pairingCode.startsWith('GORA-'))
      ? remoteUser.pairingCode
      : (householdData?.pairingCode && householdData.pairingCode.startsWith('GORA-'))
      ? householdData.pairingCode
      : generatePairingCode();

    if (!householdData) {
      householdData = {
        id: householdId,
        name: `${remoteUser.name || firebaseUser.displayName || 'User'}'s Household`,
        type: 'partner',
        memberIds: [firebaseUser.uid],
        pairingCode,
        isSetupComplete: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      try {
        await setDoc(householdRef, householdData, { merge: true });
      } catch {
        // ignore
      }
    } else if (!householdData.pairingCode || !householdData.pairingCode.startsWith('GORA-')) {
      householdData.pairingCode = pairingCode;
      try {
        await setDoc(householdRef, { pairingCode }, { merge: true });
      } catch {
        // ignore
      }
    }
    localStore.households[householdId] = householdData;

    const effectiveName = (remoteUser.name && remoteUser.name.trim() !== '')
      ? remoteUser.name
      : (firebaseUser.displayName || remoteUser.name || 'Google User');

    // Update local profile memory
    const updatedUser: User = {
      ...remoteUser,
      id: firebaseUser.uid,
      email: firebaseUser.email || remoteUser.email,
      name: effectiveName,
      avatar: firebaseUser.photoURL || remoteUser.avatar,
      householdId,
      pairingCode,
      isGoogleBound: isGoogle || remoteUser.isGoogleBound,
      linkedGoogleEmail: isGoogle ? (firebaseUser.email || remoteUser.email) : remoteUser.linkedGoogleEmail,
      isSetupComplete: true,
    };
    localStore.users[firebaseUser.uid] = updatedUser;

    // Persist verified user profile to Firestore
    try {
      await setDoc(userRef, updatedUser, { merge: true });
    } catch {
      // ignore
    }

    // Set active user and household in Zustand Store
    const store = useAppStore.getState();
    store.setCurrentUser(firebaseUser.uid);
    store.setCurrentHousehold(householdId);

    // Hydrate all collections from Firestore directly into local storage and Zustand store
    await hydrateHouseholdCollections(householdId);

    // Bind live realtime sync
    enableRealtimeSync(householdId);

    notifyStoreChange();
    return updatedUser;
  }

  // 2. Fresh "Start from 0" Initialization for Brand New Accounts (and ONLY if brand new)
  const newHouseholdId = `h_${firebaseUser.uid}`;
  const pairingCode = generatePairingCode(newHouseholdId);

  const newHousehold: Household = {
    id: newHouseholdId,
    name: `${firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User'}'s Household`,
    type: 'partner',
    memberIds: [firebaseUser.uid],
    pairingCode,
    isSetupComplete: true,
    emergencyFund: {
      balance: 0,
      targetAmount: 50000,
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const newUserProfile: User = {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
    email: firebaseUser.email || '',
    avatar: firebaseUser.photoURL || '',
    hasPin: false,
    householdId: newHouseholdId,
    pairingCode,
    isGoogleBound: !!isGoogle,
    linkedGoogleEmail: isGoogle ? (firebaseUser.email || '') : undefined,
    isSetupComplete: true,
  };

  const defaultEfAccount: Account = {
    id: `acc_ef_${newHouseholdId}`,
    householdId: newHouseholdId,
    ownerId: null,
    name: 'Emergency Fund (Safety Net)',
    type: 'bank',
    institution: 'High-Yield Savings Reserve',
    balance: 0,
    color: '#8B5CF6',
    icon: 'shield-alert',
    isSystemDefault: true,
  };

  // Zero out localStore collections for this brand new account
  localStore.users[firebaseUser.uid] = newUserProfile;
  localStore.households[newHouseholdId] = newHousehold;
  localStore.accounts = [defaultEfAccount];
  localStore.transactions = [];
  localStore.goals = [];
  localStore.debts = [];
  localStore.bills = [];
  localStore.groceryItems = [];
  localStore.groceryLists = [];
  localStore.recurringRules = [];

  // Set Zustand store
  const store = useAppStore.getState();
  store.setCurrentUser(firebaseUser.uid);
  store.setCurrentHousehold(newHouseholdId);
  store.setHouseholdData({
    accounts: [defaultEfAccount],
    transactions: [],
    goals: [],
    debts: [],
    bills: [],
    categories: [],
    emergencyFund: defaultEfAccount,
  });

  notifyStoreChange();

  // Push clean, zeroed state & new profile to Firestore
  try {
    await setDoc(userRef, newUserProfile);
    await setDoc(doc(db, 'households', newHouseholdId), newHousehold);
    await setDoc(doc(db, 'accounts', defaultEfAccount.id), defaultEfAccount);
    await ensureDefaultCategories(newHouseholdId);
  } catch (err: any) {
    console.warn("Firestore new user initialization notice:", err?.message || err);
  }

  // Bind live realtime sync
  enableRealtimeSync(newHouseholdId);

  return newUserProfile;
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

export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  for (let i = 0; i < 4; i++) {
    part2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `GORA-${part1}-${part2}`;
}

export async function getHouseholdPairingCode(householdId: string, userId?: string): Promise<string> {
  if (!householdId && !userId) return generatePairingCode();

  // 1. Check local memory first
  const hh = householdId ? localStore.households[householdId] : null;
  if (hh?.pairingCode && typeof hh.pairingCode === 'string' && hh.pairingCode.startsWith('GORA-')) {
    return hh.pairingCode;
  }
  if (userId && localStore.users[userId]?.pairingCode?.startsWith('GORA-')) {
    return localStore.users[userId].pairingCode!;
  }

  let code: string | null = null;

  // 2. Query Firestore for household doc
  if (householdId) {
    try {
      const householdRef = doc(db, 'households', householdId);
      const snap = await getDoc(householdRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data.pairingCode && typeof data.pairingCode === 'string' && data.pairingCode.startsWith('GORA-')) {
          code = data.pairingCode;
        }
      }
    } catch (err) {
      console.warn("Firestore getHouseholdPairingCode error:", err);
    }
  }

  // 3. If not in household doc, check user doc
  if (!code && userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const uSnap = await getDoc(userRef);
      if (uSnap.exists()) {
        const uData = uSnap.data();
        if (uData.pairingCode && typeof uData.pairingCode === 'string' && uData.pairingCode.startsWith('GORA-')) {
          code = uData.pairingCode;
        }
      }
    } catch (err) {
      console.warn("Firestore user pairingCode check error:", err);
    }
  }

  // 4. Generate fresh unique code if none exists yet
  if (!code) {
    code = generatePairingCode();
  }

  // 5. Persist to Firestore household doc
  if (householdId) {
    try {
      const householdRef = doc(db, 'households', householdId);
      await setDoc(householdRef, {
        id: householdId,
        pairingCode: code,
        updatedAt: Date.now(),
      }, { merge: true });
    } catch (e) {
      console.warn("Failed to persist pairingCode to household:", e);
    }

    if (hh) {
      hh.pairingCode = code;
    } else {
      localStore.households[householdId] = {
        id: householdId,
        name: 'My Household',
        type: 'partner',
        memberIds: userId ? [userId] : [],
        pairingCode: code,
      };
    }
  }

  // 6. Persist to Firestore user doc
  if (userId) {
    try {
      await setDoc(doc(db, 'users', userId), { pairingCode: code, updatedAt: Date.now() }, { merge: true });
    } catch {
      // ignore
    }
    if (localStore.users[userId]) {
      localStore.users[userId].pairingCode = code;
    }
  }

  // Assign pairingCode to matching users in localStore
  if (householdId) {
    const matchingUsers = Object.values(localStore.users).filter(u => u.householdId === householdId);
    for (const u of matchingUsers) {
      u.pairingCode = code;
    }
  }

  notifyStoreChange();
  return code;
}

export async function createHousehold(userId: string, householdName: string): Promise<string> {
  const householdId = 'h_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const pairingCode = generatePairingCode(householdId);
  const newHousehold: Household = {
    id: householdId,
    name: householdName,
    type: 'partner',
    memberIds: [userId],
    pairingCode,
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

/**
 * Utility function that filters and deduplicates member items/strings into a clean list of unique UIDs
 */
export function deduplicateHouseholdMembers(membersInput: any[]): string[] {
  if (!Array.isArray(membersInput)) return [];
  const rawIds = membersInput.map(m => {
    if (!m) return null;
    if (typeof m === 'string') return m.trim();
    if (typeof m === 'object') return (m.id || m.uid || m.userId || '').toString().trim();
    return null;
  }).filter(Boolean) as string[];

  return Array.from(new Set(rawIds));
}

export async function joinHousehold(userId: string, householdId: string): Promise<boolean> {
  const hh = localStore.households[householdId];
  if (hh) {
    const rawLocalMembers = [
      ...(Array.isArray(hh.memberIds) ? hh.memberIds : []),
      ...(Array.isArray((hh as any).members) ? (hh as any).members : []),
      userId
    ];
    const dedupedLocal = deduplicateHouseholdMembers(rawLocalMembers);
    hh.memberIds = dedupedLocal;
    (hh as any).members = dedupedLocal;

    if (localStore.users[userId]) {
      localStore.users[userId].householdId = householdId;
    }
    notifyStoreChange();
  }

  try {
    const householdRef = doc(db, 'households', householdId);
    const householdSnap = await getDoc(householdRef);
    if (householdSnap.exists()) {
      const remoteHh = householdSnap.data() as Household;
      const rawRemoteMembers = [
        ...(Array.isArray(remoteHh.memberIds) ? remoteHh.memberIds : []),
        ...(Array.isArray((remoteHh as any).members) ? (remoteHh as any).members : []),
        userId
      ];
      const dedupedRemote = deduplicateHouseholdMembers(rawRemoteMembers);

      remoteHh.memberIds = dedupedRemote;
      (remoteHh as any).members = dedupedRemote;

      await setDoc(householdRef, {
        memberIds: dedupedRemote,
        members: dedupedRemote,
        updatedAt: Date.now()
      }, { merge: true });

      await setDoc(doc(db, 'users', userId), { householdId, updatedAt: Date.now() }, { merge: true });
      localStore.households[householdId] = remoteHh;
      notifyStoreChange();
      return true;
    }
  } catch (err: any) {
    console.warn("Firestore join notice:", err?.message || err);
  }

  return true;
}

export async function pairHouseholdByCodeOrEmail(
  currentUserId: string,
  codeOrEmail: string
): Promise<{ success: boolean; message: string; householdId?: string }> {
  const inputRaw = codeOrEmail.trim();
  if (!inputRaw) {
    return { success: false, message: 'Please enter a valid pairing code or partner email.' };
  }

  const codeUpper = inputRaw.toUpperCase();
  const emailLower = inputRaw.toLowerCase();

  let targetHouseholdId: string | null = null;
  let targetHouseholdName: string = 'Partner Household';
  let targetHouseholdCode: string = codeUpper;
  let userAId: string | null = null;

  // 1. Search by pairingCode in Firestore or localStore
  try {
    const hhColl = collections.households;
    const qCode = query(hhColl, where('pairingCode', '==', codeUpper));
    const snapCode = await getDocs(qCode);
    if (!snapCode.empty) {
      const hhData = snapCode.docs[0].data() as Household;
      targetHouseholdId = hhData.id;
      targetHouseholdName = hhData.name || targetHouseholdName;
      if (hhData.pairingCode) targetHouseholdCode = hhData.pairingCode;
      if (Array.isArray(hhData.memberIds) && hhData.memberIds.length > 0) {
        userAId = hhData.memberIds[0];
      }
    }
  } catch (err) {
    console.warn("Query households by pairingCode error:", err);
  }

  // Check by household doc ID directly
  if (!targetHouseholdId) {
    try {
      const hhSnap = await getDoc(doc(db, 'households', inputRaw));
      if (hhSnap.exists()) {
        const hhData = hhSnap.data() as Household;
        targetHouseholdId = hhData.id;
        targetHouseholdName = hhData.name || targetHouseholdName;
        if (hhData.pairingCode) targetHouseholdCode = hhData.pairingCode;
        if (Array.isArray(hhData.memberIds) && hhData.memberIds.length > 0) {
          userAId = hhData.memberIds[0];
        }
      }
    } catch (err) {
      console.warn("Query households by ID error:", err);
    }
  }

  // Search localStore households
  if (!targetHouseholdId) {
    const localHh = Object.values(localStore.households).find(
      h => h.id === inputRaw || (h.pairingCode && h.pairingCode.toUpperCase() === codeUpper)
    );
    if (localHh) {
      targetHouseholdId = localHh.id;
      targetHouseholdName = localHh.name || targetHouseholdName;
      if (localHh.pairingCode) targetHouseholdCode = localHh.pairingCode;
      if (Array.isArray(localHh.memberIds) && localHh.memberIds.length > 0) {
        userAId = localHh.memberIds[0];
      }
    }
  }

  // 2. Search by partner EMAIL or user ID in Firestore or localStore
  if (!targetHouseholdId) {
    try {
      const usersColl = collections.users;
      const qEmail = query(usersColl, where('email', '==', emailLower));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const userData = snapEmail.docs[0].data() as User;
        if (userData.householdId) {
          targetHouseholdId = userData.householdId;
          userAId = userData.id;
        }
      }
    } catch (err) {
      console.warn("Query users by email error:", err);
    }
  }

  if (!targetHouseholdId) {
    try {
      const usersColl = collections.users;
      const qLinked = query(usersColl, where('linkedGoogleEmail', '==', emailLower));
      const snapLinked = await getDocs(qLinked);
      if (!snapLinked.empty) {
        const userData = snapLinked.docs[0].data() as User;
        if (userData.householdId) {
          targetHouseholdId = userData.householdId;
          userAId = userData.id;
        }
      }
    } catch (err) {
      console.warn("Query users by linked email error:", err);
    }
  }

  // Search users by pairingCode in Firestore
  if (!targetHouseholdId) {
    try {
      const usersColl = collections.users;
      const qUserCode = query(usersColl, where('pairingCode', '==', codeUpper));
      const snapUserCode = await getDocs(qUserCode);
      if (!snapUserCode.empty) {
        const userData = snapUserCode.docs[0].data() as User;
        if (userData.householdId) {
          targetHouseholdId = userData.householdId;
          userAId = userData.id;
        }
      }
    } catch (err) {
      console.warn("Query users by pairingCode error:", err);
    }
  }

  if (!targetHouseholdId) {
    const localUser = Object.values(localStore.users).find(
      u => u.email?.toLowerCase() === emailLower || u.id === inputRaw || (u.pairingCode && u.pairingCode.toUpperCase() === codeUpper)
    );
    if (localUser && localUser.householdId) {
      targetHouseholdId = localUser.householdId;
      userAId = localUser.id;
    }
  }

  if (!targetHouseholdId) {
    return {
      success: false,
      message: `No active household found for pairing code "${inputRaw}". Please ask your partner to open Settings > Sync & Integrations to copy their unique code.`,
    };
  }

  // Determine current user's household before joining
  const userObj = localStore.users[currentUserId];
  const previousHouseholdId = userObj?.householdId || 'h_sample';

  if (previousHouseholdId === targetHouseholdId) {
    return {
      success: false,
      message: 'You are already connected to this household!',
      householdId: targetHouseholdId,
    };
  }

  // 3. Add both users to active members list inside households/{householdId} with strict UID deduplication
  const hhRef = doc(db, 'households', targetHouseholdId);
  try {
    const hhSnap = await getDoc(hhRef);
    let rawMembers: any[] = [];
    if (hhSnap.exists()) {
      const hhData = hhSnap.data() as Household;
      rawMembers = [
        ...(Array.isArray(hhData.memberIds) ? hhData.memberIds : []),
        ...(Array.isArray((hhData as any).members) ? (hhData as any).members : []),
      ];
      if (hhData.pairingCode) targetHouseholdCode = hhData.pairingCode;
      if (hhData.name) targetHouseholdName = hhData.name;
    }
    if (userAId) {
      rawMembers.push(userAId);
    }
    if (currentUserId) {
      rawMembers.push(currentUserId);
    }

    // Deduplicate by UID strictly using utility
    const dedupedMemberIds = deduplicateHouseholdMembers(rawMembers);

    await setDoc(hhRef, {
      id: targetHouseholdId,
      memberIds: dedupedMemberIds,
      members: dedupedMemberIds,
      type: 'partner',
      pairingCode: targetHouseholdCode,
      updatedAt: Date.now(),
    }, { merge: true });

    if (localStore.households[targetHouseholdId]) {
      localStore.households[targetHouseholdId].memberIds = dedupedMemberIds;
      (localStore.households[targetHouseholdId] as any).members = dedupedMemberIds;
      localStore.households[targetHouseholdId].pairingCode = targetHouseholdCode;
    }
  } catch (err) {
    console.warn("Failed to update household memberIds in Firestore:", err);
  }

  // 4. Update User B's profile (users/{uid}) so their householdId points to User A's householdId
  const effectiveEmail = auth.currentUser?.email 
    || userObj?.email 
    || (userObj as any)?.linkedGoogleEmail 
    || '';
  const effectiveName = auth.currentUser?.displayName 
    || userObj?.name 
    || (userObj as any)?.displayName 
    || (userObj as any)?.fullName 
    || 'User';
  const effectivePhotoURL = auth.currentUser?.photoURL 
    || userObj?.avatar 
    || (userObj as any)?.photoURL 
    || '';

  try {
    await setDoc(doc(db, 'users', currentUserId), {
      householdId: targetHouseholdId,
      pairingCode: targetHouseholdCode,
      email: effectiveEmail,
      name: effectiveName,
      displayName: effectiveName,
      avatar: effectivePhotoURL,
      photoURL: effectivePhotoURL,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn("Failed to set user householdId in Firestore:", err);
  }

  if (localStore.users[currentUserId]) {
    localStore.users[currentUserId].householdId = targetHouseholdId;
    localStore.users[currentUserId].pairingCode = targetHouseholdCode;
    if (effectiveEmail && !localStore.users[currentUserId].email) {
      localStore.users[currentUserId].email = effectiveEmail;
    }
  }
  useAppStore.getState().setCurrentHousehold(targetHouseholdId);

  // 5. Fetch all collections from User A's households/{householdId} and immediately populate/hydrate User B's local state and Zustand store
  if (previousHouseholdId !== 'h_sample' && !previousHouseholdId.startsWith('h_sample')) {
    await mergeLocalAndRemoteData(previousHouseholdId, targetHouseholdId);
  }
  await hydrateHouseholdCollections(targetHouseholdId);
  enableRealtimeSync(targetHouseholdId);

  // 6. Shared Household Calendar Reminders:
  // Automatically sync User A's active bill, debt, and goal reminders into User B's Google Calendar
  try {
    const userBToken = getCalendarToken() || localStore.users[currentUserId]?.googleCalendarAccessToken;
    if (userBToken) {
      await autoSyncGoogleCalendarReminders(targetHouseholdId, userBToken);
    }
  } catch (calErr) {
    console.warn("Notice: auto-sync calendar reminders on pairing:", calErr);
  }

  partnerBroadcastChannel?.postMessage({
    type: 'GORAGO_SYNC_PULSE',
    householdId: targetHouseholdId,
    timestamp: Date.now(),
  });
  notifyStoreChange();

  return {
    success: true,
    message: `Successfully linked with ${targetHouseholdName}! All shared balances, accounts, bills, and goals are now synchronized.`,
    householdId: targetHouseholdId,
  };
}

export async function unpairHouseholdMember(
  householdId: string,
  memberIdToDisconnect: string
): Promise<void> {
  const currentUserId = localStorage.getItem('gorago_current_user_id') || auth.currentUser?.uid || '';

  // 1. Remove partner UID from local store memory
  const hh = localStore.households[householdId];
  if (hh) {
    hh.memberIds = (hh.memberIds || []).filter(id => id && id !== memberIdToDisconnect);
    if ((hh as any).members && Array.isArray((hh as any).members)) {
      (hh as any).members = (hh as any).members
        .map((m: any) => (typeof m === 'string' ? m : (m?.id || m?.uid)))
        .filter((id: string) => id && id !== memberIdToDisconnect);
    }
  }

  // 2. Perform atomic arrayRemove on households/{householdId} in Firestore
  const hhRef = doc(db, 'households', householdId);
  try {
    await updateDoc(hhRef, {
      memberIds: arrayRemove(memberIdToDisconnect),
      members: arrayRemove(memberIdToDisconnect),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("Notice: updateDoc arrayRemove on household:", err);
  }

  // Server-side filter verification: query snapshot and enforce clean memberIds
  try {
    const snap = await getDoc(hhRef);
    if (snap.exists()) {
      const data = snap.data() as Household;
      const rawMemberIds = [
        ...(Array.isArray(data.memberIds) ? data.memberIds : []),
        ...(Array.isArray((data as any).members) ? (data as any).members.map((m: any) => typeof m === 'string' ? m : (m?.id || m?.uid)) : [])
      ];
      const verifiedMemberIds = Array.from(new Set(rawMemberIds.filter(id => id && id !== memberIdToDisconnect)));
      await setDoc(hhRef, {
        memberIds: verifiedMemberIds,
        members: verifiedMemberIds,
        updatedAt: Date.now(),
      }, { merge: true });
    }
  } catch (err) {
    console.warn("Failed server-side filter verification for household unpair:", err);
  }

  // 3. Create a fresh, isolated householdId (`h_{uid}`) for the unpaired user
  const newIsolatedHouseholdId = `h_${memberIdToDisconnect}`;
  const pairingCode = generatePairingCode(newIsolatedHouseholdId);

  let unpairedUserData: User | null = localStore.users[memberIdToDisconnect] || null;
  if (!unpairedUserData) {
    try {
      const uSnap = await getDoc(doc(db, 'users', memberIdToDisconnect));
      if (uSnap.exists()) {
        unpairedUserData = uSnap.data() as User;
      }
    } catch {
      // ignore
    }
  }
  const userName = unpairedUserData?.name || unpairedUserData?.displayName || 'User';

  const freshHousehold: Household = {
    id: newIsolatedHouseholdId,
    name: `${userName}'s Household`,
    type: 'partner',
    memberIds: [memberIdToDisconnect],
    members: [memberIdToDisconnect],
    pairingCode,
    isSetupComplete: true,
    emergencyFund: {
      balance: 0,
      targetAmount: 50000,
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const defaultEfAccount: Account = {
    id: `acc_ef_${newIsolatedHouseholdId}`,
    householdId: newIsolatedHouseholdId,
    ownerId: null,
    name: 'Emergency Fund (Safety Net)',
    type: 'bank',
    institution: 'High-Yield Savings Reserve',
    balance: 0,
    color: '#8B5CF6',
    icon: 'shield-alert',
    isSystemDefault: true,
  };

  localStore.households[newIsolatedHouseholdId] = freshHousehold;

  try {
    await setDoc(doc(db, 'households', newIsolatedHouseholdId), freshHousehold, { merge: true });
    await setDoc(doc(db, 'accounts', defaultEfAccount.id), defaultEfAccount, { merge: true });
  } catch (err) {
    console.warn("Failed to create isolated household in Firestore:", err);
  }

  // 4. Update the unpaired user's document in users/{uid} with their new individual householdId
  if (localStore.users[memberIdToDisconnect]) {
    localStore.users[memberIdToDisconnect].householdId = newIsolatedHouseholdId;
    localStore.users[memberIdToDisconnect].pairingCode = pairingCode;
  }

  try {
    await setDoc(doc(db, 'users', memberIdToDisconnect), {
      householdId: newIsolatedHouseholdId,
      pairingCode: pairingCode,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn("Failed to update disconnected user profile in Firestore:", err);
  }

  // 5. Clear local state for the unpaired user if current device is the unpaired user
  if (currentUserId === memberIdToDisconnect) {
    localStore.accounts = [defaultEfAccount];
    localStore.transactions = [];
    localStore.goals = [];
    localStore.debts = [];
    localStore.bills = [];
    localStore.groceryItems = [];
    localStore.groceryLists = [];
    localStore.recurringRules = [];

    const store = useAppStore.getState();
    store.setCurrentHousehold(newIsolatedHouseholdId);
    store.setHouseholdData({
      accounts: [defaultEfAccount],
      transactions: [],
      goals: [],
      debts: [],
      bills: [],
      categories: [],
    });
  }

  // 6. Broadcast pulse & dispatch custom unpair event so all connected clients and tabs refresh immediately
  partnerBroadcastChannel?.postMessage({
    type: 'GORAGO_SYNC_PULSE',
    householdId,
    timestamp: Date.now(),
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gorago_member_unpaired', {
      detail: { householdId, memberId: memberIdToDisconnect }
    }));
  }

  notifyStoreChange();
}

export async function ensureDefaultCategories(householdId: string): Promise<void> {
  for (const cat of defaultCategories) {
    const item: Category = { ...cat, id: `${cat.id}_${householdId}`, householdId };
    saveCategory(item);
  }
}

// ─── Grocery Store Helpers ──────────────────────────────────────────────────

export async function saveGroceryItem(item: GroceryItem): Promise<void> {
  const hid = item.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  item.householdId = hid;

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
    await setDoc(doc(db, 'groceryItems', item.id), item, { merge: true });
    await touchHousehold(hid);
  } catch (err: any) {
    console.warn("Firestore sync notice (grocery item saved locally):", err?.message || err);
  }
}

export async function deleteGroceryItem(itemId: string): Promise<void> {
  const item = localStore.groceryItems.find(g => g.id === itemId);
  localStore.groceryItems = localStore.groceryItems.filter(g => g.id !== itemId);
  notifyStoreChange();

  try {
    await deleteDoc(doc(db, 'groceryItems', itemId));
    if (item?.householdId) await touchHousehold(item.householdId);
  } catch (err: any) {
    console.warn("Firestore sync notice (grocery item deleted locally):", err?.message || err);
  }
}

export async function saveGroceryList(list: GroceryList): Promise<void> {
  const hid = list.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  list.householdId = hid;

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
    await setDoc(doc(db, 'groceryLists', list.id), list, { merge: true });
    await touchHousehold(hid);
  } catch (err: any) {
    console.warn("Firestore sync notice (grocery list saved locally):", err?.message || err);
  }
}

export async function deleteGroceryList(listId: string): Promise<void> {
  const list = localStore.groceryLists.find(l => l.id === listId);
  localStore.groceryLists = localStore.groceryLists.filter(l => l.id !== listId);
  notifyStoreChange();

  try {
    await deleteDoc(doc(db, 'groceryLists', listId));
    if (list?.householdId) await touchHousehold(list.householdId);
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
  const hid = goal.householdId || useAppStore.getState().currentHouseholdId || 'h_sample';
  goal.householdId = hid;

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
    await setDoc(doc(db, 'goals', goal.id), goal, { merge: true });
    await touchHousehold(hid);
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
    if (goal?.householdId) await touchHousehold(goal.householdId);
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
    await setDoc(doc(db, 'goals', goal.id), goal, { merge: true });
    await setDoc(doc(db, 'transactions', txId), tx, { merge: true });
    await touchHousehold(goal.householdId);
  } catch (err: any) {
    console.warn("Firestore sync notice (goal deposit saved locally):", err?.message || err);
  }

  return { success: true };
}

export async function wipeAllUserData(householdId?: string): Promise<void> {
  const currentUserId = localStorage.getItem('gorago_current_user_id') || auth.currentUser?.uid || '';
  const targetId = householdId || useAppStore.getState().currentHouseholdId || localStore.users['u_default']?.householdId || 'h_sample';
  const shouldRemove = (hid?: string) => !hid || hid === targetId || (targetId === 'h_sample' && hid === 'h_sample');

  // Calendar Cleanup on Reset / Data Wipe:
  // Execute Google Calendar API calls to delete all calendar events/reminders associated with the household bills and debts
  try {
    const eventIdsToDelete: string[] = [];
    localStore.bills.forEach(b => {
      if (shouldRemove(b.householdId) && b.googleCalendarEventId) {
        eventIdsToDelete.push(b.googleCalendarEventId);
      }
    });
    localStore.debts.forEach(d => {
      if (shouldRemove(d.householdId) && d.googleCalendarEventId) {
        eventIdsToDelete.push(d.googleCalendarEventId);
      }
    });

    const activeToken = getCalendarToken();
    if (activeToken) {
      await cleanupHouseholdCalendarEvents(eventIdsToDelete, activeToken);
    }
    const targetHh = localStore.households[targetId];
    if (targetHh?.memberIds) {
      for (const mId of targetHh.memberIds) {
        const mUser = localStore.users[mId];
        if (mUser?.googleCalendarAccessToken && mUser.googleCalendarAccessToken !== activeToken) {
          await cleanupHouseholdCalendarEvents(eventIdsToDelete, mUser.googleCalendarAccessToken);
        }
      }
    }
  } catch (calCleanupErr) {
    console.warn("Calendar cleanup notice during wipeAllUserData:", calCleanupErr);
  }

  // Pure 0-state purge across all local memory store collections for this household (no default account re-creation)
  localStore.accounts = localStore.accounts.filter(a => !shouldRemove(a.householdId));
  localStore.bills = localStore.bills.filter(b => !shouldRemove(b.householdId));
  localStore.debts = localStore.debts.filter(d => !shouldRemove(d.householdId));
  localStore.transactions = localStore.transactions.filter(t => !shouldRemove(t.householdId));
  localStore.categories = localStore.categories.filter(c => !shouldRemove(c.householdId));
  localStore.recurringRules = localStore.recurringRules.filter(r => !shouldRemove(r.householdId));
  localStore.groceryItems = localStore.groceryItems.filter(g => !shouldRemove(g.householdId));
  localStore.groceryLists = localStore.groceryLists.filter(l => !shouldRemove(l.householdId));
  localStore.goals = localStore.goals.filter(g => !shouldRemove(g.householdId));
  if (localStore.notifications) {
    localStore.notifications = localStore.notifications.filter(n => !n.userId || n.userId === currentUserId);
  }

  if (localStore.households[targetId]) {
    localStore.households[targetId].emergencyFund = {
      balance: 0,
      targetAmount: 0,
      updatedAt: Date.now()
    };
  }

  // Direct Zustand store reset to an isolated blank workspace
  const store = useAppStore.getState();
  store.setHouseholdData({
    accounts: [],
    transactions: [],
    goals: [],
    debts: [],
    bills: [],
    categories: [],
    emergencyFund: { balance: 0, targetAmount: 0, updatedAt: Date.now() },
  });

  // Thorough Client-Side Cache Clearance: LocalStorage & IndexedDB
  if (typeof window !== 'undefined') {
    try {
      localStorage.clear();
      localStorage.setItem('gorago_is_wiped', 'true');

      // Purge IndexedDB offline caches
      if ('indexedDB' in window) {
        if (typeof indexedDB.databases === 'function') {
          try {
            const dbs = await indexedDB.databases();
            for (const dbInfo of dbs) {
              if (dbInfo.name) {
                indexedDB.deleteDatabase(dbInfo.name);
              }
            }
          } catch {
            indexedDB.deleteDatabase('firestoreLocalDb');
            indexedDB.deleteDatabase('gorago_db');
          }
        } else {
          indexedDB.deleteDatabase('firestoreLocalDb');
          indexedDB.deleteDatabase('gorago_db');
        }
      }

      window.dispatchEvent(new CustomEvent('gorago_data_wiped'));
    } catch (e) {
      console.warn("Notice: Client cache purge during wipeAllUserData:", e);
    }
  }

  notifyStoreChange();

  // Remote Firestore Erasure: Batch-delete all documents in target household across all collections
  try {
    const collectionsToClean = [
      'accounts',
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

    // Reset household document in Firestore to a blank 0-state emergency fund
    await setDoc(doc(db, 'households', targetId), {
      emergencyFund: {
        balance: 0,
        targetAmount: 0,
        updatedAt: Date.now()
      },
      updatedAt: Date.now()
    }, { merge: true });

  } catch (err: any) {
    console.warn("Firestore wipe notice (wiped locally):", err?.message || err);
  }

  // Broadcast pulse so all connected devices / partner screens re-hydrate to blank state immediately
  partnerBroadcastChannel?.postMessage({
    type: 'GORAGO_SYNC_PULSE',
    householdId: targetId,
    timestamp: Date.now(),
  });
}

export const wipeHouseholdData = wipeAllUserData;

/**
 * Merges local offline/guest data (usually under h_sample) with the user's
 * remote household data in Firestore, preserving the latest updates.
 */
export const pairHouseholdAccount = pairHouseholdByCodeOrEmail;

export function useHouseholdSync(householdId: string | null) {
  useEffect(() => {
    if (householdId) {
      enableRealtimeSync(householdId);
    }
  }, [householdId]);
}

function parseTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return isNaN(parsed) ? (Number(val) || 0) : parsed;
  }
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'object' && typeof val.seconds === 'number') return val.seconds * 1000;
  return 0;
}

export async function mergeLocalAndRemoteData(localHhId: string, remoteHhId: string): Promise<void> {
  if (!remoteHhId || localHhId === remoteHhId) return;

  const collectionsToMerge = [
    { name: 'accounts', collRef: collections.accounts },
    { name: 'bills', collRef: collections.bills },
    { name: 'debts', collRef: collections.debts },
    { name: 'categories', collRef: collections.categories },
    { name: 'transactions', collRef: collections.transactions },
    { name: 'recurringRules', collRef: collections.recurringRules },
    { name: 'groceryItems', collRef: collections.groceryItems },
    { name: 'groceryLists', collRef: collections.groceryLists },
    { name: 'goals', collRef: collections.goals },
  ];

  for (const { name, collRef } of collectionsToMerge) {
    let remoteDocs: any[] = [];
    try {
      const q = query(collRef, where('householdId', '==', remoteHhId));
      const snap = await getDocs(q);
      remoteDocs = snap.docs.map(doc => doc.data());
    } catch (e) {
      console.warn(`Failed to fetch remote docs for merge on ${name}:`, e);
    }

    const localDocs = ((localStore as any)[name] as any[]) || [];

    const localMap = new Map<string, any>();
    localDocs.forEach(d => {
      if (d.householdId === localHhId) {
        localMap.set(d.id, d);
      }
    });

    const remoteMap = new Map<string, any>();
    remoteDocs.forEach(d => remoteMap.set(d.id, d));

    const mergedList: any[] = [];

    // Include remote docs that aren't present locally
    remoteDocs.forEach(r => {
      if (!localMap.has(r.id)) {
        mergedList.push(r);
      }
    });

    // Merge or migrate local docs
    for (const [id, localDoc] of localMap.entries()) {
      const remoteDoc = remoteMap.get(id);

      if (remoteDoc) {
        const localTime = parseTimestamp(localDoc.lastUpdated || localDoc.lastUpdatedDate || localDoc.updatedAt || localDoc.date);
        const remoteTime = parseTimestamp(remoteDoc.lastUpdated || remoteDoc.lastUpdatedDate || remoteDoc.updatedAt || remoteDoc.date);

        if (localTime >= remoteTime) {
          const updatedDoc = { 
            ...localDoc, 
            householdId: remoteHhId, 
            lastUpdatedDate: localTime || Date.now(),
            lastUpdated: localTime || Date.now()
          };
          mergedList.push(updatedDoc);
          try {
            await setDoc(doc(db, name, id), updatedDoc);
          } catch (err) {
            console.warn(`Failed to push merged local doc ${id} in ${name}:`, err);
          }
        } else {
          mergedList.push(remoteDoc);
        }
      } else {
        const updatedDoc = { 
          ...localDoc, 
          householdId: remoteHhId, 
          lastUpdatedDate: parseTimestamp(localDoc.lastUpdated || localDoc.lastUpdatedDate || localDoc.date) || Date.now(),
          lastUpdated: parseTimestamp(localDoc.lastUpdated || localDoc.lastUpdatedDate || localDoc.date) || Date.now()
        };
        mergedList.push(updatedDoc);
        try {
          await setDoc(doc(db, name, id), updatedDoc);
        } catch (err) {
          console.warn(`Failed to push local-only doc ${id} in ${name}:`, err);
        }
      }
    }

    const otherHhDocs = localDocs.filter(d => d.householdId !== localHhId);
    (localStore as any)[name] = [...otherHhDocs, ...mergedList];
  }

  notifyStoreChange();
}

