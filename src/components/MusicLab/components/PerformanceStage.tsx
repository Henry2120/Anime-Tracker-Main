import React, { useMemo, useState } from 'react';
import { MusicInstrument, PlaybackState, MusicAnalysisResult } from '../types';
import { AppTheme } from '../../../types/theme';
import { MusicianFigure } from './MusicianFigure';
import { getInstrumentDefinition } from '../instruments/registry';
import { Character3DViewer } from '../../CharacterViewer/Character3DViewer';
import { Box, Sparkles, LayoutGrid } from 'lucide-react';

interface PerformanceStageProps {
  activeInstruments: MusicInstrument[]; // Currently detected / selected instruments
  playingInstruments: Set<MusicInstrument>; // Instruments currently actively performing at this playback time
  instrumentIntensities?: Record<string, number>; // Section/timeline dynamic intensities
  theme: AppTheme;
  isPlaying: boolean;
  playback?: PlaybackState;
  analysisResult?: MusicAnalysisResult | null;
  onTogglePlayPause?: () => void;
  className?: string;
  onSelectInstrument?: (instrument: MusicInstrument) => void;
  stageViewMode?: '2d' | '3d';
  onStageViewModeChange?: (mode: '2d' | '3d') => void;
}

export const PerformanceStage: React.FC<PerformanceStageProps> = ({
  activeInstruments,
  playingInstruments,
  instrumentIntensities = {},
  theme,
  isPlaying,
  playback,
  analysisResult,
  onTogglePlayPause,
  className = '',
  onSelectInstrument,
  stageViewMode: controlledMode,
  onStageViewModeChange,
}) => {
  // Toggle between 2D ensemble stage and 3D character viewport (defaults to 3D)
  const [internalMode, setInternalMode] = useState<'2d' | '3d'>('3d');
  const currentMode = controlledMode ?? internalMode;

  const setMode = (m: '2d' | '3d') => {
    setInternalMode(m);
    onStageViewModeChange?.(m);
  };

  // Theme styling for the stage floor, wooden platform, and backdrop
  const stageStyles = {
    dark: {
      backdrop: 'bg-gradient-to-b from-[#181524] via-[#120F1D] to-[#0A0812]',
      border: 'border-[#2E2C37]',
      floor: 'bg-gradient-to-t from-[#0E0B16] to-[#1E1A2D] border-t border-[#3B3454]',
      glow: 'radial-gradient(ellipse at 50% 100%, rgba(117,103,199,0.22) 0%, transparent 70%)',
      stageShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75)',
      curtainAccent: '#7567C7',
    },
    sakura: {
      backdrop: 'bg-gradient-to-b from-[#FFF5F7] via-[#FCEAEF] to-[#F5D8E0]',
      border: 'border-[#F2D6DC]',
      floor: 'bg-gradient-to-t from-[#E8BFCA] to-[#FDF0F3] border-t border-[#E8BFCA]',
      glow: 'radial-gradient(ellipse at 50% 100%, rgba(244,114,182,0.2) 0%, transparent 70%)',
      stageShadow: '0 25px 50px -15px rgba(244, 114, 182, 0.18)',
      curtainAccent: '#F472B6',
    },
    light: {
      backdrop: 'bg-gradient-to-b from-[#FAF8F5] via-[#F3EFE9] to-[#E9E4DC]',
      border: 'border-[#E7E3DF]',
      floor: 'bg-gradient-to-t from-[#DFD9D0] to-[#FAF8F5] border-t border-[#D5CEC4]',
      glow: 'radial-gradient(ellipse at 50% 100%, rgba(198,154,85,0.15) 0%, transparent 70%)',
      stageShadow: '0 25px 50px -15px rgba(0, 0, 0, 0.08)',
      curtainAccent: '#7567C7',
    },
  }[theme] || {
    backdrop: 'bg-gradient-to-b from-[#FAF8F5] via-[#F3EFE9] to-[#E9E4DC]',
    border: 'border-[#E7E3DF]',
    floor: 'bg-gradient-to-t from-[#DFD9D0] to-[#FAF8F5] border-t border-[#D5CEC4]',
    glow: 'radial-gradient(ellipse at 50% 100%, rgba(198,154,85,0.15) 0%, transparent 70%)',
    stageShadow: '0 25px 50px -15px rgba(0, 0, 0, 0.08)',
    curtainAccent: '#7567C7',
  };

  /**
   * Intelligently arrange performers based on ensemble type:
   * - Solo (1): centered soloist
   * - Duo (2): balanced left/right
   * - Trio (3): natural triangle
   * - Band / Orchestra: Backline (Drums, Organ, Horns, Bass) & Frontline (Vocal, Piano, Strings, Lead Guitar)
   */
  const { frontRow, backRow, isSolo, isDuo } = useMemo(() => {
    if (activeInstruments.length === 0) {
      return { frontRow: [], backRow: [], isSolo: false, isDuo: false };
    }

    if (activeInstruments.length === 1) {
      return { frontRow: activeInstruments, backRow: [], isSolo: true, isDuo: false };
    }

    if (activeInstruments.length === 2) {
      return { frontRow: activeInstruments, backRow: [], isSolo: false, isDuo: true };
    }

    if (activeInstruments.length === 3) {
      // Small acoustic trio on one cohesive row
      return { frontRow: activeInstruments, backRow: [], isSolo: false, isDuo: false };
    }

    // Larger ensembles: Split into backline (percussion, organ, brass, backing bass) and frontline (vocalist, solo strings, keys, guitars)
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

    const back: MusicInstrument[] = [];
    const front: MusicInstrument[] = [];

    // Prioritize vocalist front and center
    const sorted = [...activeInstruments].sort((a, b) => {
      const defA = getInstrumentDefinition(a);
      const defB = getInstrumentDefinition(b);
      return defA.defaultEnsembleRank - defB.defaultEnsembleRank;
    });

    sorted.forEach((inst) => {
      if (backlineTypes.includes(inst)) {
        back.push(inst);
      } else {
        front.push(inst);
      }
    });

    // Balance rows if one is too empty
    if (back.length === 0 && front.length > 4) {
      const splitAt = Math.ceil(front.length / 2);
      return { frontRow: front.slice(0, splitAt), backRow: front.slice(splitAt), isSolo: false, isDuo: false };
    }

    return { frontRow: front.length > 0 ? front : back, backRow: front.length > 0 ? back : [], isSolo: false, isDuo: false };
  }, [activeInstruments]);

  // When in 3D Character Viewport mode: Expand to fill full available space
  if (currentMode === '3d') {
    return (
      <div className={`flex-1 min-h-0 w-full h-full flex flex-col ${className}`}>
        <Character3DViewer
          theme={theme}
          className="flex-1 min-h-0 w-full h-full"
          onReturnToEnsemble={() => setMode('2d')}
        />
      </div>
    );
  }

  return (
    <div className={`w-full flex flex-col space-y-2 ${className}`}>
      {/* Stage Mode Switcher (2D Mode) */}
      <div className="flex items-center justify-end px-2">
        <div className="inline-flex items-center p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs">
          <button
            type="button"
            onClick={() => setMode('3d')}
            className="px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer text-[#77747D] hover:text-[#25242A] dark:hover:text-white"
          >
            <Box className="h-3.5 w-3.5" />
            <span>3D Character Studio</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('2d')}
            className="px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer bg-[#7567C7] text-white shadow-xs"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>2D Ensemble Stage</span>
          </button>
        </div>
      </div>

      <div
        className={`relative w-full rounded-3xl overflow-hidden border ${stageStyles.border} ${stageStyles.backdrop} p-4 sm:p-8 flex flex-col justify-between min-h-[380px] sm:min-h-[460px] shadow-2xl transition-colors duration-500`}
        style={{ boxShadow: stageStyles.stageShadow }}
      >
        {/* Diorama Ambient Atmosphere */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: stageStyles.glow }} />

        {/* Top Stage Bar: Live Ensemble & Performance Status */}
        <div className="relative z-10 flex items-center justify-between gap-3 text-xs mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isPlaying && playingInstruments.size > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#25242A] dark:text-[#F4F2F7]">
              {isPlaying && playingInstruments.size > 0
                ? `Concert Performance (${playingInstruments.size} Playing)`
                : 'Concert Stage • Ready'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-[#77747D] dark:text-[#9E9AA6]">
              Ensemble: {activeInstruments.length} {activeInstruments.length === 1 ? 'Musician' : 'Musicians'}
            </span>
          </div>
        </div>

        {/* Main Diorama Stage Floor & Performers Array */}
        <div className="relative z-10 flex-1 flex flex-col justify-end items-center my-auto pb-4 w-full">
          {activeInstruments.length === 0 ? (
            <div className="py-16 text-center text-[#77747D] dark:text-[#9E9AA6] space-y-2">
              <span className="text-4xl select-none">🎭</span>
              <p className="text-sm font-semibold">Stage is empty</p>
              <p className="text-xs">Provide a song above to detect instruments and assemble your band.</p>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center gap-4 sm:gap-6">
              {/* Back Row (Drums, Organ, Brass, Bass) */}
              {backRow.length > 0 && (
                <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-8 w-full transform sm:scale-95 origin-bottom opacity-95">
                  {backRow.map((inst) => {
                    const isInstPlaying = isPlaying && playingInstruments.has(inst);
                    const instIntensity = instrumentIntensities[inst] ?? 0.8;
                    return (
                      <div
                        key={`back-${inst}`}
                        onClick={() => onSelectInstrument?.(inst)}
                        className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                      >
                        <MusicianFigure
                          instrumentId={inst}
                          isPlaying={isInstPlaying}
                          intensity={instIntensity}
                          theme={theme}
                          size={isSolo ? 'large' : 'medium'}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Front Row (Soloists, Vocalist, Lead Guitars, Piano) */}
              <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-6 w-full">
                {frontRow.map((inst) => {
                  const isInstPlaying = isPlaying && playingInstruments.has(inst);
                  const instIntensity = instrumentIntensities[inst] ?? 0.8;
                  return (
                    <div
                      key={`front-${inst}`}
                      onClick={() => onSelectInstrument?.(inst)}
                      className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    >
                      <MusicianFigure
                        instrumentId={inst}
                        isPlaying={isInstPlaying}
                        intensity={instIntensity}
                        theme={theme}
                        size={isSolo ? 'large' : isDuo ? 'medium' : 'medium'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Stage Wooden Deck Floor with Quick Status Indicators */}
        <div
          className={`relative z-10 w-full h-9 sm:h-12 rounded-2xl ${stageStyles.floor} flex items-center justify-between px-4 sm:px-6 shadow-md`}
        >
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
            {activeInstruments.map((inst) => {
              const def = getInstrumentDefinition(inst);
              const isInstPlaying = isPlaying && playingInstruments.has(inst);
              return (
                <span
                  key={`deck-${inst}`}
                  className={`text-xs sm:text-sm transition-all duration-200 cursor-pointer ${
                    isInstPlaying
                      ? 'scale-125 filter drop-shadow-sm opacity-100'
                      : 'opacity-40 hover:opacity-80'
                  }`}
                  title={`${def.performerTitle} (${def.name}) — ${isInstPlaying ? 'Playing ♪' : 'Resting'}`}
                  onClick={() => onSelectInstrument?.(inst)}
                >
                  {def.icon}
                </span>
              );
            })}
          </div>

          <span className="font-mono text-[10px] uppercase tracking-widest text-[#77747D] dark:text-[#9E9AA6] shrink-0 ml-2">
            Miniature Music Stage
          </span>
        </div>
      </div>
    </div>
  );
};
