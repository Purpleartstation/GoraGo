import { create } from 'zustand';

interface AppState {
  currentUserId: string;
  currentHouseholdId: string;
  viewMode: 'mine' | 'household';
  isAddMenuOpen: boolean;
  themeMode: 'dark' | 'light';
  
  setCurrentUser: (id: string) => void;
  setCurrentHousehold: (id: string) => void;
  setViewMode: (mode: 'mine' | 'household') => void;
  toggleAddMenu: (isOpen?: boolean) => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
}

const initialTheme = (localStorage.getItem('theme') as 'dark' | 'light') || 'light';
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
  currentHouseholdId: '',
  viewMode: 'mine',
  isAddMenuOpen: false,
  themeMode: initialTheme,
  
  setCurrentUser: (id) => set({ currentUserId: id }),
  setCurrentHousehold: (id) => set({ currentHouseholdId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleAddMenu: (isOpen) => set((state) => ({ isAddMenuOpen: isOpen !== undefined ? isOpen : !state.isAddMenuOpen })),
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
}));
