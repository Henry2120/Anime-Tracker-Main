import React from 'react';
import { MusicInstrument, PerformerGender } from '../types';
import { AppTheme } from '../../../types/theme';
import { getInstrumentDefinition } from '../instruments/registry';

export interface HumanFigureProps {
  instrument: MusicInstrument;
  gender: PerformerGender;
  isPlaying: boolean;
  theme: AppTheme;
  characterName?: string;
  isSelected?: boolean;
  isEditing?: boolean;
  className?: string;
}

export const HumanFigure: React.FC<HumanFigureProps> = ({
  instrument,
  gender,
  isPlaying,
  theme,
  characterName,
  isSelected = false,
  isEditing = false,
  className = '',
}) => {
  const isMale = gender === 'male';

  // Palette definitions: refined concert attire, skin, and instrument finishes
  const skinTone = isMale ? '#F0CBB8' : '#F6D5C8';
  const skinShadow = isMale ? '#DCAE98' : '#E8B9A6';

  // Hair colors
  const hairColor = isMale ? '#2B262D' : '#3D2B24';
  const hairHighlight = isMale ? '#463F4B' : '#5C4339';

  // Concert attire palette
  const suitColor = isMale ? '#18171F' : '#211E2B';
  const suitAccent = isMale ? '#2D2938' : '#352E46';
  const shirtColor = '#FDFDFD';
  const tieColor = theme === 'sakura' ? '#E06B95' : '#7567C7';
  const dressColor = theme === 'sakura' ? '#4A1D2F' : '#221F2D';
  const dressAccent = theme === 'sakura' ? '#E06B95' : '#8A7AC7';
  const shoeColor = '#121118';

  // Instrument finishes
  const brassGold = '#D9A74A';
  const darkBrass = '#8C6527';
  const woodMaple = '#C48A54';
  const woodEbony = '#232026';
  const chromeSilver = '#D6DCE5';

  // Render Head & Hair for Male / Female
  const renderHead = (headX: number, headY: number, angle: number = 0) => {
    return (
      <g
        transform={`rotate(${angle}, ${headX}, ${headY})`}
        className={isPlaying ? 'animate-bounce-subtle' : 'animate-idle-breathe'}
      >
        {/* Neck */}
        <rect
          x={headX - (isMale ? 5 : 4)}
          y={headY + 12}
          width={isMale ? 10 : 8}
          height={10}
          rx={3}
          fill={skinShadow}
        />

        {/* Head base */}
        <ellipse
          cx={headX}
          cy={headY}
          rx={isMale ? 13 : 11.5}
          ry={isMale ? 15 : 14}
          fill={skinTone}
          stroke={skinShadow}
          strokeWidth="0.8"
        />

        {/* Hair - distinct male vs female illustrated styles */}
        {isMale ? (
          // Male: stylish side-part volume hairstyle
          <g>
            <path
              d={`M${headX - 14} ${headY - 2} Q${headX - 15} ${headY - 17} ${headX} ${headY - 18} Q${headX + 15} ${headY - 17} ${headX + 14} ${headY - 1} Q${headX + 11} ${headY - 8} ${headX + 3} ${headY - 11} Q${headX - 7} ${headY - 12} ${headX - 14} ${headY - 2} Z`}
              fill={hairColor}
            />
            <path
              d={`M${headX - 8} ${headY - 15} Q${headX + 3} ${headY - 16} ${headX + 11} ${headY - 8}`}
              stroke={hairHighlight}
              strokeWidth="1.5"
              fill="none"
            />
          </g>
        ) : (
          // Female: elegant updo / flowing concert hairstyle
          <g>
            <ellipse cx={headX} cy={headY - 16} rx={7} ry={5} fill={hairColor} />
            <path
              d={`M${headX - 13} ${headY + 3} Q${headX - 16} ${headY - 16} ${headX} ${headY - 18} Q${headX + 16} ${headY - 16} ${headX + 13} ${headY + 3} Q${headX + 10} ${headY - 6} ${headX + 4} ${headY - 9} Q${headX - 6} ${headY - 10} ${headX - 13} ${headY + 3} Z`}
              fill={hairColor}
            />
            {/* Soft hair strand */}
            <path
              d={`M${headX - 13} ${headY} Q${headX - 15} ${headY + 12} ${headX - 10} ${headY + 16}`}
              stroke={hairColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M${headX + 13} ${headY} Q${headX + 15} ${headY + 12} ${headX + 10} ${headY + 16}`}
              stroke={hairColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        )}

        {/* Eyes & Eyebrows */}
        <g opacity="0.85">
          <ellipse cx={headX - 4.5} cy={headY + 1} rx={1.8} ry={1.2} fill="#1E1C22" />
          <ellipse cx={headX + 4.5} cy={headY + 1} rx={1.8} ry={1.2} fill="#1E1C22" />
          <path
            d={`M${headX - 7} ${headY - 3} Q${headX - 4} ${headY - 4.5} ${headX - 2} ${headY - 3}`}
            stroke="#1E1C22"
            strokeWidth="1"
            fill="none"
          />
          <path
            d={`M${headX + 2} ${headY - 3} Q${headX + 4} ${headY - 4.5} ${headX + 7} ${headY - 3}`}
            stroke="#1E1C22"
            strokeWidth="1"
            fill="none"
          />
          {/* Nose bridge */}
          <path d={`M${headX} ${headY + 2} L${headX} ${headY + 5} L${headX + 1.2} ${headY + 5.5}`} stroke={skinShadow} strokeWidth="0.8" fill="none" />
          {/* Mouth */}
          <path
            d={`M${headX - 2.5} ${headY + 9} Q${headX} ${headY + (instrument === 'vocalist' && isPlaying ? 12 : 9.8)} ${headX + 2.5} ${headY + 9}`}
            stroke={instrument === 'vocalist' && isPlaying ? '#B93E58' : skinShadow}
            strokeWidth={instrument === 'vocalist' && isPlaying ? 2.5 : 1}
            fill={instrument === 'vocalist' && isPlaying ? '#731C2D' : 'none'}
          />
        </g>
      </g>
    );
  };

  // Render Seated Legs & Shoes
  const renderSeatedLegs = (hipX: number, hipY: number, kneeX: number, kneeY: number, footX: number, footY: number) => {
    return (
      <g>
        {/* Legs in formal concert trousers or long skirt */}
        <path
          d={`M${hipX - 10} ${hipY} L${kneeX - 6} ${kneeY} L${footX - 4} ${footY} L${footX + 6} ${footY} L${kneeX + 4} ${kneeY + 2} L${hipX + 10} ${hipY} Z`}
          fill={suitColor}
        />
        {/* Dress shoes */}
        <ellipse cx={footX} cy={footY + 2} rx="8" ry="3.5" fill={shoeColor} />
      </g>
    );
  };

  // Render Standing Legs & Shoes
  const renderStandingLegs = (rootX: number, rootY: number) => {
    return (
      <g>
        {isMale ? (
          // Male formal slacks
          <g>
            <path
              d={`M${rootX - 12} ${rootY} L${rootX - 14} ${rootY + 55} L${rootX - 4} ${rootY + 55} L${rootX - 2} ${rootY + 12} L${rootX} ${rootY} Z`}
              fill={suitColor}
            />
            <path
              d={`M${rootX + 12} ${rootY} L${rootX + 14} ${rootY + 55} L${rootX + 4} ${rootY + 55} L${rootX + 2} ${rootY + 12} L${rootX} ${rootY} Z`}
              fill={suitColor}
            />
            {/* Left Shoe */}
            <ellipse cx={rootX - 9} cy={rootY + 57} rx="7" ry="3" fill={shoeColor} />
            {/* Right Shoe */}
            <ellipse cx={rootX + 9} cy={rootY + 57} rx="7" ry="3" fill={shoeColor} />
          </g>
        ) : (
          // Female formal concert dress or slacks
          <g>
            <path
              d={`M${rootX - 14} ${rootY} Q${rootX - 18} ${rootY + 30} ${rootX - 20} ${rootY + 55} L${rootX + 20} ${rootY + 55} Q${rootX + 18} ${rootY + 30} ${rootX + 14} ${rootY} Z`}
              fill={dressColor}
            />
            <ellipse cx={rootX - 10} cy={rootY + 57} rx="6" ry="2.8" fill={shoeColor} />
            <ellipse cx={rootX + 10} cy={rootY + 57} rx="6" ry="2.8" fill={shoeColor} />
          </g>
        )}
      </g>
    );
  };

  // Render Instrument and Pose
  const renderInstrumentAndPerformer = () => {
    switch (instrument) {
      // 1. PIANO
      case 'piano':
        return (
          <g transform="translate(15, 20)">
            {/* Baby Grand Piano Body */}
            <path
              d="M75 75 L155 75 Q175 90 170 120 L80 120 Z"
              fill="#18151E"
              stroke="#3B3549"
              strokeWidth="2"
            />
            {/* Piano Propped Lid with Golden Strut */}
            <path d="M78 72 L160 35" stroke="#2D2938" strokeWidth="4" strokeLinecap="round" />
            <line x1="145" y1="42" x2="148" y2="75" stroke={brassGold} strokeWidth="2.5" />
            {/* Golden Cast-Iron Harp Frame Inside */}
            <path d="M85 75 Q115 80 145 75" stroke={brassGold} strokeWidth="3" opacity="0.8" />
            {/* Piano Keys */}
            <rect x="75" y="92" width="28" height="15" fill="#FFFFFF" stroke="#222" strokeWidth="1" />
            <line x1="82" y1="92" x2="82" y2="104" stroke="#111" strokeWidth="2.5" />
            <line x1="90" y1="92" x2="90" y2="104" stroke="#111" strokeWidth="2.5" />
            <line x1="97" y1="92" x2="97" y2="104" stroke="#111" strokeWidth="2.5" />
            {/* Piano Legs & Lyre Pedals */}
            <line x1="85" y1="120" x2="85" y2="165" stroke="#18151E" strokeWidth="6" strokeLinecap="round" />
            <line x1="160" y1="120" x2="160" y2="165" stroke="#18151E" strokeWidth="6" strokeLinecap="round" />
            <rect x="110" y="152" width="12" height="12" fill={brassGold} rx="2" />

            {/* Piano Bench */}
            <rect x="35" y="115" width="34" height="8" rx="2" fill="#2E1C14" />
            <line x1="40" y1="123" x2="38" y2="165" stroke="#20130E" strokeWidth="4.5" strokeLinecap="round" />
            <line x1="64" y1="123" x2="66" y2="165" stroke="#20130E" strokeWidth="4.5" strokeLinecap="round" />

            {/* Pianist Seated Legs */}
            {renderSeatedLegs(52, 115, 68, 130, 80, 165)}

            {/* Pianist Torso & Jacket */}
            <g className={isPlaying ? 'animate-bounce-subtle' : ''}>
              <path
                d="M42 85 Q52 78 64 85 L62 120 L40 120 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M50 85 L53 100 L56 85 Z" fill={shirtColor} />
              {isMale && <line x1="53" y1="88" x2="53" y2="98" stroke={tieColor} strokeWidth="1.5" />}

              {/* Head */}
              {renderHead(52, 60, 5)}

              {/* Arms & Hands Playing Keys */}
              <g className={isPlaying ? 'animate-piano-hands' : ''}>
                <path d="M56 88 L72 96 L86 98" fill="none" stroke={suitColor} strokeWidth="6" strokeLinecap="round" />
                <ellipse cx="88" cy="98" rx="3.5" ry="2.5" fill={skinTone} />
                <path d="M52 90 L68 98 L78 101" fill="none" stroke={suitAccent} strokeWidth="5.5" strokeLinecap="round" opacity="0.9" />
                <ellipse cx="80" cy="101" rx="3.5" ry="2.5" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 2. CHURCH ORGAN
      case 'church-organ':
        return (
          <g transform="translate(10, 10)">
            {/* Grand Pipe Array in Background */}
            <g opacity="0.95">
              {[-36, -27, -18, -9, 0, 9, 18, 27, 36].map((offset, idx) => {
                const pipeHeight = 70 + Math.abs(offset) * 1.5 - (idx % 2) * 5;
                return (
                  <rect
                    key={`pipe-${idx}`}
                    x={95 + offset}
                    y={110 - pipeHeight}
                    width="6.5"
                    height={pipeHeight}
                    rx="2"
                    fill={idx % 2 === 0 ? brassGold : chromeSilver}
                    stroke="#554422"
                    strokeWidth="0.8"
                  />
                );
              })}
              {/* Organ Case Trim */}
              <rect x="52" y="105" width="96" height="6" fill="#4A2612" rx="2" />
            </g>

            {/* Organ Console / Rolltop Case */}
            <rect x="62" y="98" width="76" height="52" rx="4" fill="#381D0E" stroke="#5C3218" strokeWidth="2" />
            {/* Stop Knobs on Left and Right Jambs */}
            <circle cx="68" cy="112" r="2.5" fill="#F0E8D0" stroke="#333" strokeWidth="0.5" />
            <circle cx="68" cy="120" r="2.5" fill="#F0E8D0" stroke="#333" strokeWidth="0.5" />
            <circle cx="132" cy="112" r="2.5" fill="#F0E8D0" stroke="#333" strokeWidth="0.5" />
            <circle cx="132" cy="120" r="2.5" fill="#F0E8D0" stroke="#333" strokeWidth="0.5" />

            {/* Double Manual Keyboards */}
            <rect x="76" y="112" width="48" height="6" fill="#FFF" stroke="#222" strokeWidth="0.8" />
            <rect x="76" y="120" width="48" height="6" fill="#FFF" stroke="#222" strokeWidth="0.8" />

            {/* Organ Bench */}
            <rect x="70" y="138" width="60" height="7" rx="2" fill="#2E170B" />
            <line x1="75" y1="145" x2="73" y2="185" stroke="#201007" strokeWidth="5" />
            <line x1="125" y1="145" x2="127" y2="185" stroke="#201007" strokeWidth="5" />
            {/* Pedalboard beneath */}
            <rect x="78" y="180" width="44" height="6" fill="#D2B48C" stroke="#443" strokeWidth="1" />

            {/* Organist Character (Seated Facing Console) */}
            <g className={isPlaying ? 'animate-bounce-subtle' : ''}>
              {/* Seated Legs */}
              <rect x="86" y="142" width="10" height="40" fill={suitColor} rx="3" />
              <rect x="104" y="142" width="10" height="40" fill={suitColor} rx="3" />
              <ellipse cx="91" cy="183" rx="5" ry="2.5" fill={shoeColor} />
              <ellipse cx="109" cy="183" rx="5" ry="2.5" fill={shoeColor} />

              {/* Torso back/three-quarter view */}
              <path
                d="M82 105 L118 105 L114 142 L86 142 Z"
                fill={isMale ? suitColor : dressColor}
              />
              {/* Head looking slightly upward toward pipes */}
              {renderHead(100, 85, -2)}

              {/* Arms reaching for upper and lower manuals */}
              <g className={isPlaying ? 'animate-organ-hands' : ''}>
                <path d="M86 110 L94 118 L100 115" stroke={suitColor} strokeWidth="6" strokeLinecap="round" fill="none" />
                <ellipse cx="102" cy="115" rx="3" ry="2" fill={skinTone} />
                <path d="M114 110 L106 122 L98 123" stroke={suitAccent} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <ellipse cx="96" cy="123" rx="3" ry="2" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 3. SYNTHESIZER
      case 'synthesizer':
        return (
          <g transform="translate(15, 20)">
            {/* Modern Z-Stand */}
            <path d="M60 165 L100 100 L70 100" stroke="#2B2D38" strokeWidth="4.5" fill="none" />
            <path d="M140 165 L100 100 L130 100" stroke="#2B2D38" strokeWidth="4.5" fill="none" />
            <line x1="50" y1="165" x2="150" y2="165" stroke="#1D1E24" strokeWidth="4" />

            {/* Synthesizer Workstation Chassis */}
            <rect x="52" y="90" width="96" height="18" rx="3" fill="#1C1B24" stroke="#4C465E" strokeWidth="1.5" />
            {/* Glowing Blue Digital LCD Screen */}
            <rect x="90" y="93" width="20" height="7" rx="1.5" fill="#00D2FF" opacity="0.85" />
            {/* Sliders and Knobs bank */}
            <circle cx="62" cy="96" r="2" fill="#E06B95" />
            <circle cx="68" cy="96" r="2" fill="#7567C7" />
            <circle cx="74" cy="96" r="2" fill="#00E5A3" />
            {/* Synthesizer White & Black Keys */}
            <rect x="54" y="101" width="92" height="6" fill="#FFF" stroke="#222" strokeWidth="0.8" />
            <line x1="70" y1="101" x2="70" y2="105" stroke="#111" strokeWidth="1.5" />
            <line x1="85" y1="101" x2="85" y2="105" stroke="#111" strokeWidth="1.5" />
            <line x1="100" y1="101" x2="100" y2="105" stroke="#111" strokeWidth="1.5" />
            <line x1="115" y1="101" x2="115" y2="105" stroke="#111" strokeWidth="1.5" />
            <line x1="130" y1="101" x2="130" y2="105" stroke="#111" strokeWidth="1.5" />

            {/* Synth Performer Standing Behind */}
            <g className={isPlaying ? 'animate-bounce-subtle' : ''}>
              {renderStandingLegs(100, 110)}
              {/* Torso */}
              <path
                d="M84 72 Q100 68 116 72 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 72 L100 86 L104 72 Z" fill={shirtColor} />

              {/* Head */}
              {renderHead(100, 52, 0)}

              {/* Arms moving across keyboard */}
              <g className={isPlaying ? 'animate-synth-glides' : ''}>
                <path d="M88 78 L80 92 L75 96" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <ellipse cx="74" cy="97" rx="3.5" ry="2.5" fill={skinTone} />
                <path d="M112 78 L120 92 L125 96" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <ellipse cx="126" cy="97" rx="3.5" ry="2.5" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 4. ACOUSTIC DRUMS
      case 'drums':
        return (
          <g transform="translate(15, 20)">
            {/* Drum Hardware Stands */}
            <line x1="30" y1="95" x2="25" y2="165" stroke="#888" strokeWidth="3" />
            <line x1="170" y1="85" x2="175" y2="165" stroke="#888" strokeWidth="3" />
            <line x1="100" y1="125" x2="100" y2="165" stroke="#888" strokeWidth="4.5" />

            {/* Bass Drum Center */}
            <circle cx="100" cy="125" r="32" fill="#1C1824" stroke="#4C465E" strokeWidth="3" />
            <circle cx="100" cy="125" r="26" fill={theme === 'dark' ? '#14121A' : '#EDE8F5'} />
            <circle cx="100" cy="125" r="9" fill={dressAccent} opacity="0.6" />

            {/* Snare Drum & High Tom */}
            <ellipse cx="60" cy="108" rx="17" ry="8" fill="#F4F4F6" stroke="#2B2735" strokeWidth="2.5" />
            <ellipse cx="140" cy="105" rx="16" ry="7.5" fill="#F4F4F6" stroke="#2B2735" strokeWidth="2.5" />

            {/* Brass Cymbals */}
            <ellipse
              cx="32"
              cy="80"
              rx="22"
              ry="6"
              fill={brassGold}
              stroke={darkBrass}
              strokeWidth="2"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />
            <ellipse
              cx="168"
              cy="72"
              rx="24"
              ry="6.5"
              fill={brassGold}
              stroke={darkBrass}
              strokeWidth="2"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />

            {/* Drummer Seated Behind the Kit */}
            <g className={isPlaying ? 'animate-drummer-strike' : ''}>
              {/* Torso */}
              <path
                d="M86 65 Q100 62 114 65 L112 98 L88 98 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 65 L100 78 L104 65 Z" fill={shirtColor} />

              {/* Head */}
              {renderHead(100, 46, 0)}

              {/* Drumsticks Left / Right */}
              <g className={isPlaying ? 'animate-drumstick-left' : ''}>
                <line x1="88" y1="72" x2="68" y2="88" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" />
                <line x1="68" y1="88" x2="52" y2="105" stroke={woodMaple} strokeWidth="2.5" strokeLinecap="round" />
              </g>
              <g className={isPlaying ? 'animate-drumstick-right' : ''}>
                <line x1="112" y1="72" x2="135" y2="80" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" />
                <line x1="135" y1="80" x2="160" y2="74" stroke={woodMaple} strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>
          </g>
        );

      // 5. ELECTRONIC DRUMS
      case 'electronic-drums':
        return (
          <g transform="translate(15, 20)">
            {/* Curved Electronic Aluminum Rack */}
            <path d="M35 165 L50 85 L150 85 L165 165" stroke="#2B2D38" strokeWidth="4.5" fill="none" />
            <line x1="50" y1="120" x2="150" y2="120" stroke="#2B2D38" strokeWidth="3.5" />

            {/* Electronic Mesh Trigger Hex/Round Pads with Neon Rims */}
            <circle cx="62" cy="115" r="14" fill="#181820" stroke="#00D2FF" strokeWidth="2.5" />
            <circle cx="100" cy="110" r="15" fill="#181820" stroke="#7567C7" strokeWidth="2.5" />
            <circle cx="138" cy="115" r="14" fill="#181820" stroke="#00D2FF" strokeWidth="2.5" />

            {/* Electronic Cymbal Pads with Mute Choke Edge */}
            <path
              d="M32 75 Q48 68 62 82 Z"
              fill="#22212C"
              stroke="#00D2FF"
              strokeWidth="2"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />
            <path
              d="M138 82 Q152 68 168 75 Z"
              fill="#22212C"
              stroke="#7567C7"
              strokeWidth="2"
              className={isPlaying ? 'animate-cymbal-vibe' : ''}
            />

            {/* Electronic Brain Module Screen */}
            <rect x="42" y="90" width="16" height="12" rx="2" fill="#0D0C12" stroke="#4C465E" strokeWidth="1" />
            <rect x="45" y="93" width="10" height="6" fill="#00E5A3" opacity="0.8" />

            {/* Drummer Figure */}
            <g className={isPlaying ? 'animate-drummer-strike' : ''}>
              <path
                d="M86 65 Q100 62 114 65 L112 98 L88 98 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 65 L100 78 L104 65 Z" fill={shirtColor} />
              {renderHead(100, 46, 0)}

              <g className={isPlaying ? 'animate-drumstick-left' : ''}>
                <line x1="88" y1="72" x2="72" y2="92" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" />
                <line x1="72" y1="92" x2="60" y2="112" stroke={chromeSilver} strokeWidth="2.5" strokeLinecap="round" />
              </g>
              <g className={isPlaying ? 'animate-drumstick-right' : ''}>
                <line x1="112" y1="72" x2="128" y2="90" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" />
                <line x1="128" y1="90" x2="140" y2="112" stroke={chromeSilver} strokeWidth="2.5" strokeLinecap="round" />
              </g>
            </g>
          </g>
        );

      // 6. DJ / TURNTABLES
      case 'dj-turntable':
        return (
          <g transform="translate(15, 20)">
            {/* DJ Booth Counter Table */}
            <rect x="40" y="105" width="120" height="60" rx="4" fill="#191722" stroke="#3D374D" strokeWidth="2" />
            {/* Front Illumination / LED Logo Bar */}
            <line x1="50" y1="125" x2="150" y2="125" stroke={dressAccent} strokeWidth="2.5" opacity="0.75" />

            {/* Left Turntable Deck */}
            <rect x="46" y="98" width="32" height="20" rx="2" fill="#242130" stroke="#4C465E" strokeWidth="1" />
            <circle cx="62" cy="108" r="9" fill="#111" stroke="#444" strokeWidth="1" />
            <g className={isPlaying ? 'animate-vinyl-spin origin-center' : ''} style={{ transformOrigin: '62px 108px' }}>
              <circle cx="62" cy="108" r="4" fill="#E06B95" />
            </g>
            <line x1="72" y1="102" x2="65" y2="108" stroke={chromeSilver} strokeWidth="1.5" />

            {/* 4-Channel DJ Mixer Center */}
            <rect x="82" y="98" width="36" height="20" rx="2" fill="#1C1A24" stroke="#4C465E" strokeWidth="1" />
            {/* Crossfader & VU Meters */}
            <line x1="90" y1="114" x2="110" y2="114" stroke="#444" strokeWidth="2" />
            <rect x="98" y="112" width="4" height="4" fill="#00D2FF" rx="0.5" />
            <line x1="94" y1="101" x2="94" y2="108" stroke="#00E5A3" strokeWidth="1.5" />
            <line x1="106" y1="101" x2="106" y2="108" stroke="#00E5A3" strokeWidth="1.5" />

            {/* Right Turntable Deck */}
            <rect x="122" y="98" width="32" height="20" rx="2" fill="#242130" stroke="#4C465E" strokeWidth="1" />
            <circle cx="138" cy="108" r="9" fill="#111" stroke="#444" strokeWidth="1" />
            <g className={isPlaying ? 'animate-vinyl-spin origin-center' : ''} style={{ transformOrigin: '138px 108px' }}>
              <circle cx="138" cy="108" r="4" fill="#7567C7" />
            </g>
            <line x1="148" y1="102" x2="141" y2="108" stroke={chromeSilver} strokeWidth="1.5" />

            {/* DJ Standing Behind Console */}
            <g className={isPlaying ? 'animate-bounce-subtle' : ''}>
              {/* Torso */}
              <path
                d="M84 70 Q100 66 116 70 L114 110 L86 110 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 85 L104 70 Z" fill={shirtColor} />

              {/* Head with DJ Headphones over ears */}
              {renderHead(100, 50, isPlaying ? 4 : 0)}
              {/* Over-ear DJ Headphone Band */}
              <path d="M86 48 Q100 32 114 48" stroke="#222" strokeWidth="3.5" fill="none" />
              <ellipse cx="86" cy="50" rx="3.5" ry="5" fill="#E06B95" />
              <ellipse cx="114" cy="50" rx="3.5" ry="5" fill="#E06B95" />

              {/* Arms Scratching Platter / Tweaking EQ */}
              <g className={isPlaying ? 'animate-dj-scratch' : ''}>
                <path d="M88 76 L74 88 L65 104" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <ellipse cx="65" cy="105" rx="3.5" ry="2.5" fill={skinTone} />
                <path d="M112 76 L118 88 L104 104" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <ellipse cx="104" cy="105" rx="3.5" ry="2.5" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 7. VOCALIST
      case 'vocalist':
        return (
          <g transform="translate(15, 20)">
            {/* Vocalist Standing Figures */}
            <g className={isPlaying ? 'animate-vocalist-sing' : ''}>
              {renderStandingLegs(100, 110)}
              {/* Torso */}
              <path
                d="M84 68 Q100 64 116 68 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M95 68 L100 84 L105 68 Z" fill={shirtColor} />
              {isMale && <line x1="100" y1="72" x2="100" y2="82" stroke={tieColor} strokeWidth="1.5" />}

              {/* Head tilted with passion */}
              {renderHead(100, 48, isPlaying ? -3 : 0)}

              {/* Gesturing Expressive Performance Arm */}
              <g className={isPlaying ? 'animate-vocalist-arm' : ''} style={{ transformOrigin: '88px 74px' }}>
                <path d="M86 74 L70 86 L62 82" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
                <ellipse cx="60" cy="82" rx="3" ry="2" fill={skinTone} />
              </g>
              {/* Arm holding microphone stand */}
              <path d="M114 74 L118 88 L106 94" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <ellipse cx="105" cy="94" rx="3" ry="2" fill={skinTone} />
            </g>

            {/* Vintage Chrome Stage Microphone & Heavy Round Base Stand */}
            <circle cx="106" cy="165" r="14" fill="#1C1A24" stroke="#444" strokeWidth="2" />
            <line x1="106" y1="78" x2="106" y2="165" stroke={chromeSilver} strokeWidth="3" />
            {/* Vintage Chrome Mic Head (Shure 55 style) */}
            <rect x="101" y="70" width="10" height="14" rx="3" fill={chromeSilver} stroke="#444" strokeWidth="1" />
            <line x1="103" y1="73" x2="109" y2="73" stroke="#222" strokeWidth="1" />
            <line x1="103" y1="76" x2="109" y2="76" stroke="#222" strokeWidth="1" />
            <line x1="103" y1="79" x2="109" y2="79" stroke="#222" strokeWidth="1" />
          </g>
        );

      // 8. HARP
      case 'harp':
        return (
          <g transform="translate(15, 20)">
            {/* Grand Concert Pedal Harp */}
            {/* Sculpted Golden Pillar */}
            <path
              d="M70 45 Q64 90 74 150 Q78 165 85 165 L60 165 Q66 100 66 45 Z"
              fill={brassGold}
              stroke={darkBrass}
              strokeWidth="1.5"
            />
            {/* Harp Crown Top */}
            <circle cx="68" cy="42" r="7" fill={brassGold} stroke={darkBrass} strokeWidth="1.5" />
            {/* Harmonic Curved Neck with Brass Tuning Pins */}
            <path
              d="M68 42 Q105 32 140 70 Q130 75 125 72 Q100 48 68 45 Z"
              fill={woodMaple}
              stroke={darkBrass}
              strokeWidth="1.5"
            />
            {/* Soundboard Body */}
            <path
              d="M140 70 L115 165 L85 165 L125 72 Z"
              fill={woodMaple}
              stroke="#5D3A1A"
              strokeWidth="1.5"
            />
            {/* Harp Strings (Array of vertical strings) */}
            <g opacity="0.65">
              {[80, 86, 92, 98, 104, 110, 116, 122, 128].map((xPos, idx) => (
                <line
                  key={`harp-str-${idx}`}
                  x1={xPos}
                  y1={48 + idx * 2.8}
                  x2={85 + idx * 3.5}
                  y2={165}
                  stroke={idx % 4 === 0 ? '#C0392B' : idx % 4 === 2 ? '#2980B9' : '#EDE8F5'}
                  strokeWidth="0.8"
                />
              ))}
            </g>

            {/* Harpist Chair & Seated Harpist */}
            <rect x="135" y="125" width="24" height="6" rx="2" fill="#2E1C14" />
            <line x1="140" y1="131" x2="138" y2="165" stroke="#20130E" strokeWidth="4" />
            <line x1="154" y1="131" x2="156" y2="165" stroke="#20130E" strokeWidth="4" />

            {/* Harpist Seated Figure */}
            <g className={isPlaying ? 'animate-bounce-subtle' : ''}>
              {renderSeatedLegs(146, 125, 130, 138, 120, 165)}

              {/* Torso leaning gracefully into soundboard */}
              <path
                d="M136 90 Q146 86 156 90 L152 126 L134 126 Z"
                fill={isMale ? suitColor : dressColor}
              />
              {renderHead(144, 70, -8)}

              {/* Both Hands Plucking Harp Strings */}
              <g className={isPlaying ? 'animate-harp-pluck' : ''}>
                <path d="M140 96 L124 102 L110 100" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
                <ellipse cx="108" cy="100" rx="3" ry="2" fill={skinTone} />
                <path d="M136 98 L118 108 L104 108" stroke={suitAccent} strokeWidth="4.5" strokeLinecap="round" fill="none" />
                <ellipse cx="102" cy="108" rx="3" ry="2" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 9. CELLO
      case 'cello':
        return (
          <g transform="translate(15, 20)">
            {/* Seated Cellist Chair */}
            <rect x="88" y="120" width="24" height="6" rx="2" fill="#2E1C14" />
            <line x1="92" y1="126" x2="90" y2="165" stroke="#20130E" strokeWidth="4" />
            <line x1="108" y1="126" x2="110" y2="165" stroke="#20130E" strokeWidth="4" />

            {/* Cellist Seated Legs Spread for Cello Body */}
            <path d="M88 120 L72 135 L68 165 L76 165 L80 138 L92 120 Z" fill={suitColor} />
            <path d="M112 120 L128 135 L132 165 L124 165 L120 138 L108 120 Z" fill={suitColor} />
            <ellipse cx="72" cy="166" rx="6" ry="2.5" fill={shoeColor} />
            <ellipse cx="128" cy="166" rx="6" ry="2.5" fill={shoeColor} />

            {/* Cellist Torso */}
            <path
              d="M86 85 Q100 80 114 85 L112 122 L88 122 Z"
              fill={isMale ? suitColor : dressColor}
            />
            {renderHead(100, 64, 4)}

            {/* Full-Size Acoustic Cello with Telescoping Endpin */}
            {/* Endpin */}
            <line x1="100" y1="155" x2="100" y2="168" stroke={chromeSilver} strokeWidth="2.5" />
            {/* Cello Body */}
            <path
              d="M90 92 Q82 105 88 120 Q84 135 90 148 Q100 156 110 148 Q116 135 112 120 Q118 105 110 92 Z"
              fill={woodMaple}
              stroke="#5C3516"
              strokeWidth="2"
            />
            {/* C-Bouts & F-Holes */}
            <path d="M94 116 Q91 122 94 128" stroke="#331A08" strokeWidth="2" fill="none" />
            <path d="M106 116 Q109 122 106 128" stroke="#331A08" strokeWidth="2" fill="none" />
            {/* Ebony Fingerboard & Scroll */}
            <line x1="100" y1="68" x2="100" y2="130" stroke={woodEbony} strokeWidth="3.5" />
            <circle cx="100" cy="66" r="3.5" fill={woodMaple} />

            {/* Left Hand on Fingerboard */}
            <path d="M88 88 L94 78 L98 82" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
            <circle cx="99" cy="83" r="2.5" fill={skinTone} />

            {/* Bow & Bowing Right Arm */}
            <g className={isPlaying ? 'animate-cello-bowing' : ''} style={{ transformOrigin: '110px 92px' }}>
              <path d="M112 90 L126 102 L112 118" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
              <circle cx="112" cy="118" r="3" fill={skinTone} />
              {/* Horsehair Cello Bow */}
              <line x1="82" y1="126" x2="135" y2="114" stroke="#EDE8F5" strokeWidth="1.8" />
              <line x1="80" y1="125" x2="137" y2="113" stroke="#5D3A1A" strokeWidth="1.2" />
            </g>
          </g>
        );

      // 10. VIOLIN
      case 'violin':
        return (
          <g transform="translate(15, 20)">
            <g className={isPlaying ? 'animate-violin-sway' : ''}>
              {renderStandingLegs(100, 110)}
              {/* Torso */}
              <path
                d="M84 70 Q100 66 116 70 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 84 L104 70 Z" fill={shirtColor} />

              {/* Head tilted onto violin chinrest */}
              {renderHead(100, 50, -8)}

              {/* Classical Violin Held Under Jaw */}
              <g transform="rotate(-20, 95, 68)">
                <path
                  d="M90 60 Q84 68 88 78 Q83 88 88 98 Q96 102 104 98 Q109 88 104 78 Q108 68 102 60 Z"
                  fill={woodMaple}
                  stroke="#5C3516"
                  strokeWidth="1.5"
                />
                <line x1="96" y1="44" x2="96" y2="88" stroke={woodEbony} strokeWidth="2.5" />
                <circle cx="96" cy="42" r="2.5" fill={woodMaple} />
              </g>

              {/* Left Arm Supporting Violin Fingerboard */}
              <path d="M86 76 L76 72 L82 56" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <circle cx="83" cy="55" r="2.5" fill={skinTone} />

              {/* Right Arm Bowing */}
              <g className={isPlaying ? 'animate-violin-bowing' : ''} style={{ transformOrigin: '114px 76px' }}>
                <path d="M114 76 L124 90 L106 82" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <circle cx="105" cy="82" r="3" fill={skinTone} />
                {/* Horsehair Violin Bow */}
                <line x1="72" y1="74" x2="128" y2="78" stroke="#EDE8F5" strokeWidth="1.8" />
                <line x1="70" y1="73" x2="130" y2="77" stroke="#5D3A1A" strokeWidth="1.2" />
              </g>
            </g>
          </g>
        );

      // 11. ACOUSTIC GUITAR
      case 'acoustic-guitar':
        return (
          <g transform="translate(15, 20)">
            <g className={isPlaying ? 'animate-guitar-rock' : ''}>
              {renderStandingLegs(100, 110)}
              <path
                d="M84 70 Q100 66 116 70 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 84 L104 70 Z" fill={shirtColor} />
              {renderHead(100, 50, 4)}

              {/* Acoustic Dreadnought Guitar on Strap */}
              <path d="M88 74 L126 118" stroke="#333" strokeWidth="2.5" strokeDasharray="3 2" fill="none" />
              <g transform="rotate(-28, 100, 95)">
                {/* Acoustic Body */}
                <path
                  d="M85 75 Q72 88 80 104 Q72 120 84 135 Q100 144 116 135 Q128 120 120 104 Q128 88 115 75 Z"
                  fill="#D49A6A"
                  stroke="#5C3516"
                  strokeWidth="2"
                />
                {/* Soundhole with Rosette */}
                <circle cx="100" cy="98" r="9" fill="#1C140E" stroke="#5C3516" strokeWidth="1.5" />
                {/* Neck & Headstock */}
                <rect x="97" y="32" width="6" height="44" fill={woodMaple} stroke="#442" strokeWidth="0.8" />
                <rect x="96" y="24" width="8" height="10" rx="1" fill="#4A2612" />
                {/* Bridge */}
                <rect x="94" y="120" width="12" height="4" rx="1" fill="#2E1C14" />
              </g>

              {/* Left Hand on Fretboard */}
              <g className={isPlaying ? 'animate-fretting-hand' : ''}>
                <path d="M86 76 L70 82 L64 74" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <circle cx="63" cy="73" r="3" fill={skinTone} />
              </g>

              {/* Right Hand Strumming Soundhole */}
              <g className={isPlaying ? 'animate-strumming-arm' : ''} style={{ transformOrigin: '114px 76px' }}>
                <path d="M114 76 L118 94 L102 96" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <circle cx="101" cy="96" r="3.5" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 12. ELECTRIC GUITAR
      case 'electric-guitar':
        return (
          <g transform="translate(15, 20)">
            <g className={isPlaying ? 'animate-guitar-rock' : ''}>
              {renderStandingLegs(100, 110)}
              <path
                d="M84 70 Q100 66 116 70 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 84 L104 70 Z" fill={shirtColor} />
              {renderHead(100, 50, 6)}

              {/* Electric Guitar Solid Body with Double Cutaway */}
              <path d="M88 74 L126 118" stroke="#333" strokeWidth="2.5" strokeDasharray="3 2" fill="none" />
              <g transform="rotate(-32, 100, 95)">
                <path
                  d="M85 70 L78 85 Q75 95 82 108 Q76 125 90 138 L114 136 Q125 125 118 108 Q125 95 115 85 L108 70 Z"
                  fill={dressAccent}
                  stroke="#1D1828"
                  strokeWidth="2"
                />
                {/* Pickguard & Chrome Pickups */}
                <rect x="94" y="90" width="12" height="4" fill={chromeSilver} stroke="#222" strokeWidth="0.5" />
                <rect x="94" y="98" width="12" height="4" fill={chromeSilver} stroke="#222" strokeWidth="0.5" />
                <line x1="98" y1="28" x2="98" y2="72" stroke={woodEbony} strokeWidth="4.5" />
                <polygon points="96,20 102,18 102,28 96,28" fill="#1D1828" />
              </g>

              {/* Left Hand Fretting */}
              <g className={isPlaying ? 'animate-fretting-hand' : ''}>
                <path d="M86 76 L66 80 L58 70" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <circle cx="57" cy="69" r="3" fill={skinTone} />
              </g>

              {/* Right Hand Picking */}
              <g className={isPlaying ? 'animate-strumming-arm' : ''} style={{ transformOrigin: '114px 76px' }}>
                <path d="M114 76 L122 92 L106 95" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <circle cx="105" cy="95" r="3.5" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 13. BASS GUITAR
      case 'bass':
        return (
          <g transform="translate(15, 20)">
            <g className={isPlaying ? 'animate-guitar-rock' : ''}>
              {renderStandingLegs(100, 110)}
              <path
                d="M84 70 Q100 66 116 70 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 84 L104 70 Z" fill={shirtColor} />
              {renderHead(100, 50, 4)}

              {/* Long-Scale Solid Bass Body */}
              <g transform="rotate(-30, 100, 95)">
                <path
                  d="M82 72 Q74 88 80 105 Q72 125 86 142 L114 140 Q128 125 120 105 Q126 88 112 72 Z"
                  fill="#1C1A24"
                  stroke="#3E384D"
                  strokeWidth="2"
                />
                <rect x="94" y="94" width="12" height="5" fill="#111" stroke="#444" strokeWidth="0.8" />
                <rect x="94" y="104" width="12" height="5" fill="#111" stroke="#444" strokeWidth="0.8" />
                {/* Long Neck & 4 Tuning Pegs */}
                <line x1="98" y1="18" x2="98" y2="74" stroke={woodMaple} strokeWidth="5" />
                <rect x="95" y="10" width="8" height="12" fill="#2E1C14" rx="1.5" />
              </g>

              {/* Left Hand Fretting */}
              <g className={isPlaying ? 'animate-fretting-hand' : ''}>
                <path d="M86 76 L65 78 L54 65" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <circle cx="53" cy="64" r="3" fill={skinTone} />
              </g>

              {/* Right Hand Plucking Fingerstyle */}
              <g className={isPlaying ? 'animate-strumming-arm' : ''} style={{ transformOrigin: '114px 76px' }}>
                <path d="M114 76 L120 92 L104 94" stroke={suitColor} strokeWidth="5.5" strokeLinecap="round" fill="none" />
                <circle cx="103" cy="94" r="3.5" fill={skinTone} />
              </g>
            </g>
          </g>
        );

      // 14. FLUTE
      case 'flute':
        return (
          <g transform="translate(15, 20)">
            <g className={isPlaying ? 'animate-woodwind-sway' : ''}>
              {renderStandingLegs(100, 110)}
              <path
                d="M84 70 Q100 66 116 70 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 84 L104 70 Z" fill={shirtColor} />
              {renderHead(100, 50, 5)}

              {/* Silver Concert Flute Held Horizontally */}
              <line x1="95" y1="56" x2="160" y2="52" stroke={chromeSilver} strokeWidth="3.5" strokeLinecap="round" />
              <circle cx="100" cy="55.8" r="2.2" fill="#888" />
              {/* Flute Tone Keys */}
              {[115, 122, 129, 136, 143].map((kX, idx) => (
                <circle key={`flute-key-${idx}`} cx={kX} cy="53" r="1.5" fill="#444" />
              ))}

              {/* Hands on Keys */}
              <path d="M90 76 L108 68 L116 57" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <circle cx="117" cy="56" r="2.5" fill={skinTone} />
              <path d="M114 76 L130 68 L138 56" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <circle cx="139" cy="55" r="2.5" fill={skinTone} />
            </g>
          </g>
        );

      // 15. SAXOPHONE
      case 'saxophone':
        return (
          <g transform="translate(15, 20)">
            <g className={isPlaying ? 'animate-woodwind-sway' : ''}>
              {renderStandingLegs(100, 110)}
              <path
                d="M84 70 Q100 66 116 70 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 84 L104 70 Z" fill={shirtColor} />
              {renderHead(100, 50, 4)}

              {/* Tenor Saxophone Brass Body with Flared Bell */}
              <path
                d="M102 56 Q108 65 106 82 Q103 105 116 112 Q126 112 128 95"
                stroke={brassGold}
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
              {/* Flared Brass Bell */}
              <ellipse cx="128" cy="92" rx="7" ry="9" fill={brassGold} stroke={darkBrass} strokeWidth="1.5" />
              <circle cx="128" cy="92" r="5" fill="#3D290F" />
              {/* Mouthpiece */}
              <line x1="102" y1="56" x2="100" y2="54" stroke="#111" strokeWidth="2.5" />

              {/* Hands on Sax Keys */}
              <path d="M88 74 L98 76 L104 74" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <circle cx="105" cy="74" r="2.5" fill={skinTone} />
              <path d="M112 74 L114 84 L108 88" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <circle cx="108" cy="89" r="2.5" fill={skinTone} />
            </g>
          </g>
        );

      // 16. TRUMPET
      case 'trumpet':
        return (
          <g transform="translate(15, 20)">
            <g className={isPlaying ? 'animate-horn-bob' : ''}>
              {renderStandingLegs(100, 110)}
              <path
                d="M84 70 Q100 66 116 70 L114 112 L86 112 Z"
                fill={isMale ? suitColor : dressColor}
              />
              <path d="M96 70 L100 84 L104 70 Z" fill={shirtColor} />
              {renderHead(100, 50, -4)}

              {/* Brass Trumpet Held Forward */}
              <g transform="rotate(-8, 102, 54)">
                <line x1="102" y1="54" x2="152" y2="54" stroke={brassGold} strokeWidth="3.5" />
                <line x1="112" y1="57" x2="140" y2="57" stroke={brassGold} strokeWidth="2.5" />
                {/* 3 Piston Valves */}
                <rect x="122" y="47" width="2" height="7" fill={chromeSilver} stroke="#333" strokeWidth="0.5" />
                <rect x="126" y="47" width="2" height="7" fill={chromeSilver} stroke="#333" strokeWidth="0.5" />
                <rect x="130" y="47" width="2" height="7" fill={chromeSilver} stroke="#333" strokeWidth="0.5" />
                {/* Flared Bell */}
                <polygon points="150,54 165,45 165,63" fill={brassGold} stroke={darkBrass} strokeWidth="1.2" />
                <ellipse cx="165" cy="54" rx="2" ry="9" fill={darkBrass} />
              </g>

              {/* Hands holding trumpet */}
              <path d="M88 74 L108 68 L120 58" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <circle cx="121" cy="57" r="2.5" fill={skinTone} />
              <path d="M112 74 L126 66 L128 56" stroke={suitColor} strokeWidth="5" strokeLinecap="round" fill="none" />
              <circle cx="128" cy="55" r="2.5" fill={skinTone} />
            </g>
          </g>
        );

      default:
        return null;
    }
  };

  const def = getInstrumentDefinition(instrument);

  return (
    <div
      className={`relative select-none transition-all duration-200 ${
        isSelected
          ? 'ring-2 ring-[#7567C7] ring-offset-2 ring-offset-black/20 rounded-2xl shadow-xl'
          : isEditing
          ? 'hover:ring-1 hover:ring-[#7567C7]/50 rounded-2xl'
          : ''
      } ${className}`}
      style={{
        width: 170,
        height: 190,
      }}
    >
      {/* Selection subtle indicator when in editor */}
      {isEditing && isSelected && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[#7567C7] text-white text-[10px] font-bold tracking-wider uppercase whitespace-nowrap shadow-md z-30 pointer-events-none flex items-center gap-1">
          <span>{gender === 'female' ? '♀' : '♂'}</span>
          <span>{characterName || def.performerTitle}</span>
        </div>
      )}

      {/* Performer Vector Illustration Canvas */}
      <svg
        viewBox="0 0 200 210"
        className="w-full h-full overflow-visible drop-shadow-md"
      >
        {/* Soft Stage Footlight Ground Shadow */}
        <ellipse cx="100" cy="186" rx="48" ry="10" fill="rgba(0,0,0,0.35)" filter="blur(2px)" />

        {/* Performer & Instrument Art */}
        {renderInstrumentAndPerformer()}
      </svg>
    </div>
  );
};
