import React, { useState } from 'react';
import {
  ArrowLeft,
  Music2,
  Sparkles,
  Youtube,
  Radio,
  Sliders,
  Compass,
  Play,
  Volume2,
  Disc3,
  Waves,
  Layers,
  Sparkle,
} from 'lucide-react';
import { WorldSwitcher, AppMode } from '../WorldSwitcher';
import { AppearanceSelector } from '../AppearanceSelector';
import { MalUser } from '../../types';

interface MusicLabViewProps {
  onReturnToAnime: () => void;
  onSelectMode: (mode: AppMode) => void;
  malUser: MalUser | null;
  theme?: string;
  onThemeChange?: (theme: any) => void;
}

type StageAmbiance = 'twilight' | 'ember' | 'cyber';

export const MusicLabView: React.FC<MusicLabViewProps> = ({
  onReturnToAnime,
  onSelectMode,
  malUser,
  theme = 'light',
  onThemeChange,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [activeAmbiance, setActiveAmbiance] = useState<StageAmbiance>('twilight');
  const [isStageFocused, setIsStageFocused] = useState(false);

  // Ambiance color presets
  const ambianceStyles = {
    twilight: {
      name: 'Twilight Reverie',
      subtitle: 'Deep indigo, starlight violet & lilac glow',
      gradient: 'from-[#120D26] via-[#1B1438] to-[#0A0716]',
      spotlightLeft: 'rgba(139, 92, 246, 0.25)',
      spotlightRight: 'rgba(236, 72, 153, 0.25)',
      accentColor: '#A78BFA',
      borderColor: 'border-purple-500/20',
      pillBg: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
      beamColor: 'from-purple-500/30 via-violet-500/10 to-transparent',
    },
    ember: {
      name: 'Acoustic Ember',
      subtitle: 'Warm amber, sunset gold & intimate recital',
      gradient: 'from-[#24130A] via-[#331A0F] to-[#0D0704]',
      spotlightLeft: 'rgba(245, 158, 11, 0.25)',
      spotlightRight: 'rgba(239, 68, 68, 0.25)',
      accentColor: '#FBBF24',
      borderColor: 'border-amber-500/20',
      pillBg: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      beamColor: 'from-amber-500/30 via-orange-500/10 to-transparent',
    },
    cyber: {
      name: 'Neon Cyber',
      subtitle: 'Electric cyan, magenta pulse & synthesizer vibe',
      gradient: 'from-[#081826] via-[#0E243A] to-[#040C14]',
      spotlightLeft: 'rgba(6, 182, 212, 0.25)',
      spotlightRight: 'rgba(217, 70, 239, 0.25)',
      accentColor: '#22D3EE',
      borderColor: 'border-cyan-500/20',
      pillBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
      beamColor: 'from-cyan-500/30 via-teal-500/10 to-transparent',
    },
  };

  const currentTheme = ambianceStyles[activeAmbiance];

  return (
    <div className="min-h-screen w-full bg-[#09080F] text-[#EDEAF5] flex flex-col font-sans selection:bg-[#EC4899]/30 selection:text-white relative overflow-x-hidden">
      {/* Dynamic Background Noise / Aurora Ambient Gradients */}
      <div
        className={`fixed inset-0 bg-gradient-to-b ${currentTheme.gradient} transition-colors duration-1000 pointer-events-none`}
        aria-hidden="true"
      />

      {/* Subtle Glowing Aurora Orbs */}
      <div
        className="fixed top-[-10%] left-[20%] w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none transition-all duration-1000 opacity-40 animate-pulse"
        style={{
          background:
            activeAmbiance === 'twilight'
              ? 'radial-gradient(circle, #7C3AED 0%, #DB2777 60%, transparent 80%)'
              : activeAmbiance === 'ember'
              ? 'radial-gradient(circle, #D97706 0%, #DC2626 60%, transparent 80%)'
              : 'radial-gradient(circle, #0891B2 0%, #9333EA 60%, transparent 80%)',
          animationDuration: '8s',
        }}
        aria-hidden="true"
      />

      {/* =========================================================================
          MUSIC LAB MINIMAL HEADER
          ========================================================================= */}
      <header className="w-full sticky top-0 z-50 bg-[#09080F]/80 backdrop-blur-xl border-b border-white/10 px-4 sm:px-8 py-3.5 transition-all duration-200">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-4">
          {/* Back to AniVerse Action */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="return-to-aniverse-btn"
              onClick={onReturnToAnime}
              title="Return to Anime Tracker (My Season, My List, Calendar)"
              className="group flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 hover:border-white/25 text-[#E4E1F0] hover:text-white transition-all duration-200 cursor-pointer text-xs sm:text-sm font-semibold shadow-sm"
            >
              <ArrowLeft className="h-4 w-4 text-[#A78BFA] transition-transform duration-200 group-hover:-translate-x-1" />
              <span>← AniVerse</span>
              <span className="hidden md:inline-block text-[10px] text-white/50 font-normal ml-1">
                (Anime Tracker)
              </span>
            </button>

            {/* Quick World Switcher Dropdown */}
            <WorldSwitcher
              currentMode="music"
              onSelectMode={onSelectMode}
              variant="music-header"
            />
          </div>

          {/* Center / Right Branding & Controls */}
          <div className="flex items-center gap-2.5 sm:gap-4">
            {/* Stage Ambiance Quick Selector */}
            <div className="hidden sm:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setActiveAmbiance('twilight')}
                title="Twilight Reverie (Violet / Pink)"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  activeAmbiance === 'twilight'
                    ? 'bg-purple-600/60 text-white shadow-xs'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                🌌 Twilight
              </button>
              <button
                type="button"
                onClick={() => setActiveAmbiance('ember')}
                title="Acoustic Ember (Amber / Sunset)"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  activeAmbiance === 'ember'
                    ? 'bg-amber-600/60 text-white shadow-xs'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                🌅 Ember
              </button>
              <button
                type="button"
                onClick={() => setActiveAmbiance('cyber')}
                title="Neon Cyber (Cyan / Synth)"
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  activeAmbiance === 'cyber'
                    ? 'bg-cyan-600/60 text-white shadow-xs'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                ⚡ Cyber
              </button>
            </div>

            {/* Status Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#EC4899]/20 to-[#8B5CF6]/20 border border-[#EC4899]/30 text-[#F472B6] text-[11px] font-bold tracking-wide">
              <Sparkles className="h-3 w-3 animate-spin" style={{ animationDuration: '4s' }} />
              <span className="hidden xs:inline">Experimental</span>
              <span>v0.1</span>
            </div>

            {/* Appearance Selector if available */}
            {onThemeChange && (
              <AppearanceSelector
                currentTheme={theme as any}
                onThemeChange={onThemeChange}
              />
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          MAIN MUSIC LAB CANVAS
          ========================================================================= */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-12 z-10 flex flex-col items-center">
        {/* HERO SECTION */}
        <section className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 relative animate-in fade-in slide-in-from-bottom-3 duration-500">
          {/* Floating Glowing Icon */}
          <div className="relative inline-flex items-center justify-center mb-6">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#EC4899] to-[#8B5CF6] rounded-3xl blur-xl opacity-60 animate-pulse" />
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-b from-[#1C1733] to-[#0F0B1E] border border-white/20 flex items-center justify-center shadow-2xl">
              <Music2 className="h-8 w-8 sm:h-10 sm:w-10 text-[#F472B6]" />
            </div>
            <div className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-[#EC4899] text-[10px] font-black tracking-widest text-white shadow-lg uppercase">
              LAB
            </div>
          </div>

          {/* Heading with subtle Japanese aesthetic typography */}
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-3 flex items-center justify-center gap-3">
            <span>MUSIC LAB</span>
          </h1>

          <p className="text-sm sm:text-base font-semibold text-[#A78BFA] tracking-widest uppercase mb-4">
            Let music come alive.
          </p>

          <p className="text-sm sm:text-base text-white/70 max-w-xl mx-auto leading-relaxed font-normal">
            Paste a music video and AniVerse will eventually turn it into an
            atmospheric visual performance, dynamic lighting stage, and anime concert scene.
          </p>
        </section>

        {/* INPUT SECTION (COMING SOON STATE) */}
        <section className="w-full max-w-2xl mx-auto mb-12 sm:mb-16 animate-in fade-in slide-in-from-bottom-4 duration-600">
          <div className="p-1.5 sm:p-2 rounded-2xl sm:rounded-3xl bg-white/[0.04] backdrop-blur-xl border border-white/15 shadow-2xl relative overflow-hidden group">
            {/* Ambient edge glow */}
            <div className="absolute -inset-px bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-cyan-500/20 rounded-3xl opacity-50 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            <div className="relative flex flex-col sm:flex-row items-center gap-2 p-2">
              <div className="relative flex-1 w-full flex items-center">
                <div className="absolute left-3.5 text-white/40 pointer-events-none">
                  <Youtube className="h-5 w-5" />
                </div>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Paste YouTube music video URL (e.g. YOASOBI - Idol)..."
                  disabled
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-black/40 border border-white/10 text-white/50 text-xs sm:text-sm placeholder-white/30 cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-purple-500/50 transition-all font-mono"
                />
                <div className="absolute right-3 hidden sm:block">
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-white/60 text-[10px] font-semibold tracking-wider uppercase border border-white/10">
                    Engine Coming Soon
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled
                className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-gradient-to-r from-[#8B5CF6]/50 to-[#EC4899]/50 text-white/60 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed border border-white/10 shrink-0 shadow-sm"
              >
                <Play className="h-4 w-4" />
                <span>Explore Soundstage</span>
              </button>
            </div>

            {/* Subtle notice banner below input */}
            <div className="px-4 py-2.5 mt-1 border-t border-white/5 flex items-center justify-between text-[11px] text-white/50">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EC4899] animate-pulse" />
                <span>Audio extraction, beat analysis, and scene generation under active development</span>
              </div>
              <span className="hidden sm:inline text-white/40">Preview Stage Below ↓</span>
            </div>
          </div>
        </section>

        {/* =========================================================================
            ATMOSPHERIC VISUAL SOUNDSTAGE PREVIEW
            ========================================================================= */}
        <section className="w-full max-w-5xl mx-auto mb-14">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[#EC4899]" />
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                VISUAL SCENE PREVIEW
              </h2>
              <span className="text-[11px] font-medium text-white/40">
                — {currentTheme.name}
              </span>
            </div>

            {/* Mobile Ambiance buttons */}
            <div className="flex sm:hidden items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveAmbiance('twilight')}
                className={`p-1.5 rounded-lg text-xs ${
                  activeAmbiance === 'twilight' ? 'bg-purple-600 text-white' : 'text-white/50'
                }`}
              >
                🌌
              </button>
              <button
                type="button"
                onClick={() => setActiveAmbiance('ember')}
                className={`p-1.5 rounded-lg text-xs ${
                  activeAmbiance === 'ember' ? 'bg-amber-600 text-white' : 'text-white/50'
                }`}
              >
                🌅
              </button>
              <button
                type="button"
                onClick={() => setActiveAmbiance('cyber')}
                className={`p-1.5 rounded-lg text-xs ${
                  activeAmbiance === 'cyber' ? 'bg-cyan-600 text-white' : 'text-white/50'
                }`}
              >
                ⚡
              </button>
            </div>
          </div>

          {/* Cinematic Soundstage Box */}
          <div
            className={`relative w-full aspect-[16/9] max-h-[520px] rounded-3xl overflow-hidden border ${currentTheme.borderColor} shadow-2xl bg-[#06040A] flex flex-col justify-between p-6 sm:p-10 transition-all duration-700`}
            style={{
              boxShadow: `0 20px 60px -15px ${currentTheme.spotlightLeft}`,
            }}
          >
            {/* Top Stage Spotlights (Subtle gentle swaying lighting cones) */}
            <div
              className={`absolute -top-10 left-[15%] w-48 sm:w-80 h-96 bg-gradient-to-b ${currentTheme.beamColor} transform -rotate-12 blur-2xl opacity-60 pointer-events-none transition-all duration-1000`}
              style={{
                transformOrigin: 'top center',
              }}
            />
            <div
              className={`absolute -top-10 right-[15%] w-48 sm:w-80 h-96 bg-gradient-to-b ${currentTheme.beamColor} transform rotate-12 blur-2xl opacity-60 pointer-events-none transition-all duration-1000`}
              style={{
                transformOrigin: 'top center',
              }}
            />

            {/* Atmospheric Floating Audio Particles (CSS Only, GPU-accelerated) */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div
                className="absolute top-1/4 left-1/4 w-1.5 h-1.5 rounded-full bg-white/70 blur-[0.5px] animate-ping"
                style={{ animationDuration: '3s' }}
              />
              <div
                className="absolute top-1/3 right-1/3 w-2 h-2 rounded-full bg-purple-300/80 blur-[0.5px] animate-pulse"
                style={{ animationDuration: '4s' }}
              />
              <div
                className="absolute top-1/2 left-1/3 w-1 h-1 rounded-full bg-pink-300/80 blur-[0.5px] animate-ping"
                style={{ animationDuration: '5s' }}
              />
              <div
                className="absolute top-2/3 right-1/4 w-1.5 h-1.5 rounded-full bg-cyan-300/80 blur-[0.5px] animate-pulse"
                style={{ animationDuration: '3.5s' }}
              />
            </div>

            {/* Top Stage Bar: Track & State Info */}
            <div className="relative z-10 flex items-center justify-between text-xs text-white/70">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono uppercase tracking-widest text-[11px] text-white/90">
                  Soundstage Canvas • Ready
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                <Waves className="h-3.5 w-3.5 text-[#EC4899]" />
                <span>Ambient Resonance: 432 Hz</span>
              </div>
            </div>

            {/* Center Stage: Stylized Visualizer Waves & Silhouetted Performance Motif */}
            <div className="relative z-10 flex flex-col items-center justify-center my-auto text-center">
              {/* Pulsing Visual Waveform Bars */}
              <div className="flex items-end justify-center gap-1.5 sm:gap-2 h-20 sm:h-28 mb-4">
                {[40, 65, 30, 85, 95, 60, 100, 75, 45, 90, 80, 55, 70, 35, 60, 85, 50, 75, 40].map(
                  (height, i) => (
                    <div
                      key={i}
                      className="w-1 sm:w-1.5 rounded-full transition-all duration-500"
                      style={{
                        height: `${height}%`,
                        background: `linear-gradient(to top, rgba(236,72,153,0.2), ${currentTheme.accentColor})`,
                        opacity: 0.6 + (i % 3) * 0.15,
                        animation: `pulse ${1.2 + (i % 5) * 0.3}s ease-in-out infinite alternate`,
                      }}
                    />
                  )
                )}
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-white text-xs font-semibold shadow-lg mb-2">
                <Disc3 className="h-3.5 w-3.5 text-[#F472B6] animate-spin" style={{ animationDuration: '6s' }} />
                <span>"Music is about to become a performance."</span>
              </div>
              <p className="text-xs text-white/50 max-w-md">
                Every chord, instrument track, and tempo change will orchestrate dynamic backgrounds, lighting cues, and anime scenes.
              </p>
            </div>

            {/* Bottom Stage Deck: Stage Floor Grid & Perspective Silhouette */}
            <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/60">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-white/40" />
                <span className="text-[11px] font-mono">Preset: {currentTheme.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/40 hidden sm:inline">
                  Interactive CSS Ambiance
                </span>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${currentTheme.pillBg}`}>
                  Live Preview
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            FEATURE ARCHITECTURE / ROADMAP BLUEPRINT
            ========================================================================= */}
        <section className="w-full max-w-5xl mx-auto mb-16">
          <div className="text-center mb-8">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-[#A78BFA] mb-1">
              Architecture Blueprint
            </h3>
            <p className="text-lg sm:text-xl font-bold text-white">
              What Music Lab is building next
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1 */}
            <div className="p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3.5">
                <Waves className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">
                Multi-Stem Audio Separation
              </h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Extract vocals, piano, bass, guitar, and drums individually to drive dedicated instrument visualizers.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center text-pink-400 mb-3.5">
                <Sparkles className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">
                Atmospheric Scene Painter
              </h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Translate melody mood, energy curves, and lyrics into evocative anime scenery and concert lighting.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3.5">
                <Disc3 className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">
                Real-Time Beat Sync
              </h4>
              <p className="text-xs text-white/60 leading-relaxed">
                Synchronize camera pans, particle velocities, and spotlight strobes to the rhythm and crescendo.
              </p>
            </div>
          </div>
        </section>

        {/* BOTTOM RETURN BAR */}
        <div className="w-full max-w-xl mx-auto text-center pt-6 border-t border-white/10">
          <p className="text-xs text-white/50 mb-3">
            Ready to track your seasonal anime, releases, and watch list?
          </p>
          <button
            type="button"
            onClick={onReturnToAnime}
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-bold transition-all cursor-pointer inline-flex items-center gap-2 border border-white/15 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4 text-[#A78BFA]" />
            <span>Return to Anime Tracker</span>
          </button>
        </div>
      </main>
    </div>
  );
};

export default MusicLabView;
