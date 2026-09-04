export interface UserFinancialGoal {
  id: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  category: 'savings' | 'debt_payoff' | 'purchase' | 'investment' | 'emergency_fund';
  deadline?: string; // e.g. '2026-12-31'
  notes?: string;
  createdAt: number;
}

export interface UserMemoryItem {
  id: string;
  key: string;
  content: string;
  category: 'goal' | 'preference' | 'rule' | 'context';
  timestamp: number;
}

const STORAGE_GOALS_KEY = 'gora_ai_financial_goals_v1';
const STORAGE_MEMORIES_KEY = 'gora_ai_user_memories_v1';

// Initial default goals tailored to personal financial health in the Philippines
const defaultInitialGoals: UserFinancialGoal[] = [
  {
    id: 'goal_emergency_fund',
    title: 'Emergency Fund Buffer (3 Months)',
    targetAmount: 50000,
    currentAmount: 20000,
    category: 'emergency_fund',
    deadline: '2026-12-31',
    notes: 'Liquid safety cushion in Maya/BPI for unexpected expenses',
    createdAt: Date.now() - 30 * 86400000
  },
  {
    id: 'goal_credit_card_payoff',
    title: 'Pay Off High-Interest Credit Card',
    targetAmount: 18000,
    currentAmount: 8000,
    category: 'debt_payoff',
    deadline: '2026-10-31',
    notes: 'Aggressively eliminate 3% monthly finance charges',
    createdAt: Date.now() - 15 * 86400000
  }
];

const defaultInitialMemories: UserMemoryItem[] = [
  {
    id: 'mem_1',
    key: 'target_savings_rate',
    content: 'Targeting at least 20% of monthly income saved into digital savings',
    category: 'goal',
    timestamp: Date.now()
  },
  {
    id: 'mem_2',
    key: 'primary_wallet',
    content: 'Prefers GCash for everyday food, groceries, and commute payments',
    category: 'preference',
    timestamp: Date.now()
  },
  {
    id: 'mem_3',
    key: 'frugality_rule',
    content: 'Requires a 48-hour cooling period for discretionary purchases over ₱5,000',
    category: 'rule',
    timestamp: Date.now()
  }
];

export function getStoredFinancialGoals(): UserFinancialGoal[] {
  try {
    const isWiped = localStorage.getItem('gorago_is_wiped') === 'true';
    const raw = localStorage.getItem(STORAGE_GOALS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (isWiped) {
      return [];
    }
    localStorage.setItem(STORAGE_GOALS_KEY, JSON.stringify(defaultInitialGoals));
    return defaultInitialGoals;
  } catch {
    return [];
  }
}

export function saveFinancialGoal(goal: Omit<UserFinancialGoal, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): UserFinancialGoal[] {
  try {
    const current = getStoredFinancialGoals();
    const existingIndex = current.findIndex(g => (goal.id && g.id === goal.id) || g.title.toLowerCase() === goal.title.toLowerCase());
    
    let updated: UserFinancialGoal[];
    if (existingIndex >= 0) {
      const existing = current[existingIndex];
      const merged: UserFinancialGoal = {
        ...existing,
        ...goal,
        id: existing.id,
        createdAt: existing.createdAt || Date.now()
      };
      updated = [...current];
      updated[existingIndex] = merged;
    } else {
      const newGoal: UserFinancialGoal = {
        ...goal,
        id: goal.id || `goal_${Date.now()}`,
        createdAt: Date.now()
      };
      updated = [newGoal, ...current];
    }

    localStorage.setItem(STORAGE_GOALS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save financial goal:', err);
    return getStoredFinancialGoals();
  }
}

export function deleteFinancialGoal(id: string): UserFinancialGoal[] {
  try {
    const current = getStoredFinancialGoals();
    const filtered = current.filter(g => g.id !== id);
    localStorage.setItem(STORAGE_GOALS_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (err) {
    console.error('Failed to delete financial goal:', err);
    return getStoredFinancialGoals();
  }
}

export function getStoredUserMemories(): UserMemoryItem[] {
  try {
    const isWiped = localStorage.getItem('gorago_is_wiped') === 'true';
    const raw = localStorage.getItem(STORAGE_MEMORIES_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (isWiped) {
      return [];
    }
    localStorage.setItem(STORAGE_MEMORIES_KEY, JSON.stringify(defaultInitialMemories));
    return defaultInitialMemories;
  } catch {
    return [];
  }
}

export function saveUserMemory(key: string, content: string, category: 'goal' | 'preference' | 'rule' | 'context' = 'context'): UserMemoryItem[] {
  try {
    const current = getStoredUserMemories();
    const existingIdx = current.findIndex(m => m.key.toLowerCase() === key.toLowerCase());
    let updated: UserMemoryItem[];

    if (existingIdx >= 0) {
      updated = [...current];
      updated[existingIdx] = {
        ...updated[existingIdx],
        content,
        category,
        timestamp: Date.now()
      };
    } else {
      const newMem: UserMemoryItem = {
        id: `mem_${Date.now()}`,
        key,
        content,
        category,
        timestamp: Date.now()
      };
      updated = [newMem, ...current];
    }

    localStorage.setItem(STORAGE_MEMORIES_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save user memory:', err);
    return getStoredUserMemories();
  }
}

export function deleteUserMemory(id: string): UserMemoryItem[] {
  try {
    const current = getStoredUserMemories();
    const filtered = current.filter(m => m.id !== id);
    localStorage.setItem(STORAGE_MEMORIES_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (err) {
    console.error('Failed to delete user memory:', err);
    return getStoredUserMemories();
  }
}

export function clearAllFinancialGoalsAndMemories(): void {
  try {
    localStorage.setItem(STORAGE_GOALS_KEY, JSON.stringify([]));
    localStorage.setItem(STORAGE_MEMORIES_KEY, JSON.stringify([]));
    localStorage.removeItem('gora_ai_chat_history');
    localStorage.removeItem('gora_ai_last_briefing');
    localStorage.removeItem('gora_ai_custom_prompts');
    localStorage.setItem('gorago_is_wiped', 'true');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gorago_data_wiped'));
    }
  } catch (err) {
    console.error('Failed to clear financial goals and memories:', err);
  }
}

