import React, { useState } from 'react';
import {
  Sparkles,
  Eye,
  User,
  Palette,
  Layers,
  CheckCircle2,
  ZoomIn,
  Smile,
  Shirt,
  Scissors,
  Ruler,
  Maximize2,
  FileCheck,
  ShieldCheck,
  Compass,
  Box,
  AlertTriangle,
  FileText,
  Star,
} from 'lucide-react';
import { AppTheme } from '../../../types/theme';

interface CharacterDesignSheetProps {
  theme?: AppTheme;
  className?: string;
}

// Master production reference assets for Aria (Cast #01)
// Image 4 is the CANONICAL MASTER REFERENCE.
const MASTER_PRODUCTION_ASSETS = {
  front: '/src/assets/images/aniverse_character_full_front_1790477876315.jpg', // Image 4 (CANONICAL MASTER)
  turnaround: '/src/assets/images/aniverse_character_turnaround_1790478347883.jpg', // Image 1
  costumeBreakdown: '/src/assets/images/aniverse_character_costume_breakdown_1790478367972.jpg', // Image 2
  faceSheet: '/src/assets/images/aniverse_character_face_sheet_1790478385507.jpg', // Image 3
  threeQuarter: '/src/assets/images/aniverse_character_three_quarter_1790477890979.jpg', // Image 5
  faceCloseup: '/src/assets/images/aniverse_character_face_closeup_1790477902714.jpg', // Image 6
};

export const CharacterDesignSheet: React.FC<CharacterDesignSheetProps> = ({
  theme = 'light',
  className = '',
}) => {
  const [activeSheet, setActiveSheet] = useState<
    'front' | 'turnaround' | 'costumeBreakdown' | 'faceSheet' | 'threeQuarter' | 'faceCloseup'
  >('front');
  const [zoomModalImage, setZoomModalImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sheet' | 'master_spec' | 'audit' | 'palette'>('master_spec');

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

  const sheetDescriptions: Record<string, { title: string; subtitle: string; description: string; isMaster?: boolean; tags: string[] }> = {
    front: {
      title: 'Image 4: Master Front View (CANONICAL SOURCE OF TRUTH)',
      subtitle: 'Definitive Reference • All Features Locked from this Image',
      description:
        'The absolute canonical source of truth for AniVerse Character. Every proportion, facial feature, hair ribbon mass, clothing seam, and color is established here.',
      isMaster: true,
      tags: ['CANONICAL MASTER', 'Source of Truth', 'Locked Identity', 'Front A-Pose'],
    },
    turnaround: {
      title: 'Image 1: Full-Body 4-Angle Turnaround Sheet',
      subtitle: 'Front View (A-Pose) • Side Profile • Back View • 3/4 Perspective',
      description:
        'Standard orthographic model sheet showing the character across 4 horizontal angles with height alignment guidelines for 3D modeling.',
      tags: ['Orthographic Turnaround', 'Front / Side / Back / 3/4', 'A-Pose'],
    },
    costumeBreakdown: {
      title: 'Image 2: Costume & Hair Structural Breakdown',
      subtitle: 'Hair Masses • Collar & Bow • Pleated Skirt • Boots & Accessories',
      description:
        'Technical modeling callouts detailing discrete mesh layers: blouse collar, neck ribbon bow, cardigan jacket hem/cuffs, pleated skirt waistband, and footwear.',
      tags: ['Mesh Layers', 'Pleat Counts', 'Cuff Construction', 'Buckle Details'],
    },
    faceSheet: {
      title: 'Image 3: Facial Structure & Head Turnaround',
      subtitle: 'Facial Planes • Eye Specular Map • Profile Angle • Mouth & Chin',
      description:
        'Head orthographics from Front, 3/4, and Side Profile angles. Establishes the soft anime eye geometry, dual star specular highlights, petite button nose, and refined jaw curvature.',
      tags: ['Eye Topology', 'Iris Speculars', 'Nose Bridge Contour', 'Eyelash Planes'],
    },
    threeQuarter: {
      title: 'Image 5: Full-Body 3/4 Perspective View',
      subtitle: 'Spatial Depth • Clothing Drape • Side Silhouette',
      description:
        'Natural three-quarter angle verifying depth, skirt pleating rhythm, hair wave, and collar-to-shoulder transitions in prospective space.',
      tags: ['Depth Check', 'Skirt Drape', 'Shoulder Slope'],
    },
    faceCloseup: {
      title: 'Image 6: High-Definition Face & Expression Macro',
      subtitle: 'Eye Iris Detail • Eyelashes • Subtle Blush • Hair Bang Layers',
      description:
        'Ultra-detailed facial close-up defining the warm amber-hazel irises, subtle cheek blush gradient, soft philtrum, and delicate layered bangs.',
      tags: ['Iris Macro', 'Blush Gradient', 'Bang Silhouette'],
    },
  };

  const currentInfo = sheetDescriptions[activeSheet];

  return (
    <div className={`w-full rounded-3xl overflow-hidden border shadow-xl flex flex-col ${containerBg} ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-[#7567C7]/15 text-[#7567C7] dark:text-[#B9B0F2] border border-[#7567C7]/25 shrink-0">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#25242A] dark:text-[#F4F2F7]">
                AniVerse Character 01: Master Model Specification & Audit
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#7567C7]/15 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20">
                Character • Image 4 is Master
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#9E9AA6]">
              Canonical character reference, structured consistency audit & master specifications
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            <span>Image 4 = Source of Truth</span>
          </span>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: High-Res Master Viewport */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* Main Visual Display */}
          <div
            className={`relative rounded-3xl overflow-hidden border ${cardBg} aspect-[16/11] sm:aspect-[16/10] flex items-center justify-center p-2 sm:p-3 shadow-md group bg-neutral-900/5`}
          >
            <img
              src={MASTER_PRODUCTION_ASSETS[activeSheet]}
              alt={currentInfo.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain rounded-2xl transition-transform duration-300 group-hover:scale-[1.01]"
            />

            {/* Quick Zoom Button */}
            <button
              type="button"
              onClick={() => setZoomModalImage(MASTER_PRODUCTION_ASSETS[activeSheet])}
              className="absolute top-4 right-4 p-2.5 rounded-xl bg-black/60 hover:bg-black/85 text-white backdrop-blur-md transition-all cursor-pointer shadow-lg border border-white/10"
              title="Inspect at full resolution"
            >
              <Maximize2 className="h-4 w-4" />
            </button>

            {/* Active Sheet Badge */}
            <div className="absolute bottom-4 left-4 max-w-[85%] px-3.5 py-2 rounded-2xl bg-black/75 backdrop-blur-md text-white text-xs border border-white/15 shadow-xl space-y-0.5">
              <div className="flex items-center gap-2 font-bold font-mono text-[11px] text-[#C4B9FC]">
                {currentInfo.isMaster ? (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-black text-[9px] uppercase tracking-wider">
                    MASTER
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
                <span className="truncate">{currentInfo.title}</span>
              </div>
              <div className="text-[10px] text-white/80 truncate">
                {currentInfo.subtitle}
              </div>
            </div>
          </div>

          {/* Reference Sheet Selection Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {[
              {
                id: 'front',
                label: 'Image 4 (MASTER)',
                desc: 'Canonical Source of Truth',
                src: MASTER_PRODUCTION_ASSETS.front,
                isMaster: true,
              },
              {
                id: 'turnaround',
                label: 'Image 1 (Turnaround)',
                desc: '4-angle orthographics',
                src: MASTER_PRODUCTION_ASSETS.turnaround,
              },
              {
                id: 'costumeBreakdown',
                label: 'Image 2 (Costume)',
                desc: 'Mesh structural details',
                src: MASTER_PRODUCTION_ASSETS.costumeBreakdown,
              },
              {
                id: 'faceSheet',
                label: 'Image 3 (Facial Sheet)',
                desc: 'Head turns & eye details',
                src: MASTER_PRODUCTION_ASSETS.faceSheet,
              },
              {
                id: 'threeQuarter',
                label: 'Image 5 (3/4 View)',
                desc: 'Spatial perspective',
                src: MASTER_PRODUCTION_ASSETS.threeQuarter,
              },
              {
                id: 'faceCloseup',
                label: 'Image 6 (Face Macro)',
                desc: 'Iris highlights & expression',
                src: MASTER_PRODUCTION_ASSETS.faceCloseup,
              },
            ].map((sheet) => {
              const isCurrent = activeSheet === sheet.id;
              return (
                <button
                  key={sheet.id}
                  type="button"
                  onClick={() => setActiveSheet(sheet.id as any)}
                  className={`p-2 rounded-2xl border text-left transition-all cursor-pointer flex items-center gap-2.5 relative ${
                    isCurrent
                      ? sheet.isMaster
                        ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/40 shadow-xs'
                        : 'bg-[#7567C7]/15 border-[#7567C7] ring-1 ring-[#7567C7]/40 shadow-xs'
                      : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-black/15 opacity-80 hover:opacity-100'
                  }`}
                >
                  <img
                    src={sheet.src}
                    alt={sheet.label}
                    referrerPolicy="no-referrer"
                    className="w-12 h-10 rounded-xl object-cover shrink-0 border border-black/10"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] truncate flex items-center gap-1">
                      <span>{sheet.label}</span>
                    </div>
                    <div className="text-[10px] text-[#77747D] dark:text-[#9E9AA6] truncate">
                      {sheet.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 5 Columns: Tabs for Master Spec, Audit & Guidelines */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* Navigation Tabs */}
          <div className="flex rounded-2xl bg-black/5 dark:bg-white/5 p-1 border border-black/5 dark:border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('master_spec')}
              className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'master_spec'
                  ? 'bg-white dark:bg-[#25242E] text-[#7567C7] dark:text-[#B9B0F2] shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              Master Spec
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-white dark:bg-[#25242E] text-[#7567C7] dark:text-[#B9B0F2] shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              Consistency Audit
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sheet')}
              className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'sheet'
                  ? 'bg-white dark:bg-[#25242E] text-[#7567C7] dark:text-[#B9B0F2] shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              Active Sheet
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('palette')}
              className={`flex-1 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                activeTab === 'palette'
                  ? 'bg-white dark:bg-[#25242E] text-[#7567C7] dark:text-[#B9B0F2] shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              Palette
            </button>
          </div>

          {/* TAB 1: MASTER SPECIFICATION (Derived ONLY from Image 4) */}
          {activeTab === 'master_spec' && (
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1 text-xs">
              <div className={`p-4 rounded-3xl border ${cardBg} space-y-2.5`}>
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                  <div className="flex items-center gap-2 font-bold text-[#25242A] dark:text-white">
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    <span>Master Specification (Image 4 Source)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    Authority Standard
                  </span>
                </div>

                <div className="space-y-3 text-[11px] text-[#524E5B] dark:text-[#D1CCE0] divide-y divide-black/5 dark:divide-white/5">
                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">1. Face</strong>
                    Soft rounded anime cheek contour, small delicate refined chin, subtle jawline curve. Petite button nose with minimal nostrils. Small delicate mouth with gentle relaxed upturn. Light natural cheek blush.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">2. Eyes</strong>
                    Large expressive anime eyes with warm amber-hazel irises. Clean dark upper lash line with delicate corner flick. Dual sparkling star specular highlights. Gentle arched eyebrows sitting just above eye crease.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">3. Hair</strong>
                    Rich dark-brown flowing hair past shoulder blades. Distinctive layered fringe bangs split into 3 primary clusters framing the forehead. Soft cheek-framing side tresses. Small pastel rose hairpin on the right side.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">4. Head Proportions</strong>
                    Slightly oversized anime head relative to torso. Face height-to-width ratio ~1.15. Eyes sit on the lower horizontal third of the cranium. Short distance from nose base to upper lip.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">5. Body Proportions</strong>
                    ~6.8 heads tall anime-game silhouette. Slender graceful shoulders, slim waist, subtle hip curve. Long elegant legs with refined ankle joints. Stylized slender hands and fingers.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">6. Clothing</strong>
                    Crisp cream collared blouse with central placket. Fitted cropped navy cardigan jacket with gold hem piping and tailored wrist cuffs. High-waisted navy layered pleated skirt with gold hem trim.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">7. Shoes & Legwear</strong>
                    Dark navy/black knee-high socks ending just below the patella. Warm brown tailored leather ankle boots with rounded toe box, modest block heel, and gold side buckle straps.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">8. Accessories</strong>
                    Pastel rose-pink neck ribbon bow at collar. Pastel rose floral hairpin in right side hair lock. Restrained gold accent piping on jacket, skirt, and boot buckles.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">9. Colors</strong>
                    Dark Brown (`#2C1D17`), Cream White (`#FAF7F2`), Navy Blue (`#1C233B`), Pastel Rose (`#EBA3B4`), Gold (`#D6A653`), Amber Hazel (`#B87B4C`).
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">10. Personality & Presence</strong>
                    Youthful, elegant, refined, and approachable. Radiates calm musical intelligence and charm even in neutral rest pose.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">11. Silhouette</strong>
                    Distinctive A-line silhouette formed by layered hair flow, cropped jacket waistline, pleated skirt flare, and long slender leg contours.
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">12. Anime Style</strong>
                    Modern Japanese rhythm/adventure anime-game aesthetic (clean line art, cel-shading gradients, distinct anime features, no realism or chibi drift).
                  </div>

                  <div className="pt-2">
                    <strong className="text-[#25242A] dark:text-white block font-bold text-xs mb-0.5">13. Important Identifying Features</strong>
                    Amber-hazel eye stars + 3-cluster layered bangs + pastel rose ribbon bow + cropped navy gold-trim jacket + high-waist pleated skirt.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONSISTENCY AUDIT (All images vs Image 4) */}
          {activeTab === 'audit' && (
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1 text-xs">
              {/* Image 4 Master Badge */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2.5">
                <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                <div>
                  <div className="font-bold text-amber-700 dark:text-amber-400 text-xs">
                    IMAGE 4 (MASTER REFERENCE)
                  </div>
                  <div className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                    MASTER — 100% Source of Truth. No corrections applied.
                  </div>
                </div>
              </div>

              {/* Image 1 Audit */}
              <div className={`p-4 rounded-3xl border ${cardBg} space-y-2`}>
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                  <span className="font-bold text-[#25242A] dark:text-white">IMAGE 1 (Turnaround Sheet) vs IMAGE 4</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">Turnaround</span>
                </div>
                <div className="space-y-1 text-[11px] text-[#524E5B] dark:text-[#D1CCE0]">
                  <div><strong className="text-emerald-600 dark:text-emerald-400">Matches:</strong> Overall body height, color palette, costume layers (blouse, navy jacket, skirt), eye color, and general hairstyle length.</div>
                  <div><strong className="text-amber-600 dark:text-amber-400">Inconsistent:</strong> Side view nose bridge slightly sharper than Image 4's petite curve; back view hair mass rendered slightly denser than Image 4 front volume.</div>
                  <div><strong className="text-[#7567C7] dark:text-[#A294EE]">Required correction:</strong> Align side profile nose projection and back hair strand taper directly to Image 4's softer anime contour.</div>
                </div>
              </div>

              {/* Image 2 Audit */}
              <div className={`p-4 rounded-3xl border ${cardBg} space-y-2`}>
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                  <span className="font-bold text-[#25242A] dark:text-white">IMAGE 2 (Costume Breakdown) vs IMAGE 4</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">Costume Detail</span>
                </div>
                <div className="space-y-1 text-[11px] text-[#524E5B] dark:text-[#D1CCE0]">
                  <div><strong className="text-emerald-600 dark:text-emerald-400">Matches:</strong> Cream blouse collar structure, rose neck ribbon bow, gold trim on jacket hem, pleated skirt accordion geometry, boot buckle layout.</div>
                  <div><strong className="text-amber-600 dark:text-amber-400">Inconsistent:</strong> Seam line callouts add micro-creases not present in Image 4's clean anime cel finish.</div>
                  <div><strong className="text-[#7567C7] dark:text-[#A294EE]">Required correction:</strong> Maintain Image 4's clean, un-cluttered anime surface aesthetic during 3D texture mapping.</div>
                </div>
              </div>

              {/* Image 3 Audit */}
              <div className={`p-4 rounded-3xl border ${cardBg} space-y-2`}>
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                  <span className="font-bold text-[#25242A] dark:text-white">IMAGE 3 (Facial Sheet) vs IMAGE 4</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">Head Turns</span>
                </div>
                <div className="space-y-1 text-[11px] text-[#524E5B] dark:text-[#D1CCE0]">
                  <div><strong className="text-emerald-600 dark:text-emerald-400">Matches:</strong> Amber-hazel eye irises, dual specular highlights, soft cheek curves, eyelash wing shape, dark-brown bangs geometry.</div>
                  <div><strong className="text-amber-600 dark:text-amber-400">Inconsistent:</strong> Eyebrow position in 3/4 turn sits ~2% higher relative to eye socket than in Image 4.</div>
                  <div><strong className="text-[#7567C7] dark:text-[#A294EE]">Required correction:</strong> Lock eyebrow spacing and resting height to Image 4 neutral calibration.</div>
                </div>
              </div>

              {/* Image 5 Audit */}
              <div className={`p-4 rounded-3xl border ${cardBg} space-y-2`}>
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                  <span className="font-bold text-[#25242A] dark:text-white">IMAGE 5 (3/4 Perspective) vs IMAGE 4</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">Perspective</span>
                </div>
                <div className="space-y-1 text-[11px] text-[#524E5B] dark:text-[#D1CCE0]">
                  <div><strong className="text-emerald-600 dark:text-emerald-400">Matches:</strong> Facial identity, hair tress flow, rose hairpin, jacket crop line, skirt flare, boot buckles, and eye sparkle.</div>
                  <div><strong className="text-amber-600 dark:text-amber-400">Inconsistent:</strong> Skirt length appears ~3% shorter due to perspective tilt compared to Image 4's mid-thigh front baseline.</div>
                  <div><strong className="text-[#7567C7] dark:text-[#A294EE]">Required correction:</strong> Enforce Image 4's true vertical skirt hem length for all orthographic 3D modeling.</div>
                </div>
              </div>

              {/* Image 6 Audit */}
              <div className={`p-4 rounded-3xl border ${cardBg} space-y-2`}>
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/10 pb-2">
                  <span className="font-bold text-[#25242A] dark:text-white">IMAGE 6 (Face Macro) vs IMAGE 4</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">Macro Closeup</span>
                </div>
                <div className="space-y-1 text-[11px] text-[#524E5B] dark:text-[#D1CCE0]">
                  <div><strong className="text-emerald-600 dark:text-emerald-400">Matches:</strong> Perfect 1:1 facial identity, identical amber-hazel iris layers, eyelash contours, philtrum softness, and hair bang split.</div>
                  <div><strong className="text-amber-600 dark:text-amber-400">Inconsistent:</strong> Close crop obscures full hair volume and torso proportions.</div>
                  <div><strong className="text-[#7567C7] dark:text-[#A294EE]">Required correction:</strong> Use solely for facial/eye texture detail while deferring all body geometry to Image 4.</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVE SHEET INFO */}
          {activeTab === 'sheet' && (
            <div className="space-y-4">
              <div className={`p-4 sm:p-5 rounded-3xl border ${cardBg} space-y-3`}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7567C7] dark:text-[#A294EE]">
                  <FileCheck className="h-4 w-4" />
                  <span>Sheet Overview</span>
                </div>
                <h3 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  {currentInfo.title}
                </h3>
                <p className="text-xs text-[#524E5B] dark:text-[#D1CCE0] leading-relaxed">
                  {currentInfo.description}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {currentInfo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-[#7567C7]/10 text-[#7567C7] dark:text-[#A294EE] border border-[#7567C7]/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LOCKED PALETTE */}
          {activeTab === 'palette' && (
            <div className="space-y-4">
              <div className={`p-4 sm:p-5 rounded-3xl border ${cardBg} space-y-3`}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7567C7] dark:text-[#A294EE]">
                  <Palette className="h-4 w-4" />
                  <span>Image 4 Master Palette Swatches</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                  <div className="p-2.5 rounded-2xl bg-[#2C1D17] text-white space-y-1">
                    <div className="h-6 rounded-lg bg-[#3A241B] border border-white/20" />
                    <div className="font-bold">Dark Brown (#2C1D17)</div>
                    <div className="text-[10px] text-white/70">Flowing Hair</div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-[#FAF7F2] text-[#25242A] border border-black/10 space-y-1">
                    <div className="h-6 rounded-lg bg-[#FFFDF8] border border-black/10" />
                    <div className="font-bold">Cream White (#FAF7F2)</div>
                    <div className="text-[10px] text-[#77747D]">Blouse & Cuffs</div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-[#1C233B] text-white space-y-1">
                    <div className="h-6 rounded-lg bg-[#273256] border border-white/20" />
                    <div className="font-bold">Navy Blue (#1C233B)</div>
                    <div className="text-[10px] text-white/70">Jacket & Pleated Skirt</div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-[#F6DCE2] text-[#7A2B3E] border border-black/10 space-y-1">
                    <div className="h-6 rounded-lg bg-[#EBA3B4]" />
                    <div className="font-bold">Pastel Rose (#EBA3B4)</div>
                    <div className="text-[10px] text-[#7A2B3E]/80">Neck Ribbon & Hair Clip</div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-[#D6A653] text-[#3D2C0C] space-y-1">
                    <div className="h-6 rounded-lg bg-[#E8BC67]" />
                    <div className="font-bold">Gold Accent (#D6A653)</div>
                    <div className="text-[10px] text-[#3D2C0C]/80">Hem Trim & Buckles</div>
                  </div>

                  <div className="p-2.5 rounded-2xl bg-[#B87B4C] text-white space-y-1">
                    <div className="h-6 rounded-lg bg-[#C68858] border border-white/20" />
                    <div className="font-bold">Amber Hazel (#B87B4C)</div>
                    <div className="text-[10px] text-white/70">Eyes & Leather Boots</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal */}
      {zoomModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setZoomModalImage(null)}
        >
          <div className="relative max-w-5xl max-h-[92vh] flex flex-col items-center">
            <img
              src={zoomModalImage}
              alt="High Resolution Master Reference"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
            <div className="flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white text-xs font-mono">
              <span>Click anywhere to dismiss lightbox</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
