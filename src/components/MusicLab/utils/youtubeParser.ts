/**
 * Robust, safe YouTube video ID extractor supporting various URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID&t=120s
 * - https://youtu.be/VIDEO_ID
 * - https://youtu.be/VIDEO_ID?t=120
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 * - Direct 11-char ID: VIDEO_ID
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 1. Direct 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Full or partial URL parsing
  try {
    const urlString = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    
    const parsed = new URL(urlString);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    // Standard YouTube domains
    if (
      hostname === 'youtube.com' ||
      hostname === 'm.youtube.com' ||
      hostname === 'music.youtube.com' ||
      hostname === 'youtube-nocookie.com'
    ) {
      if (parsed.pathname === '/watch') {
        const v = parsed.searchParams.get('v');
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      }
      if (parsed.pathname.startsWith('/embed/')) {
        const id = parsed.pathname.slice('/embed/'.length).split(/[?&#/]/)[0];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.slice('/shorts/'.length).split(/[?&#/]/)[0];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
      if (parsed.pathname.startsWith('/v/')) {
        const id = parsed.pathname.slice('/v/'.length).split(/[?&#/]/)[0];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }

    // Short youtu.be domain
    if (hostname === 'youtu.be') {
      const id = parsed.pathname.replace(/^\//, '').split(/[?&#/]/)[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
  } catch {
    // If URL constructor fails, attempt regex fallback
  }

  // 3. Fallback Regex pattern
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/;
  const match = trimmed.match(regex);
  if (match && match[1] && match[1].length === 11) {
    return match[1];
  }

  return null;
}
