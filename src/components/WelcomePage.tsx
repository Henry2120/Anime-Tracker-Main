import React from 'react';
import { motion } from 'motion/react';
import {
  ExternalLink,
  Sparkles,
  CalendarDays,
  Tv,
  BarChart3,
  Sun,
  PlayCircle,
  CheckCircle2,
  ChevronDown,
  ArrowRight,
  Star,
} from 'lucide-react';
import { JikanSeasonalAnime } from '../utils/seasonUtils';

interface WelcomePageProps {
  onConnectMal: () => void;
  seasonalSampleList?: JikanSeasonalAnime[];
}

export const WelcomePage: React.FC<WelcomePageProps> = ({
  onConnectMal,
  seasonalSampleList = [],
}) => {
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Select top anime for collage from sample list or fallback high quality anime
  const sampleAnime = seasonalSampleList.length >= 4 ? seasonalSampleList.slice(0, 4) : [
    {
      mal_id: 57555,
      title: "Chainsaw Man Season 2",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1806/126216.jpg" } },
      score: 8.8,
    },
    {
      mal_id: 54970,
      title: "Jujutsu Kaisen: Culling Game",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1171/109222.jpg" } },
      score: 8.9,
    },
    {
      mal_id: 52991,
      title: "Sousou no Frieren",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1015/138025.jpg" } },
      score: 9.3,
    },
    {
      mal_id: 54724,
      title: "Oshi no Ko Season 2",
      images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/1990/142981.jpg" } },
      score: 8.5,
    },
  ];

  return (
    <div className="w-full space-y-24 py-8">
      {/* HERO SECTION */}
      <section className="relative min-h-[80vh] flex flex-col justify-center items-center text-center px-4 max-w-5xl mx-auto">
        {/* Subtle Decorative Background Accent */}
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#F0EDFA] rounded-full blur-3xl -z-10 opacity-70 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-6"
        >
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F0EDFA] border border-[#7567C7]/20 text-[#7567C7] text-xs font-bold tracking-widest uppercase">
            <span>✦ ANIME TRACKER</span>
            <span className="text-[#77747D]/60">•</span>
            <span className="text-[11px] font-medium tracking-normal text-[#77747D]">アニメトラッカー</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-[#25242A] tracking-tight leading-[1.1] max-w-3xl mx-auto">
            Your anime.<br />
            <span className="text-[#7567C7]">Your season.</span><br />
            Your story.
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-xl text-[#77747D] max-w-xl mx-auto font-normal leading-relaxed">
            A personal space for everything you're watching this season. Seamlessly synced with MyAnimeList.
          </p>

          {/* CTA Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onConnectMal}
              className="w-full sm:w-auto px-8 py-4 rounded-xl bg-[#7567C7] hover:bg-[#6455b8] text-white font-semibold text-base shadow-sm hover:shadow transition-all flex items-center justify-center gap-3 cursor-pointer group"
            >
              <span>Connect MyAnimeList</span>
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={() => scrollToSection('features')}
              className="w-full sm:w-auto px-6 py-4 rounded-xl bg-white border border-[#E7E3DF] hover:bg-[#F0EDFA]/50 text-[#25242A] font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Explore the tracker</span>
              <ChevronDown className="h-4 w-4 text-[#77747D]" />
            </button>
          </div>
        </motion.div>

        {/* EDITORIAL ANIME COLLAGE */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-16 w-full grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 items-end"
        >
          {sampleAnime.map((anime: any, idx: number) => {
            const imgUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
            const score = anime.score || anime.mean || 8.5;
            const heights = ['h-64 sm:h-72', 'h-72 sm:h-84', 'h-64 sm:h-80', 'h-72 sm:h-76'];
            return (
              <div
                key={anime.mal_id || idx}
                className={`relative group rounded-2xl overflow-hidden bg-white border border-[#E7E3DF] shadow-xs transition-transform duration-300 hover:-translate-y-1 ${heights[idx % 4]}`}
              >
                {imgUrl && (
                  <img
                    src={imgUrl}
                    alt={anime.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#25242A]/80 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                <div className="absolute bottom-3 left-3 right-3 text-left">
                  <div className="flex items-center gap-1 text-[#C69A55] text-xs font-bold mb-1">
                    <Star className="h-3 w-3 fill-current" />
                    <span>{score}</span>
                  </div>
                  <h4 className="text-white text-xs sm:text-sm font-semibold line-clamp-1">
                    {anime.title}
                  </h4>
                </div>
              </div>
            );
          })}
        </motion.div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-12 border-t border-[#E7E3DF]">
        <div className="text-center max-w-xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-bold tracking-widest text-[#7567C7] uppercase">
            EVERYTHING IN ONE PLACE
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#25242A] tracking-tight">
            Track your season.<br />Understand your habits.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-[#E7E3DF] space-y-4 shadow-xs hover:border-[#7567C7]/40 transition-colors">
            <span className="text-2xl font-light text-[#7567C7] font-serif">01</span>
            <div className="w-10 h-10 rounded-xl bg-[#F0EDFA] text-[#7567C7] flex items-center justify-center">
              <Sun className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-[#25242A]">MY SEASON</h3>
            <p className="text-sm text-[#77747D] leading-relaxed">
              Follow the anime you're currently watching this season with episode progress and personal notes.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#E7E3DF] space-y-4 shadow-xs hover:border-[#7567C7]/40 transition-colors">
            <span className="text-2xl font-light text-[#7567C7] font-serif">02</span>
            <div className="w-10 h-10 rounded-xl bg-[#F0EDFA] text-[#7567C7] flex items-center justify-center">
              <CalendarDays className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-[#25242A]">RELEASE CALENDAR</h3>
            <p className="text-sm text-[#77747D] leading-relaxed">
              Know exactly when your next episode airs in Japanese Standard Time or your local timezone.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#E7E3DF] space-y-4 shadow-xs hover:border-[#7567C7]/40 transition-colors">
            <span className="text-2xl font-light text-[#7567C7] font-serif">03</span>
            <div className="w-10 h-10 rounded-xl bg-[#F0EDFA] text-[#7567C7] flex items-center justify-center">
              <BarChart3 className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-[#25242A]">STATISTICS</h3>
            <p className="text-sm text-[#77747D] leading-relaxed">
              Analyze your score distributions, top genres, and overall completion rate over time.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#E7E3DF] space-y-4 shadow-xs hover:border-[#7567C7]/40 transition-colors">
            <span className="text-2xl font-light text-[#7567C7] font-serif">04</span>
            <div className="w-10 h-10 rounded-xl bg-[#F0EDFA] text-[#7567C7] flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-[#25242A]">AI INSIGHTS</h3>
            <p className="text-sm text-[#77747D] leading-relaxed">
              Discover deeper patterns in your history powered by Google's Gemini models.
            </p>
          </div>
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="max-w-6xl mx-auto px-4 py-12 border-t border-[#E7E3DF]">
        <div className="text-center max-w-xl mx-auto mb-12 space-y-3">
          <span className="text-xs font-bold tracking-widest text-[#7567C7] uppercase">
            PRODUCT PREVIEW
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#25242A] tracking-tight">
            YOUR SEASON, AT A GLANCE
          </h2>
          <p className="text-sm text-[#77747D]">
            A clean dashboard designed around your anime artwork and watching pace.
          </p>
        </div>

        {/* Mockup Dashboard Shell */}
        <div className="rounded-2xl bg-white border border-[#E7E3DF] shadow-md p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E7E3DF] pb-5">
            <div>
              <div className="text-xs font-bold text-[#7567C7] uppercase tracking-wider mb-1">
                SUMMER 2026
              </div>
              <h3 className="text-2xl font-bold text-[#25242A]">
                Your season, at a glance.
              </h3>
            </div>
            <div className="flex items-center gap-6 text-xs text-[#77747D]">
              <div><strong className="text-[#25242A] text-base font-bold">20</strong> WATCHING</div>
              <div><strong className="text-[#25242A] text-base font-bold">8</strong> COMPLETED</div>
              <div><strong className="text-[#25242A] text-base font-bold">8.4</strong> AVG SCORE</div>
            </div>
          </div>

          {/* Cards Row Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {sampleAnime.map((anime: any, idx: number) => {
              const imgUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
              return (
                <div key={idx} className="p-3 rounded-2xl bg-[#F7F5F2] border border-[#E7E3DF] space-y-3">
                  <div className="aspect-[3/4] rounded-xl overflow-hidden bg-white relative">
                    {imgUrl && <img src={imgUrl} alt={anime.title} className="w-full h-full object-cover" />}
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-[#25242A]/80 text-[#C69A55] text-xs font-bold backdrop-blur-md flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      <span>{anime.score || 8.5}</span>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#25242A] truncate">{anime.title}</h4>
                    <p className="text-xs text-[#77747D] mt-0.5">Watching • 7 / 12 ep</p>
                  </div>
                  <div className="w-full h-1.5 bg-[#E7E3DF] rounded-full overflow-hidden">
                    <div className="h-full bg-[#7567C7] rounded-full" style={{ width: `${(idx + 1) * 22}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-6xl mx-auto px-4 py-12 border-t border-[#E7E3DF]">
        <div className="text-center max-w-xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-bold tracking-widest text-[#7567C7] uppercase">
            GETTING STARTED
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#25242A] tracking-tight">
            HOW IT WORKS
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="p-8 rounded-2xl bg-white border border-[#E7E3DF] space-y-3 shadow-xs">
            <span className="text-3xl font-light text-[#7567C7] font-serif">01</span>
            <h3 className="text-lg font-bold text-[#25242A]">CONNECT</h3>
            <p className="text-sm text-[#77747D]">
              Connect your official MyAnimeList account via secure PKCE OAuth.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-white border border-[#E7E3DF] space-y-3 shadow-xs">
            <span className="text-3xl font-light text-[#7567C7] font-serif">02</span>
            <h3 className="text-lg font-bold text-[#25242A]">SYNC</h3>
            <p className="text-sm text-[#77747D]">
              Your MAL list instantly becomes your clean, personalized season tracker.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-white border border-[#E7E3DF] space-y-3 shadow-xs">
            <span className="text-3xl font-light text-[#7567C7] font-serif">03</span>
            <h3 className="text-lg font-bold text-[#25242A]">DISCOVER</h3>
            <p className="text-sm text-[#77747D]">
              Explore airing schedules, completion stats, and AI insights.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center border-t border-[#E7E3DF]">
        <div className="p-10 sm:p-14 rounded-3xl bg-white border border-[#E7E3DF] shadow-sm space-y-6">
          <span className="text-xs font-bold tracking-widest text-[#7567C7] uppercase">
            START YOUR SEASON
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold text-[#25242A] tracking-tight">
            READY TO TRACK?
          </h2>
          <p className="text-base text-[#77747D] max-w-md mx-auto">
            Connect your MyAnimeList account now to access your personalized anime schedule and insights.
          </p>

          <div className="pt-2">
            <button
              onClick={onConnectMal}
              className="px-8 py-4 rounded-xl bg-[#7567C7] hover:bg-[#6455b8] text-white font-semibold text-base shadow-sm hover:shadow transition-all inline-flex items-center gap-3 cursor-pointer group"
            >
              <ExternalLink className="h-5 w-5" />
              <span>Connect MyAnimeList →</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
