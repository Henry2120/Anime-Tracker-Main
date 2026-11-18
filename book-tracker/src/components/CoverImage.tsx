import { useEffect, useState } from 'react';
import { resolveEditionCoverObjectUrl } from '../services/covers';

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
  const [src, setSrc] = useState<string | null>(edition?.coverUrl || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revokeUrl: string | null = null;
    let active = true;
    setFailed(false);

    if (!edition) {
      setSrc(null);
      return;
    }

    resolveEditionCoverObjectUrl(edition).then((url) => {
      if (!active) {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
        return;
      }
      if (url && url.startsWith('blob:')) {
        revokeUrl = url;
      }
      setSrc(url);
    });

    return () => {
      active = false;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [edition?.coverBlobKey, edition?.coverStoragePath, edition?.coverUrl]);

  if (src && !failed) {
    return (
      <div className={`relative overflow-hidden rounded-lg bg-stone-200 dark:bg-slate-800 border border-stone-200/80 dark:border-slate-700/80 ${className}`}>
        <img
          src={src}
          alt={title}
          loading="lazy"
          onError={() => setFailed(true)}
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
