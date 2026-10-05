import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  User,
  Sparkles,
  Layers,
  AlertCircle,
  RefreshCw,
  Sliders,
  Maximize2,
  Check,
  ChevronRight,
  Info,
  Film,
} from 'lucide-react';
import {
  BLUE_ARCHIVE_CHARACTERS,
  CharacterManifestEntry,
} from '../../data/blueArchiveCharacters';
import { LoadedCharacterInstance } from './types';
import { AppTheme } from '../../types/theme';

interface CharacterBrowserDrawerProps {
  theme: AppTheme;
  isOpen: boolean;
  onClose: () => void;
  loadedCharacters: LoadedCharacterInstance[];
  selectedInstanceId: string | null;
  loading: boolean;
  loadingCharacter: CharacterManifestEntry | null;
  error: { character: CharacterManifestEntry; message: string } | null;
  onSelectCharacter: (character: CharacterManifestEntry, mode: 'replace' | 'add') => void;
  onRemoveInstance: (instanceId: string) => void;
  onToggleInstanceVisibility: (instanceId: string) => void;
  onSelectInstance: (instanceId: string) => void;
  onClearAll: () => void;
}

export const CharacterBrowserDrawer: React.FC<CharacterBrowserDrawerProps> = ({
  theme,
  isOpen,
  onClose,
  loadedCharacters,
  selectedInstanceId,
  loading,
  loadingCharacter,
  error,
  onSelectCharacter,
  onRemoveInstance,
  onToggleInstanceVisibility,
  onSelectInstance,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'roster' | 'scene'>('roster');
  const [alphabetFilter, setAlphabetFilter] = useState<string>('ALL');

  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  // Extract unique starting letters for quick alphabetic jump
  const alphabetList = useMemo(() => {
    const letters = new Set<string>();
    BLUE_ARCHIVE_CHARACTERS.forEach((c) => {
      const firstChar = c.name.charAt(0).toUpperCase();
      if (/[A-Z]/.test(firstChar)) {
        letters.add(firstChar);
      }
    });
    return ['ALL', ...Array.from(letters).sort()];
  }, []);

  // Filtered 295 roster
  const filteredCharacters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return BLUE_ARCHIVE_CHARACTERS.filter((c) => {
      const matchesQuery = !query || c.name.toLowerCase().includes(query) || c.filename.toLowerCase().includes(query);
      const matchesLetter = alphabetFilter === 'ALL' || c.name.toUpperCase().startsWith(alphabetFilter);
      return matchesQuery && matchesLetter;
    });
  }, [searchQuery, alphabetFilter]);

  // Check if a manifest entry is currently loaded in scene
  const isCharacterLoaded = (characterId: string) => {
    return loadedCharacters.some((c) => c.characterId === characterId);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-40 w-full sm:w-[420px] bg-white/95 dark:bg-[#161422]/95 backdrop-blur-xl border-l border-black/10 dark:border-white/10 shadow-2xl flex flex-col transition-all duration-300 animate-in slide-in-from-right select-none">
      {/* Drawer Header */}
      <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#7567C7] to-[#9A8BF0] flex items-center justify-center text-white shadow-sm">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
              Blue Archive Character Roster
            </h2>
            <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
              {BLUE_ARCHIVE_CHARACTERS.length} Public GLB 3D Models
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs: Roster vs Active Scene Characters */}
      <div className="flex items-center gap-1 p-2 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setActiveTab('roster')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'roster'
              ? 'bg-[#7567C7] text-white shadow-xs'
              : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          <span>All Characters ({filteredCharacters.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scene')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'scene'
              ? 'bg-[#7567C7] text-white shadow-xs'
              : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>In Scene ({loadedCharacters.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'roster' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search Box */}
          <div className="p-3 border-b border-black/5 dark:border-white/5 space-y-2">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-3.5 w-3.5 text-[#77747D] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 295 characters (e.g. Hina, Shiroko, Aris)..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-xs text-[#25242A] dark:text-white placeholder-[#77747D] focus:outline-none focus:ring-2 focus:ring-[#7567C7]/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 p-1 text-[#77747D] hover:text-[#25242A] dark:hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Alphabet quick filter bar */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[10px] font-bold">
              {alphabetList.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setAlphabetFilter(letter)}
                  className={`px-1.5 py-0.5 rounded-md transition-colors shrink-0 cursor-pointer ${
                    alphabetFilter === letter
                      ? 'bg-[#7567C7] text-white'
                      : 'text-[#77747D] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>

          {/* Loading / Error Banner */}
          {loading && loadingCharacter && (
            <div className="p-3 bg-[#7567C7]/10 border-b border-[#7567C7]/20 flex items-center gap-2.5 text-xs text-[#7567C7] dark:text-[#A898F8] animate-pulse">
              <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
              <span className="font-semibold truncate">
                Downloading & loading 3D model for <strong>{loadingCharacter.name}</strong>...
              </span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border-b border-red-500/20 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-bold">Failed to load {error.character.name}</p>
                <p className="text-[11px] opacity-80 break-words">{error.message}</p>
                <button
                  type="button"
                  onClick={() => onSelectCharacter(error.character, 'replace')}
                  className="mt-1.5 px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 font-bold transition-colors cursor-pointer"
                >
                  Retry Download
                </button>
              </div>
            </div>
          )}

          {/* Character List Grid */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {filteredCharacters.length === 0 ? (
              <div className="py-12 text-center text-[#77747D]">
                <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-xs">No characters found matching "{searchQuery}"</p>
                <p className="text-[11px] mt-1">Try searching another name or reset filters.</p>
              </div>
            ) : (
              filteredCharacters.map((char) => {
                const loaded = isCharacterLoaded(char.id);
                const isCurrentLoading = loadingCharacter?.id === char.id;

                return (
                  <div
                    key={char.id}
                    className={`group p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      loaded
                        ? 'bg-[#7567C7]/10 border-[#7567C7]/40 shadow-xs'
                        : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/5 dark:border-white/5'
                    }`}
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => onSelectCharacter(char, 'replace')}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[#25242A] dark:text-[#F4F2F7] truncate">
                          {char.name}
                        </span>
                        {loaded && (
                          <span className="px-1.5 py-0.2 rounded-md bg-[#7567C7] text-white text-[9px] font-bold shrink-0">
                            Loaded
                          </span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-[#77747D] dark:text-[#9E9AA6] truncate mt-0.5">
                        {char.filename}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Replace / Load Button */}
                      <button
                        type="button"
                        onClick={() => onSelectCharacter(char, 'replace')}
                        disabled={isCurrentLoading}
                        title="Load and replace current 3D character"
                        className={`p-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          loaded
                            ? 'bg-[#7567C7] text-white'
                            : 'bg-black/5 dark:bg-white/10 hover:bg-[#7567C7] hover:text-white text-[#25242A] dark:text-white'
                        }`}
                      >
                        {isCurrentLoading ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : loaded ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <span>Load</span>
                        )}
                      </button>

                      {/* Add to Scene (Multi-model Mode) */}
                      <button
                        type="button"
                        onClick={() => onSelectCharacter(char, 'add')}
                        disabled={isCurrentLoading}
                        title="Add this character alongside existing models (Multi-GLB mode)"
                        className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Scene Instances Tab (Multi-model manager) */
        <div className="flex-1 flex flex-col p-3 space-y-3 min-h-0">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#77747D]">Active 3D Character Instances</span>
            {loadedCharacters.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-[11px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {loadedCharacters.length === 0 ? (
            <div className="py-12 text-center text-[#77747D] space-y-2">
              <Layers className="h-8 w-8 mx-auto opacity-30" />
              <p className="font-semibold text-xs">No models currently loaded in scene</p>
              <p className="text-[11px]">Select any character from the roster tab to load it.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2">
              {loadedCharacters.map((char, index) => {
                const isSelected = selectedInstanceId === char.id;

                return (
                  <div
                    key={char.id}
                    onClick={() => onSelectInstance(char.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'bg-[#7567C7]/10 border-[#7567C7]/50 shadow-sm'
                        : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/5 dark:border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#7567C7] text-white text-[10px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="font-bold text-xs text-[#25242A] dark:text-white">
                          {char.manifestEntry.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleInstanceVisibility(char.id)}
                          title={char.visible ? 'Hide character' : 'Show character'}
                          className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D]"
                        >
                          {char.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-amber-500" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveInstance(char.id)}
                          title="Remove character from scene"
                          className="p-1 rounded hover:bg-red-500/10 text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Stats & Animation info */}
                    <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-[#77747D] dark:text-[#A4A1AA] pt-1 border-t border-black/5 dark:border-white/5">
                      <div>Pos X: {char.position.x.toFixed(2)}m</div>
                      <div>Meshes: {char.meshCount}</div>
                      <div>Verts: {(char.vertexCount / 1000).toFixed(1)}k</div>
                    </div>

                    {char.availableAnimations.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-[#7567C7] dark:text-[#A898F8] font-medium pt-0.5">
                        <Film className="h-3 w-3 shrink-0" />
                        <span className="truncate">Clip: {char.currentAnimationName || 'None'}</span>
                        <span className="opacity-60 text-[9px]">({char.availableAnimations.length} clips)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="p-3 border-t border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-[10px] text-[#77747D]">
        <span>Multi-GLB Standard Renderer</span>
        <span>Lazy remote asset delivery</span>
      </div>
    </div>
  );
};
