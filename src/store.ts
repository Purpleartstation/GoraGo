import { create } from 'zustand';

interface AppState {
  currentUserId: string;
  currentHouseholdId: string;
  viewMode: 'mine' | 'household';
  isAddMenuOpen: boolean;
  
  setCurrentUser: (id: string) => void;
  setCurrentHousehold: (id: string) => void;
  setViewMode: (mode: 'mine' | 'household') => void;
  toggleAddMenu: (isOpen?: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentUserId: '',
  currentHouseholdId: '',
  viewMode: 'mine',
  isAddMenuOpen: false,
  
  setCurrentUser: (id) => set({ currentUserId: id }),
  setCurrentHousehold: (id) => set({ currentHouseholdId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleAddMenu: (isOpen) => set((state) => ({ isAddMenuOpen: isOpen !== undefined ? isOpen : !state.isAddMenuOpen })),
}));
