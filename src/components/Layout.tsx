import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import AddMenu from './AddMenu';

export default function Layout() {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center p-0 sm:py-6 overflow-hidden transition-colors duration-300">
      {/* Strict iPhone Mobile Frame */}
      <div className="w-full max-w-[430px] h-[100dvh] sm:h-[880px] sm:rounded-[48px] bg-white dark:bg-black text-zinc-800 dark:text-zinc-100 border-x sm:border border-white/40 dark:border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] relative flex flex-col overflow-hidden transition-colors duration-300">
        
        {/* Ambient Colorful Background Blobs */}
        <div className="absolute top-[-50px] left-[-50px] w-72 h-72 bg-purple-400/40 dark:bg-purple-600/30 rounded-full blur-[100px] pointer-events-none z-0 transition-all duration-300" />
        <div className="absolute bottom-[-50px] right-[-50px] w-80 h-80 bg-pink-400/40 dark:bg-fuchsia-600/30 rounded-full blur-[100px] pointer-events-none z-0 transition-all duration-300" />
        <div className="absolute top-[40%] right-[-60px] w-64 h-64 bg-fuchsia-400/30 dark:bg-purple-500/20 rounded-full blur-[90px] pointer-events-none z-0 transition-all duration-300" />

        {/* Scrollable Main Content Frame */}
        <main className="flex-1 overflow-y-auto pt-safe-top pb-32 no-scrollbar">
          <Outlet />
        </main>
        
        {/* Floating iOS Glass Bottom Dock */}
        <BottomNav />

        {/* Add Menu Bottom Sheet */}
        <AddMenu />
      </div>
    </div>
  );
}

