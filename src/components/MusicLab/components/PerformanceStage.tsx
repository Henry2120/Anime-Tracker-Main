import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  MusicInstrument,
  TheaterEnvironment,
  TheaterPerformer,
  PerformerGender,
} from '../types';
import { AppTheme } from '../../../types/theme';
import { getInstrumentDefinition, ALL_INSTRUMENTS } from '../instruments/registry';
import { TheaterStage } from './TheaterStage';
import { TheaterEditor } from './TheaterEditor';
import { MusicLab3DStage } from './MusicLab3DStage';
import { Box, Sparkles, Layers, SlidersHorizontal, RotateCcw, Check } from 'lucide-react';

interface PerformanceStageProps {
  activeInstruments: MusicInstrument[]; // Currently detected / selected instruments
  playingInstruments: Set<MusicInstrument>; // Instruments currently actively performing at this playback time
  instrumentIntensities?: Record<string, number>; // Section/timeline dynamic intensities
  theme: AppTheme;
  isPlaying: boolean;
  className?: string;
  onSelectInstrument?: (instrument: MusicInstrument) => void;
}

/**
 * Generates an initial aesthetic stage layout for detected instruments
 */
function generateDefaultPerformers(
  activeInstruments: MusicInstrument[],
  existingPerformers: TheaterPerformer[] = []
): { performers: TheaterPerformer[]; defaultEnv: TheaterEnvironment } {
  if (activeInstruments.length === 0) {
    return { performers: [], defaultEnv: 'concert-hall' };
  }

  // Preserve existing performers if they already match active instruments
  const existingMap = new Map<string, TheaterPerformer>();
  existingPerformers.forEach((p) => existingMap.set(p.instrument, p));

  // Determine smart environment
  const hasChurchOrgan =
    activeInstruments.includes('church-organ') ||
    activeInstruments.includes('pipe-organ');
  const defaultEnv: TheaterEnvironment = hasChurchOrgan ? 'church' : 'concert-hall';

  // Sort instruments by orchestral hierarchy
  const sorted = [...activeInstruments].sort((a, b) => {
    const defA = getInstrumentDefinition(a);
    const defB = getInstrumentDefinition(b);
    return defA.defaultEnsembleRank - defB.defaultEnsembleRank;
  });

  const count = sorted.length;
  const newPerformers: TheaterPerformer[] = [];

  // 1. Solo Performer
  if (count === 1) {
    const inst = sorted[0];
    const existing = existingMap.get(inst);
    const def = getInstrumentDefinition(inst);
    newPerformers.push({
      id: existing?.id || `performer-${inst}-${Date.now()}`,
      instrument: inst,
      gender: existing?.gender || (inst === 'violin' || inst === 'harp' || inst === 'flute' ? 'female' : 'male'),
      characterName: existing?.characterName || def.performerTitle,
      x: 50,
      y: 76,
      scale: 1.15,
      isPlaying: false,
      playMode: existing?.playMode || 'auto',
      layerOrder: 50,
    });
    return { performers: newPerformers, defaultEnv };
  }

  // 2. Duo Performance (Balanced Left/Right)
  if (count === 2) {
    sorted.forEach((inst, idx) => {
      const existing = existingMap.get(inst);
      const def = getInstrumentDefinition(inst);
      const xPos = idx === 0 ? 36 : 64;
      newPerformers.push({
        id: existing?.id || `performer-${inst}-${Date.now()}-${idx}`,
        instrument: inst,
        gender: existing?.gender || (idx === 0 ? 'female' : 'male'),
        characterName: existing?.characterName || def.performerTitle,
        x: existing?.x ?? xPos,
        y: existing?.y ?? 76,
        scale: existing?.scale ?? 1.05,
        isPlaying: false,
        playMode: existing?.playMode || 'auto',
        layerOrder: 50,
      });
    });
    return { performers: newPerformers, defaultEnv };
  }

  // 3. Trio Ensemble (Natural Triangle Formation)
  if (count === 3) {
    const positions = [
      { x: 50, y: 78, scale: 1.1 },
      { x: 28, y: 74, scale: 1.0 },
      { x: 72, y: 74, scale: 1.0 },
    ];
    sorted.forEach((inst, idx) => {
      const existing = existingMap.get(inst);
      const def = getInstrumentDefinition(inst);
      const pos = positions[idx] || { x: 50, y: 75, scale: 1.0 };
      newPerformers.push({
        id: existing?.id || `performer-${inst}-${Date.now()}-${idx}`,
        instrument: inst,
        gender: existing?.gender || (idx % 2 === 0 ? 'female' : 'male'),
        characterName: existing?.characterName || def.performerTitle,
        x: existing?.x ?? pos.x,
        y: existing?.y ?? pos.y,
        scale: existing?.scale ?? pos.scale,
        isPlaying: false,
        playMode: existing?.playMode || 'auto',
        layerOrder: Math.round(pos.y * 10),
      });
    });
    return { performers: newPerformers, defaultEnv };
  }

  // 4. Band / Chamber / Full Ensemble Formation
  const backlineTypes: MusicInstrument[] = [
    'drums',
    'electronic-drums',
    'timpani',
    'percussion',
    'electronic-drum-pad',
    'drum-machine',
    'bass',
    'double-bass',
    'church-organ',
    'pipe-organ',
    'trumpet',
    'trombone',
    'french-horn',
    'tuba',
    'choir',
  ];

  const frontRowInsts: MusicInstrument[] = [];
  const backRowInsts: MusicInstrument[] = [];

  sorted.forEach((inst) => {
    if (backlineTypes.includes(inst)) {
      backRowInsts.push(inst);
    } else {
      frontRowInsts.push(inst);
    }
  });

  // Balance rows
  if (backRowInsts.length === 0 && frontRowInsts.length > 4) {
    const splitAt = Math.ceil(frontRowInsts.length / 2);
    backRowInsts.push(...frontRowInsts.splice(splitAt));
  }

  // Place back row performers
  backRowInsts.forEach((inst, idx) => {
    const existing = existingMap.get(inst);
    const def = getInstrumentDefinition(inst);
    const total = backRowInsts.length;
    const spacing = 70 / (total + 1);
    const xPos = Math.round(15 + spacing * (idx + 1));
    const yPos = 52;

    newPerformers.push({
      id: existing?.id || `performer-${inst}-${Date.now()}-${idx}`,
      instrument: inst,
      gender: existing?.gender || (idx % 2 === 1 ? 'female' : 'male'),
      characterName: existing?.characterName || def.performerTitle,
      x: existing?.x ?? xPos,
      y: existing?.y ?? yPos,
      scale: existing?.scale ?? 0.92,
      isPlaying: false,
      playMode: existing?.playMode || 'auto',
      layerOrder: Math.round(yPos * 10),
    });
  });

  // Place front row performers
  frontRowInsts.forEach((inst, idx) => {
    const existing = existingMap.get(inst);
    const def = getInstrumentDefinition(inst);
    const total = frontRowInsts.length;
    const spacing = 74 / (total + 1);
    const xPos = Math.round(13 + spacing * (idx + 1));
    const yPos = 78;

    newPerformers.push({
      id: existing?.id || `performer-${inst}-${Date.now()}-${idx}`,
      instrument: inst,
      gender: existing?.gender || (idx % 2 === 0 ? 'female' : 'male'),
      characterName: existing?.characterName || def.performerTitle,
      x: existing?.x ?? xPos,
      y: existing?.y ?? yPos,
      scale: existing?.scale ?? 1.05,
      isPlaying: false,
      playMode: existing?.playMode || 'auto',
      layerOrder: Math.round(yPos * 10),
    });
  });

  return { performers: newPerformers, defaultEnv };
}

export const PerformanceStage: React.FC<PerformanceStageProps> = ({
  activeInstruments,
  playingInstruments,
  instrumentIntensities = {},
  theme,
  isPlaying,
  className = '',
  onSelectInstrument,
}) => {
  // View mode switcher: 'theater' (Miniature Human Performers Stage) vs '3d' (Three.js character test stage)
  const [stageViewMode, setStageViewMode] = useState<'theater' | '3d'>('theater');

  // Theater Environment & Performers state
  const [environment, setEnvironment] = useState<TheaterEnvironment>('concert-hall');
  const [performers, setPerformers] = useState<TheaterPerformer[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPerformerId, setSelectedPerformerId] = useState<string | null>(null);

  // Undo / Redo history tracking for stage layout editing
  const [history, setHistory] = useState<TheaterPerformer[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isHistoryActionRef = useRef(false);

  // Auto-sync performers when activeInstruments change
  useEffect(() => {
    const { performers: generated, defaultEnv } = generateDefaultPerformers(activeInstruments, performers);
    setPerformers(generated);
    setEnvironment((prev) => (prev === 'concert-hall' && defaultEnv === 'church' ? 'church' : prev));
    setHistory([generated]);
    setHistoryIndex(0);
  }, [activeInstruments]);

  // Synchronize playing state with playback and timeline
  const livePerformers = useMemo(() => {
    return performers.map((p) => {
      const isActivelyPlaying =
        isPlaying &&
        (p.playMode === 'always' ||
          (p.playMode !== 'resting' && playingInstruments.has(p.instrument)));

      return {
        ...p,
        isPlaying: isActivelyPlaying,
      };
    });
  }, [performers, isPlaying, playingInstruments]);

  // Save state snapshot for undo/redo
  const pushHistorySnapshot = useCallback((newPerformers: TheaterPerformer[]) => {
    if (isHistoryActionRef.current) {
      isHistoryActionRef.current = false;
      return;
    }
    setHistory((prev) => {
      const sliced = prev.slice(0, historyIndex + 1);
      return [...sliced, newPerformers];
    });
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isHistoryActionRef.current = true;
      const targetIndex = historyIndex - 1;
      setPerformers(history[targetIndex]);
      setHistoryIndex(targetIndex);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isHistoryActionRef.current = true;
      const targetIndex = historyIndex + 1;
      setPerformers(history[targetIndex]);
      setHistoryIndex(targetIndex);
    }
  }, [history, historyIndex]);

  // Performer editing actions
  const handleUpdatePerformerPosition = useCallback((id: string, x: number, y: number) => {
    setPerformers((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, x, y, layerOrder: Math.round(y * 10) } : p));
      return updated;
    });
  }, []);

  const handleUpdatePerformer = useCallback((id: string, updates: Partial<TheaterPerformer>) => {
    setPerformers((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      pushHistorySnapshot(updated);
      return updated;
    });
  }, [pushHistorySnapshot]);

  const handleAddPerformer = useCallback((newP: Omit<TheaterPerformer, 'id'>) => {
    const id = `custom-performer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const created: TheaterPerformer = {
      ...newP,
      id,
    };
    setPerformers((prev) => {
      const updated = [...prev, created];
      pushHistorySnapshot(updated);
      return updated;
    });
    setSelectedPerformerId(id);
  }, [pushHistorySnapshot]);

  const handleDeletePerformer = useCallback((id: string) => {
    setPerformers((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      pushHistorySnapshot(updated);
      return updated;
    });
    if (selectedPerformerId === id) {
      setSelectedPerformerId(null);
    }
  }, [selectedPerformerId, pushHistorySnapshot]);

  const handleDuplicatePerformer = useCallback((id: string) => {
    const found = performers.find((p) => p.id === id);
    if (!found) return;

    const dupId = `dup-performer-${Date.now()}`;
    const duplicated: TheaterPerformer = {
      ...found,
      id: dupId,
      x: Math.min(90, found.x + 6),
      y: Math.min(88, found.y + 4),
      characterName: `${found.characterName} (Copy)`,
    };
    setPerformers((prev) => {
      const updated = [...prev, duplicated];
      pushHistorySnapshot(updated);
      return updated;
    });
    setSelectedPerformerId(dupId);
  }, [performers, pushHistorySnapshot]);

  const handleResetToDetected = useCallback(() => {
    const { performers: resetPerformers } = generateDefaultPerformers(activeInstruments);
    setPerformers(resetPerformers);
    pushHistorySnapshot(resetPerformers);
    setSelectedPerformerId(null);
  }, [activeInstruments, pushHistorySnapshot]);

  // Formations helper
  const handleApplyLayout = useCallback((layoutType: 'arc' | 'quartet' | 'band' | 'orchestra') => {
    setPerformers((prev) => {
      if (prev.length === 0) return prev;
      const count = prev.length;
      const updated = [...prev];

      if (layoutType === 'arc') {
        const step = 70 / Math.max(1, count - 1);
        updated.forEach((p, idx) => {
          const x = count === 1 ? 50 : 15 + idx * step;
          const distFromCenter = Math.abs(x - 50) / 35;
          const y = 80 - Math.pow(distFromCenter, 2) * 14;
          p.x = Math.round(x);
          p.y = Math.round(y);
          p.layerOrder = Math.round(y * 10);
        });
      } else if (layoutType === 'quartet') {
        const coords = [
          { x: 30, y: 76 },
          { x: 44, y: 72 },
          { x: 56, y: 72 },
          { x: 70, y: 76 },
        ];
        updated.forEach((p, idx) => {
          const pos = coords[idx % coords.length];
          p.x = pos.x;
          p.y = pos.y;
          p.layerOrder = Math.round(pos.y * 10);
        });
      } else if (layoutType === 'band') {
        const half = Math.ceil(count / 2);
        updated.forEach((p, idx) => {
          if (idx < half) {
            // Front line
            const x = count === 1 ? 50 : 18 + (idx * 64) / Math.max(1, half - 1);
            p.x = Math.round(x);
            p.y = 80;
            p.scale = 1.05;
          } else {
            // Back line
            const bIdx = idx - half;
            const bTotal = count - half;
            const x = 24 + (bIdx * 52) / Math.max(1, bTotal - 1);
            p.x = Math.round(x);
            p.y = 52;
            p.scale = 0.92;
          }
          p.layerOrder = Math.round(p.y * 10);
        });
      } else if (layoutType === 'orchestra') {
        // 3-Tier Arc
        updated.forEach((p, idx) => {
          const tier = idx % 3;
          const yTiers = [82, 66, 50];
          const scaleTiers = [1.08, 0.98, 0.88];
          const xPos = 16 + ((idx * 68) / Math.max(1, count - 1));
          p.x = Math.round(xPos);
          p.y = yTiers[tier];
          p.scale = scaleTiers[tier];
          p.layerOrder = Math.round(p.y * 10);
        });
      }

      pushHistorySnapshot(updated);
      return updated;
    });
  }, [pushHistorySnapshot]);

  return (
    <div className={`w-full space-y-3 ${className}`}>
      {/* =========================================================================
          STAGE CONTROL HEADER: View Mode Switcher, Environment Badge & Edit Toggle
          ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-1">
        {/* Left: View Mode Segmented Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] shadow-xs">
          <button
            type="button"
            onClick={() => setStageViewMode('theater')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              stageViewMode === 'theater'
                ? 'bg-[#7567C7] text-white shadow-xs'
                : 'text-[#77747D] dark:text-[#9E9AA6] hover:text-[#25242A] dark:hover:text-white'
            }`}
          >
            <span>🎭</span>
            <span>Miniature Theater</span>
          </button>

          <button
            type="button"
            onClick={() => setStageViewMode('3d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              stageViewMode === '3d'
                ? 'bg-[#7567C7] text-white shadow-xs'
                : 'text-[#77747D] dark:text-[#9E9AA6] hover:text-[#25242A] dark:hover:text-white'
            }`}
          >
            <Box className="h-3.5 w-3.5" />
            <span>3D GLB Character</span>
          </button>
        </div>

        {/* Right: Environment Selector & Edit Cast Button */}
        {stageViewMode === 'theater' && (
          <div className="flex items-center gap-2">
            {/* Environment Quick Pill Buttons */}
            <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#1E1D24] border border-[#E7E3DF] dark:border-[#2E2C37] text-xs">
              <button
                type="button"
                onClick={() => setEnvironment('concert-hall')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  environment === 'concert-hall'
                    ? 'bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] font-bold'
                    : 'text-[#77747D] hover:text-black dark:hover:text-white'
                }`}
                title="Concert Hall Stage"
              >
                🏛️ Hall
              </button>
              <button
                type="button"
                onClick={() => setEnvironment('small-theater')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  environment === 'small-theater'
                    ? 'bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] font-bold'
                    : 'text-[#77747D] hover:text-black dark:hover:text-white'
                }`}
                title="Intimate Small Theater"
              >
                🎭 Theater
              </button>
              <button
                type="button"
                onClick={() => setEnvironment('church')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  environment === 'church'
                    ? 'bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] font-bold'
                    : 'text-[#77747D] hover:text-black dark:hover:text-white'
                }`}
                title="Church Cathedral with Pipe Organ"
              >
                ⛪ Church
              </button>
            </div>

            {/* Edit Cast & Stage Toggle Button */}
            <button
              type="button"
              onClick={() => setIsEditing((prev) => !prev)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border ${
                isEditing
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 ring-2 ring-emerald-500/20'
                  : 'bg-white dark:bg-[#1E1D24] text-[#7567C7] dark:text-[#B9B0F2] border-[#7567C7]/30 hover:border-[#7567C7] hover:bg-[#F0EDFA]/40 dark:hover:bg-[#2A2542]/40'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{isEditing ? 'Editing Mode Active' : 'Edit Stage & Cast'}</span>
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          MAIN STAGE VIEWPORT
          ========================================================================= */}
      {stageViewMode === '3d' ? (
        <MusicLab3DStage
          theme={theme}
          defaultModelPath="/music-lab/characters/test-character.glb"
          onReturnToEnsemble={() => setStageViewMode('theater')}
        />
      ) : (
        <div className="space-y-4">
          <TheaterStage
            environment={environment}
            performers={livePerformers}
            onSelectPerformer={setSelectedPerformerId}
            selectedPerformerId={selectedPerformerId}
            onUpdatePerformerPosition={handleUpdatePerformerPosition}
            isEditing={isEditing}
            isPlaying={isPlaying}
            theme={theme}
          />

          {/* =========================================================================
              THEATER EDITOR PANEL (EXPANDED WHEN EDITING)
              ========================================================================= */}
          {isEditing && (
            <TheaterEditor
              environment={environment}
              onSelectEnvironment={setEnvironment}
              performers={performers}
              selectedPerformerId={selectedPerformerId}
              onSelectPerformer={setSelectedPerformerId}
              onAddPerformer={handleAddPerformer}
              onUpdatePerformer={handleUpdatePerformer}
              onDeletePerformer={handleDeletePerformer}
              onDuplicatePerformer={handleDuplicatePerformer}
              onResetToDetected={handleResetToDetected}
              onApplyLayout={handleApplyLayout}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < history.length - 1}
              onUndo={handleUndo}
              onRedo={handleRedo}
              theme={theme}
              onCloseEditor={() => setIsEditing(false)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default PerformanceStage;
