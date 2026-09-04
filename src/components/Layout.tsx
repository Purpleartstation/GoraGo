import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import AddMenu from './AddMenu';
import GoraAIAssistant from './GoraAIAssistant';
import AppTourOverlay from './AppTourOverlay';

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-zinc-950 flex items-center justify-center p-0 sm:py-6 overflow-hidden transition-colors duration-300">
      {/* Strict iPhone Mobile Frame */}
      <div className="w-full max-w-[430px] mx-auto h-[100dvh] sm:h-[880px] sm:rounded-[48px] bg-[#FFFFFF] dark:bg-[#12161A] text-zinc-800 dark:text-zinc-100 border-x sm:border border-white/60 dark:border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.12)] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] relative flex flex-col overflow-hidden transition-colors duration-300">
        
        {/* Soft Pastel Ambient Glows */}
        <div className="absolute top-[-40px] left-[-40px] w-72 h-72 bg-purple-200/40 dark:bg-purple-900/20 rounded-full blur-[90px] pointer-events-none z-0 transition-all duration-300" />
        <div className="absolute bottom-[-40px] right-[-40px] w-80 h-80 bg-pink-200/40 dark:bg-fuchsia-900/20 rounded-full blur-[90px] pointer-events-none z-0 transition-all duration-300" />
        <div className="absolute top-[40%] right-[-50px] w-64 h-64 bg-sky-200/35 dark:bg-indigo-900/20 rounded-full blur-[80px] pointer-events-none z-0 transition-all duration-300" />

        {/* Scrollable Main Content Frame with Generous Bottom Dock Clearance and Native iOS Momentum Scrolling */}
        <main className="flex-1 overflow-y-auto pt-safe-top pb-[calc(10rem+env(safe-area-inset-bottom,0px))] no-scrollbar relative -webkit-overflow-scrolling-touch overscroll-y-contain">
          <Outlet />
        </main>
        
        {/* Floating iOS Glass Bottom Dock */}
        <BottomNav />

        {/* Add Menu Bottom Sheet */}
        <AddMenu />

        {/* Real AI Floating Financial Coach */}
        <GoraAIAssistant />

        {/* Interactive Guided App Tour & Explorer */}
        <AppTourOverlay />
      </div>
    </div>
  );
}

