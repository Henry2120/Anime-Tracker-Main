import React from 'react';
import { MusicInstrument } from '../types';
import { AppTheme } from '../../../types/theme';
import { getInstrumentDefinition } from '../instruments/registry';

interface PerformerFigureProps {
  instrument: MusicInstrument;
  isPlaying: boolean;
  theme: AppTheme;
  characterName?: string;
  size?: 'normal' | 'large';
  className?: string;
}

export const PerformerFigure: React.FC<PerformerFigureProps> = ({
  instrument,
  isPlaying,
  theme,
  characterName,
  size = 'normal',
  className = '',
}) => {
  const def = getInstrumentDefinition(instrument);

  // Theme-aware color palette
  const colors = {
    dark: {
      skin: '#F5D0C5',
      hair: '#3A3042',
      clothing: '#242038',
      clothingAccent: '#7567C7',
      instrumentPrimary: '#D4AF37',
      instrumentDark: '#1E1B24',
      instrumentHighlight: '#A294EE',
      spotlight: 'rgba(162, 148, 238, 0.25)',
      cardBorder: 'border-[#2E2C37]',
      cardBg: 'bg-[#1C1A24]/90',
      activeText: 'text-[#A294EE]',
      activeBadge: 'bg-[#7567C7]/20 text-[#D8D2FF] border-[#7567C7]/40',
      idleBadge: 'bg-white/5 text-white/40 border-white/10',
    },
    sakura: {
      skin: '#FDE2DB',
      hair: '#4A2835',
      clothing: '#2F1924',
      clothingAccent: '#F472B6',
      instrumentPrimary: '#E07A5F',
      instrumentDark: '#26121C',
      instrumentHighlight: '#F472B6',
      spotlight: 'rgba(244, 114, 182, 0.25)',
      cardBorder: 'border-[#F2D6DC]',
      cardBg: 'bg-[#FFF5F7]/95',
      activeText: 'text-[#E04D86]',
      activeBadge: 'bg-[#F472B6]/20 text-[#9C2356] dark:text-[#FCE7F3] border-[#F472B6]/40',
      idleBadge: 'bg-black/5 dark:bg-white/5 text-[#77747D] border-transparent',
    },
    light: {
      skin: '#FCD5CE',
      hair: '#2D3142',
      clothing: '#F4F2F7',
      clothingAccent: '#7567C7',
      instrumentPrimary: '#C69A55',
      instrumentDark: '#2E2C37',
      instrumentHighlight: '#7567C7',
      spotlight: 'rgba(117, 103, 199, 0.15)',
      cardBorder: 'border-[#E7E3DF]',
      cardBg: 'bg-white/95',
      activeText: 'text-[#7567C7]',
      activeBadge: 'bg-[#F0EDFA] text-[#7567C7] border-[#7567C7]/30',
      idleBadge: 'bg-[#F7F5F2] text-[#77747D] border-[#E7E3DF]',
    },
  }[theme] || {
    skin: '#FCD5CE',
    hair: '#2D3142',
    clothing: '#F4F2F7',
    clothingAccent: '#7567C7',
    instrumentPrimary: '#C69A55',
    instrumentDark: '#2E2C37',
    instrumentHighlight: '#7567C7',
    spotlight: 'rgba(117, 103, 199, 0.15)',
    cardBorder: 'border-[#E7E3DF]',
    cardBg: 'bg-white/95',
    activeText: 'text-[#7567C7]',
    activeBadge: 'bg-[#F0EDFA] text-[#7567C7] border-[#7567C7]/30',
    idleBadge: 'bg-[#F7F5F2] text-[#77747D] border-[#E7E3DF]',
  };

  const isWide = instrument === 'piano' || instrument === 'drums';
  const widthClass = isWide ? 'w-48 sm:w-56' : 'w-36 sm:w-44';
  const heightClass = size === 'large' ? 'h-56 sm:h-64' : 'h-48 sm:h-52';

  // Render instrument-specific SVG artwork and performer posture
  const renderPerformerArt = () => {
    switch (instrument) {
      case 'piano':
        return (
          <svg viewBox="0 0 160 140" className="w-full h-full overflow-visible">
            {/* Piano Bench */}
            <rect x="42" y="90" width="36" height="6" rx="2" fill="#3E2723" />
            <line x1="46" y1="96" x2="44" y2="125" stroke="#2D1B17" strokeWidth="4" />
            <line x1="74" y1="96" x2="76" y2="125" stroke="#2D1B17" strokeWidth="4" />

            {/* Grand Piano Body (Side/Profile view) */}
            <path
              d="M75 55 L145 55 Q155 70 150 95 L85 95 Z"
              fill={colors.instrumentDark}
              stroke={colors.instrumentHighlight}
              strokeWidth="2"
            />
            {/* Piano Lid Propped Up */}
            <path d="M80 53 L140 25" stroke={colors.instrumentHighlight} strokeWidth="3" strokeLinecap="round" />
            <line x1="125" y1="32" x2="128" y2="55" stroke="#C69A55" strokeWidth="2" />

            {/* Piano Keys & Fallboard */}
            <rect x="75" y="70" width="22" height="14" fill="#FFFFFF" stroke="#222" strokeWidth="1" />
            <line x1="80" y1="70" x2="80" y2="82" stroke="#111" strokeWidth="2" />
            <line x1="86" y1="70" x2="86" y2="82" stroke="#111" strokeWidth="2" />
            <line x1="92" y1="70" x2="92" y2="82" stroke="#111" strokeWidth="2" />

            {/* Piano Legs */}
            <line x1="88" y1="95" x2="88" y2="128" stroke={colors.instrumentDark} strokeWidth="5" />
            <line x1="145" y1="95" x2="145" y2="128" stroke={colors.instrumentDark} strokeWidth="5" />

            {/* Pianist: Body, Head & Hands */}
            <g
              className={`transition-transform duration-300 origin-bottom ${
                isPlaying ? 'animate-bounce-subtle' : ''
              }`}
              style={{ transformOrigin: '60px 100px' }}
            >
              {/* Torso & Concert Jacket */}
              <path d="M50 65 Q60 60 70 68 L68 95 L48 95 Z" fill={colors.clothing} />
              <path d="M57 65 L60 80 L63 65 Z" fill={colors.clothingAccent} />

              {/* Head with anime styling */}
              <circle cx="58" cy="45" r="13" fill={colors.skin} />
              <path d="M46 45 Q50 32 65 34 Q73 38 71 49 Q65 42 55 45 Z" fill={colors.hair} />
              {/* Eyes looking down at keyboard */}
              <ellipse cx="64" cy="46" rx="2" ry="1.5" fill="#222" />

              {/* Arms & Hands over Keys */}
              <g
                className={isPlaying ? 'animate-piano-hands' : ''}
                style={{ transformOrigin: '65px 70px' }}
              >
                <path d="M62 70 L75 75 L85 77" fill="none" stroke={colors.clothing} strokeWidth="5" strokeLinecap="round" />
                <circle cx="86" cy="77" r="3.5" fill={colors.skin} />
                {/* Secondary hand */}
                <path d="M58 72 L72 78 L80 80" fill="none" stroke={colors.clothing} strokeWidth="4.5" strokeLinecap="round" opacity="0.9" />
                <circle cx="81" cy="80" r="3" fill={colors.skin} />
              </g>
            </g>
          </svg>
        );

      case 'drums':
        return (
          <svg viewBox="0 0 160 140" className="w-full h-full overflow-visible">
            {/* Drum Hardware Stands */}
            <line x1="30" y1="75" x2="25" y2="125" stroke="#777" strokeWidth="2.5" />
            <line x1="130" y1="65" x2="135" y2="125" stroke="#777" strokeWidth="2.5" />
            <line x1="80" y1="100" x2="80" y2="125" stroke="#777" strokeWidth="4" />

            {/* Bass Drum (Center Kick) */}
            <circle cx="80" cy="95" r="26" fill={colors.instrumentDark} stroke={colors.instrumentHighlight} strokeWidth="3" />
            <circle cx="80" cy="95" r="21" fill={theme === 'dark' ? '#161320' : '#ECE8F2'} />
            <circle cx="80" cy="95" r="8" fill={colors.clothingAccent} opacity="0.6" />

            {/* Snare & Toms */}
            <ellipse cx="48" cy="80" rx="14" ry="6" fill="#F4F4F6" stroke={colors.instrumentDark} strokeWidth="2.5" />
            <ellipse cx="112" cy="78" rx="13" ry="5.5" fill="#F4F4F6" stroke={colors.instrumentDark} strokeWidth="2.5" />

            {/* Hi-Hat & Crash Cymbals */}
            <ellipse
              cx="30"
              cy="65"
              rx="18"
              ry="5"
              fill={colors.instrumentPrimary}
              stroke="#B38600"
              strokeWidth="1.5"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />
            <ellipse
              cx="130"
              cy="55"
              rx="20"
              ry="5.5"
              fill={colors.instrumentPrimary}
              stroke="#B38600"
              strokeWidth="1.5"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />

            {/* Drummer Seated Behind the Kit */}
            <g
              className={`transition-transform duration-200 origin-center ${
                isPlaying ? 'animate-drummer-strike' : ''
              }`}
            >
              {/* Torso */}
              <path d="M70 55 L90 55 L88 78 L72 78 Z" fill={colors.clothing} />
              {/* Head with headband/hair */}
              <circle cx="80" cy="42" r="12" fill={colors.skin} />
              <path d="M68 40 Q75 28 92 35 Q90 48 80 48 Z" fill={colors.hair} />
              {/* Eyes */}
              <circle cx="76" cy="42" r="1.5" fill="#222" />
              <circle cx="84" cy="42" r="1.5" fill="#222" />

              {/* Arms with Drumsticks */}
              {/* Left Drumstick Arm striking snare */}
              <g className={isPlaying ? 'animate-drumstick-left' : ''}>
                <line x1="72" y1="58" x2="55" y2="70" stroke={colors.skin} strokeWidth="4.5" strokeLinecap="round" />
                <line x1="55" y1="70" x2="45" y2="78" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" />
              </g>

              {/* Right Drumstick Arm striking cymbal / tom */}
              <g className={isPlaying ? 'animate-drumstick-right' : ''}>
                <line x1="88" y1="58" x2="110" y2="65" stroke={colors.skin} strokeWidth="4.5" strokeLinecap="round" />
                <line x1="110" y1="65" x2="125" y2="58" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>
          </svg>
        );

      case 'electric-guitar':
      case 'bass':
      case 'acoustic-guitar':
        const isAcoustic = instrument === 'acoustic-guitar';
        const isBass = instrument === 'bass';
        const guitarBodyColor = isAcoustic
          ? '#C68B59'
          : isBass
          ? colors.instrumentDark
          : colors.clothingAccent;

        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            {/* Guitarist Character */}
            <g
              className={`transition-transform duration-300 origin-bottom ${
                isPlaying ? 'animate-guitar-rock' : ''
              }`}
              style={{ transformOrigin: '65px 120px' }}
            >
              {/* Legs */}
              <line x1="55" y1="100" x2="50" y2="132" stroke={colors.clothing} strokeWidth="8" strokeLinecap="round" />
              <line x1="75" y1="100" x2="80" y2="132" stroke={colors.clothing} strokeWidth="8" strokeLinecap="round" />

              {/* Torso */}
              <path d="M52 58 L78 58 L74 100 L56 100 Z" fill={colors.clothing} />
              {/* Jacket open showing shirt */}
              <line x1="65" y1="58" x2="65" y2="95" stroke={colors.clothingAccent} strokeWidth="4" />

              {/* Head & Expression */}
              <circle cx="65" cy="42" r="13" fill={colors.skin} />
              <path d="M52 42 Q60 26 78 30 Q82 42 78 52 Q68 45 52 42 Z" fill={colors.hair} />
              <ellipse cx="69" cy="43" rx="1.5" ry="2" fill="#222" />

              {/* Guitar Body (held diagonally across torso) */}
              <g transform="rotate(-25 65 78)">
                {/* Long Neck & Headstock */}
                <rect x="62" y="10" width="7" height="60" fill="#EAD2AC" stroke="#5D4037" strokeWidth="1" />
                <path d="M60 8 L71 8 L68 18 L63 18 Z" fill="#3E2723" />

                {/* Guitar Soundboard / Cutaway Body */}
                <path
                  d="M48 65 Q45 50 65 52 Q85 50 82 65 Q85 75 75 88 Q65 95 55 88 Q45 75 48 65 Z"
                  fill={guitarBodyColor}
                  stroke={colors.instrumentHighlight}
                  strokeWidth="2"
                />
                {/* Soundhole or Pickups */}
                {isAcoustic ? (
                  <circle cx="65" cy="68" r="7" fill="#2D1B17" stroke="#C69A55" strokeWidth="1.5" />
                ) : (
                  <>
                    <rect x="58" y="62" width="14" height="4" rx="1" fill="#111" />
                    <rect x="58" y="70" width="14" height="4" rx="1" fill="#111" />
                  </>
                )}
                {/* Strings */}
                <line x1="65.5" y1="10" x2="65.5" y2="85" stroke="#FFFFFF" strokeWidth="1" opacity="0.9" />
              </g>

              {/* Left Hand Fretting Neck */}
              <g className={isPlaying ? 'animate-fretting-hand' : ''}>
                <line x1="54" y1="62" x2="42" y2="52" stroke={colors.skin} strokeWidth="5" strokeLinecap="round" />
                <circle cx="41" cy="51" r="4" fill={colors.skin} />
              </g>

              {/* Right Arm Strumming / Plucking */}
              <g
                className={isPlaying ? 'animate-strumming-arm' : ''}
                style={{ transformOrigin: '76px 65px' }}
              >
                <line x1="76" y1="65" x2="82" y2="78" stroke={colors.skin} strokeWidth="5" strokeLinecap="round" />
                <circle cx="82" cy="80" r="4" fill={colors.skin} />
              </g>
            </g>
          </svg>
        );

      case 'violin':
        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            <g
              className={`transition-transform duration-300 origin-bottom ${
                isPlaying ? 'animate-violin-sway' : ''
              }`}
              style={{ transformOrigin: '65px 120px' }}
            >
              {/* Elegant Performer Body */}
              <path d="M54 60 L76 60 L78 125 L52 125 Z" fill={colors.clothing} />

              {/* Head Tilted resting chin on violin */}
              <circle cx="65" cy="40" r="12" fill={colors.skin} />
              <path d="M53 40 Q62 26 78 30 Q78 44 72 50 Z" fill={colors.hair} />

              {/* Violin under the chin, pointing forward-left */}
              <g transform="rotate(-15 65 52)">
                <rect x="35" y="49" width="30" height="4.5" fill="#422" />
                {/* Violin Body */}
                <path
                  d="M62 46 Q58 40 70 42 Q82 40 78 46 Q80 52 74 60 Q66 64 62 60 Q58 52 62 46 Z"
                  fill="#8D4925"
                  stroke="#5C2E14"
                  strokeWidth="1.5"
                />
                <circle cx="70" cy="52" r="2.5" fill="#3D1C2E" />
              </g>

              {/* Left Hand Holding Neck */}
              <line x1="56" y1="64" x2="42" y2="52" stroke={colors.skin} strokeWidth="4.5" strokeLinecap="round" />
              <circle cx="41" cy="52" r="3.5" fill={colors.skin} />

              {/* Right Arm & Bow moving smoothly back and forth */}
              <g
                className={isPlaying ? 'animate-violin-bowing' : ''}
                style={{ transformOrigin: '80px 65px' }}
              >
                <line x1="76" y1="62" x2="90" y2="58" stroke={colors.skin} strokeWidth="4.5" strokeLinecap="round" />
                <circle cx="91" cy="58" r="3.5" fill={colors.skin} />
                {/* Violin Bow Rod */}
                <line x1="55" y1="48" x2="105" y2="65" stroke="#E6C280" strokeWidth="2" strokeLinecap="round" />
              </g>
            </g>
          </svg>
        );

      case 'cello':
        return (
          <svg viewBox="0 0 140 140" className="w-full h-full overflow-visible">
            {/* Cellist Seated with Cello between knees */}
            {/* Cello Endpin */}
            <line x1="70" y1="105" x2="70" y2="135" stroke="#999" strokeWidth="3" />

            {/* Cello Body */}
            <g transform="rotate(-5 70 85)">
              <path
                d="M54 75 Q48 60 70 62 Q92 60 86 75 Q90 88 80 105 Q70 112 60 105 Q50 88 54 75 Z"
                fill="#823F1C"
                stroke="#54240C"
                strokeWidth="2"
              />
              <rect x="68" y="40" width="5" height="35" fill="#331A0F" />
              <circle cx="70" cy="85" r="4.5" fill="#241107" />
            </g>

            {/* Cellist Head & Body */}
            <circle cx="70" cy="38" r="12" fill={colors.skin} />
            <path d="M58 38 Q65 24 82 28 Q84 42 78 48 Z" fill={colors.hair} />
            <path d="M55 52 L85 52 L82 85 L58 85 Z" fill={colors.clothing} />

            {/* Left Hand on Cello Fingerboard */}
            <line x1="58" y1="58" x2="68" y2="50" stroke={colors.skin} strokeWidth="4" strokeLinecap="round" />

            {/* Right Arm & Bow across Cello */}
            <g className={isPlaying ? 'animate-cello-bowing' : ''}>
              <line x1="82" y1="62" x2="95" y2="78" stroke={colors.skin} strokeWidth="4" strokeLinecap="round" />
              <line x1="50" y1="88" x2="105" y2="76" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          </svg>
        );

      case 'flute':
        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            {/* Flutist holding transverse flute to the right */}
            <g className={isPlaying ? 'animate-woodwind-sway' : ''}>
              {/* Body */}
              <path d="M54 60 L76 60 L76 125 L54 125 Z" fill={colors.clothing} />
              {/* Head turned sideways */}
              <circle cx="65" cy="40" r="12" fill={colors.skin} />
              <path d="M53 40 Q62 26 78 28 Q78 42 70 48 Z" fill={colors.hair} />
              <ellipse cx="68" cy="41" rx="1.5" ry="1" fill="#222" />

              {/* Silver Transverse Flute held horizontally */}
              <line x1="60" y1="46" x2="115" y2="44" stroke="#D9D9D9" strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="68" cy="45.5" r="2.5" fill="#B0B0B0" />

              {/* Hands on flute */}
              <circle cx="78" cy="46" r="3" fill={colors.skin} />
              <circle cx="95" cy="45" r="3" fill={colors.skin} />
            </g>
          </svg>
        );

      case 'saxophone':
        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            <g className={isPlaying ? 'animate-horn-bob' : ''}>
              {/* Body */}
              <path d="M54 60 L76 60 L76 125 L54 125 Z" fill={colors.clothing} />
              {/* Head */}
              <circle cx="65" cy="40" r="12" fill={colors.skin} />
              <path d="M53 40 Q62 26 78 30 Q78 44 72 49 Z" fill={colors.hair} />

              {/* Brass Curved Saxophone */}
              <g transform="translate(10, 10)">
                {/* Neck to mouth */}
                <path d="M52 38 Q58 45 58 55" stroke="#C69A55" strokeWidth="3" fill="none" />
                {/* Body Tube */}
                <path d="M58 55 L58 85 Q58 105 75 105 Q90 105 88 88" stroke="#D4AF37" strokeWidth="7" strokeLinecap="round" fill="none" />
                {/* Flared Bell */}
                <ellipse cx="88" cy="85" rx="7" ry="9" fill="#D4AF37" stroke="#A88120" strokeWidth="1.5" />
              </g>

              {/* Hands around keys */}
              <circle cx="67" cy="72" r="3.5" fill={colors.skin} />
              <circle cx="69" cy="86" r="3.5" fill={colors.skin} />
            </g>
          </svg>
        );

      case 'trumpet':
        return (
          <svg viewBox="0 0 130 140" className="w-full h-full overflow-visible">
            <g className={isPlaying ? 'animate-horn-bob' : ''}>
              {/* Body */}
              <path d="M54 60 L76 60 L76 125 L54 125 Z" fill={colors.clothing} />
              {/* Head */}
              <circle cx="65" cy="40" r="12" fill={colors.skin} />
              <path d="M53 40 Q62 26 78 28 Q78 42 70 48 Z" fill={colors.hair} />

              {/* Golden Trumpet pointed up & outward */}
              <g transform="rotate(-10 65 45)">
                <line x1="65" y1="46" x2="110" y2="46" stroke="#D4AF37" strokeWidth="3.5" />
                {/* Valves */}
                <line x1="82" y1="42" x2="82" y2="48" stroke="#A88120" strokeWidth="2" />
                <line x1="86" y1="42" x2="86" y2="48" stroke="#A88120" strokeWidth="2" />
                <line x1="90" y1="42" x2="90" y2="48" stroke="#A88120" strokeWidth="2" />
                {/* Flared Bell */}
                <path d="M108 46 L120 40 L120 52 Z" fill="#D4AF37" stroke="#A88120" strokeWidth="1" />
              </g>

              {/* Hands pressing valves */}
              <circle cx="85" cy="44" r="3.5" fill={colors.skin} />
            </g>
          </svg>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`relative flex flex-col items-center justify-end p-2.5 rounded-2xl transition-all duration-300 border ${colors.cardBorder} ${colors.cardBg} ${widthClass} ${className} shadow-sm group`}
    >
      {/* Subtle stage spotlight beneath performer */}
      <div
        className="absolute bottom-2 left-1/2 -translate-x-1/2 w-4/5 h-10 rounded-full blur-md pointer-events-none transition-opacity duration-300"
        style={{
          background: colors.spotlight,
          opacity: isPlaying ? 0.9 : 0.2,
        }}
      />

      {/* Performer Status Pill */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
        <span className="text-sm">{def.icon}</span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all duration-200 ${
            isPlaying ? colors.activeBadge : colors.idleBadge
          }`}
        >
          {isPlaying ? 'Playing' : 'Idle'}
        </span>
      </div>

      {/* Stylized Visual Performer + Instrument Canvas */}
      <div className={`w-full ${heightClass} flex items-center justify-center relative mt-4`}>
        {renderPerformerArt()}
      </div>

      {/* Performer Title & Instrument Footer */}
      <div className="w-full text-center mt-1 pt-1.5 border-t border-black/5 dark:border-white/5">
        <div className={`text-xs font-bold truncate ${isPlaying ? colors.activeText : 'text-[#25242A] dark:text-[#F4F2F7]'}`}>
          {def.performerTitle}
        </div>
        <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] truncate font-medium">
          {characterName || def.name}
        </div>
      </div>
    </div>
  );
};
