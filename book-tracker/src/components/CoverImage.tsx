import { useEffect, useState } from 'react';
import {
  resolveEditionCoverSources,
  sanitizeCoverUrl,
  type ResolvedCoverSource,
} from '../services/covers';

interface CoverImageProps {
  title: string;
  author?: string;
  edition?: {
    coverBlobKey?: string;
    coverStoragePath?: string;
    coverUrl?: string;
  };
  className?: string;
}

export function CoverImage({ title, author, edition, className = 'w-full aspect-[2/3]' }: CoverImageProps) {
  const initialSafeUrl = sanitizeCoverUrl(edition?.coverUrl);
  const [sources, setSources] = useState<ResolvedCoverSource[]>(
    initialSafeUrl ? [{ src: initialSafeUrl, isObjectUrl: false }] : []
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let active = true;
    const createdObjectUrls: string[] = [];

    const immediateSafe = sanitizeCoverUrl(edition?.coverUrl);
    setSources(immediateSafe ? [{ src: immediateSafe, isObjectUrl: false }] : []);
    setActiveIndex(0);

    if (!edition) {
      return;
    }

    resolveEditionCoverSources(edition).then((resolved) => {
      for (const item of resolved) {
        if (item.isObjectUrl) createdObjectUrls.push(item.src);
      }
      if (!active) {
        for (const u of createdObjectUrls) URL.revokeObjectURL(u);
        return;
      }
      setSources(resolved);
      setActiveIndex(0);
    });

    return () => {
      active = false;
      for (const u of createdObjectUrls) URL.revokeObjectURL(u);
    };
  }, [edition?.coverBlobKey, edition?.coverStoragePath, edition?.coverUrl]);

  const currentSrc = sources[activeIndex]?.src;

  if (currentSrc) {
    return (
      <div className={`relative overflow-hidden rounded-lg bg-stone-200 dark:bg-slate-800 border border-stone-200/80 dark:border-slate-700/80 ${className}`}>
        <img
          src={currentSrc}
          alt={title}
          loading="lazy"
          onError={() => setActiveIndex((idx) => idx + 1)}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-lg border border-stone-300 dark:border-slate-700 bg-gradient-to-br from-stone-100 via-amber-50/40 to-stone-200 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 p-2.5 ${className}`}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#C2410C]" />
      <div className="pl-1.5">
        <p className="font-editorial text-xs font-semibold leading-snug text-stone-900 dark:text-slate-100 line-clamp-3">
          {title}
        </p>
      </div>
      {author && (
        <p className="pl-1.5 text-[10px] font-medium text-stone-600 dark:text-slate-400 truncate">
          {author}
        </p>
      )}
    </div>
  );
}
