import React from 'react';
import { useConcertMusic } from './ConcertMusicContext';
import { Music2, Play, Pause, Disc3 } from 'lucide-react';

interface AnimeHeaderConcertWidgetProps {
  onOpenConcert: () => void;
}

export const AnimeHeaderConcertWidget: React.FC<AnimeHeaderConcertWidgetProps> = ({
  onOpenConcert,
}) => {
  const { isPlaying, videoTitle, togglePlay, isConcertActive } = useConcertMusic();

  if (!isConcertActive && !isPlaying) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-[#7567C7]/10 dark:bg-[#7567C7]/20 border border-[#7567C7]/20 text-xs font-semibold animate-in fade-in duration-200">
      <button
        type="button"
        onClick={onOpenConcert}
        className="flex items-center gap-1.5 text-[#7567C7] dark:text-[#B9B0F2] hover:underline cursor-pointer min-w-0"
        title="Open Blue Archive 10-Character Concert Stage"
      >
        <Disc3
          className={`h-3.5 w-3.5 shrink-0 ${
            isPlaying ? 'text-emerald-500 animate-spin' : 'text-[#7567C7]'
          }`}
        />
        <span className="truncate max-w-[120px] sm:max-w-[170px] text-[11px] font-bold">
          {videoTitle}
        </span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        className={`p-1 rounded-lg transition-all active:scale-90 cursor-pointer ${
          isPlaying
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'bg-[#7567C7] hover:bg-[#6556B8] text-white'
        }`}
        title={isPlaying ? 'Pause Concert Music' : 'Play Concert Music'}
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 fill-white" />
        ) : (
          <Play className="h-3 w-3 fill-white" />
        )}
      </button>
    </div>
  );
};
