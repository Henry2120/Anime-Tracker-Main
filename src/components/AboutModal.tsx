import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, Tag, History } from 'lucide-react';
import { APP_VERSION_INFO } from '../config/version';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#25242A]/40 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-md bg-white border border-[#E7E3DF] rounded-2xl shadow-xl p-6 overflow-hidden z-10 space-y-5 text-[#25242A]"
          >
            {/* Top Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-xl text-[#77747D] hover:text-[#25242A] hover:bg-[#F7F5F2] transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Header / Product Brand */}
            <div className="flex items-start gap-3.5 pr-6">
              <div className="w-10 h-10 rounded-xl bg-[#F0EDFA] border border-[#7567C7]/20 flex items-center justify-center text-[#7567C7] shrink-0 mt-0.5">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold tracking-tight text-[#25242A]">
                    AniVerse
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-[#F0EDFA] border border-[#7567C7]/30 text-[#7567C7] text-[11px] font-bold">
                    {APP_VERSION_INFO.currentVersion}
                  </span>
                </div>
                <p className="text-xs text-[#77747D] mt-0.5 font-normal italic">
                  "{APP_VERSION_INFO.tagline}"
                </p>
              </div>
            </div>

            {/* Current Version Highlight */}
            <div className="p-3.5 rounded-xl bg-[#F7F5F2] border border-[#E7E3DF] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[#77747D] font-medium">
                <Tag className="h-4 w-4 text-[#7567C7]" />
                <span>Current Installed Version</span>
              </div>
              <span className="font-bold text-[#25242A] bg-white px-2.5 py-1 rounded-lg border border-[#E7E3DF]">
                {APP_VERSION_INFO.currentVersion}
              </span>
            </div>

            {/* Version History */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-[#7567C7]">
                <History className="h-3.5 w-3.5" />
                <span>Version History</span>
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1 text-xs">
                {APP_VERSION_INFO.history.map((entry, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-white border border-[#E7E3DF] space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between font-bold text-[#25242A]">
                      <span className="text-[#7567C7]">{entry.version}</span>
                      <span className="text-[11px] font-semibold text-[#77747D]">
                        {entry.date}
                      </span>
                    </div>
                    <ul className="space-y-1 text-[#77747D] font-normal list-disc list-inside leading-relaxed">
                      {entry.changes.map((change, cIdx) => (
                        <li key={cIdx}>{change}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer Action */}
            <div className="pt-2 border-t border-[#E7E3DF] flex items-center justify-between text-xs text-[#77747D]">
              <span>AniVerse &copy; 2026</span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl bg-[#F7F5F2] hover:bg-[#E7E3DF] text-[#25242A] font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
