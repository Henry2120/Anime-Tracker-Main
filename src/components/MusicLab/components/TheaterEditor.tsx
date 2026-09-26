import React, { useState, useEffect } from 'react';
import {
  TheaterEnvironment,
  TheaterPerformer,
  MusicInstrument,
  PerformerGender,
  TheaterSceneConfig,
} from '../types';
import { ALL_INSTRUMENTS, getInstrumentDefinition } from '../instruments/registry';
import {
  Plus,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  Save,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Check,
  X,
  FolderOpen,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';

interface TheaterEditorProps {
  environment: TheaterEnvironment;
  onSelectEnvironment: (env: TheaterEnvironment) => void;
  performers: TheaterPerformer[];
  selectedPerformerId: string | null;
  onSelectPerformer: (id: string | null) => void;
  onAddPerformer: (performer: Omit<TheaterPerformer, 'id'>) => void;
  onUpdatePerformer: (id: string, updates: Partial<TheaterPerformer>) => void;
  onDeletePerformer: (id: string) => void;
  onDuplicatePerformer: (id: string) => void;
  onResetToDetected: () => void;
  onApplyLayout: (layoutType: 'arc' | 'quartet' | 'band' | 'orchestra') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  theme: AppTheme;
  onCloseEditor: () => void;
}

const LOCAL_STORAGE_SAVED_THEATERS_KEY = 'aniverse_music_theater_saved_scenes';

export const TheaterEditor: React.FC<TheaterEditorProps> = ({
  environment,
  onSelectEnvironment,
  performers,
  selectedPerformerId,
  onSelectPerformer,
  onAddPerformer,
  onUpdatePerformer,
  onDeletePerformer,
  onDuplicatePerformer,
  onResetToDetected,
  onApplyLayout,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  theme,
  onCloseEditor,
}) => {
  // Modal state for "+ Add Performer"
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGender, setNewGender] = useState<PerformerGender>('female');
  const [newInstrument, setNewInstrument] = useState<MusicInstrument>('vocalist');
  const [newName, setNewName] = useState('');

  // Confirmation modal for "Reset to Detected"
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Saved scenes state
  const [savedScenes, setSavedScenes] = useState<TheaterSceneConfig[]>([]);
  const [sceneNameInput, setSceneNameInput] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

  // Load saved scenes on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_SAVED_THEATERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSavedScenes(parsed);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const selectedPerformer = performers.find((p) => p.id === selectedPerformerId) || null;

  // Handle keyboard shortcuts (Delete/Backspace, Escape, Undo/Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedPerformerId) {
          e.preventDefault();
          onDeletePerformer(selectedPerformerId);
        }
      } else if (e.key === 'Escape') {
        onSelectPerformer(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          if (canRedo) {
            e.preventDefault();
            onRedo();
          }
        } else {
          if (canUndo) {
            e.preventDefault();
            onUndo();
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (canRedo) {
          e.preventDefault();
          onRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPerformerId, onDeletePerformer, onSelectPerformer, canUndo, canRedo, onUndo, onRedo]);

  const handleConfirmAddPerformer = (e: React.FormEvent) => {
    e.preventDefault();
    const def = getInstrumentDefinition(newInstrument);
    onAddPerformer({
      instrument: newInstrument,
      gender: newGender,
      characterName: newName.trim() || `${newGender === 'female' ? 'Female' : 'Male'} ${def.performerTitle}`,
      x: 50,
      y: 75,
      scale: 1.0,
      isPlaying: false,
      playMode: 'always',
    });
    setNewName('');
    setShowAddModal(false);
  };

  const handleSaveScene = (e: React.FormEvent) => {
    e.preventDefault();
    const name = sceneNameInput.trim() || `Theater Arrangement ${savedScenes.length + 1}`;
    const newConfig: TheaterSceneConfig = {
      id: `scene-${Date.now()}`,
      name,
      environment,
      performers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updated = [newConfig, ...savedScenes.filter((s) => s.name !== name)];
    setSavedScenes(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_SAVED_THEATERS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
    setSceneNameInput('');
    setShowSaveModal(false);
  };

  const handleLoadScene = (scene: TheaterSceneConfig) => {
    onSelectEnvironment(scene.environment);
    // Replace performers with scene's performers
    // Reset selection
    onSelectPerformer(null);
    // Apply performers by updating parent
    if (Array.isArray(scene.performers)) {
      scene.performers.forEach((p) => onAddPerformer(p));
    }
    setShowLoadModal(false);
  };

  const handleDeleteSavedScene = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedScenes.filter((s) => s.id !== id);
    setSavedScenes(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_SAVED_THEATERS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  return (
    <div className="w-full bg-white dark:bg-[#1E1D24] rounded-3xl p-4 sm:p-6 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-xl space-y-5 animate-in fade-in duration-300">
      {/* =========================================================================
          TOP EDITOR TOOLBAR
          ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E3DF] dark:border-[#2E2C37] pb-4">
        {/* Left: Environment Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#F7F5F2] dark:bg-[#26252F] border border-[#E7E3DF] dark:border-[#2E2C37]">
          <span className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] px-2 uppercase tracking-wider">
            Environment:
          </span>
          <button
            type="button"
            onClick={() => onSelectEnvironment('concert-hall')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              environment === 'concert-hall'
                ? 'bg-[#7567C7] text-white shadow-xs'
                : 'text-[#524E5B] dark:text-[#A8A4B2] hover:text-black dark:hover:text-white'
            }`}
          >
            <span>🏛️</span>
            <span>Concert Hall</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectEnvironment('small-theater')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              environment === 'small-theater'
                ? 'bg-[#7567C7] text-white shadow-xs'
                : 'text-[#524E5B] dark:text-[#A8A4B2] hover:text-black dark:hover:text-white'
            }`}
          >
            <span>🎭</span>
            <span>Small Theater</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectEnvironment('church')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              environment === 'church'
                ? 'bg-[#7567C7] text-white shadow-xs'
                : 'text-[#524E5B] dark:text-[#A8A4B2] hover:text-black dark:hover:text-white'
            }`}
          >
            <span>⛪</span>
            <span>Church</span>
          </button>
        </div>

        {/* Center / Right: Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Undo / Redo */}
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] disabled:opacity-30 hover:bg-[#F0EDFA] dark:hover:bg-[#2A2542] text-[#524E5B] dark:text-[#A8A4B2] cursor-pointer transition-colors"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] disabled:opacity-30 hover:bg-[#F0EDFA] dark:hover:bg-[#2A2542] text-[#524E5B] dark:text-[#A8A4B2] cursor-pointer transition-colors"
          >
            <Redo2 className="h-4 w-4" />
          </button>

          {/* Add Performer Button */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Add Performer</span>
          </button>

          {/* Reset to Detected */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            title="Reset stage to instruments detected by Gemini"
            className="px-3 py-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 text-xs font-semibold text-[#524E5B] dark:text-[#A8A4B2] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Reset to Detection</span>
          </button>

          {/* Save Scene */}
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="px-3 py-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:bg-[#F0EDFA] dark:hover:bg-[#2A2542] text-xs font-semibold text-[#524E5B] dark:text-[#A8A4B2] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Save Theater</span>
          </button>

          {/* Load Scene */}
          {savedScenes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLoadModal(true)}
              className="px-3 py-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:bg-[#F0EDFA] dark:hover:bg-[#2A2542] text-xs font-semibold text-[#524E5B] dark:text-[#A8A4B2] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Saved ({savedScenes.length})</span>
            </button>
          )}

          {/* Exit / Done Editing */}
          <button
            type="button"
            onClick={onCloseEditor}
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Check className="h-4 w-4" />
            <span>Done Editing</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE: ASSETS BAR & INSPECTOR
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (Presets & Stage Arrangements) */}
        <div className="lg:col-span-4 space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6] mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Quick Stage Formations</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onApplyLayout('arc')}
                className="p-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7] hover:bg-[#F0EDFA]/40 dark:hover:bg-[#2A2542]/40 text-left text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] transition-all cursor-pointer"
              >
                <div className="text-sm mb-0.5">🌙 Semi-Circle Arc</div>
                <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] font-normal">
                  Even curve facing audience
                </div>
              </button>

              <button
                type="button"
                onClick={() => onApplyLayout('quartet')}
                className="p-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7] hover:bg-[#F0EDFA]/40 dark:hover:bg-[#2A2542]/40 text-left text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] transition-all cursor-pointer"
              >
                <div className="text-sm mb-0.5">🎻 Chamber Quartet</div>
                <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] font-normal">
                  Prague Cello / classical setup
                </div>
              </button>

              <button
                type="button"
                onClick={() => onApplyLayout('band')}
                className="p-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7] hover:bg-[#F0EDFA]/40 dark:hover:bg-[#2A2542]/40 text-left text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] transition-all cursor-pointer"
              >
                <div className="text-sm mb-0.5">🎸 Concert Band</div>
                <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] font-normal">
                  Rhythm back, soloist center
                </div>
              </button>

              <button
                type="button"
                onClick={() => onApplyLayout('orchestra')}
                className="p-2.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7] hover:bg-[#F0EDFA]/40 dark:hover:bg-[#2A2542]/40 text-left text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] transition-all cursor-pointer"
              >
                <div className="text-sm mb-0.5">🏛️ Symphonic Tier</div>
                <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] font-normal">
                  Multi-tier orchestral depth
                </div>
              </button>
            </div>
          </div>

          {/* Quick Performer Roster on Stage */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6] mb-2">
              Stage Cast ({performers.length})
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {performers.map((p) => {
                const def = getInstrumentDefinition(p.instrument);
                const isSelected = p.id === selectedPerformerId;

                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectPerformer(p.id)}
                    className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#F0EDFA] dark:bg-[#2A2542] border-[#7567C7] text-[#7567C7] dark:text-[#D8D2FF] font-bold shadow-2xs'
                        : 'bg-[#F7F5F2]/60 dark:bg-[#26252F]/40 border-[#E7E3DF] dark:border-[#2E2C37] text-[#25242A] dark:text-[#F4F2F7] hover:border-[#7567C7]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-base">{def.icon}</span>
                      <span className="truncate">{p.characterName || `${p.gender === 'female' ? 'Female' : 'Male'} ${def.performerTitle}`}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[#77747D] dark:text-[#9E9AA6]">
                      <span className="capitalize">{p.gender}</span>
                      <span>•</span>
                      <span>{(p.scale || 1).toFixed(1)}×</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Performer Properties Inspector */}
        <div className="lg:col-span-8 p-4 sm:p-5 rounded-2xl bg-[#F7F5F2] dark:bg-[#26252F] border border-[#E7E3DF] dark:border-[#2E2C37] space-y-4">
          {selectedPerformer ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E3DF] dark:border-[#2E2C37] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">
                    {getInstrumentDefinition(selectedPerformer.instrument).icon}
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      {selectedPerformer.characterName || 'Performer Inspector'}
                    </h3>
                    <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
                      {selectedPerformer.gender === 'female' ? 'Female' : 'Male'}{' '}
                      {getInstrumentDefinition(selectedPerformer.instrument).performerTitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onDuplicatePerformer(selectedPerformer.id)}
                    className="px-2.5 py-1 rounded-lg border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] hover:border-[#7567C7] text-xs font-semibold text-[#524E5B] dark:text-[#A8A4B2] transition-colors cursor-pointer flex items-center gap-1"
                    title="Duplicate performer"
                  >
                    <Copy className="h-3 w-3" />
                    <span>Duplicate</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeletePerformer(selectedPerformer.id)}
                    className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    title="Delete performer (Delete key)"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Inspector Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* 1. Character Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                    Performer Name
                  </label>
                  <input
                    type="text"
                    value={selectedPerformer.characterName}
                    onChange={(e) =>
                      onUpdatePerformer(selectedPerformer.id, { characterName: e.target.value })
                    }
                    placeholder="e.g. Lead Cellist"
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] focus:outline-none focus:ring-1 focus:ring-[#7567C7]"
                  />
                </div>

                {/* 2. Gender Toggle (Female / Male) */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                    Performer Gender
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37]">
                    <button
                      type="button"
                      onClick={() => onUpdatePerformer(selectedPerformer.id, { gender: 'female' })}
                      className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedPerformer.gender === 'female'
                          ? 'bg-[#7567C7] text-white shadow-xs'
                          : 'text-[#77747D] hover:text-black dark:hover:text-white'
                      }`}
                    >
                      ♀ Female
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePerformer(selectedPerformer.id, { gender: 'male' })}
                      className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedPerformer.gender === 'male'
                          ? 'bg-[#7567C7] text-white shadow-xs'
                          : 'text-[#77747D] hover:text-black dark:hover:text-white'
                      }`}
                    >
                      ♂ Male
                    </button>
                  </div>
                </div>

                {/* 3. Instrument Dropdown */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                    Musical Instrument
                  </label>
                  <select
                    value={selectedPerformer.instrument}
                    onChange={(e) =>
                      onUpdatePerformer(selectedPerformer.id, {
                        instrument: e.target.value as MusicInstrument,
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] focus:outline-none focus:ring-1 focus:ring-[#7567C7] cursor-pointer"
                  >
                    {ALL_INSTRUMENTS.map((inst) => {
                      const def = getInstrumentDefinition(inst);
                      return (
                        <option key={inst} value={inst}>
                          {def.icon} {def.name} ({def.performerTitle})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 4. Scale Slider (0.5x to 2.0x) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                      Scale Size
                    </span>
                    <span className="font-mono font-bold text-[#7567C7]">
                      {(selectedPerformer.scale || 1.0).toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={selectedPerformer.scale || 1.0}
                    onChange={(e) =>
                      onUpdatePerformer(selectedPerformer.id, {
                        scale: parseFloat(e.target.value),
                      })
                    }
                    className="w-full accent-[#7567C7] cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-[#77747D]">
                    <button
                      type="button"
                      onClick={() => onUpdatePerformer(selectedPerformer.id, { scale: 0.75 })}
                      className="hover:text-black dark:hover:text-white cursor-pointer"
                    >
                      0.75×
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePerformer(selectedPerformer.id, { scale: 1.0 })}
                      className="hover:text-black dark:hover:text-white cursor-pointer font-bold"
                    >
                      1.0×
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePerformer(selectedPerformer.id, { scale: 1.25 })}
                      className="hover:text-black dark:hover:text-white cursor-pointer"
                    >
                      1.25×
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePerformer(selectedPerformer.id, { scale: 1.5 })}
                      className="hover:text-black dark:hover:text-white cursor-pointer"
                    >
                      1.5×
                    </button>
                  </div>
                </div>

                {/* 5. Playback Mode */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                    Performance Sync
                  </label>
                  <select
                    value={selectedPerformer.playMode || 'always'}
                    onChange={(e) =>
                      onUpdatePerformer(selectedPerformer.id, {
                        playMode: e.target.value as 'auto' | 'always' | 'resting',
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] focus:outline-none focus:ring-1 focus:ring-[#7567C7] cursor-pointer"
                  >
                    <option value="always">Always Playing during song</option>
                    <option value="auto">Follow Detected Instrument timeline</option>
                    <option value="resting">Resting / Silent</option>
                  </select>
                </div>

                {/* 6. Layer Depth Controls */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                    Stage Depth / Layer
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePerformer(selectedPerformer.id, {
                          layerOrder: (selectedPerformer.layerOrder || Math.round(selectedPerformer.y * 10)) + 10,
                        })
                      }
                      title="Move Forward"
                      className="p-1.5 flex-1 rounded-lg border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs font-semibold hover:border-[#7567C7] cursor-pointer flex items-center justify-center gap-1"
                    >
                      <ArrowUp className="h-3 w-3" />
                      <span>Forward</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePerformer(selectedPerformer.id, {
                          layerOrder: (selectedPerformer.layerOrder || Math.round(selectedPerformer.y * 10)) - 10,
                        })
                      }
                      title="Move Backward"
                      className="p-1.5 flex-1 rounded-lg border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs font-semibold hover:border-[#7567C7] cursor-pointer flex items-center justify-center gap-1"
                    >
                      <ArrowDown className="h-3 w-3" />
                      <span>Back</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Coordinates display helper */}
              <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] flex items-center justify-between border-t border-[#E7E3DF] dark:border-[#2E2C37] pt-2">
                <span>
                  Position: X: <strong className="text-[#25242A] dark:text-[#F4F2F7]">{selectedPerformer.x}%</strong>, Y: <strong className="text-[#25242A] dark:text-[#F4F2F7]">{selectedPerformer.y}%</strong> (Drag directly on stage)
                </span>
                <span className="italic">Grounded to stage floor</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-[#77747D] dark:text-[#9E9AA6] space-y-1">
              <span className="text-2xl">👆</span>
              <p className="text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7]">
                No Performer Selected
              </p>
              <p className="text-[11px]">
                Click on any musician on the stage to modify their instrument, gender, size, or layer.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          MODAL: ADD PERFORMER
          ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1D24] rounded-3xl p-6 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E7E3DF] dark:border-[#2E2C37] pb-3">
              <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#7567C7]" />
                <span>Add Performer to Stage</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-[#77747D] hover:text-black dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmAddPerformer} className="space-y-4">
              {/* Gender Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  Performer Gender:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewGender('female')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      newGender === 'female'
                        ? 'bg-[#F0EDFA] dark:bg-[#2A2542] border-[#7567C7] text-[#7567C7] dark:text-[#D8D2FF] font-bold shadow-xs'
                        : 'border-[#E7E3DF] dark:border-[#2E2C37] text-[#77747D]'
                    }`}
                  >
                    <div className="text-xl mb-1">👩</div>
                    <div className="text-xs font-bold">Female Performer</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewGender('male')}
                    className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                      newGender === 'male'
                        ? 'bg-[#F0EDFA] dark:bg-[#2A2542] border-[#7567C7] text-[#7567C7] dark:text-[#D8D2FF] font-bold shadow-xs'
                        : 'border-[#E7E3DF] dark:border-[#2E2C37] text-[#77747D]'
                    }`}
                  >
                    <div className="text-xl mb-1">👨</div>
                    <div className="text-xs font-bold">Male Performer</div>
                  </button>
                </div>
              </div>

              {/* Instrument Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  Musical Instrument:
                </label>
                <select
                  value={newInstrument}
                  onChange={(e) => setNewInstrument(e.target.value as MusicInstrument)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs font-semibold text-[#25242A] dark:text-[#F4F2F7] focus:outline-none focus:ring-2 focus:ring-[#7567C7] cursor-pointer"
                >
                  {ALL_INSTRUMENTS.map((inst) => {
                    const def = getInstrumentDefinition(inst);
                    return (
                      <option key={inst} value={inst}>
                        {def.icon} {def.name} ({def.performerTitle})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Optional Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  Character Name (Optional):
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`e.g. ${newGender === 'female' ? 'Female' : 'Male'} ${getInstrumentDefinition(newInstrument).performerTitle}`}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs text-[#25242A] dark:text-[#F4F2F7] focus:outline-none focus:ring-2 focus:ring-[#7567C7]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E3DF] dark:border-[#2E2C37]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#77747D] hover:text-black dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Add to Stage
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: RESET CONFIRMATION
          ========================================================================= */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#1E1D24] rounded-3xl p-6 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl space-y-4 text-center">
            <span className="text-3xl">⚠️</span>
            <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
              Reset to Detected Ensemble?
            </h3>
            <p className="text-xs text-[#77747D] dark:text-[#9E9AA6]">
              This will discard manual stage additions and reconstruct the theater performers strictly from the latest music analysis.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#77747D] hover:text-black dark:hover:text-white cursor-pointer"
              >
                Keep My Changes
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetToDetected();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                Reset Stage
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: SAVE THEATER SCENE
          ========================================================================= */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#1E1D24] rounded-3xl p-6 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E7E3DF] dark:border-[#2E2C37] pb-3">
              <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2">
                <Save className="h-4 w-4 text-[#7567C7]" />
                <span>Save Theater Scene</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="p-1 rounded-lg text-[#77747D] hover:text-black dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveScene} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  Scene Name:
                </label>
                <input
                  type="text"
                  value={sceneNameInput}
                  onChange={(e) => setSceneNameInput(e.target.value)}
                  placeholder="e.g. My Phantom Cello Quartet"
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E3DF] dark:border-[#2E2C37] bg-white dark:bg-[#1E1D24] text-xs text-[#25242A] dark:text-[#F4F2F7] focus:outline-none focus:ring-2 focus:ring-[#7567C7]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E3DF] dark:border-[#2E2C37]">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#77747D] hover:text-black dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-xs font-bold transition-all cursor-pointer shadow-sm"
                >
                  Save to Browser
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: LOAD SAVED THEATER SCENE
          ========================================================================= */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#1E1D24] rounded-3xl p-6 border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E7E3DF] dark:border-[#2E2C37] pb-3">
              <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-[#7567C7]" />
                <span>Saved Theater Scenes</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="p-1 rounded-lg text-[#77747D] hover:text-black dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {savedScenes.map((scene) => (
                <div
                  key={scene.id}
                  onClick={() => handleLoadScene(scene)}
                  className="p-3 rounded-2xl border border-[#E7E3DF] dark:border-[#2E2C37] hover:border-[#7567C7] hover:bg-[#F0EDFA]/40 dark:hover:bg-[#2A2542]/40 flex items-center justify-between cursor-pointer transition-all"
                >
                  <div>
                    <h4 className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      {scene.name}
                    </h4>
                    <p className="text-[10px] text-[#77747D] dark:text-[#9E9AA6]">
                      {scene.environment === 'concert-hall'
                        ? '🏛️ Concert Hall'
                        : scene.environment === 'small-theater'
                        ? '🎭 Small Theater'
                        : '⛪ Church'}{' '}
                      • {scene.performers?.length || 0} Performers
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteSavedScene(scene.id, e)}
                    className="p-1.5 rounded-lg text-[#77747D] hover:text-red-500 cursor-pointer"
                    title="Delete saved scene"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
