import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Tv, Sparkles, Music2, Layers, Check } from 'lucide-react';

export type AppMode = 'anime' | 'music';

interface WorldSwitcherProps {
  currentMode: AppMode;
  onSelectMode: (mode: AppMode) => void;
  variant?: 'header' | 'music-header';
}

export const WorldSwitcher: React.FC<WorldSwitcherProps> = ({
  currentMode,
  onSelectMode,
  variant = 'header',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Esc key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleModeChange = (mode: AppMode) => {
    onSelectMode(mode);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Brand Trigger Button */}
      <button
        type="button"
        id="world-switcher-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Switch AniVerse Universe Mode"
        className={`group flex items-center gap-2 sm:gap-2.5 px-2 sm:px-2.5 py-1.5 rounded-xl transition-all duration-200 cursor-pointer ${
          variant === 'music-header'
            ? 'bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 shadow-sm'
            : 'bg-transparent hover:bg-[#F7F5F2] dark:hover:bg-[#26252F] text-[#25242A] dark:text-[#F4F2F7]'
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`text-base sm:text-lg font-bold transition-transform duration-200 group-hover:scale-110 ${
              currentMode === 'music' ? 'text-[#EC4899]' : 'text-[#7567C7]'
            }`}
          >
            {currentMode === 'music' ? '🎵' : '✦'}
          </span>
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg font-bold tracking-tight">
                {currentMode === 'music' ? 'Music Lab' : 'AniVerse'}
              </span>
              <span className="text-[10px] font-medium text-[#77747D] dark:text-[#9E9AA6] tracking-wider hidden sm:inline-block">
                {currentMode === 'music' ? '音楽室' : 'アニバース'}
              </span>
            </div>
          </div>
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 text-[#77747D] dark:text-[#9E9AA6] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#7567C7]' : 'group-hover:text-[#25242A] dark:group-hover:text-white'
          }`}
        />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-[#1C192E] rounded-2xl shadow-2xl border border-[#E7E3DF] dark:border-[#2D2A4A] p-2 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md"
        >
          {/* Header info */}
          <div className="px-3 py-2 border-b border-[#E7E3DF] dark:border-[#2D2A4A] mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#77747D] dark:text-[#AEA8C9]">
              <Layers className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>AniVerse Worlds</span>
            </div>
            <span className="text-[10px] font-medium text-[#77747D] dark:text-[#9E9AA6]">
              Switch Mode
            </span>
          </div>

          {/* Mode 1: Anime Tracker */}
          <button
            type="button"
            role="menuitem"
            id="world-select-anime"
            onClick={() => handleModeChange('anime')}
            className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-3 group relative ${
              currentMode === 'anime'
                ? 'bg-[#F0EDFA] text-[#7567C7] dark:bg-[#7567C7]/20 dark:text-[#D8D2FF] border border-[#7567C7]/30'
                : 'text-[#25242A] dark:text-[#F4F2F7] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D]'
            }`}
          >
            <div
              className={`p-2 rounded-xl shrink-0 transition-transform group-hover:scale-105 ${
                currentMode === 'anime'
                  ? 'bg-[#7567C7] text-white shadow-sm'
                  : 'bg-[#F0EDFA] dark:bg-[#2E284A] text-[#7567C7]'
              }`}
            >
              <Tv className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-xs sm:text-sm text-[#25242A] dark:text-white flex items-center gap-1.5">
                  🌸 Anime Tracker
                </span>
                {currentMode === 'anime' && (
                  <span className="text-[10px] font-semibold bg-[#7567C7] text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <Check className="h-2.5 w-2.5" />
                    Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#77747D] dark:text-[#AEA8C9] mt-0.5 leading-snug line-clamp-2">
                Seasonal releases, MAL library sync, calendar schedule & AI insights.
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 text-[9px] font-semibold text-[#77747D] dark:text-[#AEA8C9]/80 uppercase tracking-wider">
                <span>My Season</span>
                <span>•</span>
                <span>My List</span>
                <span>•</span>
                <span>Calendar</span>
                <span>•</span>
                <span>Stats</span>
              </div>
            </div>
          </button>

          {/* Divider */}
          <div className="my-1.5 border-t border-[#E7E3DF] dark:border-[#2D2A4A]" />

          {/* Mode 2: Music Lab */}
          <button
            type="button"
            role="menuitem"
            id="world-select-music"
            onClick={() => handleModeChange('music')}
            className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-3 group relative ${
              currentMode === 'music'
                ? 'bg-[#FDF2F8] text-[#EC4899] dark:bg-[#EC4899]/20 dark:text-[#FBCFE8] border border-[#EC4899]/30'
                : 'text-[#25242A] dark:text-[#F4F2F7] hover:bg-[#F7F5F2] dark:hover:bg-[#25223D]'
            }`}
          >
            <div
              className={`p-2 rounded-xl shrink-0 transition-transform group-hover:scale-105 ${
                currentMode === 'music'
                  ? 'bg-gradient-to-br from-[#EC4899] to-[#8B5CF6] text-white shadow-sm'
                  : 'bg-[#FCE7F3] dark:bg-[#3D1E30] text-[#EC4899]'
              }`}
            >
              <Music2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-xs sm:text-sm text-[#25242A] dark:text-white flex items-center gap-1.5">
                  🎵 Music Lab
                </span>
                <span className="text-[10px] font-bold bg-gradient-to-r from-[#EC4899] to-[#8B5CF6] text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-2xs">
                  <Sparkles className="h-2.5 w-2.5" />
                  Experimental
                </span>
              </div>
              <p className="text-[11px] text-[#77747D] dark:text-[#AEA8C9] mt-0.5 leading-snug line-clamp-2">
                Turn music into an atmospheric visual performance & soundstage.
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 text-[9px] font-semibold text-[#EC4899] dark:text-[#F472B6] uppercase tracking-wider">
                <span>Soundstage</span>
                <span>•</span>
                <span>Acoustic Visuals</span>
                <span>•</span>
                <span>Scene Generator</span>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
