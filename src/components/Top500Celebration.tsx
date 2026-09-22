import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Sparkles, ExternalLink, FileText, Download } from 'lucide-react';

/**
 * Temporary AI Riser Vietnam 2026 Top 500 celebration feature flag.
 * Set to false when the celebration period is over (after ~1 month).
 */
export const SHOW_TOP_500_CELEBRATION = true;

interface Top500CelebrationProps {
  className?: string;
}

export const Top500Celebration: React.FC<Top500CelebrationProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Keyboard support: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Lock body scroll while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on open
    setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // If the feature flag is disabled, do not render anything
  if (!SHOW_TOP_500_CELEBRATION) {
    return null;
  }

  return (
    <>
      {/* HOMEPAGE TOP-RIGHT CELEBRATION BADGE BUTTON */}
      <button
        id="top-500-celebration-button"
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="AniVerse Top 500 AI Riser Vietnam 2026 Celebration"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="AniVerse Milestone: Top 500 in AI Riser Vietnam 2026"
        className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 cursor-pointer overflow-hidden group select-none border ${
          className || ''
        } bg-gradient-to-r from-[#FFF9E6] via-[#FFF3D1] to-[#FFF9E6] dark:from-[#2E2718] dark:via-[#3D331F] dark:to-[#2E2718] text-[#8C6418] dark:text-[#F3D78A] border-[#E5B869]/40 dark:border-[#E5B869]/30 shadow-xs hover:shadow-md hover:border-[#E5B869] dark:hover:border-[#E5B869]/60 hover:scale-[1.02] active:scale-[0.98]`}
      >
        {/* Subtle moving shimmer highlight */}
        <span
          className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent pointer-events-none"
          aria-hidden="true"
        />

        {/* Small subtle gold trophy icon */}
        <span className="text-sm leading-none shrink-0 drop-shadow-xs" aria-hidden="true">
          🏆
        </span>

        {/* Button label */}
        <span className="tracking-tight font-extrabold whitespace-nowrap">
          Top 500
        </span>

        {/* Subtle sakura petal dot */}
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#FFB7C5] dark:bg-[#F79FA4] shrink-0 animate-pulse"
          aria-hidden="true"
        />
      </button>

      {/* CELEBRATION MODAL */}
      <AnimatePresence>
        {isOpen && (
          <div
            id="top-500-celebration-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="top-500-modal-title"
            aria-describedby="top-500-modal-description"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          >
            {/* Soft Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-[#25242A]/50 dark:bg-black/70 backdrop-blur-xs"
              aria-hidden="true"
            />

            {/* Modal Dialog Card */}
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white dark:bg-[#1C1A24] border border-[#E5B869]/30 dark:border-[#E5B869]/20 rounded-3xl shadow-2xl overflow-hidden z-10 text-[#25242A] dark:text-[#EAE8F0]"
            >
              {/* Soft decorative background glows */}
              <div
                className="absolute -top-16 -left-16 w-56 h-56 bg-[#FFF4D4] dark:bg-[#3D331F]/40 rounded-full blur-3xl pointer-events-none opacity-60"
                aria-hidden="true"
              />
              <div
                className="absolute -top-16 -right-16 w-56 h-56 bg-[#FFE4E9] dark:bg-[#4A2535]/30 rounded-full blur-3xl pointer-events-none opacity-60"
                aria-hidden="true"
              />

              {/* Close Button */}
              <button
                ref={closeButtonRef}
                id="top-500-close-button"
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-2xl text-[#77747D] dark:text-[#A4A1AA] hover:text-[#25242A] dark:hover:text-white hover:bg-[#F7F5F2] dark:hover:bg-[#2A2736] transition-colors cursor-pointer z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5B869]"
                title="Close celebration modal"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Scrollable Modal Content */}
              <div className="overflow-y-auto px-5 py-6 sm:px-8 sm:py-7 space-y-5 text-center">
                {/* Heading / Sakura Eyebrow */}
                <div className="space-y-1.5 pt-1">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF7E0] dark:bg-[#332A18] border border-[#E5B869]/30 text-[#8C6418] dark:text-[#F3D78A] text-xs font-semibold">
                    <span aria-hidden="true">🌸</span>
                    <span id="top-500-modal-title" className="tracking-wide">
                      A Special AniVerse Milestone
                    </span>
                    <span aria-hidden="true">🌸</span>
                  </div>

                  {/* Main Achievement: TOP 500 */}
                  <div className="pt-2">
                    <div className="relative inline-block">
                      <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#B3801B] via-[#E5B869] to-[#996D14] dark:from-[#F5D88F] dark:via-[#FFE8A3] dark:to-[#E0B55A] drop-shadow-xs">
                        TOP 500
                      </h2>
                      <Sparkles
                        className="h-4 w-4 text-[#E5B869] absolute -top-1 -right-4 animate-pulse"
                        aria-hidden="true"
                      />
                    </div>
                  </div>

                  {/* Contest Name */}
                  <p className="text-sm font-bold tracking-wider text-[#7567C7] dark:text-[#A597F5] uppercase">
                    AI Riser Vietnam 2026
                  </p>

                  {/* Celebration Message */}
                  <p
                    id="top-500-modal-description"
                    className="text-base sm:text-lg font-semibold text-[#25242A] dark:text-[#F4F2F7] max-w-md mx-auto pt-1"
                  >
                    AniVerse has made it into the Top 500!
                  </p>
                </div>

                {/* CERTIFICATE DISPLAY CONTAINER */}
                <div className="relative rounded-2xl overflow-hidden border border-[#E5B869]/30 dark:border-[#E5B869]/25 bg-[#FAF8F5] dark:bg-[#14131A] shadow-md p-1.5 sm:p-2 group">
                  <div className="relative w-full rounded-xl overflow-hidden bg-neutral-900/5 dark:bg-black/40">
                    {/* High-resolution Certificate Image */}
                    <img
                      src="/certificates/airiser-vietnam-2026-top500.jpg"
                      alt="Official AI Riser Vietnam 2026 Top 500 Certificate awarded to AniVerse"
                      className="w-full h-auto max-h-[46vh] sm:max-h-[50vh] object-contain mx-auto rounded-lg transition-transform duration-300 group-hover:scale-[1.01]"
                      loading="eager"
                    />
                  </div>

                  {/* Certificate Action Footer: View Full PDF / Download */}
                  <div className="mt-2.5 pt-2 border-t border-[#E7E3DF]/80 dark:border-[#2D2A3D] flex flex-wrap items-center justify-between gap-2 px-2 text-xs text-[#77747D] dark:text-[#AEA8C9]">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Trophy className="h-3.5 w-3.5 text-[#E5B869]" />
                      <span>Silver Tier LeaderBoard Certificate</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href="/certificates/airiser-vietnam-2026-top500.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-[#25232F] border border-[#E7E3DF] dark:border-[#383447] hover:border-[#E5B869] dark:hover:border-[#E5B869] text-[#25242A] dark:text-[#EAE8F0] hover:text-[#8C6418] dark:hover:text-[#F3D78A] font-semibold transition-colors cursor-pointer shadow-2xs"
                      >
                        <FileText className="h-3.5 w-3.5 text-[#E5B869]" />
                        <span>Open PDF</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>

                      <a
                        href="/certificates/airiser-vietnam-2026-top500.pdf"
                        download="airiser-vietnam-2026-top500.pdf"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#FFF9E6] dark:bg-[#2D2718] border border-[#E5B869]/30 hover:border-[#E5B869] text-[#8C6418] dark:text-[#F3D78A] font-semibold transition-colors cursor-pointer shadow-2xs"
                        title="Download Certificate PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                </div>

                {/* Supporting Message */}
                <div className="pt-1 pb-1">
                  <p className="text-xs sm:text-sm text-[#77747D] dark:text-[#AEA8C9] font-normal italic">
                    Built with anime, AI, and a lot of debugging.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
