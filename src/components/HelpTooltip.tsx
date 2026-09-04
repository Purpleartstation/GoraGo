import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Info } from 'lucide-react';

export interface HelpTooltipProps {
  text: string;
  title?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  buttonClassName?: string;
}

export default function HelpTooltip({
  text,
  title,
  align = 'center',
  className = '',
  buttonClassName = '',
}: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
    arrowLeft: number;
    width: number;
  }>({
    top: 0,
    left: 0,
    placement: 'bottom',
    arrowLeft: 0,
    width: 280,
  });

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Determine target width (responsive, max 300px, clamped to screen)
    const padding = 16;
    const maxTooltipWidth = Math.min(300, viewportWidth - padding * 2);
    const tooltipWidth = maxTooltipWidth;

    // Approximate height if not yet measured (standard 120-150px)
    const tooltipHeight = tooltipRef.current
      ? tooltipRef.current.offsetHeight
      : 140;

    // Decide vertical placement (auto-flip if not enough space below)
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const gap = 8;

    let placement: 'top' | 'bottom' = 'bottom';
    let top = triggerRect.bottom + gap;

    if (spaceBelow < tooltipHeight + gap + 16 && spaceAbove > spaceBelow) {
      placement = 'top';
      top = triggerRect.top - tooltipHeight - gap;
    }

    // Determine horizontal alignment & clamping
    const triggerCenterX = triggerRect.left + triggerRect.width / 2;
    let targetLeft = triggerCenterX - tooltipWidth / 2;

    if (align === 'left') {
      targetLeft = triggerRect.left;
    } else if (align === 'right') {
      targetLeft = triggerRect.right - tooltipWidth;
    }

    // Clamp horizontally to screen bounds
    const clampedLeft = Math.max(
      padding,
      Math.min(targetLeft, viewportWidth - tooltipWidth - padding)
    );

    // Compute exact arrow offset relative to the tooltip box
    const arrowLeft = Math.max(
      16,
      Math.min(triggerCenterX - clampedLeft, tooltipWidth - 20)
    );

    setCoords({
      top: Math.max(padding, top),
      left: clampedLeft,
      placement,
      arrowLeft,
      width: tooltipWidth,
    });
  }, [align]);

  // Handle open / reposition
  useEffect(() => {
    if (isOpen) {
      updatePosition();

      const handleScrollOrResize = () => {
        updatePosition();
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
        }
      };

      const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
        const target = e.target as Node;
        if (
          triggerRef.current &&
          triggerRef.current.contains(target)
        ) {
          return;
        }
        if (
          tooltipRef.current &&
          tooltipRef.current.contains(target)
        ) {
          return;
        }
        setIsOpen(false);
      };

      window.addEventListener('resize', handleScrollOrResize, { passive: true });
      window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handlePointerDownOutside, { capture: true });
      document.addEventListener('touchstart', handlePointerDownOutside, { capture: true });

      // Secondary check once DOM renders to get accurate offsetHeight
      const timer = setTimeout(updatePosition, 20);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', handleScrollOrResize);
        window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mousedown', handlePointerDownOutside, { capture: true });
        document.removeEventListener('touchstart', handlePointerDownOutside, { capture: true });
      };
    }
  }, [isOpen, updatePosition]);

  return (
    <>
      <span
        className={`inline-flex items-center ml-1.5 align-middle select-none ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }}
          className={`w-4 h-4 rounded-full bg-black/5 dark:bg-white/10 hover:bg-purple-500/25 hover:text-purple-600 dark:hover:text-fuchsia-300 text-zinc-500 dark:text-zinc-400 border border-zinc-900/10 dark:border-white/10 flex items-center justify-center text-[10px] font-black transition-all active:scale-90 touch-manipulation cursor-pointer ${buttonClassName}`}
          aria-label={title ? `Information about ${title}` : 'More information'}
          aria-expanded={isOpen}
        >
          ?
        </button>
      </span>

      {isOpen &&
        createPortal(
          <div
            ref={tooltipRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999,
            }}
            className="p-3.5 bg-zinc-900/95 dark:bg-zinc-900/98 backdrop-blur-2xl border border-zinc-700/80 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.6)] text-zinc-100 animate-in fade-in zoom-in-95 duration-150 select-text"
          >
            {/* Pointer Arrow */}
            <div
              style={{
                left: `${coords.arrowLeft}px`,
              }}
              className={`absolute w-3 h-3 bg-zinc-900/95 dark:bg-zinc-900/98 border-zinc-700/80 transform rotate-45 pointer-events-none -translate-x-1/2 ${
                coords.placement === 'bottom'
                  ? '-top-1.5 border-t border-l'
                  : '-bottom-1.5 border-b border-r'
              }`}
            />

            {/* Header */}
            <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-zinc-700/60 relative z-10">
              <span className="font-black text-[10px] text-purple-400 uppercase tracking-wider flex items-center gap-1.5 truncate pr-2">
                <Info size={12} className="text-purple-400 shrink-0" />
                <span className="truncate">{title || 'Information'}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 -mr-1 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                aria-label="Close tooltip"
              >
                <X size={13} />
              </button>
            </div>

            {/* Body */}
            <p className="text-xs leading-relaxed text-zinc-300 font-medium relative z-10 break-words">
              {text}
            </p>
          </div>,
          document.body
        )}
    </>
  );
}
