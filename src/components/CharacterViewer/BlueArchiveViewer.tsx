import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Layers,
  RotateCcw,
  Sun,
  Moon,
  Tv,
  Eye,
  Grid,
  Box,
  Volume2,
  RefreshCw,
  HelpCircle,
  Maximize2,
  Settings,
  Share2,
} from 'lucide-react';
import { AppTheme } from '../../types/theme';
import { WorldSwitcher, AppMode } from '../WorldSwitcher';
import { Character3DViewport } from './Character3DViewport';
import { CharacterBrowserPanel } from './CharacterBrowserPanel';
import { useCharacterViewerState } from './useCharacterViewerState';
import { CharacterManifestEntry } from '../../types/characterViewer';
import manifestData from '../../data/blueArchiveManifest.json';

const allManifest: CharacterManifestEntry[] = manifestData as CharacterManifestEntry[];

interface BlueArchiveViewerProps {
  onReturnToAnime: () => void;
  onSelectMode: (mode: AppMode) => void;
  malUser: any;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}

export const BlueArchiveViewer: React.FC<BlueArchiveViewerProps> = ({
  onReturnToAnime,
  onSelectMode,
  malUser,
  theme,
  onThemeChange,
}) => {
  const {
    loadedCharacters,
    selectedInstanceId,
    setSelectedInstanceId,
    isMultiMode,
    setIsMultiMode,
    settings,
    setSettings,
    loadCharacter,
    removeCharacter,
    clearCharacters,
    updateCharacterTransform,
    toggleCharacterVisibility,
  } = useCharacterViewerState();

  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);

  // Load initial default character on first mount
  useEffect(() => {
    if (!hasInitialLoaded && loadedCharacters.length === 0 && allManifest.length > 0) {
      setHasInitialLoaded(true);
      // Pick Airi or Airi (Band) as default demo model
      const defaultEntry = allManifest.find((m) => m.id === 'airi-band') || allManifest[0];
      loadCharacter(defaultEntry);
    }
  }, [hasInitialLoaded, loadedCharacters.length, loadCharacter]);

  const activeSelectedChar = loadedCharacters.find((c) => c.instanceId === selectedInstanceId);

  return (
    <div
      className={`w-full min-h-screen flex flex-col transition-colors duration-300 font-sans ${
        theme === 'dark'
          ? 'bg-[#111017] text-[#F4F2F7]'
          : theme === 'sakura'
          ? 'bg-[#FDF5F7] text-[#25242A]'
          : 'bg-[#F5F3EF] text-[#25242A]'
      }`}
    >
      {/* =========================================================================
          TOP NAVIGATION HEADER BAR
          ========================================================================= */}
      <header className="sticky top-0 z-40 w-full px-4 py-2.5 bg-white/70 dark:bg-[#161422]/70 backdrop-blur-xl border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* World Switcher (Anime Tracker vs Blue Archive 3D Viewer) */}
          <WorldSwitcher currentMode="music" onSelectMode={onSelectMode} variant="header" />

          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-black/10 dark:border-white/10 text-xs font-semibold text-[#77747D]">
            <Sparkles className="h-3.5 w-3.5 text-[#7567C7]" />
            <span>295 Blue Archive 3D GLB Asset Engine</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Return to Anime Tracker */}
          <button
            type="button"
            onClick={onReturnToAnime}
            className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-black/5 dark:border-white/5"
          >
            <Tv className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Anime Tracker</span>
          </button>

          {/* Theme Selector */}
          <button
            type="button"
            onClick={() => {
              if (theme === 'dark') onThemeChange('light');
              else if (theme === 'light') onThemeChange('sakura');
              else onThemeChange('dark');
            }}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#25242A] dark:text-white transition-colors cursor-pointer border border-black/5 dark:border-white/5"
            title="Switch Theme"
          >
            {theme === 'dark' ? <Moon className="h-4 w-4 text-[#A898F8]" /> : <Sun className="h-4 w-4 text-[#EAB308]" />}
          </button>
        </div>
      </header>

      {/* =========================================================================
          MAIN WORKSPACE LAYOUT: 3D VIEWPORT & CHARACTER BROWSER
          ========================================================================= */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0 overflow-hidden max-w-[1920px] mx-auto w-full">
        {/* 3D Viewport Container */}
        <div className="flex-1 flex flex-col min-h-[480px] lg:min-h-0 relative rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-2xl">
          {/* Top Viewport Control Bar */}
          <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-2 pointer-events-auto bg-white/80 dark:bg-[#181624]/80 backdrop-blur-md p-1.5 rounded-xl border border-black/10 dark:border-white/10 shadow-md text-xs font-semibold">
              <span className="px-2 py-0.5 rounded-lg bg-[#7567C7] text-white font-bold text-[10px]">
                3D GLB
              </span>
              <span className="text-[#25242A] dark:text-white font-bold">
                {activeSelectedChar
                  ? activeSelectedChar.manifestEntry.displayName
                  : loadedCharacters.length > 0
                  ? `${loadedCharacters.length} Models Loaded`
                  : 'Select a Character'}
              </span>
            </div>

            {/* Quick Display Setting Toggles */}
            <div className="flex items-center gap-1 pointer-events-auto bg-white/80 dark:bg-[#181624]/80 backdrop-blur-md p-1 rounded-xl border border-black/10 dark:border-white/10 shadow-md text-xs font-semibold">
              {/* Grid Toggle */}
              <button
                type="button"
                onClick={() => setSettings({ ...settings, showGrid: !settings.showGrid })}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  settings.showGrid ? 'bg-[#7567C7] text-white' : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                title="Toggle Floor Grid"
              >
                <Grid className="h-4 w-4" />
              </button>

              {/* Bounding Box Toggle */}
              <button
                type="button"
                onClick={() => setSettings({ ...settings, showBoundingBox: !settings.showBoundingBox })}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  settings.showBoundingBox ? 'bg-[#7567C7] text-white' : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                title="Toggle Bounding Box"
              >
                <Box className="h-4 w-4" />
              </button>

              {/* Auto-Rotate Toggle */}
              <button
                type="button"
                onClick={() => setSettings({ ...settings, autoRotate: !settings.autoRotate })}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  settings.autoRotate ? 'bg-[#7567C7] text-white' : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                title="Toggle Turntable Auto-Rotate"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 3D Canvas */}
          <div className="w-full h-full flex-1">
            <Character3DViewport
              loadedCharacters={loadedCharacters}
              selectedInstanceId={selectedInstanceId}
              onSelectInstance={(id) => setSelectedInstanceId(id)}
              settings={settings}
              theme={theme}
            />
          </div>

          {/* Bottom Viewport Hint */}
          <div className="absolute bottom-3 left-3 z-30 pointer-events-none bg-black/60 backdrop-blur-md text-white/90 px-3 py-1.5 rounded-xl text-[10px] font-mono flex items-center gap-2 border border-white/10">
            <span>Left Click: Rotate</span>
            <span>•</span>
            <span>Right Click: Pan</span>
            <span>•</span>
            <span>Scroll: Zoom</span>
          </div>
        </div>

        {/* Character Browser & Control Panel Drawer */}
        <CharacterBrowserPanel
          loadedCharacters={loadedCharacters}
          selectedInstanceId={selectedInstanceId}
          isMultiMode={isMultiMode}
          onToggleMultiMode={() => setIsMultiMode(!isMultiMode)}
          onSelectCharacter={(entry) => loadCharacter(entry)}
          onRemoveInstance={removeCharacter}
          onClearAll={clearCharacters}
          onSelectInstance={setSelectedInstanceId}
          onToggleVisibility={toggleCharacterVisibility}
          onUpdateTransform={updateCharacterTransform}
          theme={theme}
        />
      </main>
    </div>
  );
};

export default BlueArchiveViewer;
