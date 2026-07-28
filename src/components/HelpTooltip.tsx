import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface HelpTooltipProps {
  text: string;
  title?: string;
}

export default function HelpTooltip({ text, title }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-flex items-center ml-1.5 z-30" ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-4 h-4 rounded-full bg-black/5 dark:bg-white/10 hover:bg-purple-500/20 hover:text-purple-600 dark:hover:text-fuchsia-300 text-zinc-500 dark:text-zinc-400 border border-zinc-900/10 dark:border-white/10 flex items-center justify-center text-[10px] font-black transition-all active:scale-90"
        aria-label="More information"
      >
        ?
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 p-3 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-white/60 dark:border-white/15 rounded-2xl shadow-2xl text-xs z-[60] text-zinc-800 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-zinc-200 dark:border-white/10">
            <span className="font-extrabold text-[10px] text-purple-600 dark:text-fuchsia-400 uppercase tracking-wider">
              {title || 'Help Info'}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-0.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-md"
            >
              <X size={12} />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 font-medium">{text}</p>
        </div>
      )}
    </div>
  );
}
