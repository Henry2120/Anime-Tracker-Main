import React, { useState } from 'react';
import {
  Sparkles,
  Eye,
  User,
  Palette,
  Layers,
  Heart,
  CheckCircle2,
  ZoomIn,
  Smile,
  Shirt,
  Scissors,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';

interface CharacterDesignSheetProps {
  theme?: AppTheme;
  className?: string;
}

// Generated high-resolution character design reference assets
const CHARACTER_ASSETS = {
  front: '/src/assets/images/aniverse_character_full_front_1790477876315.jpg',
  threeQuarter: '/src/assets/images/aniverse_character_three_quarter_1790477890979.jpg',
  faceCloseup: '/src/assets/images/aniverse_character_face_closeup_1790477902714.jpg',
};

export const CharacterDesignSheet: React.FC<CharacterDesignSheetProps> = ({
  theme = 'light',
  className = '',
}) => {
  const [activeView, setActiveView] = useState<'front' | 'threeQuarter' | 'faceCloseup'>('front');
  const [zoomModalImage, setZoomModalImage] = useState<string | null>(null);

  const isDark = theme === 'dark';
  const isSakura = theme === 'sakura';

  const containerBg = isDark
    ? 'bg-[#14121C] border-[#2E2C37]'
    : isSakura
    ? 'bg-[#FDF6F8] border-[#F2D6DC]'
    : 'bg-[#F8F6F2] border-[#E7E3DF]';

  const cardBg = isDark
    ? 'bg-[#1C1929] border-[#2E2C37]'
    : isSakura
    ? 'bg-white border-[#F2D6DC]'
    : 'bg-white border-[#E7E3DF]';

  return (
    <div className={`w-full rounded-3xl overflow-hidden border shadow-xl flex flex-col ${containerBg} ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border border-[#7567C7]/25 shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#25242A] dark:text-[#F4F2F7]">
                AniVerse Character Design Sheet
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20">
                Heroine #01: Aria (アリア)
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#9E9AA6]">
              Official visual direction & art-design reference for the AniVerse character universe
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Design Locked</span>
          </span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Primary Character Viewport (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* Main Visual Display */}
          <div className={`relative rounded-3xl overflow-hidden border ${cardBg} aspect-[3/4] max-h-[560px] flex items-center justify-center p-3 shadow-sm group`}>
            <img
              src={CHARACTER_ASSETS[activeView]}
              alt={`Aria Character Design - ${activeView}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain rounded-2xl transition-transform duration-300 group-hover:scale-[1.01]"
            />

            {/* Quick Zoom Button */}
            <button
              type="button"
              onClick={() => setZoomModalImage(CHARACTER_ASSETS[activeView])}
              className="absolute top-5 right-5 p-2 rounded-xl bg-black/50 hover:bg-black/75 text-white backdrop-blur-md transition-all cursor-pointer shadow-md"
              title="Expand high-resolution view"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            {/* Current View Label */}
            <div className="absolute bottom-5 left-5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white text-xs font-bold font-mono border border-white/10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#A294EE] animate-pulse" />
              <span>
                {activeView === 'front'
                  ? '01. FULL-BODY FRONT VIEW'
                  : activeView === 'threeQuarter'
                  ? '02. FULL-BODY 3/4 VIEW'
                  : '03. FACE & EYE CLOSE-UP'}
              </span>
            </div>
          </div>

          {/* View Selection Thumbnails */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'front', label: '1. Front View', desc: 'Neutral standing pose', src: CHARACTER_ASSETS.front },
              { id: 'threeQuarter', label: '2. 3/4 Angle', desc: 'Graceful perspective', src: CHARACTER_ASSETS.threeQuarter },
              { id: 'faceCloseup', label: '3. Face Close-Up', desc: 'Eyes, expression & hair', src: CHARACTER_ASSETS.faceCloseup },
            ].map((tab) => {
              const isCurrent = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveView(tab.id as any)}
                  className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                    isCurrent
                      ? 'bg-[#7567C7]/15 border-[#7567C7] ring-1 ring-[#7567C7]/40 shadow-xs'
                      : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-black/15 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={tab.src}
                    alt={tab.label}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover shrink-0 border border-black/10"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] truncate">
                      {tab.label}
                    </div>
                    <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] truncate">
                      {tab.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Character Design Analysis & Specifications (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* Identity & Personality Card */}
          <div className={`p-5 rounded-3xl border ${cardBg} space-y-3`}>
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-2">
                  <User className="h-4 w-4 text-[#7567C7]" />
                  <span>Aria (アリア)</span>
                </h3>
                <span className="text-[11px] text-[#77747D] dark:text-[#9E9AA6]">
                  Kind • Graceful • Lively • Approachable
                </span>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A294EE]">
                Heroine Archetype
              </span>
            </div>

            <p className="text-xs text-[#524E5B] dark:text-[#D1CCE0] leading-relaxed">
              Designed strictly within the aesthetic conventions of modern Japanese anime games. She combines youthful charm with refined posture, presenting a warm and memorable presence even in a neutral resting pose.
            </p>
          </div>

          {/* Design Breakdown Pillars */}
          <div className={`p-5 rounded-3xl border ${cardBg} space-y-4`}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6] flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Design Pillars & Stylization Analysis</span>
            </h4>

            <div className="space-y-3 text-xs">
              {/* Pillar 1: Face */}
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-500 shrink-0 mt-0.5">
                  <Smile className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    1. Face & Eyes (Highest Priority)
                  </div>
                  <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] mt-0.5">
                    Large expressive anime eyes with sparkling amber-hazel irises, delicate eyelashes, petite button nose, soft rounded chin, and natural cheek blush.
                  </p>
                </div>
              </div>

              {/* Pillar 2: Hair */}
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 shrink-0 mt-0.5">
                  <Scissors className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    2. Flowing Dark-Brown Hairstyle
                  </div>
                  <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] mt-0.5">
                    Layered fringe bangs with clear primary shapes, soft side tresses framing the cheeks, natural cascading volume, and a small pastel rose hairpin.
                  </p>
                </div>
              </div>

              {/* Pillar 3: Body */}
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    3. Stylized Anime Proportions
                  </div>
                  <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] mt-0.5">
                    ~6.8 heads tall anime silhouette. Long elegant legs, narrow waist, slim shoulders, and stylized hands avoiding realistic fashion-model anatomy.
                  </p>
                </div>
              </div>

              {/* Pillar 4: Clothing */}
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
                  <Shirt className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    4. Fantasy-Academy Ensemble
                  </div>
                  <p className="text-[11px] text-[#77747D] dark:text-[#9E9AA6] mt-0.5">
                    Cream collared blouse, pastel rose neck ribbon bow, cropped navy cardigan jacket, layered navy pleated skirt with gold hem, dark knee-high socks, and buckle ankle boots.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Color Palette Card */}
          <div className={`p-4 rounded-3xl border ${cardBg} space-y-2.5`}>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#77747D] dark:text-[#9E9AA6] flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-[#7567C7]" />
              <span>Cohesive Anime Color Palette</span>
            </h4>

            <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
              <div className="p-2 rounded-xl bg-[#2D1F18] text-white font-mono space-y-1">
                <div className="w-full h-4 rounded-md bg-[#3E271D]" />
                <span className="font-bold">Dark Brown</span>
                <span className="block opacity-75">Hair</span>
              </div>
              <div className="p-2 rounded-xl bg-[#FAF6F0] text-[#25242A] font-mono border border-black/10 space-y-1">
                <div className="w-full h-4 rounded-md bg-[#FFFDF9]" />
                <span className="font-bold">Cream</span>
                <span className="block opacity-75">Blouse</span>
              </div>
              <div className="p-2 rounded-xl bg-[#1E2540] text-white font-mono space-y-1">
                <div className="w-full h-4 rounded-md bg-[#253055]" />
                <span className="font-bold">Navy Blue</span>
                <span className="block opacity-75">Skirt / Coat</span>
              </div>
              <div className="p-2 rounded-xl bg-[#F8DCE2] text-[#8C2C45] font-mono space-y-1">
                <div className="w-full h-4 rounded-md bg-[#ECA1B2]" />
                <span className="font-bold">Pastel Rose</span>
                <span className="block opacity-75">Ribbon Bow</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* High-Res Image Zoom Modal */}
      {zoomModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomModalImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img
              src={zoomModalImage}
              alt="High Resolution Character View"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
            <span className="text-white/80 text-xs font-mono mt-3">
              Click anywhere to close full view
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
