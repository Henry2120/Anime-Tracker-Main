import React from 'react';
import { MusicInstrument } from '../types';
import { AppTheme } from '../../../types/theme';
import { getInstrumentDefinition } from '../instruments/registry';

export interface MusicianFigureConfig {
  instrumentId: MusicInstrument;
  performerStyle: string;
  pose: 'seated' | 'standing' | 'station';
  animation: string;
  scale: number;
  anchorPosition?: string;
}

export interface MusicianFigureProps {
  instrumentId: MusicInstrument;
  isPlaying: boolean;
  intensity?: number; // 0.0 to 1.0 (defaults to 0.8)
  size?: 'small' | 'medium' | 'large';
  theme: AppTheme;
  characterName?: string;
  className?: string;
  showPedestal?: boolean;
}

/**
 * Reusable Miniature Musician Figurine Component
 * Renders stylized, collectible diorama music-box figurines
 * with dynamic playing postures, instrument silhouettes, and responsive animations.
 */
export const MusicianFigure: React.FC<MusicianFigureProps> = ({
  instrumentId,
  isPlaying,
  intensity = 0.8,
  size = 'medium',
  theme,
  characterName,
  className = '',
  showPedestal = true,
}) => {
  const def = getInstrumentDefinition(instrumentId);

  // Palette attuned to the AniVerse design system (Light / Sumi Dark / Sakura)
  const palette = {
    dark: {
      skin: '#F5D0C5',
      skinShadow: '#DEB5A9',
      hair: '#31283B',
      clothingPrimary: '#201C2B',
      clothingAccent: '#7567C7',
      clothingLapel: '#3B3354',
      instrumentWood: '#8D4925',
      instrumentDarkWood: '#4A2311',
      instrumentGold: '#E5C158',
      instrumentSilver: '#D1D5DB',
      instrumentKey: '#FFFFFF',
      instrumentBlackKey: '#111827',
      pedestalBase: '#161420',
      pedestalTop: '#242032',
      pedestalBorder: '#3E3754',
      pedestalGlow: 'rgba(117,103,199,0.3)',
      textMain: '#F4F2F7',
      textMuted: '#9E9AA6',
      badgeActive: 'bg-[#7567C7]/25 text-[#D8D2FF] border-[#7567C7]/40',
      badgeIdle: 'bg-white/5 text-white/40 border-white/10',
    },
    sakura: {
      skin: '#FDE2DB',
      skinShadow: '#F0C6BE',
      hair: '#4A2835',
      clothingPrimary: '#3A1C2B',
      clothingAccent: '#F472B6',
      clothingLapel: '#5C2D44',
      instrumentWood: '#A25838',
      instrumentDarkWood: '#5A2A19',
      instrumentGold: '#E6BC50',
      instrumentSilver: '#F3E8EE',
      instrumentKey: '#FFFDFD',
      instrumentBlackKey: '#2D1622',
      pedestalBase: '#FCE7ED',
      pedestalTop: '#FFF5F8',
      pedestalBorder: '#F2C1CE',
      pedestalGlow: 'rgba(244,114,182,0.3)',
      textMain: '#3B1828',
      textMuted: '#8C5D72',
      badgeActive: 'bg-[#F472B6]/25 text-[#9C2356] dark:text-[#FCE7F3] border-[#F472B6]/40',
      badgeIdle: 'bg-black/5 dark:bg-white/5 text-[#77747D] border-transparent',
    },
    light: {
      skin: '#FCD5CE',
      skinShadow: '#EBBAB1',
      hair: '#2D3142',
      clothingPrimary: '#3F3D4E',
      clothingAccent: '#7567C7',
      clothingLapel: '#56536C',
      instrumentWood: '#9E5B2B',
      instrumentDarkWood: '#562C13',
      instrumentGold: '#D8AE3C',
      instrumentSilver: '#CBD5E1',
      instrumentKey: '#FFFFFF',
      instrumentBlackKey: '#1E293B',
      pedestalBase: '#E5DFC8',
      pedestalTop: '#FAF8F5',
      pedestalBorder: '#D8CEBE',
      pedestalGlow: 'rgba(198,154,85,0.22)',
      textMain: '#25242A',
      textMuted: '#77747D',
      badgeActive: 'bg-[#F0EDFA] text-[#7567C7] border-[#7567C7]/30',
      badgeIdle: 'bg-[#F7F5F2] text-[#77747D] border-[#E7E3DF]',
    },
  }[theme] || {
    skin: '#FCD5CE',
    skinShadow: '#EBBAB1',
    hair: '#2D3142',
    clothingPrimary: '#3F3D4E',
    clothingAccent: '#7567C7',
    clothingLapel: '#56536C',
    instrumentWood: '#9E5B2B',
    instrumentDarkWood: '#562C13',
    instrumentGold: '#D8AE3C',
    instrumentSilver: '#CBD5E1',
    instrumentKey: '#FFFFFF',
    instrumentBlackKey: '#1E293B',
    pedestalBase: '#E5DFC8',
    pedestalTop: '#FAF8F5',
    pedestalBorder: '#D8CEBE',
    pedestalGlow: 'rgba(198,154,85,0.22)',
    textMain: '#25242A',
    textMuted: '#77747D',
    badgeActive: 'bg-[#F0EDFA] text-[#7567C7] border-[#7567C7]/30',
    badgeIdle: 'bg-[#F7F5F2] text-[#77747D] border-[#E7E3DF]',
  };

  // Dimensions based on instrument presence and scale
  const isLargeInstrument =
    instrumentId === 'piano' ||
    instrumentId === 'drums' ||
    instrumentId === 'electronic-drums' ||
    instrumentId === 'church-organ' ||
    instrumentId === 'pipe-organ' ||
    instrumentId === 'harp' ||
    instrumentId === 'choir';

  const sizeClasses = {
    small: isLargeInstrument ? 'w-44 h-48' : 'w-32 h-44',
    medium: isLargeInstrument ? 'w-52 sm:w-56 h-56 sm:h-60' : 'w-36 sm:w-40 h-52 sm:h-56',
    large: isLargeInstrument ? 'w-60 sm:w-68 h-64 sm:h-72' : 'w-44 sm:w-48 h-60 sm:h-64',
  }[size];

  // Dynamic animation rate based on playing intensity
  const animStyle = isPlaying
    ? {
        animationDuration: `${Math.max(0.4, 1.2 - intensity * 0.6)}s`,
      }
    : undefined;

  /**
   * Renders the miniature figurine illustration
   * Detailed SVG artwork depicting the musician and the physical instrument
   */
  const renderFigurineArtwork = () => {
    switch (instrumentId) {
      // ----------------------------------------------------
      // 1. PIANO / PIANIST
      // ----------------------------------------------------
      case 'piano':
        return (
          <svg viewBox="0 0 160 140" className="w-full h-full overflow-visible">
            {/* Piano Bench */}
            <rect x="36" y="94" width="34" height="6" rx="2" fill="#2C1A14" />
            <line x1="40" y1="100" x2="38" y2="128" stroke="#1F120E" strokeWidth="3.5" />
            <line x1="66" y1="100" x2="68" y2="128" stroke="#1F120E" strokeWidth="3.5" />

            {/* Grand Piano Body (Side Profile) */}
            <path
              d="M72 60 L146 60 Q156 75 152 98 L80 98 Z"
              fill={theme === 'dark' ? '#120F1A' : '#1A1822'}
              stroke={palette.instrumentGold}
              strokeWidth="1.5"
            />
            {/* Propped Lid */}
            <path d="M76 58 L142 26" stroke={palette.instrumentGold} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="126" y1="34" x2="130" y2="59" stroke="#C59B3F" strokeWidth="2" />

            {/* Keyboard & Music Stand */}
            <rect x="72" y="74" width="22" height="14" fill="#FFFFFF" stroke="#333" strokeWidth="1" />
            <line x1="77" y1="74" x2="77" y2="86" stroke="#111" strokeWidth="2" />
            <line x1="83" y1="74" x2="83" y2="86" stroke="#111" strokeWidth="2" />
            <line x1="89" y1="74" x2="89" y2="86" stroke="#111" strokeWidth="2" />
            {/* Sheet Music */}
            <rect x="85" y="52" width="12" height="16" fill="#F8FAFC" rx="1" transform="rotate(10 85 52)" />

            {/* Piano Legs */}
            <line x1="84" y1="98" x2="84" y2="128" stroke="#1A1822" strokeWidth="4.5" />
            <line x1="146" y1="98" x2="146" y2="128" stroke="#1A1822" strokeWidth="4.5" />

            {/* Pianist Figurine */}
            <g
              className={isPlaying ? 'animate-bounce-subtle' : 'animate-idle-breathe'}
              style={{ transformOrigin: '53px 100px', ...animStyle }}
            >
              {/* Seated Legs */}
              <path d="M46 95 L65 95 L68 126" fill="none" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />

              {/* Tuxedo / Concert Attire Torso */}
              <path d="M44 68 Q54 62 66 70 L63 96 L42 96 Z" fill={palette.clothingPrimary} />
              <path d="M52 68 L56 82 L60 68 Z" fill={palette.clothingAccent} />
              {/* Bowtie */}
              <circle cx="56" cy="67" r="2.5" fill={palette.instrumentGold} />

              {/* Head with styled hair */}
              <circle cx="56" cy="46" r="12" fill={palette.skin} />
              <path d="M44 46 Q48 34 64 36 Q71 40 68 50 Q63 43 52 45 Z" fill={palette.hair} />
              {/* Focused eye glancing down */}
              <ellipse cx="61" cy="47" rx="1.8" ry="1.2" fill="#222" />

              {/* Expressive Hands on Keys */}
              <g className={isPlaying ? 'animate-piano-hands' : ''} style={{ transformOrigin: '60px 72px' }}>
                <path d="M58 72 L72 77 L82 80" fill="none" stroke={palette.clothingPrimary} strokeWidth="4.5" strokeLinecap="round" />
                <circle cx="83" cy="80" r="3.2" fill={palette.skin} />
                <path d="M54 74 L68 80 L76 83" fill="none" stroke={palette.clothingPrimary} strokeWidth="4" strokeLinecap="round" opacity="0.9" />
                <circle cx="77" cy="83" r="2.8" fill={palette.skin} />
              </g>
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // 2. VIOLIN / VIOLINIST (also Viola)
      // ----------------------------------------------------
      case 'violin':
      case 'viola':
        const isViola = instrumentId === 'viola';
        const bodyScale = isViola ? 1.15 : 1.0;
        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            <g
              className={isPlaying ? 'animate-violin-sway' : 'animate-idle-breathe'}
              style={{ transformOrigin: '65px 125px', ...animStyle }}
            >
              {/* Musician Legs & Stand */}
              <line x1="56" y1="95" x2="52" y2="128" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />
              <line x1="74" y1="95" x2="78" y2="128" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />

              {/* Elegant Concert Dress/Suit */}
              <path d="M52 62 L78 62 L82 100 L48 100 Z" fill={palette.clothingPrimary} />
              <line x1="65" y1="62" x2="65" y2="98" stroke={palette.clothingAccent} strokeWidth="3" />

              {/* Head resting on Chinrest */}
              <circle cx="65" cy="40" r="12" fill={palette.skin} />
              <path d="M52 40 Q62 26 78 30 Q78 44 72 50 Z" fill={palette.hair} />
              <ellipse cx="69" cy="41" rx="1.5" ry="1.2" fill="#222" />

              {/* Violin Silhouette propped under chin */}
              <g transform={`rotate(-16 65 52) scale(${bodyScale})`}>
                <rect x="36" y="50" width="28" height="4" fill="#3D1D11" />
                {/* Body */}
                <path
                  d="M62 46 Q58 40 70 42 Q82 40 78 46 Q80 53 74 61 Q66 65 62 61 Q58 53 62 46 Z"
                  fill={palette.instrumentWood}
                  stroke={palette.instrumentDarkWood}
                  strokeWidth="1.5"
                />
                {/* F-Holes */}
                <circle cx="68" cy="51" r="1.5" fill="#2D1107" />
                <circle cx="72" cy="55" r="1.5" fill="#2D1107" />
              </g>

              {/* Left Hand Gripping Neck */}
              <line x1="56" y1="64" x2="44" y2="52" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="43" cy="51" r="3.2" fill={palette.skin} />

              {/* Right Arm & Bow Performing Across Strings */}
              <g
                className={isPlaying ? 'animate-violin-bowing' : ''}
                style={{ transformOrigin: '80px 65px' }}
              >
                <line x1="76" y1="64" x2="92" y2="58" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
                <circle cx="93" cy="58" r="3.2" fill={palette.skin} />
                {/* Horsehair Bow */}
                <line x1="50" y1="46" x2="108" y2="65" stroke={palette.instrumentGold} strokeWidth="2.2" strokeLinecap="round" />
              </g>
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // 3. CELLO / CELLIST (also Double Bass)
      // ----------------------------------------------------
      case 'cello':
      case 'double-bass':
        const isUpright = instrumentId === 'double-bass';
        return (
          <svg viewBox="0 0 140 140" className="w-full h-full overflow-visible">
            {/* Endpin to ground */}
            <line x1="70" y1="108" x2="70" y2="135" stroke="#777" strokeWidth="3" />

            {/* Instrument Body */}
            <g transform={isUpright ? 'scale(1.2) translate(-10, -8)' : 'rotate(-5 70 85)'}>
              <path
                d="M52 74 Q46 60 70 62 Q94 60 88 74 Q92 88 82 106 Q70 114 58 106 Q48 88 52 74 Z"
                fill={palette.instrumentWood}
                stroke={palette.instrumentDarkWood}
                strokeWidth="2"
              />
              <rect x="68" y="38" width="5" height="36" fill="#2A1409" />
              {/* F-holes */}
              <path d="M60 82 Q58 88 62 94" stroke="#1F0D05" strokeWidth="2" fill="none" />
              <path d="M80 82 Q82 88 78 94" stroke="#1F0D05" strokeWidth="2" fill="none" />
            </g>

            {/* Musician Seated (or Standing for Double Bass) */}
            <g
              className={isPlaying ? 'animate-bounce-subtle' : 'animate-idle-breathe'}
              style={{ transformOrigin: '70px 100px', ...animStyle }}
            >
              <circle cx="70" cy="38" r="12" fill={palette.skin} />
              <path d="M58 38 Q65 24 82 28 Q84 42 78 48 Z" fill={palette.hair} />
              <path d="M54 52 L86 52 L82 86 L56 86 Z" fill={palette.clothingPrimary} />

              {/* Left Hand on Fingerboard */}
              <line x1="56" y1="58" x2="68" y2="50" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="68" cy="49" r="3.2" fill={palette.skin} />

              {/* Right Arm & Bow moving across the strings */}
              <g className={isPlaying ? 'animate-cello-bowing' : ''}>
                <line x1="82" y1="62" x2="96" y2="78" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
                <line x1="48" y1="88" x2="108" y2="76" stroke={palette.instrumentGold} strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // 4. GUITAR (Acoustic / Classical / Electric / Bass)
      // ----------------------------------------------------
      case 'acoustic-guitar':
      case 'classical-guitar':
      case 'electric-guitar':
      case 'bass':
      case 'mandolin':
        const isClassical = instrumentId === 'classical-guitar';
        const isAcousticGtr = instrumentId === 'acoustic-guitar';
        const isMandolin = instrumentId === 'mandolin';
        const isElectric = instrumentId === 'electric-guitar';

        const gtrColor = isClassical
          ? '#C97D45'
          : isAcousticGtr
          ? palette.instrumentWood
          : isMandolin
          ? '#9E5B2B'
          : isElectric
          ? palette.clothingAccent
          : palette.clothingPrimary;

        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            <g
              className={isPlaying ? 'animate-guitar-rock' : 'animate-idle-breathe'}
              style={{ transformOrigin: '65px 125px', ...animStyle }}
            >
              {/* Legs */}
              <line x1="54" y1="98" x2="48" y2="130" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />
              <line x1="76" y1="98" x2="82" y2="130" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />

              {/* Torso */}
              <path d="M52 58 L78 58 L74 100 L56 100 Z" fill={palette.clothingPrimary} />
              <line x1="65" y1="58" x2="65" y2="95" stroke={palette.clothingAccent} strokeWidth="3" />

              {/* Head */}
              <circle cx="65" cy="42" r="12" fill={palette.skin} />
              <path d="M52 42 Q60 26 78 30 Q82 42 78 52 Q68 45 52 42 Z" fill={palette.hair} />
              <ellipse cx="69" cy="43" rx="1.5" ry="1.8" fill="#222" />

              {/* Guitar Slung Diagonally */}
              <g transform="rotate(-26 65 78)">
                <rect x="62" y="10" width="6.5" height="55" fill="#E2C08A" stroke="#5D4037" strokeWidth="1" />
                <path d="M59 8 L71 8 L68 18 L62 18 Z" fill="#3E2723" />

                {/* Soundboard Silhouette */}
                <path
                  d="M48 65 Q45 50 65 52 Q85 50 82 65 Q85 75 75 88 Q65 95 55 88 Q45 75 48 65 Z"
                  fill={gtrColor}
                  stroke={palette.instrumentGold}
                  strokeWidth="1.8"
                />
                {isClassical || isAcousticGtr || isMandolin ? (
                  <circle cx="65" cy="68" r="7" fill="#2D1B17" stroke="#A88120" strokeWidth="1.2" />
                ) : (
                  <>
                    <rect x="58" y="62" width="14" height="4" rx="1" fill="#111" />
                    <rect x="58" y="70" width="14" height="4" rx="1" fill="#111" />
                  </>
                )}
                <line x1="65" y1="10" x2="65" y2="85" stroke="#FFF" strokeWidth="1" opacity="0.8" />
              </g>

              {/* Fretting Hand */}
              <g className={isPlaying ? 'animate-fretting-hand' : ''}>
                <line x1="54" y1="62" x2="42" y2="52" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
                <circle cx="41" cy="51" r="3.5" fill={palette.skin} />
              </g>

              {/* Strumming Hand */}
              <g
                className={isPlaying ? 'animate-strumming-arm' : ''}
                style={{ transformOrigin: '76px 65px' }}
              >
                <line x1="76" y1="65" x2="82" y2="78" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
                <circle cx="82" cy="79" r="3.5" fill={palette.skin} />
              </g>
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // 5. DRUMS (Acoustic Kit / Electronic Drums / Timpani)
      // ----------------------------------------------------
      case 'drums':
      case 'electronic-drums':
      case 'timpani':
      case 'percussion':
      case 'electronic-drum-pad':
        const isTimpani = instrumentId === 'timpani';
        return (
          <svg viewBox="0 0 160 140" className="w-full h-full overflow-visible">
            {/* Stands */}
            <line x1="28" y1="75" x2="24" y2="126" stroke="#777" strokeWidth="2.5" />
            <line x1="132" y1="65" x2="136" y2="126" stroke="#777" strokeWidth="2.5" />
            <line x1="80" y1="100" x2="80" y2="126" stroke="#777" strokeWidth="3.5" />

            {/* Kick Drum / Kettle Drum */}
            <circle cx="80" cy="95" r="26" fill={palette.clothingPrimary} stroke={palette.instrumentGold} strokeWidth="2.5" />
            <circle cx="80" cy="95" r="21" fill={theme === 'dark' ? '#14111E' : '#ECE8F2'} />

            {/* Snare & Toms */}
            <ellipse cx="46" cy="80" rx="14" ry="6" fill="#F4F4F6" stroke="#333" strokeWidth="2" />
            <ellipse cx="114" cy="78" rx="13" ry="5.5" fill="#F4F4F6" stroke="#333" strokeWidth="2" />

            {/* Cymbals */}
            <ellipse
              cx="28"
              cy="65"
              rx="18"
              ry="5"
              fill={palette.instrumentGold}
              stroke="#B38600"
              strokeWidth="1.5"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />
            <ellipse
              cx="132"
              cy="55"
              rx="20"
              ry="5.5"
              fill={palette.instrumentGold}
              stroke="#B38600"
              strokeWidth="1.5"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />

            {/* Drummer Figurine */}
            <g
              className={isPlaying ? 'animate-drummer-strike' : 'animate-idle-breathe'}
              style={{ transformOrigin: '80px 70px', ...animStyle }}
            >
              <path d="M70 54 L90 54 L88 78 L72 78 Z" fill={palette.clothingPrimary} />
              <circle cx="80" cy="40" r="12" fill={palette.skin} />
              <path d="M68 38 Q75 26 92 33 Q90 46 80 46 Z" fill={palette.hair} />

              {/* Striking Arms with Sticks */}
              <g className={isPlaying ? 'animate-drumstick-left' : ''}>
                <line x1="72" y1="58" x2="54" y2="70" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
                <line x1="54" y1="70" x2="44" y2="78" stroke={palette.instrumentGold} strokeWidth="2.5" strokeLinecap="round" />
              </g>
              <g className={isPlaying ? 'animate-drumstick-right' : ''}>
                <line x1="88" y1="58" x2="110" y2="65" stroke={palette.skin} strokeWidth="4.5" strokeLinecap="round" />
                <line x1="110" y1="65" x2="124" y2="58" stroke={palette.instrumentGold} strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // 6. VOCALIST / SINGER (also Choir / Vocals FX)
      // ----------------------------------------------------
      case 'vocalist':
      case 'vocals-effects':
      case 'choir':
        const isChoir = instrumentId === 'choir';
        if (isChoir) {
          // Three compact vocalists singing together as choral group
          return (
            <svg viewBox="0 0 160 140" className="w-full h-full overflow-visible">
              <g className={isPlaying ? 'animate-vocalist-sing' : 'animate-idle-breathe'} style={animStyle}>
                {/* Center Lead */}
                <circle cx="80" cy="38" r="10" fill={palette.skin} />
                <path d="M70 38 Q78 26 90 30 Q88 44 80 44 Z" fill={palette.hair} />
                <path d="M70 50 L90 50 L92 110 L68 110 Z" fill={palette.clothingPrimary} />
                {/* Left Choir Member */}
                <circle cx="52" cy="46" r="9" fill={palette.skin} />
                <path d="M44 46 Q50 34 60 38 Q58 50 52 50 Z" fill={palette.hair} />
                <path d="M44 56 L60 56 L62 110 L42 110 Z" fill={palette.clothingPrimary} opacity="0.9" />
                {/* Right Choir Member */}
                <circle cx="108" cy="46" r="9" fill={palette.skin} />
                <path d="M100 46 Q106 34 116 38 Q114 50 108 50 Z" fill={palette.hair} />
                <path d="M100 56 L116 56 L118 110 L98 110 Z" fill={palette.clothingPrimary} opacity="0.9" />
                {/* Choral folders */}
                <rect x="74" y="66" width="12" height="16" fill="#1E1B24" rx="1" />
              </g>
            </svg>
          );
        }

        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            {/* Vintage Chrome Microphone on Stand */}
            <line x1="68" y1="46" x2="68" y2="128" stroke="#888" strokeWidth="2.5" />
            <circle cx="68" cy="128" r="10" fill="#333" />
            <ellipse cx="68" cy="42" rx="4.5" ry="6" fill="#CBD5E1" stroke="#475569" strokeWidth="1.5" />

            {/* Vocalist with expressive singing posture */}
            <g
              className={isPlaying ? 'animate-vocalist-sing' : 'animate-idle-breathe'}
              style={{ transformOrigin: '56px 120px', ...animStyle }}
            >
              {/* Legs */}
              <line x1="50" y1="95" x2="46" y2="128" stroke={palette.clothingPrimary} strokeWidth="6.5" strokeLinecap="round" />
              <line x1="64" y1="95" x2="68" y2="128" stroke={palette.clothingPrimary} strokeWidth="6.5" strokeLinecap="round" />

              {/* Outfit */}
              <path d="M46 62 L68 62 L70 98 L44 98 Z" fill={palette.clothingPrimary} />
              <circle cx="57" cy="72" r="3" fill={palette.clothingAccent} />

              {/* Head with open mouth singing */}
              <circle cx="56" cy="40" r="12" fill={palette.skin} />
              <path d="M44 40 Q52 24 70 28 Q68 44 62 48 Z" fill={palette.hair} />
              <ellipse cx="60" cy="40" rx="1.5" ry="1.2" fill="#222" />
              {isPlaying ? (
                <ellipse cx="64" cy="44" rx="2.5" ry="3" fill="#B91C1C" />
              ) : (
                <line x1="62" y1="44" x2="65" y2="44" stroke="#222" strokeWidth="1.5" strokeLinecap="round" />
              )}

              {/* Expressive hand holding mic or gesturing */}
              <g className={isPlaying ? 'animate-vocalist-arm' : ''} style={{ transformOrigin: '64px 64px' }}>
                <line x1="64" y1="64" x2="67" y2="46" stroke={palette.skin} strokeWidth="4" strokeLinecap="round" />
                <circle cx="67" cy="45" r="3.2" fill={palette.skin} />
              </g>
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // 7. CHURCH ORGAN / PIPE ORGAN (also Accordion)
      // ----------------------------------------------------
      case 'church-organ':
      case 'pipe-organ':
      case 'accordion':
        if (instrumentId === 'accordion') {
          return (
            <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
              <g className={isPlaying ? 'animate-bounce-subtle' : 'animate-idle-breathe'} style={animStyle}>
                <line x1="55" y1="95" x2="52" y2="128" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />
                <line x1="75" y1="95" x2="78" y2="128" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />
                <circle cx="65" cy="40" r="12" fill={palette.skin} />
                <path d="M53 40 Q62 26 78 30 Q78 44 72 50 Z" fill={palette.hair} />
                {/* Accordion Bellows */}
                <rect x="44" y="60" width="42" height="30" rx="2" fill="#991B1B" stroke="#450A0A" strokeWidth="1.5" />
                <line x1="52" y1="60" x2="52" y2="90" stroke="#FFF" strokeWidth="2" />
                <line x1="60" y1="60" x2="60" y2="90" stroke="#FFF" strokeWidth="2" />
                <line x1="68" y1="60" x2="68" y2="90" stroke="#FFF" strokeWidth="2" />
                <line x1="76" y1="60" x2="76" y2="90" stroke="#FFF" strokeWidth="2" />
              </g>
            </svg>
          );
        }

        return (
          <svg viewBox="0 0 160 140" className="w-full h-full overflow-visible">
            {/* Grand Cathedral Organ Pipes in Background */}
            <g opacity="0.85">
              <rect x="25" y="10" width="8" height="80" rx="2" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1" />
              <rect x="37" y="20" width="8" height="70" rx="2" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1" />
              <rect x="49" y="30" width="8" height="60" rx="2" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1" />
              <rect x="105" y="30" width="8" height="60" rx="2" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1" />
              <rect x="117" y="20" width="8" height="70" rx="2" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1" />
              <rect x="129" y="10" width="8" height="80" rx="2" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1" />
            </g>

            {/* Multi-manual Organ Console */}
            <rect x="60" y="65" width="42" height="34" rx="2" fill="#2E1B14" stroke="#452316" strokeWidth="2" />
            <line x1="62" y1="72" x2="100" y2="72" stroke="#FFF" strokeWidth="2.5" />
            <line x1="62" y1="79" x2="100" y2="79" stroke="#FFF" strokeWidth="2.5" />
            <line x1="62" y1="86" x2="100" y2="86" stroke="#FFF" strokeWidth="2.5" />

            {/* Organist Figurine */}
            <g
              className={isPlaying ? 'animate-organ-hands' : 'animate-idle-breathe'}
              style={{ transformOrigin: '80px 100px', ...animStyle }}
            >
              <circle cx="80" cy="42" r="11" fill={palette.skin} />
              <path d="M70 42 Q76 28 92 32 Q90 46 82 48 Z" fill={palette.hair} />
              <path d="M70 54 L90 54 L88 95 L72 95 Z" fill={palette.clothingPrimary} />
              {/* Hands working across manuals */}
              <line x1="72" y1="64" x2="68" y2="76" stroke={palette.skin} strokeWidth="4" strokeLinecap="round" />
              <line x1="88" y1="64" x2="94" y2="78" stroke={palette.skin} strokeWidth="4" strokeLinecap="round" />
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // 8. SYNTHESIZER / KEYBOARD / ELECTRONIC PRODUCER
      // ----------------------------------------------------
      case 'synthesizer':
      case 'keyboard-workstation':
      case 'dj-turntable':
      case 'sampler':
      case 'drum-machine':
      case 'midi-controller':
      case 'sequencer':
      case 'electronic-producer':
        const isDJ = instrumentId === 'dj-turntable';
        return (
          <svg viewBox="0 0 150 140" className="w-full h-full overflow-visible">
            {/* Stand / DJ Table */}
            <rect x="30" y="75" width="90" height="12" rx="2" fill="#1E1C24" stroke={palette.instrumentGold} strokeWidth="1.5" />
            <line x1="40" y1="87" x2="35" y2="128" stroke="#555" strokeWidth="3.5" />
            <line x1="110" y1="87" x2="115" y2="128" stroke="#555" strokeWidth="3.5" />

            {/* Gear on desk */}
            {isDJ ? (
              <>
                {/* Vinyl decks */}
                <circle cx="50" cy="72" r="12" fill="#111" stroke="#333" strokeWidth="2" />
                <circle cx="50" cy="72" r="4" fill="#C62828" className={isPlaying ? 'animate-vinyl-spin' : ''} />
                <circle cx="100" cy="72" r="12" fill="#111" stroke="#333" strokeWidth="2" />
                <circle cx="100" cy="72" r="4" fill="#1565C0" className={isPlaying ? 'animate-vinyl-spin' : ''} />
                {/* Mixer crossfader */}
                <rect x="70" y="68" width="10" height="8" rx="1" fill="#2A2A38" />
              </>
            ) : (
              <>
                {/* Synth keys & LED mod knobs */}
                <rect x="35" y="65" width="80" height="10" rx="1" fill="#FFF" stroke="#222" strokeWidth="1" />
                <line x1="45" y1="65" x2="45" y2="73" stroke="#111" strokeWidth="2" />
                <line x1="60" y1="65" x2="60" y2="73" stroke="#111" strokeWidth="2" />
                <line x1="75" y1="65" x2="75" y2="73" stroke="#111" strokeWidth="2" />
                <line x1="90" y1="65" x2="90" y2="73" stroke="#111" strokeWidth="2" />
                <circle cx="40" cy="62" r="2" fill="#10B981" />
                <circle cx="48" cy="62" r="2" fill="#EF4444" />
                <circle cx="56" cy="62" r="2" fill="#3B82F6" />
              </>
            )}

            {/* Synth Performer Figurine with headphones */}
            <g
              className={isPlaying ? (isDJ ? 'animate-dj-scratch' : 'animate-synth-glides') : 'animate-idle-breathe'}
              style={{ transformOrigin: '75px 100px', ...animStyle }}
            >
              <line x1="65" y1="95" x2="62" y2="128" stroke={palette.clothingPrimary} strokeWidth="6.5" strokeLinecap="round" />
              <line x1="85" y1="95" x2="88" y2="128" stroke={palette.clothingPrimary} strokeWidth="6.5" strokeLinecap="round" />
              <circle cx="75" cy="38" r="12" fill={palette.skin} />
              <path d="M63 38 Q70 24 88 28 Q86 42 78 46 Z" fill={palette.hair} />
              {/* DJ / Studio Headphones */}
              <path d="M62 38 Q75 22 88 38" stroke="#333" strokeWidth="3" fill="none" />
              <ellipse cx="62" cy="38" rx="3" ry="5" fill={palette.clothingAccent} />
              <ellipse cx="88" cy="38" rx="3" ry="5" fill={palette.clothingAccent} />

              <path d="M64 50 L86 50 L84 95 L66 95 Z" fill={palette.clothingPrimary} />
              {/* Hands working faders / keys */}
              <line x1="66" y1="60" x2="54" y2="72" stroke={palette.skin} strokeWidth="4" strokeLinecap="round" />
              <circle cx="53" cy="72" r="3" fill={palette.skin} />
              <line x1="84" y1="60" x2="96" y2="72" stroke={palette.skin} strokeWidth="4" strokeLinecap="round" />
              <circle cx="97" cy="72" r="3" fill={palette.skin} />
            </g>
          </svg>
        );

      // ----------------------------------------------------
      // WINDS & BRASS (Flute, Clarinet, Oboe, Saxophone, Trumpet, Trombone, Horn, Tuba, Harp)
      // ----------------------------------------------------
      case 'flute':
      case 'clarinet':
      case 'oboe':
      case 'bassoon':
      case 'saxophone':
      case 'trumpet':
      case 'trombone':
      case 'french-horn':
      case 'tuba':
      case 'harp':
        const isSax = instrumentId === 'saxophone';
        const isFlute = instrumentId === 'flute';
        const isHarp = instrumentId === 'harp';

        if (isHarp) {
          return (
            <svg viewBox="0 0 140 140" className="w-full h-full overflow-visible">
              {/* Concert Harp Golden Pillar & Strings */}
              <path d="M40 128 L40 25 Q70 20 100 45 L95 128 Z" fill="none" stroke={palette.instrumentGold} strokeWidth="3" />
              <line x1="45" y1="35" x2="90" y2="125" stroke="#E2E8F0" strokeWidth="1" opacity="0.7" />
              <line x1="52" y1="38" x2="85" y2="125" stroke="#E2E8F0" strokeWidth="1" opacity="0.7" />
              <line x1="60" y1="42" x2="80" y2="125" stroke="#E2E8F0" strokeWidth="1" opacity="0.7" />
              {/* Harpist seated plucking strings */}
              <g className={isPlaying ? 'animate-harp-pluck' : 'animate-idle-breathe'} style={animStyle}>
                <circle cx="105" cy="45" r="11" fill={palette.skin} />
                <path d="M95 45 Q102 32 118 36 Q115 50 108 52 Z" fill={palette.hair} />
                <path d="M96 58 L114 58 L110 105 L92 105 Z" fill={palette.clothingPrimary} />
                <line x1="96" y1="68" x2="72" y2="65" stroke={palette.skin} strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="71" cy="65" r="3" fill={palette.skin} />
              </g>
            </svg>
          );
        }

        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            <g
              className={isPlaying ? 'animate-horn-bob' : 'animate-idle-breathe'}
              style={{ transformOrigin: '65px 125px', ...animStyle }}
            >
              <line x1="55" y1="95" x2="52" y2="128" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />
              <line x1="75" y1="95" x2="78" y2="128" stroke={palette.clothingPrimary} strokeWidth="7" strokeLinecap="round" />
              <circle cx="65" cy="40" r="12" fill={palette.skin} />
              <path d="M53 40 Q62 26 78 30 Q78 44 72 50 Z" fill={palette.hair} />
              <path d="M54 58 L76 58 L76 100 L54 100 Z" fill={palette.clothingPrimary} />

              {/* Instrument Silhouette */}
              {isFlute ? (
                <line x1="60" y1="46" x2="115" y2="44" stroke={palette.instrumentSilver} strokeWidth="3.5" strokeLinecap="round" />
              ) : isSax ? (
                <g transform="translate(10, 8)">
                  <path d="M58 52 L58 85 Q58 105 75 105 Q90 105 88 88" stroke={palette.instrumentGold} strokeWidth="6" strokeLinecap="round" fill="none" />
                  <ellipse cx="88" cy="85" rx="7" ry="9" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1.5" />
                </g>
              ) : (
                <g transform="rotate(-12 65 45)">
                  <line x1="65" y1="46" x2="110" y2="46" stroke={palette.instrumentGold} strokeWidth="3.5" />
                  <path d="M108 46 L120 40 L120 52 Z" fill={palette.instrumentGold} stroke="#997A15" strokeWidth="1" />
                </g>
              )}
            </g>
          </svg>
        );

      default:
        return (
          <div className="flex items-center justify-center h-full text-3xl">
            {def.icon}
          </div>
        );
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-end p-2.5 rounded-2xl transition-all duration-300 ${sizeClasses} ${className} group`}
    >
      {/* Diorama Pedestal Glow Effect */}
      {showPedestal && (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4/5 h-10 rounded-full blur-md pointer-events-none transition-opacity duration-300"
          style={{
            background: palette.pedestalGlow,
            opacity: isPlaying ? 0.95 : 0.25,
          }}
        />
      )}

      {/* Musician Status Badge */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
        <span className="text-sm select-none" title={def.name}>
          {def.icon}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all duration-200 ${
            isPlaying ? palette.badgeActive : palette.badgeIdle
          }`}
        >
          {isPlaying ? 'Playing ♪' : 'Idle'}
        </span>
      </div>

      {/* Center Musician Figurine Canvas */}
      <div className="w-full flex-1 flex items-center justify-center relative mt-3 select-none">
        {renderFigurineArtwork()}
      </div>

      {/* Collectible Pedestal Base */}
      {showPedestal && (
        <div
          className="w-full rounded-xl px-2 py-1 text-center shadow-xs border transition-colors duration-300 z-10"
          style={{
            background: palette.pedestalTop,
            borderColor: palette.pedestalBorder,
          }}
        >
          <div
            className={`text-xs font-bold truncate leading-tight ${
              isPlaying ? 'text-[#7567C7] dark:text-[#A294EE]' : ''
            }`}
            style={{ color: isPlaying ? undefined : palette.textMain }}
          >
            {def.performerTitle}
          </div>
          <div
            className="text-[10px] truncate font-medium"
            style={{ color: palette.textMuted }}
          >
            {characterName || def.name}
          </div>
        </div>
      )}
    </div>
  );
};
