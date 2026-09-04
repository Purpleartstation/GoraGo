import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  keyMetrics?: Array<{
    label: string;
    value: string;
    trend?: 'up' | 'down' | 'neutral';
    color?: 'emerald' | 'purple' | 'amber' | 'blue' | 'rose';
  }>;
  executedAction?: any;
  chartData?: any;
  interactiveWidget?: any;
  quickFollowUps?: string[];
}

interface AppState {
  currentUserId: string;
  currentHouseholdId: string;
  viewMode: 'mine' | 'household';
  isAddMenuOpen: boolean;
  isGoraAiOpen: boolean;
  themeMode: 'dark' | 'light';
  aiCategorizationEnabled: boolean;
  activeCategoryFilter: string;
  activeTypeFilter: 'all' | 'income' | 'expense' | 'transfer';
  isTourOpen: boolean;
  currentTourStep: number;
  tourTargetFeature: string | null;
  openSheetsCount: number;
  aiChatMessages: ChatMessage[];
  aiChatHistory: ChatMessage[];
  hapticsEnabled: boolean;
  soundEffectsEnabled: boolean;
  
  setCurrentUser: (id: string) => void;
  setCurrentHousehold: (id: string) => void;
  setViewMode: (mode: 'mine' | 'household') => void;
  toggleAddMenu: (isOpen?: boolean) => void;
  setGoraAiOpen: (isOpen: boolean) => void;
  incrementOpenSheets: () => void;
  decrementOpenSheets: () => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
  setAiCategorizationEnabled: (enabled: boolean) => void;
  setActiveCategoryFilter: (catId: string) => void;
  setActiveTypeFilter: (type: 'all' | 'income' | 'expense' | 'transfer') => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setSoundEffectsEnabled: (enabled: boolean) => void;
  startAppTour: (featureKeyOrIndex?: string | number) => void;
  startTour: (featureKeyOrIndex?: string | number) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  closeAppTour: () => void;
  setAiChatMessages: (messages: ChatMessage[]) => void;
  addAiChatMessage: (message: ChatMessage) => void;
  clearAiChatMessages: (customResetText?: string) => void;
  clearAiChatHistory: (customResetText?: string) => void;
}

const DEFAULT_WELCOME_MESSAGE: ChatMessage = {
  id: 'm_welcome',
  role: 'assistant',
  text: 'Mabuhay! I am your GoraGo CFO, your warm and encouraging financial helper. I am here to help you manage your money, build your safety net, and reach your goals in Philippine Pesos (₱).',
  timestamp: Date.now(),
  quickFollowUps: [
    'Check my financial health',
    'Show my spending breakdown chart',
    'How can I save money on my bills?'
  ]
};

const saveChatMessagesToStorage = (messages: ChatMessage[]) => {
  try {
    const json = JSON.stringify(messages);
    localStorage.setItem('ai_chat_history', json);
    localStorage.setItem('gorago_ai_chat_history', json);
    localStorage.setItem('gora_ai_chat_history', json);
  } catch (err) {
    console.warn("Failed to persist AI chat messages to localStorage:", err);
  }
};

const getInitialAiMessages = (): ChatMessage[] => {
  try {
    const raw = localStorage.getItem('ai_chat_history') || 
                localStorage.getItem('gorago_ai_chat_history') || 
                localStorage.getItem('gora_ai_chat_history');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Error parsing saved AI chat messages:", err);
  }
  return [DEFAULT_WELCOME_MESSAGE];
};

const initialTheme = (localStorage.getItem('theme') as 'dark' | 'light') || 'light';
const initialAiCat = localStorage.getItem('gorago_ai_cat') !== 'false';
const initialHouseholdId = localStorage.getItem('gorago_householdId') || '';
const initialHaptics = localStorage.getItem('gorago_haptics_enabled') !== 'false';
const initialSoundFX = localStorage.getItem('gorago_sound_fx_enabled') !== 'false';
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  if (initialTheme === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

export const useAppStore = create<AppState>((set) => ({
  currentUserId: '',
  currentHouseholdId: initialHouseholdId,
  viewMode: 'mine',
  isAddMenuOpen: false,
  isGoraAiOpen: false,
  themeMode: initialTheme,
  aiCategorizationEnabled: initialAiCat,
  activeCategoryFilter: 'all',
  activeTypeFilter: 'all',
  isTourOpen: false,
  currentTourStep: 0,
  tourTargetFeature: null,
  openSheetsCount: 0,
  aiChatMessages: getInitialAiMessages(),
  get aiChatHistory() {
    return this.aiChatMessages;
  },
  hapticsEnabled: initialHaptics,
  soundEffectsEnabled: initialSoundFX,
  
  setCurrentUser: (id) => set({ currentUserId: id }),
  setCurrentHousehold: (id) => {
    if (id) {
      localStorage.setItem('gorago_householdId', id);
    } else {
      localStorage.removeItem('gorago_householdId');
    }
    set({ currentHouseholdId: id });
  },
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleAddMenu: (isOpen) => set((state) => ({ isAddMenuOpen: isOpen !== undefined ? isOpen : !state.isAddMenuOpen })),
  setGoraAiOpen: (isOpen) => set({ isGoraAiOpen: isOpen }),
  incrementOpenSheets: () => set((state) => ({ openSheetsCount: state.openSheetsCount + 1 })),
  decrementOpenSheets: () => set((state) => ({ openSheetsCount: Math.max(0, state.openSheetsCount - 1) })),
  startAppTour: (featureKeyOrIndex) => {
    if (typeof featureKeyOrIndex === 'number') {
      set({ isTourOpen: true, currentTourStep: featureKeyOrIndex, tourTargetFeature: null, isGoraAiOpen: true });
    } else if (typeof featureKeyOrIndex === 'string') {
      set({ isTourOpen: true, currentTourStep: 0, tourTargetFeature: featureKeyOrIndex, isGoraAiOpen: true });
    } else {
      set({ isTourOpen: true, currentTourStep: 0, tourTargetFeature: null, isGoraAiOpen: true });
    }
  },
  startTour: (featureKeyOrIndex) => {
    if (typeof featureKeyOrIndex === 'number') {
      set({ isTourOpen: true, currentTourStep: featureKeyOrIndex, tourTargetFeature: null, isGoraAiOpen: true });
    } else if (typeof featureKeyOrIndex === 'string') {
      set({ isTourOpen: true, currentTourStep: 0, tourTargetFeature: featureKeyOrIndex, isGoraAiOpen: true });
    } else {
      set({ isTourOpen: true, currentTourStep: 0, tourTargetFeature: null, isGoraAiOpen: true });
    }
  },
  nextTourStep: () => set((state) => ({ currentTourStep: state.currentTourStep + 1 })),
  prevTourStep: () => set((state) => ({ currentTourStep: Math.max(0, state.currentTourStep - 1) })),
  closeAppTour: () => set({ isTourOpen: false, currentTourStep: 0, tourTargetFeature: null }),
  setAiCategorizationEnabled: (enabled) => {
    localStorage.setItem('gorago_ai_cat', String(enabled));
    set({ aiCategorizationEnabled: enabled });
  },
  setHapticsEnabled: (enabled) => {
    localStorage.setItem('gorago_haptics_enabled', String(enabled));
    set({ hapticsEnabled: enabled });
  },
  setSoundEffectsEnabled: (enabled) => {
    localStorage.setItem('gorago_sound_fx_enabled', String(enabled));
    set({ soundEffectsEnabled: enabled });
  },
  setActiveCategoryFilter: (catId) => set({ activeCategoryFilter: catId }),
  setActiveTypeFilter: (type) => set({ activeTypeFilter: type }),
  setThemeMode: (mode) => {
    localStorage.setItem('theme', mode);
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (mode === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    }
    set({ themeMode: mode });
  },
  setAiChatMessages: (messages) => {
    saveChatMessagesToStorage(messages);
    set({ aiChatMessages: messages, aiChatHistory: messages });
  },
  addAiChatMessage: (message) => {
    set((state) => {
      const updated = [...state.aiChatMessages, message];
      saveChatMessagesToStorage(updated);
      return { aiChatMessages: updated, aiChatHistory: updated };
    });
  },
  clearAiChatMessages: (customResetText) => {
    const resetMsg: ChatMessage = {
      id: `m_welcome_reset_${Date.now()}`,
      role: 'assistant',
      text: customResetText || 'Mabuhay! Your data has been completely reset to 0. I am ready to help you set up new accounts, start tracking, and build a simple budget in Philippine Pesos (₱).',
      timestamp: Date.now(),
      quickFollowUps: [
        'Help me set up my primary bank or e-wallet',
        'Help me establish an emergency fund goal',
        'What are my first 3 steps starting from 0?'
      ]
    };
    const resetList = [resetMsg];
    saveChatMessagesToStorage(resetList);
    set({ aiChatMessages: resetList, aiChatHistory: resetList });
  },
  clearAiChatHistory: (customResetText) => {
    const resetMsg: ChatMessage = {
      id: `m_welcome_reset_${Date.now()}`,
      role: 'assistant',
      text: customResetText || 'Mabuhay! Your data has been completely reset to 0. I am ready to help you set up new accounts, start tracking, and build a simple budget in Philippine Pesos (₱).',
      timestamp: Date.now(),
      quickFollowUps: [
        'Help me set up my primary bank or e-wallet',
        'Help me establish an emergency fund goal',
        'What are my first 3 steps starting from 0?'
      ]
    };
    const resetList = [resetMsg];
    saveChatMessagesToStorage(resetList);
    set({ aiChatMessages: resetList, aiChatHistory: resetList });
  },
}));
