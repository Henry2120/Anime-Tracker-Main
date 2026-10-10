import React, { useRef, useEffect } from 'react';
import { WorldSwitcher, AppMode } from '../WorldSwitcher';
import { AppTheme } from '../../types/theme';
import { Character3DViewer } from './Character3DViewer';
import { useConcertMusic } from './ConcertMusicContext';
import {
  Sparkles,
  Tv,
  Moon,
  Sun,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  X,
  Disc3,
  PictureInPicture2,
} from 'lucide-react';

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
  const {
    isConcertActive,
    isPlaying,
    videoTitle,
    togglePlay,
    presentationMode,
    setPresentationMode,
    closeMiniConcert,
  } = useConcertMusic();

  const isFull = currentMode === 'music';
  const isConcertEngaged = isConcertActive || isPlaying;

  // When switching from full Music Lab back to Anime Tracker, default to 'mini' if concert is engaged
  const prevModeRef = useRef<AppMode>(currentMode);
  useEffect(() => {
    if (prevModeRef.current === 'music' && currentMode === 'anime') {
      if (isConcertEngaged && presentationMode !== 'collapsed') {
        setPresentationMode('mini');
      }
    } else if (currentMode === 'music') {
      setPresentationMode('full');
    }
    prevModeRef.current = currentMode;
  }, [currentMode, isConcertEngaged, presentationMode, setPresentationMode]);

  const isMini = currentMode === 'anime' && isConcertEngaged && presentationMode === 'mini';
  const isCollapsed = currentMode === 'anime' && isConcertEngaged && presentationMode === 'collapsed';

  // Defer 3D stage mounting until user first enters concert or plays music.
  // Once activated, it stays mounted across all mode switches so models/animations/viewports persist!
  const hasBeenActivatedRef = useRef(false);
  if (isFull || isMini || isCollapsed) {
    hasBeenActivatedRef.current = true;
  }

  if (!hasBeenActivatedRef.current && !isFull && !isMini && !isCollapsed) {
    return null;
  }

  // Matching background classes for Anime Tracker theme family (Light, Dark, Sakura)
  const themeCardBg = {
    light: 'bg-[#F7F5F2]/95 border-[#E7E3DF] text-[#25242A] shadow-xl',
    dark: 'bg-[#141318]/95 border-[#2E2C37] text-[#F4F2F7] shadow-2xl',
    sakura: 'bg-[#FDF5F7]/95 border-[#F8D7E0] text-[#25242A] shadow-xl',
  }[theme] || 'bg-[#F7F5F2]/95 border-[#E7E3DF] text-[#25242A] shadow-xl';

  return (
    <>
      {/* =========================================================================
          1. FULL CONCERT STAGE MODE (Full screen overlay when currentMode === 'music')
          ========================================================================= */}
      {isFull && (
        <div
          className={`fixed inset-0 z-50 w-full h-full min-h-0 min-w-0 flex flex-col overflow-hidden font-sans ${
            theme === 'dark'
              ? 'bg-[#111017] text-[#F4F2F7]'
              : theme === 'sakura'
              ? 'bg-[#FDF5F7] text-[#25242A]'
              : 'bg-[#F5F3EF] text-[#25242A]'
          }`}
        >
          {/* Full Mode Header Bar */}
          <header className="shrink-0 w-full px-4 py-2 bg-white/80 dark:bg-[#161422]/80 backdrop-blur-xl border-b border-black/5 dark:border-white/5 flex items-center justify-between z-30">
            <div className="flex items-center gap-3">
              <WorldSwitcher currentMode="music" onSelectMode={onSelectMode} variant="header" />
              <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-black/10 dark:border-white/10 text-xs font-semibold text-[#77747D]">
                <Sparkles className="h-3.5 w-3.5 text-[#7567C7]" />
                <span>Blue Archive Live Concert</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReturnToAnime}
                className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-black/5 dark:border-white/5"
                title="Return to Anime Tracker (Concert will remain available)"
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

          {/* Main 3D Concert Viewport */}
          <div className="flex-1 min-h-0 min-w-0 w-full h-full flex flex-col overflow-hidden">
            <Character3DViewer
              theme={theme}
              presentationMode="full"
              className="flex-1 min-h-0 min-w-0 w-full h-full"
              onReturnToEnsemble={onReturnToAnime}
              onExpand={() => {
                onSelectMode('music');
                setPresentationMode('full');
              }}
              onCloseMini={closeMiniConcert}
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          2. MINI CONCERT MODE (Interactive floating 3D panel in bottom-left)
          ========================================================================= */}
      {isMini && (
        <div
          className={`fixed bottom-4 left-4 z-50 w-[320px] sm:w-[360px] h-[215px] sm:h-[240px] rounded-2xl border backdrop-blur-xl flex flex-col overflow-hidden select-none animate-in fade-in slide-in-from-bottom-3 duration-200 ring-1 ring-black/5 dark:ring-white/10 ${themeCardBg}`}
          style={{ boxShadow: '0 20px 45px -10px rgba(0,0,0,0.45)' }}
        >
          {/* Mini Header Bar */}
          <div className="shrink-0 z-30 px-3 py-2 border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-2 text-xs bg-black/[0.03] dark:bg-white/[0.03]">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-purple-500'
                }`}
              />
              <span className="font-semibold text-xs truncate max-w-[140px] leading-tight">
                {videoTitle}
              </span>
            </div>

            {/* Mini Actions: Collapse, Play/Pause, Maximize, Quit */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Collapse to minimal bar */}
              <button
                type="button"
                onClick={() => setPresentationMode('collapsed')}
                className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-current transition-colors cursor-pointer"
                title="Collapse into minimal control bar"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>

              {/* Play / Pause Toggle */}
              <button
                type="button"
                onClick={togglePlay}
                className={`p-1 rounded-lg transition-all active:scale-95 cursor-pointer ${
                  isPlaying
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-[#7567C7] hover:bg-[#6556B8] text-white'
                }`}
                title={isPlaying ? 'Pause music (Cafe_Idle)' : 'Play music (Cafe_Reaction)'}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
              </button>

              {/* Expand to Full Concert */}
              <button
                type="button"
                onClick={() => {
                  onSelectMode('music');
                  setPresentationMode('full');
                }}
                className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-current transition-colors cursor-pointer"
                title="Open Full Concert Stage"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>

              {/* Quit Concert */}
              <button
                type="button"
                onClick={closeMiniConcert}
                className="p-1 rounded-lg hover:bg-red-500/80 hover:text-white transition-colors cursor-pointer"
                title="Quit Concert (stops music & closes panel)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Interactive Zoomable 3D Viewport */}
          <div className="flex-1 min-h-0 min-w-0 w-full h-full flex flex-col overflow-hidden">
            <Character3DViewer
              theme={theme}
              presentationMode="mini"
              className="flex-1 min-h-0 min-w-0 w-full h-full"
              onReturnToEnsemble={onReturnToAnime}
              onExpand={() => {
                onSelectMode('music');
                setPresentationMode('full');
              }}
              onCloseMini={closeMiniConcert}
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          3. COLLAPSED CONCERT MODE (Compact bottom-left bar, essentially full screen for Anime Tracker)
          ========================================================================= */}
      {isCollapsed && (
        <>
          <div
            className={`fixed bottom-4 left-4 z-50 w-[270px] sm:w-[330px] px-3 py-2 rounded-2xl border backdrop-blur-xl flex items-center justify-between gap-2 select-none animate-in fade-in slide-in-from-bottom-2 duration-150 ring-1 ring-black/5 dark:ring-white/10 ${themeCardBg}`}
            style={{ boxShadow: '0 12px 35px -8px rgba(0,0,0,0.35)' }}
          >
            {/* Track Info */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Disc3
                className={`h-4 w-4 shrink-0 ${
                  isPlaying ? 'text-emerald-500 animate-spin' : 'text-[#7567C7]'
                }`}
              />
              <span className="font-semibold text-xs truncate max-w-[120px] sm:max-w-[160px]">
                {videoTitle}
              </span>
            </div>

            {/* Controls: Play/Pause, Expand to Mini, Open Full, Quit */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Play / Pause Toggle */}
              <button
                type="button"
                onClick={togglePlay}
                className={`p-1.5 rounded-lg transition-all active:scale-95 cursor-pointer ${
                  isPlaying
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-[#7567C7] hover:bg-[#6556B8] text-white'
                }`}
                title={isPlaying ? 'Pause music' : 'Play music'}
              >
                {isPlaying ? <Pause className="h-3 w-3 fill-white" /> : <Play className="h-3 w-3 fill-white" />}
              </button>

              {/* Expand to Mini Stage */}
              <button
                type="button"
                onClick={() => setPresentationMode('mini')}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-current transition-colors cursor-pointer"
                title="Expand to Mini 3D Stage"
              >
                <PictureInPicture2 className="h-3.5 w-3.5" />
              </button>

              {/* Open Full Concert */}
              <button
                type="button"
                onClick={() => {
                  onSelectMode('music');
                  setPresentationMode('full');
                }}
                className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-current transition-colors cursor-pointer"
                title="Open Full Concert Stage"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>

              {/* Quit Concert */}
              <button
                type="button"
                onClick={closeMiniConcert}
                className="p-1.5 rounded-lg hover:bg-red-500/80 hover:text-white transition-colors cursor-pointer"
                title="Quit Concert (stops music & closes bar)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Hidden 3D canvas so WebGL context & models remain alive in memory */}
          <div className="hidden pointer-events-none" aria-hidden="true">
            <Character3DViewer
              theme={theme}
              presentationMode="mini"
              onReturnToEnsemble={onReturnToAnime}
            />
          </div>
        </>
      )}
    </>
  );
};

