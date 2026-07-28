import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import AddMenu from './AddMenu';

export default function Layout() {
  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto relative bg-background-light dark:bg-background-dark shadow-xl overflow-hidden">
      {/* 
        Main content area is scrollable. 
        Bottom padding is generous to account for the bottom nav bar + safe area 
      */}
      <main className="flex-1 overflow-y-auto pt-safe-top pb-[calc(110px+env(safe-area-inset-bottom))] no-scrollbar">
        <Outlet />
      </main>
      
      {/* Fixed bottom navigation */}
      <BottomNav />

      {/* Add Menu Bottom Sheet */}
      <AddMenu />
    </div>
  );
}
