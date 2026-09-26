import React, { useRef, useState, useEffect, useCallback } from 'react';
import { TheaterEnvironment, TheaterPerformer } from '../types';
import { AppTheme } from '../../../types/theme';
import { HumanFigure } from './HumanFigure';

interface TheaterStageProps {
  environment: TheaterEnvironment;
  performers: TheaterPerformer[];
  onSelectPerformer?: (id: string | null) => void;
  selectedPerformerId?: string | null;
  onUpdatePerformerPosition?: (id: string, x: number, y: number) => void;
  isEditing?: boolean;
  isPlaying?: boolean;
  theme: AppTheme;
  className?: string;
}

export const TheaterStage: React.FC<TheaterStageProps> = ({
  environment,
  performers,
  onSelectPerformer,
  selectedPerformerId = null,
  onUpdatePerformerPosition,
  isEditing = false,
  isPlaying = false,
  theme,
  className = '',
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  // Deselect on clicking empty stage area
  const handleStageClick = (e: React.MouseEvent) => {
    if (e.target === stageRef.current && onSelectPerformer) {
      onSelectPerformer(null);
    }
  };

  // Pointer drag handling for performers
  const handlePointerDown = (e: React.PointerEvent, performer: TheaterPerformer) => {
    if (!isEditing) return;

    e.stopPropagation();
    if (onSelectPerformer) {
      onSelectPerformer(performer.id);
    }

    setDraggingId(performer.id);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: performer.x,
      initialY: performer.y,
    };

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditing || !draggingId || !dragStartRef.current || !stageRef.current) return;

      const rect = stageRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const deltaX = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100;
      const deltaY = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100;

      let newX = Math.round((dragStartRef.current.initialX + deltaX) * 10) / 10;
      let newY = Math.round((dragStartRef.current.initialY + deltaY) * 10) / 10;

      // Stage boundaries
      newX = Math.max(5, Math.min(95, newX));
      newY = Math.max(25, Math.min(92, newY));

      if (onUpdatePerformerPosition) {
        onUpdatePerformerPosition(draggingId, newX, newY);
      }
    },
    [isEditing, draggingId, onUpdatePerformerPosition]
  );

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
    dragStartRef.current = null;
  }, []);

  // Sorted performers by Y and layerOrder for proper depth rendering
  const sortedPerformers = [...performers].sort((a, b) => {
    if (a.layerOrder !== undefined && b.layerOrder !== undefined && a.layerOrder !== b.layerOrder) {
      return a.layerOrder - b.layerOrder;
    }
    return a.y - b.y;
  });

  return (
    <div
      ref={stageRef}
      onClick={handleStageClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative w-full rounded-3xl overflow-hidden border border-[#E7E3DF] dark:border-[#2E2C37] shadow-2xl transition-all duration-500 select-none min-h-[460px] sm:min-h-[540px] md:min-h-[580px] flex flex-col justify-between ${
        isEditing ? 'cursor-default ring-1 ring-[#7567C7]/30' : ''
      } ${className}`}
    >
      {/* =========================================================================
          THEATER ENVIRONMENT BACKGROUNDS
          ========================================================================= */}
      {/* 1. CONCERT HALL */}
      {environment === 'concert-hall' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Deep Classical Auditorium Backdrop */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0F0C14] via-[#1B1624] to-[#120F18]" />

          {/* Architectural Proscenium Arch & Gold Moldings */}
          <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-[#2B1B17] to-transparent opacity-70" />
          <div className="absolute top-2 inset-x-12 h-1 bg-[#D4AF37] opacity-40 rounded-full" />

          {/* Velvet Theater Curtains (Top & Side Swags) */}
          <div className="absolute top-0 inset-x-0 h-14 bg-gradient-to-b from-[#63141F] via-[#480E17] to-transparent shadow-lg" />
          {/* Gold Fringe on Valance */}
          <div className="absolute top-13 inset-x-0 h-1.5 bg-[#D4AF37] opacity-60" />
          {/* Left Curtain Drape */}
          <div className="absolute top-0 left-0 w-16 sm:w-24 h-full bg-gradient-to-r from-[#500F19] via-[#380911] to-transparent opacity-90 shadow-2xl" />
          {/* Right Curtain Drape */}
          <div className="absolute top-0 right-0 w-16 sm:w-24 h-full bg-gradient-to-l from-[#500F19] via-[#380911] to-transparent opacity-90 shadow-2xl" />

          {/* Overhead Spotlight Cones illuminating stage */}
          <div
            className="absolute inset-0 opacity-25"
            style={{
              background:
                'radial-gradient(circle at 50% 20%, rgba(255, 235, 185, 0.45) 0%, transparent 65%), radial-gradient(circle at 25% 30%, rgba(162, 148, 238, 0.3) 0%, transparent 50%), radial-gradient(circle at 75% 30%, rgba(162, 148, 238, 0.3) 0%, transparent 50%)',
            }}
          />

          {/* Rich Polished Maple Stage Floor with Perspective Planks */}
          <div className="absolute bottom-0 inset-x-0 h-44 sm:h-52 bg-gradient-to-t from-[#26150E] via-[#4A2C1D] to-[#693F2A] border-t-2 border-[#D4AF37]/40 shadow-inner">
            {/* Wooden Floor Planks lines */}
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, #000 0px, #000 2px, transparent 2px, transparent 40px)',
              }}
            />
            {/* Stage Front Footlights Glow */}
            <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-[#D4AF37]/20 to-transparent" />
          </div>
        </div>
      )}

      {/* 2. SMALL THEATER (Intimate Chamber / Club) */}
      {environment === 'small-theater' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Warm Dark Club Backdrop */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#141217] via-[#1F1924] to-[#120F16]" />

          {/* Acoustic Vertical Wood Slats on Rear Wall */}
          <div
            className="absolute inset-x-0 top-0 h-72 opacity-20"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, #4A3324 0px, #4A3324 8px, transparent 8px, transparent 16px)',
            }}
          />

          {/* Warm Stage Lamp Halos */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                'radial-gradient(circle at 50% 35%, rgba(255, 175, 75, 0.5) 0%, transparent 60%), radial-gradient(circle at 80% 25%, rgba(244, 114, 182, 0.25) 0%, transparent 45%)',
            }}
          />

          {/* Cozy Dark Fabric Drapery Framing */}
          <div className="absolute top-0 left-0 w-12 sm:w-16 h-full bg-gradient-to-r from-[#17141E] to-transparent opacity-95" />
          <div className="absolute top-0 right-0 w-12 sm:w-16 h-full bg-gradient-to-l from-[#17141E] to-transparent opacity-95" />

          {/* Polished Dark Walnut Wooden Stage Floor */}
          <div className="absolute bottom-0 inset-x-0 h-44 sm:h-52 bg-gradient-to-t from-[#15100B] via-[#2F1F15] to-[#453022] border-t border-[#7A543A]/50">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, #000 0px, #000 1.5px, transparent 1.5px, transparent 32px)',
              }}
            />
            {/* Vintage Amber Edison Footlight Bar */}
            <div className="absolute bottom-1 inset-x-16 flex justify-around opacity-60">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_#F59E0B]" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. CHURCH (Cathedral Sanctuary / Organ Hall) */}
      {environment === 'church' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Cathedral Stone Nave Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0F1117] via-[#171B26] to-[#0E1017]" />

          {/* Majestic Cathedral Gothic Arches */}
          <div className="absolute top-0 inset-x-0 flex justify-around opacity-25">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-48 sm:w-64 h-64 border-t-4 border-x-4 border-[#8B9BB4] rounded-t-full"
              />
            ))}
          </div>

          {/* Stained-Glass Rose Window Rosette in Center Background */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 w-44 h-44 rounded-full border-4 border-[#A2B5CD]/30 flex items-center justify-center opacity-40 shadow-[0_0_50px_rgba(117,103,199,0.3)]">
            <div
              className="w-36 h-36 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(230, 126, 34, 0.4) 0%, rgba(155, 89, 182, 0.4) 40%, rgba(52, 152, 219, 0.4) 80%, transparent 100%)',
              }}
            />
          </div>

          {/* Towering Pipe Organ Backdrop Silhouette */}
          <div className="absolute top-12 inset-x-16 flex items-end justify-center gap-1 opacity-30">
            {[-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12].map((i) => {
              const h = 120 - Math.abs(i) * 5;
              return (
                <div
                  key={`church-pipe-${i}`}
                  className="w-2.5 sm:w-3.5 bg-gradient-to-t from-[#B0B8C8] via-[#E2E6EF] to-[#8A95A8] rounded-t-sm"
                  style={{ height: `${h}px` }}
                />
              );
            })}
          </div>

          {/* Sacred Altar Sanctuary Timber & Stone Floor */}
          <div className="absolute bottom-0 inset-x-0 h-44 sm:h-52 bg-gradient-to-t from-[#1C1714] via-[#3B2E24] to-[#544133] border-t-2 border-[#A2B5CD]/40 shadow-inner">
            {/* Parquet Sanctuary floor grid */}
            <div
              className="absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, #000 0px, #000 2px, transparent 2px, transparent 28px)',
              }}
            />
            {/* Stone Altar Step Rim */}
            <div className="absolute top-0 inset-x-0 h-3 bg-gradient-to-b from-[#8C9BAE]/40 to-transparent" />
          </div>
        </div>
      )}

      {/* =========================================================================
          TOP STAGE STATUS BAR (THEATER INFO)
          ========================================================================= */}
      <div className="relative z-20 flex items-center justify-between gap-3 text-xs p-4 sm:p-6 pb-0 pointer-events-none">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-white drop-shadow-md">
            {isPlaying
              ? 'Concert Performance • Live'
              : isEditing
              ? 'Theater Editor • Arrange Stage'
              : 'Theater Stage • Ready'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 text-[11px] font-semibold">
            {environment === 'concert-hall'
              ? '🏛️ Concert Hall'
              : environment === 'small-theater'
              ? '🎭 Small Theater'
              : '⛪ Church Cathedral'}
          </span>

          <span className="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white/90 text-[11px] font-semibold">
            {performers.length} {performers.length === 1 ? 'Performer' : 'Performers'}
          </span>
        </div>
      </div>

      {/* =========================================================================
          THEATER STAGE CANVAS: PERFORMERS POSITIONED VIA NORMALIZED COORDINATES
          ========================================================================= */}
      <div className="relative z-10 flex-1 w-full h-full min-h-[380px] sm:min-h-[440px]">
        {performers.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-white/70 space-y-2 pointer-events-none">
            <span className="text-4xl">🎭</span>
            <p className="text-base font-bold text-white drop-shadow-md">The Stage is Empty</p>
            <p className="text-xs text-white/75 max-w-sm">
              {isEditing
                ? 'Click "+ Add Performer" to place musicians on stage.'
                : 'Provide a song above to automatically detect instruments and populate the theater.'}
            </p>
          </div>
        ) : (
          sortedPerformers.map((performer) => {
            const isSelected = isEditing && selectedPerformerId === performer.id;
            const isPerformerPlaying =
              isPlaying && (performer.playMode === 'always' || performer.isPlaying);

            return (
              <div
                key={performer.id}
                onPointerDown={(e) => handlePointerDown(e, performer)}
                className={`absolute transition-shadow ${
                  isEditing ? 'cursor-grab active:cursor-grabbing hover:z-50' : 'pointer-events-none'
                }`}
                style={{
                  left: `${performer.x}%`,
                  top: `${performer.y}%`,
                  transform: `translate(-50%, -100%) scale(${performer.scale || 1})`,
                  transformOrigin: '50% 100%',
                  zIndex: isSelected ? 999 : performer.layerOrder ?? Math.round(performer.y * 10),
                }}
              >
                <HumanFigure
                  instrument={performer.instrument}
                  gender={performer.gender}
                  isPlaying={isPerformerPlaying}
                  theme={theme}
                  characterName={performer.characterName}
                  isSelected={isSelected}
                  isEditing={isEditing}
                />
              </div>
            );
          })
        )}
      </div>

      {/* =========================================================================
          FRONT STAGE LIP / CURTAIN CALL APRON
          ========================================================================= */}
      <div className="relative z-20 w-full h-8 sm:h-10 bg-gradient-to-t from-black/80 to-transparent border-t border-white/10 flex items-center justify-between px-4 sm:px-6 pointer-events-none">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/50">
          AniVerse Virtual Music Theater
        </span>
        <span className="text-[10px] text-white/40 font-mono">
          {isEditing ? 'Drag performers to position • Select to inspect' : 'Interactive Soundstage'}
        </span>
      </div>
    </div>
  );
};
