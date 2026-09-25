import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Play, Pause, RefreshCw, ExternalLink } from 'lucide-react';
import { PlaybackState } from '../types';

interface YouTubePlayerProps {
  videoId: string;
  onPlaybackUpdate: (state: PlaybackState) => void;
  onVideoLoaded?: (title?: string, duration?: number) => void;
  onError?: (errorMessage: string) => void;
  className?: string;
}

// Global declaration for YouTube IFrame API
declare global {
  interface Window {
    YT?: {
      Player: any;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let isYouTubeApiLoading = false;
let isYouTubeApiReady = false;
const apiReadyCallbacks: Array<() => void> = [];

function loadYouTubeIframeApi(callback: () => void) {
  if (typeof window === 'undefined') return;

  if (window.YT && window.YT.Player) {
    callback();
    return;
  }

  apiReadyCallbacks.push(callback);

  if (isYouTubeApiLoading) return;
  isYouTubeApiLoading = true;

  const existingScript = document.getElementById('youtube-iframe-api');
  if (!existingScript) {
    const tag = document.createElement('script');
    tag.id = 'youtube-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
  }

  const prevReady = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => {
    if (prevReady) prevReady();
    isYouTubeApiReady = true;
    while (apiReadyCallbacks.length > 0) {
      const cb = apiReadyCallbacks.shift();
      cb?.();
    }
  };
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  onPlaybackUpdate,
  onVideoLoaded,
  onError,
  className = '',
}) => {
  const containerIdRef = useRef(`yt-player-${Math.random().toString(36).substring(2, 9)}`);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  // Initialize or re-create YouTube player when videoId changes
  useEffect(() => {
    if (!videoId) return;

    setErrorMessage(null);
    setIsPlayerReady(false);

    let isMounted = true;

    const initPlayer = () => {
      if (!isMounted) return;

      // Clean up previous instance if any
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }

      try {
        playerRef.current = new window.YT!.Player(containerIdRef.current, {
          videoId,
          playerVars: {
            autoplay: 0,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            playsinline: 1,
          },
          events: {
            onReady: (event: any) => {
              if (!isMounted) return;
              setIsPlayerReady(true);
              const duration = event.target.getDuration?.() || 0;
              const videoData = event.target.getVideoData?.();
              onVideoLoaded?.(videoData?.title, duration);
            },
            onStateChange: (event: any) => {
              if (!isMounted) return;
              const player = event.target;
              const state = event.data;
              const duration = player.getDuration?.() || 0;
              const currentTime = player.getCurrentTime?.() || 0;
              const progress = duration > 0 ? Math.min(1.0, currentTime / duration) : 0;
              const isPlaying = state === window.YT!.PlayerState.PLAYING;
              const isEnded = state === window.YT!.PlayerState.ENDED;
              const isBuffering = state === window.YT!.PlayerState.BUFFERING;

              onPlaybackUpdate({
                currentTime,
                duration,
                progress,
                isPlaying,
                isBuffering,
                isEnded,
              });

              if (isPlaying) {
                startPolling();
              } else {
                stopPolling();
              }
            },
            onError: (event: any) => {
              if (!isMounted) return;
              let msg = 'An error occurred while loading this YouTube video.';
              if (event.data === 101 || event.data === 150) {
                msg = 'This video does not allow playback in embedded players. Please try another video.';
              } else if (event.data === 100) {
                msg = 'This YouTube video is unavailable or has been removed.';
              } else if (event.data === 2) {
                msg = 'Invalid YouTube video ID parameter.';
              }
              setErrorMessage(msg);
              onError?.(msg);
            },
          },
        });
      } catch (err) {
        console.error('[YouTubePlayer] Error initializing YouTube player:', err);
        setErrorMessage('Failed to initialize official YouTube Player.');
      }
    };

    loadYouTubeIframeApi(initPlayer);

    return () => {
      isMounted = false;
      stopPolling();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // Ignore
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  const startPolling = () => {
    stopPolling();
    timerRef.current = window.setInterval(() => {
      if (!playerRef.current) return;
      try {
        const currentTime = playerRef.current.getCurrentTime?.() || 0;
        const duration = playerRef.current.getDuration?.() || 0;
        const state = playerRef.current.getPlayerState?.();
        const isPlaying = state === window.YT?.PlayerState.PLAYING;
        const isEnded = state === window.YT?.PlayerState.ENDED;
        const isBuffering = state === window.YT?.PlayerState.BUFFERING;
        const progress = duration > 0 ? Math.min(1.0, currentTime / duration) : 0;

        onPlaybackUpdate({
          currentTime,
          duration,
          progress,
          isPlaying,
          isBuffering,
          isEnded,
        });
      } catch {
        // Player state poll error
      }
    }, 200);
  };

  const stopPolling = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div className={`w-full flex flex-col items-center ${className}`}>
      {/* Error state */}
      {errorMessage && (
        <div className="w-full mb-3 p-3.5 rounded-2xl bg-red-500/10 dark:bg-red-950/30 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1">
            <p className="font-bold">{errorMessage}</p>
            <div className="mt-1 flex items-center gap-3">
              <a
                href={`https://www.youtube.com/watch?v=${videoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline inline-flex items-center gap-1 hover:text-red-700 dark:hover:text-red-300"
              >
                <span>Open video on YouTube</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Official YouTube IFrame Player Container (Standard ~16:9 ratio with official controls accessible) */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-xl bg-black border border-[#E7E3DF] dark:border-[#2E2C37]">
        <div id={containerIdRef.current} className="w-full h-full" />

        {!isPlayerReady && !errorMessage && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white/80 gap-2 pointer-events-none">
            <RefreshCw className="h-6 w-6 animate-spin text-[#7567C7]" />
            <span className="text-xs font-medium tracking-wide">Loading YouTube Player...</span>
          </div>
        )}
      </div>
    </div>
  );
};
