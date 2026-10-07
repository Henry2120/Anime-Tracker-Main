import React, { useRef } from 'react';
import { WorldSwitcher, AppMode } from '../WorldSwitcher';
import { AppTheme } from '../../types/theme';
import { Character3DViewer } from './Character3DViewer';
import { useConcertMusic } from './ConcertMusicContext';
import { Sparkles, Tv, Moon, Sun } from 'lucide-react';

interface PersistentConcertHostProps {
  currentMode: AppMode; // 'anime' | 'music'
  theme: AppTheme;
  onSelectMode: (mode: AppMode) => void;
  onReturnToAnime: () => void;
  onThemeChange?: (theme: AppTheme) => void;
  malUser?: any;
}

export const PersistentConcertHost: React.FC<PersistentConcertHostProps> = ({
  currentMode,
  theme,
  onSelectMode,
  onReturnToAnime,
  onThemeChange,
}) => {
  const { isConcertActive, isPlaying, closeMiniConcert } = useConcertMusic();

  const isFull = currentMode === 'music';
  const isMini = currentMode === 'anime' && (isConcertActive || isPlaying);
  const isHidden = !isFull && !isMini;

  // Defer 3D stage mounting until user first enters concert or plays music.
  // Once activated, it stays mounted across all mode switches so models/animations/viewports persist!
  const hasBeenActivatedRef = useRef(false);
  if (isFull || isMini) {
    hasBeenActivatedRef.current = true;
  }

  if (!hasBeenActivatedRef.current && isHidden) {
    return null;
  }

  return (
    <div
      className={
        isFull
          ? `fixed inset-0 z-50 w-full h-full min-h-0 min-w-0 flex flex-col overflow-hidden font-sans ${
              theme === 'dark'
                ? 'bg-[#111017] text-[#F4F2F7]'
                : theme === 'sakura'
                ? 'bg-[#FDF5F7] text-[#25242A]'
                : 'bg-[#F5F3EF] text-[#25242A]'
            }`
          : isMini
          ? 'fixed bottom-4 left-4 z-50 w-[320px] sm:w-[360px] h-[210px] sm:h-[235px] rounded-2xl shadow-2xl border border-black/15 dark:border-white/15 backdrop-blur-xl bg-[#14121C]/95 text-white flex flex-col overflow-hidden ring-1 ring-[#7567C7]/40 select-none animate-in fade-in slide-in-from-bottom-4 duration-200'
          : 'hidden'
      }
      style={isMini ? { boxShadow: '0 20px 45px -10px rgba(0,0,0,0.65)' } : undefined}
    >
      {/* Full Mode Header Bar */}
      {isFull && (
        <header className="shrink-0 w-full px-4 py-2 bg-white/80 dark:bg-[#161422]/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 flex items-center justify-between z-30">
          <div className="flex items-center gap-3">
            <WorldSwitcher currentMode="music" onSelectMode={onSelectMode} variant="header" />
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-black/10 dark:border-white/10 text-xs font-semibold text-[#77747D]">
              <Sparkles className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Blue Archive 10-Character Live Concert</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onReturnToAnime}
              className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-black/5 dark:border-white/5"
              title="Return to Anime Tracker (Music & Mini Concert will stay active!)"
            >
              <Tv className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Anime Tracker</span>
            </button>

            {onThemeChange && (
              <button
                type="button"
                onClick={() => {
                  if (theme === 'dark') onThemeChange('light');
                  else if (theme === 'light') onThemeChange('sakura');
                  else onThemeChange('dark');
                }}
                className="p-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white transition-colors cursor-pointer border border-black/5 dark:border-white/5"
                title="Switch Theme"
              >
                {theme === 'dark' ? <Moon className="h-4 w-4 text-[#A898F8]" /> : <Sun className="h-4 w-4 text-[#EAB308]" />}
              </button>
            )}
          </div>
        </header>
      )}

      {/* Main 3D Concert Viewport: Continuously Mounted across Full and Mini modes */}
      <div className="flex-1 min-h-0 min-w-0 w-full h-full flex flex-col overflow-hidden">
        <Character3DViewer
          theme={theme}
          presentationMode={isFull ? 'full' : 'mini'}
          className="flex-1 min-h-0 min-w-0 w-full h-full"
          onReturnToEnsemble={onReturnToAnime}
          onExpand={() => onSelectMode('music')}
          onCloseMini={closeMiniConcert}
        />
      </div>
    </div>
  );
};
