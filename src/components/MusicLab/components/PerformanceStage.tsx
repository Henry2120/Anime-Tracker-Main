import React, { useMemo } from 'react';
import { MusicInstrument } from '../types';
import { AppTheme } from '../../../types/theme';
import { PerformerFigure } from './PerformerFigure';
import { getInstrumentDefinition } from '../instruments/registry';

interface PerformanceStageProps {
  activeInstruments: MusicInstrument[]; // Currently detected / selected instruments
  playingInstruments: Set<MusicInstrument>; // Instruments currently actively performing at this playback time
  theme: AppTheme;
  isPlaying: boolean;
  className?: string;
}

export const PerformanceStage: React.FC<PerformanceStageProps> = ({
  activeInstruments,
  playingInstruments,
  theme,
  isPlaying,
  className = '',
}) => {
  // Theme styling for the stage floor and backdrop
  const stageStyles = {
    dark: {
      backdrop: 'bg-gradient-to-b from-[#181524] via-[#120F1D] to-[#0A0812]',
      border: 'border-[#2E2C37]',
      floor: 'bg-gradient-to-t from-[#0E0B16] to-[#1E1A2D] border-t border-[#3B3454]',
      glow: 'radial-gradient(ellipse at 50% 100%, rgba(117,103,199,0.18) 0%, transparent 70%)',
      curtainAccent: '#7567C7',
      stageShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7)',
    },
    sakura: {
      backdrop: 'bg-gradient-to-b from-[#FFF5F7] via-[#FCEAEF] to-[#F5D8E0]',
      border: 'border-[#F2D6DC]',
      floor: 'bg-gradient-to-t from-[#E8BFCA] to-[#FDF0F3] border-t border-[#E8BFCA]',
      glow: 'radial-gradient(ellipse at 50% 100%, rgba(244,114,182,0.18) 0%, transparent 70%)',
      curtainAccent: '#F472B6',
      stageShadow: '0 25px 50px -15px rgba(244, 114, 182, 0.15)',
    },
    light: {
      backdrop: 'bg-gradient-to-b from-[#FAF8F5] via-[#F3EFE9] to-[#E9E4DC]',
      border: 'border-[#E7E3DF]',
      floor: 'bg-gradient-to-t from-[#DFD9D0] to-[#FAF8F5] border-t border-[#D5CEC4]',
      glow: 'radial-gradient(ellipse at 50% 100%, rgba(198,154,85,0.12) 0%, transparent 70%)',
      curtainAccent: '#7567C7',
      stageShadow: '0 25px 50px -15px rgba(0, 0, 0, 0.08)',
    },
  }[theme] || {
    backdrop: 'bg-gradient-to-b from-[#FAF8F5] via-[#F3EFE9] to-[#E9E4DC]',
    border: 'border-[#E7E3DF]',
    floor: 'bg-gradient-to-t from-[#DFD9D0] to-[#FAF8F5] border-t border-[#D5CEC4]',
    glow: 'radial-gradient(ellipse at 50% 100%, rgba(198,154,85,0.12) 0%, transparent 70%)',
    curtainAccent: '#7567C7',
    stageShadow: '0 25px 50px -15px rgba(0, 0, 0, 0.08)',
  };

  // Sort and arrange performers into front row and back row based on instrument type
  const { frontRow, backRow } = useMemo(() => {
    // Categorize instruments
    const backlineTypes: MusicInstrument[] = ['drums', 'bass', 'trumpet', 'saxophone', 'flute', 'cello'];
    const frontlineTypes: MusicInstrument[] = ['piano', 'electric-guitar', 'acoustic-guitar', 'violin'];

    if (activeInstruments.length <= 3) {
      // 1-3 performers all sit on one unified row
      return { frontRow: activeInstruments, backRow: [] };
    }

    const back: MusicInstrument[] = [];
    const front: MusicInstrument[] = [];

    activeInstruments.forEach((inst) => {
      if (inst === 'drums') {
        back.push(inst);
      } else if (backlineTypes.includes(inst) && back.length < Math.ceil(activeInstruments.length / 2)) {
        back.push(inst);
      } else {
        front.push(inst);
      }
    });

    return { frontRow: front, backRow: back };
  }, [activeInstruments]);

  return (
    <div
      className={`relative w-full rounded-3xl overflow-hidden border ${stageStyles.border} ${stageStyles.backdrop} p-4 sm:p-8 flex flex-col justify-between min-h-[360px] sm:min-h-[440px] shadow-2xl transition-colors duration-500 ${className}`}
      style={{ boxShadow: stageStyles.stageShadow }}
    >
      {/* Stage Overhead Stage Truss / Footlight Atmosphere */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: stageStyles.glow }} />

      {/* Top Stage Bar: Ensemble Status */}
      <div className="relative z-10 flex items-center justify-between gap-3 text-xs mb-4">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isPlaying && playingInstruments.size > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#25242A] dark:text-[#F4F2F7]">
            {isPlaying && playingInstruments.size > 0
              ? `Live Performance (${playingInstruments.size} Playing)`
              : 'Performance Stage • Standby'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#77747D] dark:text-[#9E9AA6]">
            Ensemble: {activeInstruments.length} {activeInstruments.length === 1 ? 'Musician' : 'Musicians'}
          </span>
        </div>
      </div>

      {/* Main Stage Floor & Performers Array */}
      <div className="relative z-10 flex-1 flex flex-col justify-end items-center my-auto pb-4 w-full">
        {activeInstruments.length === 0 ? (
          <div className="py-16 text-center text-[#77747D] dark:text-[#9E9AA6] space-y-2">
            <span className="text-3xl">🎭</span>
            <p className="text-sm font-semibold">Stage is empty</p>
            <p className="text-xs">Provide a song above to detect instruments and assemble your band.</p>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-4 sm:gap-6">
            {/* Back Row (Drums, Bass, Horns) if > 3 instruments */}
            {backRow.length > 0 && (
              <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-8 w-full transform sm:scale-95 origin-bottom opacity-95">
                {backRow.map((inst) => {
                  const isInstPlaying = isPlaying && playingInstruments.has(inst);
                  return (
                    <PerformerFigure
                      key={`back-${inst}`}
                      instrument={inst}
                      isPlaying={isInstPlaying}
                      theme={theme}
                      size="normal"
                    />
                  );
                })}
              </div>
            )}

            {/* Front Row (Pianist, Lead Guitarists, Violinist) */}
            <div className="flex flex-wrap items-end justify-center gap-3 sm:gap-6 w-full">
              {frontRow.map((inst) => {
                const isInstPlaying = isPlaying && playingInstruments.has(inst);
                return (
                  <PerformerFigure
                    key={`front-${inst}`}
                    instrument={inst}
                    isPlaying={isInstPlaying}
                    theme={theme}
                    size="normal"
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Stage Wooden Platform Deck Floor */}
      <div className={`relative z-10 w-full h-8 sm:h-12 rounded-2xl ${stageStyles.floor} flex items-center justify-between px-4 sm:px-6 shadow-md`}>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {activeInstruments.map((inst) => {
            const def = getInstrumentDefinition(inst);
            const isInstPlaying = isPlaying && playingInstruments.has(inst);
            return (
              <span
                key={`deck-${inst}`}
                className={`text-xs sm:text-sm transition-transform duration-200 ${
                  isInstPlaying ? 'scale-125' : 'opacity-40'
                }`}
                title={`${def.performerTitle} (${def.name})`}
              >
                {def.icon}
              </span>
            );
          })}
        </div>

        <span className="font-mono text-[10px] uppercase tracking-widest text-[#77747D] dark:text-[#9E9AA6]">
          AniVerse Concert Stage
        </span>
      </div>
    </div>
  );
};
