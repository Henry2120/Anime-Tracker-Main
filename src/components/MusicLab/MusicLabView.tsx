import React from 'react';
import { WorldSwitcher, AppMode } from '../WorldSwitcher';
import { AppTheme } from '../../types/theme';
import { MalUser } from '../../types';
import { Character3DViewer } from '../CharacterViewer/Character3DViewer';
import { Sparkles, Tv, Moon, Sun } from 'lucide-react';

interface MusicLabViewProps {
  onReturnToAnime: () => void;
  onSelectMode: (mode: AppMode) => void;
  malUser: MalUser | null;
  theme?: AppTheme;
  onThemeChange?: (theme: AppTheme) => void;
}

export const MusicLabView: React.FC<MusicLabViewProps> = ({
  onReturnToAnime,
  onSelectMode,
  malUser: _malUser,
  theme = 'light',
  onThemeChange,
}) => {
  return (
    <div
      className={`w-full h-full min-h-0 flex-1 flex flex-col overflow-hidden transition-colors duration-200 font-sans ${
        theme === 'dark'
          ? 'bg-[#111017] text-[#F4F2F7]'
          : theme === 'sakura'
          ? 'bg-[#FDF5F7] text-[#25242A]'
          : 'bg-[#F5F3EF] text-[#25242A]'
      }`}
    >
      {/* Top Navigation Header Bar */}
      <header className="shrink-0 w-full px-4 py-2 bg-white/80 dark:bg-[#161422]/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <WorldSwitcher currentMode="music" onSelectMode={onSelectMode} variant="header" />
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-black/10 dark:border-white/10 text-xs font-semibold text-[#77747D]">
            <Sparkles className="h-3.5 w-3.5 text-[#7567C7]" />
            <span>Blue Archive 3D GLB Character Engine</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Return to Anime Tracker */}
          <button
            type="button"
            onClick={onReturnToAnime}
            className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-black/5 dark:border-white/5"
            title="Return to Anime Tracker"
          >
            <Tv className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Anime Tracker</span>
          </button>

          {/* Theme Switcher */}
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
              {theme === 'dark' ? (
                <Moon className="h-4 w-4 text-[#A898F8]" />
              ) : (
                <Sun className="h-4 w-4 text-[#EAB308]" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* Main Viewport Container: Fills 100% of available screen */}
      <main className="flex-1 min-h-0 min-w-0 w-full h-full flex flex-col p-2 sm:p-3 overflow-hidden">
        <Character3DViewer
          theme={theme}
          className="flex-1 min-h-0 min-w-0 w-full h-full"
        />
      </main>
    </div>
  );
};

export default MusicLabView;
