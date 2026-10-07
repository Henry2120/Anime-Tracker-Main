import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface ConcertTrack {
  id: string;
  title: string;
  artist?: string;
}

export const PRESET_CONCERT_TRACKS: ConcertTrack[] = [
  {
    id: 'dUXIymB78YQ',
    title: 'Constant Moderato (Mitsukiyo)',
    artist: 'Blue Archive OST',
  },
  {
    id: 'kYbgcOC_FkI',
    title: 'That Band (Ano Bando)',
    artist: 'Bocchi the Rock!',
  },
  {
    id: 'qpbX7SbXOtU',
    title: 'Classical Anime Medley',
    artist: 'Prague Cello Quartet',
  },
  {
    id: 'Igg7AxN5QPc',
    title: 'Carol of the Bells (Violin EDM)',
    artist: 'Lindsey Stirling',
  },
];

export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // If plain 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  // URL matching
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

export type ConcertPresentationMode = 'full' | 'mini' | 'hidden';

export interface ConcertMusicContextValue {
  // YouTube State
  videoId: string;
  videoTitle: string;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isReady: boolean;

  // Presentation State
  presentationMode: ConcertPresentationMode;
  isConcertActive: boolean;

  // Controls
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  setVideo: (videoIdOrUrl: string, title?: string) => void;
  setPresentationMode: (mode: ConcertPresentationMode) => void;
  closeMiniConcert: () => void;
}

const ConcertMusicContext = createContext<ConcertMusicContextValue | null>(null);

export const ConcertMusicProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videoId, setVideoId] = useState<string>(PRESET_CONCERT_TRACKS[0].id);
  const [videoTitle, setVideoTitle] = useState<string>(PRESET_CONCERT_TRACKS[0].title);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isStopped, setIsStopped] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [presentationMode, setPresentationMode] = useState<ConcertPresentationMode>('hidden');
  const [isConcertActive, setIsConcertActive] = useState<boolean>(false);

  const playerRef = useRef<any>(null);
  const pendingPlayRef = useRef<boolean>(false);
  const videoIdRef = useRef<string>(videoId);
  videoIdRef.current = videoId;

  // Initialize YouTube IFrame API
  useEffect(() => {
    const initPlayer = () => {
      if (playerRef.current || !window.YT || !window.YT.Player) return;

      const targetEl = document.getElementById('persistent-youtube-iframe-target');
      if (!targetEl) return;

      try {
        playerRef.current = new window.YT.Player('persistent-youtube-iframe-target', {
          height: '100%',
          width: '100%',
          videoId: videoIdRef.current,
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: (event: any) => {
              setIsReady(true);
              if (pendingPlayRef.current) {
                pendingPlayRef.current = false;
                try {
                  event.target.playVideo();
                } catch {
                  // Ignore autoplay policy rejection
                }
              }
            },
            onStateChange: (event: any) => {
              const state = event.data;
              // 1 = PLAYING
              if (state === 1) {
                setIsPlaying(true);
                setIsPaused(false);
                setIsStopped(false);
                setIsConcertActive(true);
              }
              // 2 = PAUSED
              else if (state === 2) {
                setIsPlaying(false);
                setIsPaused(true);
                setIsStopped(false);
              }
              // 0 = ENDED
              else if (state === 0) {
                setIsPlaying(false);
                setIsPaused(false);
                setIsStopped(true);
              }
            },
            onError: (err: any) => {
              console.warn('[Concert YouTube Player] Error code:', err.data);
            },
          },
        });
      } catch (err) {
        console.error('[Concert YouTube Player] Failed to initialize:', err);
      }
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };

      if (!document.getElementById('youtube-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }, []);

  const play = useCallback(() => {
    setIsConcertActive(true);
    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      try {
        playerRef.current.playVideo();
      } catch (e) {
        console.warn('[YouTube Player] playVideo error:', e);
      }
    } else {
      pendingPlayRef.current = true;
      setIsPlaying(true);
      setIsPaused(false);
      setIsStopped(false);
    }
  }, []);

  const pause = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
      try {
        playerRef.current.pauseVideo();
      } catch (e) {
        console.warn('[YouTube Player] pauseVideo error:', e);
      }
    }
    setIsPlaying(false);
    setIsPaused(true);
  }, []);

  const stop = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.stopVideo === 'function') {
      try {
        playerRef.current.stopVideo();
      } catch (e) {
        console.warn('[YouTube Player] stopVideo error:', e);
      }
    }
    setIsPlaying(false);
    setIsPaused(false);
    setIsStopped(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const setVideo = useCallback(
    (urlOrId: string, customTitle?: string) => {
      const extracted = extractYouTubeVideoId(urlOrId) || urlOrId;
      setVideoId(extracted);
      videoIdRef.current = extracted;

      const preset = PRESET_CONCERT_TRACKS.find((p) => p.id === extracted);
      const title = customTitle || preset?.title || 'YouTube Concert Track';
      setVideoTitle(title);

      setIsConcertActive(true);
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        try {
          playerRef.current.loadVideoById(extracted);
        } catch (e) {
          console.warn('[YouTube Player] loadVideoById error:', e);
        }
      }
    },
    []
  );

  const closeMiniConcert = useCallback(() => {
    stop();
    setIsConcertActive(false);
    setPresentationMode('hidden');
  }, [stop]);

  const value = {
    videoId,
    videoTitle,
    isPlaying,
    isPaused,
    isStopped,
    isReady,
    presentationMode,
    isConcertActive,
    play,
    pause,
    stop,
    togglePlay,
    setVideo,
    setPresentationMode,
    closeMiniConcert,
  };

  return (
    <ConcertMusicContext.Provider value={value}>
      {children}

      {/* =======================================================================
          PERSISTENT YOUTUBE IFRAME MOUNT (STAYS MOUNTED ACROSS ALL APP MODES)
          ======================================================================= */}
      <div
        id="persistent-youtube-player-mount"
        aria-hidden="true"
        className="fixed -left-[9999px] -top-[9999px] w-[320px] h-[180px] pointer-events-none opacity-0 z-[-1]"
      >
        <div id="persistent-youtube-iframe-target" />
      </div>
    </ConcertMusicContext.Provider>
  );
};

export function useConcertMusic(): ConcertMusicContextValue {
  const context = useContext(ConcertMusicContext);
  if (!context) {
    throw new Error('useConcertMusic must be used within a ConcertMusicProvider');
  }
  return context;
}
