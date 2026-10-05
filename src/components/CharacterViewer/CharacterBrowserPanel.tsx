import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  User,
  Sparkles,
  Layers,
  Trash2,
  Eye,
  EyeOff,
  Move,
  RotateCw,
  Maximize2,
  Plus,
  Check,
  Grid,
  Filter,
  Info,
} from 'lucide-react';
import { CharacterManifestEntry, LoadedCharacter } from '../../types/characterViewer';
import manifestData from '../../data/blueArchiveManifest.json';

const allManifest: CharacterManifestEntry[] = manifestData as CharacterManifestEntry[];

interface CharacterBrowserPanelProps {
  loadedCharacters: LoadedCharacter[];
  selectedInstanceId: string | null;
  isMultiMode: boolean;
  onToggleMultiMode: () => void;
  onSelectCharacter: (entry: CharacterManifestEntry) => void;
  onRemoveInstance: (instanceId: string) => void;
  onClearAll: () => void;
  onSelectInstance: (instanceId: string) => void;
  onToggleVisibility: (instanceId: string) => void;
  onUpdateTransform: (
    instanceId: string,
    transform: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }
  ) => void;
  theme: 'light' | 'dark' | 'sakura';
}

export const CharacterBrowserPanel: React.FC<CharacterBrowserPanelProps> = ({
  loadedCharacters,
  selectedInstanceId,
  isMultiMode,
  onToggleMultiMode,
  onSelectCharacter,
  onRemoveInstance,
  onClearAll,
  onSelectInstance,
  onToggleVisibility,
  onUpdateTransform,
  theme,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'catalog' | 'loaded'>('catalog');

  // Filter 295 characters based on search and category tags
  const filteredManifest = useMemo(() => {
    let list = allManifest;

    if (categoryFilter !== 'all') {
      const cat = categoryFilter.toLowerCase();
      list = list.filter((item) => {
        const name = item.displayName.toLowerCase();
        if (cat === 'band') return name.includes('band') || name.includes('music');
        if (cat === 'swimsuit') return name.includes('swimsuit') || name.includes('summer');
        if (cat === 'bunny') return name.includes('bunny');
        if (cat === 'maid') return name.includes('maid');
        if (cat === 'uniform') return name.includes('uniform') || name.includes('track');
        if (cat === 'dress') return name.includes('dress') || name.includes('party');
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) => item.displayName.toLowerCase().includes(q) || item.filename.toLowerCase().includes(q)
      );
    }

    return list;
  }, [searchQuery, categoryFilter]);

  const loadedEntryIds = useMemo(
    () => new Set(loadedCharacters.map((c) => c.manifestEntry.id)),
    [loadedCharacters]
  );

  const selectedCharacter = useMemo(
    () => loadedCharacters.find((c) => c.instanceId === selectedInstanceId),
    [loadedCharacters, selectedInstanceId]
  );

  return (
    <aside className="w-full lg:w-96 flex flex-col h-full rounded-2xl bg-white/80 dark:bg-[#181624]/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-xl overflow-hidden select-none">
      {/* Panel Navigation Tabs */}
      <div className="flex items-center justify-between p-3 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex-1">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'catalog'
                ? 'bg-white dark:bg-[#28243A] text-[#7567C7] dark:text-[#A898F8] shadow-xs'
                : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>Catalog ({allManifest.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('loaded')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 relative ${
              activeTab === 'loaded'
                ? 'bg-white dark:bg-[#28243A] text-[#7567C7] dark:text-[#A898F8] shadow-xs'
                : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Scene ({loadedCharacters.length})</span>
            {loadedCharacters.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#7567C7] animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: 295 CHARACTER CATALOG BROWSER
          ========================================================================= */}
      {activeTab === 'catalog' && (
        <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3">
          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-[#77747D]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 295 Blue Archive characters..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-medium focus:outline-none focus:border-[#7567C7] text-[#25242A] dark:text-white placeholder-[#77747D]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-semibold">
            {[
              { id: 'all', label: 'All' },
              { id: 'band', label: 'Band / Music' },
              { id: 'swimsuit', label: 'Swimsuit' },
              { id: 'bunny', label: 'Bunny' },
              { id: 'uniform', label: 'Uniform' },
              { id: 'maid', label: 'Maid' },
              { id: 'dress', label: 'Dress' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer border ${
                  categoryFilter === cat.id
                    ? 'bg-[#7567C7] text-white border-[#7567C7]'
                    : 'bg-black/5 dark:bg-white/5 text-[#77747D] hover:text-[#25242A] dark:hover:text-white border-black/5 dark:border-white/5'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Mode Multi-Character Toggle Banner */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-[#7567C7]/10 border border-[#7567C7]/20 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#7567C7]" />
              <div className="flex flex-col">
                <span className="font-bold text-[#25242A] dark:text-white">Multi-Model Loading</span>
                <span className="text-[10px] text-[#77747D]">
                  {isMultiMode ? 'Loads models side-by-side' : 'Replaces active model on select'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleMultiMode}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                isMultiMode
                  ? 'bg-[#7567C7] text-white border-[#7567C7]'
                  : 'bg-black/5 dark:bg-white/5 text-[#77747D] border-black/10 dark:border-white/10'
              }`}
            >
              {isMultiMode ? 'MULTI ON' : 'SINGLE MODE'}
            </button>
          </div>

          {/* Results Summary */}
          <div className="flex items-center justify-between text-[11px] font-semibold text-[#77747D] px-1">
            <span>Showing {filteredManifest.length} of {allManifest.length} models</span>
            {searchQuery && <span>Filter: &quot;{searchQuery}&quot;</span>}
          </div>

          {/* Scrollable Character List (295 GLB cards) */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 min-h-0 custom-scrollbar">
            {filteredManifest.map((item) => {
              const isLoaded = loadedEntryIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectCharacter(item)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                    isLoaded
                      ? 'bg-[#7567C7]/15 dark:bg-[#7567C7]/25 border-[#7567C7]/40 text-[#7567C7] dark:text-[#C1B7FC]'
                      : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/5 dark:border-white/5 text-[#25242A] dark:text-[#E8E6ED]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-2 rounded-xl shrink-0 ${isLoaded ? 'bg-[#7567C7] text-white' : 'bg-black/5 dark:bg-white/5 text-[#77747D]'}`}>
                      <User className="h-4 w-4" />
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs truncate leading-snug">{item.displayName}</span>
                      <span className="text-[10px] text-[#77747D] dark:text-[#A4A1AA] truncate font-mono">
                        {item.filename}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isLoaded ? (
                      <span className="px-2 py-0.5 rounded-md bg-[#7567C7] text-white text-[10px] font-bold flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/5 group-hover:bg-[#7567C7] group-hover:text-white text-[#77747D] text-[10px] font-bold transition-colors flex items-center gap-1">
                        <Plus className="h-3 w-3" />
                        Load 3D
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredManifest.length === 0 && (
              <div className="py-12 text-center text-[#77747D] space-y-2">
                <Info className="h-8 w-8 mx-auto opacity-50" />
                <p className="text-xs font-semibold">No character found matching &quot;{searchQuery}&quot;</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: LOADED SCENE INSTANCES MANAGER
          ========================================================================= */}
      {activeTab === 'loaded' && (
        <div className="flex-1 flex flex-col min-h-0 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#25242A] dark:text-white">
              Active Models in 3D Scene ({loadedCharacters.length})
            </span>

            {loadedCharacters.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                Clear All
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0 custom-scrollbar">
            {loadedCharacters.map((char) => {
              const isSelected = char.instanceId === selectedInstanceId;

              return (
                <div
                  key={char.instanceId}
                  className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                    isSelected
                      ? 'bg-[#7567C7]/10 dark:bg-[#7567C7]/20 border-[#7567C7]/40'
                      : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5'
                  }`}
                  onClick={() => onSelectInstance(char.instanceId)}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#7567C7]" />
                      <span className="font-bold text-xs truncate text-[#25242A] dark:text-white">
                        {char.manifestEntry.displayName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Visibility Toggle */}
                      <button
                        type="button"
                        onClick={() => onToggleVisibility(char.instanceId)}
                        className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] transition-colors"
                        title="Toggle Visibility"
                      >
                        {char.visible ? <Eye className="h-3.5 w-3.5 text-[#7567C7]" /> : <EyeOff className="h-3.5 w-3.5 text-red-400" />}
                      </button>

                      {/* Remove Instance */}
                      <button
                        type="button"
                        onClick={() => onRemoveInstance(char.instanceId)}
                        className="p-1 rounded-lg hover:bg-red-500/20 text-red-500 transition-colors"
                        title="Remove Character"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dimension Metrics */}
                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-[#77747D] bg-black/5 dark:bg-white/5 p-1.5 rounded-lg">
                    <div>W: {char.dimensions.x.toFixed(2)}m</div>
                    <div>H: {char.dimensions.y.toFixed(2)}m</div>
                    <div>D: {char.dimensions.z.toFixed(2)}m</div>
                  </div>

                  {/* Transform Controls for Selected Model */}
                  {isSelected && (
                    <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
                      {/* Position X Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-semibold text-[#77747D]">
                          <span className="flex items-center gap-1"><Move className="h-3 w-3" /> Position X:</span>
                          <span className="font-mono text-[#25242A] dark:text-white">{char.position.x.toFixed(2)}m</span>
                        </div>
                        <input
                          type="range"
                          min="-3.0"
                          max="3.0"
                          step="0.05"
                          value={char.position.x}
                          onChange={(e) =>
                            onUpdateTransform(char.instanceId, {
                              position: [parseFloat(e.target.value), char.position.y, char.position.z],
                            })
                          }
                          className="w-full accent-[#7567C7] cursor-pointer"
                        />
                      </div>

                      {/* Rotation Y Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-semibold text-[#77747D]">
                          <span className="flex items-center gap-1"><RotateCw className="h-3 w-3" /> Rotate Y:</span>
                          <span className="font-mono text-[#25242A] dark:text-white">
                            {Math.round((char.rotation.y * 180) / Math.PI)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-Math.PI}
                          max={Math.PI}
                          step="0.05"
                          value={char.rotation.y}
                          onChange={(e) =>
                            onUpdateTransform(char.instanceId, {
                              rotation: [char.rotation.x, parseFloat(e.target.value), char.rotation.z],
                            })
                          }
                          className="w-full accent-[#7567C7] cursor-pointer"
                        />
                      </div>

                      {/* Scale Uniform Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between font-semibold text-[#77747D]">
                          <span className="flex items-center gap-1"><Maximize2 className="h-3 w-3" /> Scale:</span>
                          <span className="font-mono text-[#25242A] dark:text-white">{char.scale.x.toFixed(2)}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="2.5"
                          step="0.05"
                          value={char.scale.x}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            onUpdateTransform(char.instanceId, {
                              scale: [val, val, val],
                            });
                          }}
                          className="w-full accent-[#7567C7] cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {loadedCharacters.length === 0 && (
              <div className="py-12 text-center text-[#77747D] space-y-2">
                <Layers className="h-8 w-8 mx-auto opacity-50" />
                <p className="text-xs font-semibold">No models currently loaded in the 3D scene.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="px-3 py-1.5 rounded-xl bg-[#7567C7] text-white text-xs font-bold hover:bg-[#6455B8] transition-colors cursor-pointer"
                >
                  Browse Catalog
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
