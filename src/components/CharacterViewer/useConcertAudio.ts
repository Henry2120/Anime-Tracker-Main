import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Minimal Web Audio Concert Music Engine
 * Provides reliable boolean state transition (STOPPED -> PLAYING -> STOPPED)
 * Plays a cheerful upbeat anime concert synth progression loop.
 */
export function useConcertAudio() {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch {
          // Ignore close error
        }
        audioCtxRef.current = null;
      }
    };
  }, []);

  const playNote = useCallback((ctx: AudioContext, freq: number, time: number, duration: number, type: OscillatorType = 'triangle', vol = 0.08) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + duration);
    } catch {
      // Audio note play fallback
    }
  }, []);

  const playBar = useCallback((ctx: AudioContext, barIndex: number, startTime: number) => {
    const tempo = 135; // BPM
    const beatSec = 60 / tempo;

    // Upbeat Royal Anime Chords: Fmaj7 -> G7 -> Em7 -> Am7
    const chords = [
      [349.23, 440.0, 523.25, 659.25], // Fmaj7
      [392.0, 493.88, 587.33, 698.46], // G7
      [329.63, 392.0, 493.88, 587.33], // Em7
      [220.0, 261.63, 329.63, 392.0],  // Am7
    ];
    const bassNotes = [174.61, 196.0, 164.81, 220.0];

    const chord = chords[barIndex % 4];
    const bass = bassNotes[barIndex % 4];

    // Play chord stabs on beat 1, 2, 3, 4
    for (let b = 0; b < 4; b++) {
      const t = startTime + b * beatSec;
      chord.forEach((f) => {
        playNote(ctx, f, t, beatSec * 0.7, 'sine', 0.04);
      });
      // Bass note
      playNote(ctx, bass, t, beatSec * 0.8, 'triangle', 0.09);

      // Drum pulse (synth click & pop)
      if (b === 0 || b === 2) {
        // Kick
        playNote(ctx, 110, t, 0.12, 'triangle', 0.12);
      } else {
        // Snare pop
        playNote(ctx, 280, t, 0.09, 'square', 0.03);
      }
    }
  }, [playNote]);

  const startMusic = useCallback(() => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      setIsPlaying(true);

      const tempo = 135;
      const barDurationMs = (60 / tempo) * 4 * 1000;
      let currentBar = 0;

      // Play initial bar
      playBar(ctx, currentBar, ctx.currentTime + 0.05);

      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      timerRef.current = window.setInterval(() => {
        if (!isPlayingRef.current || !audioCtxRef.current) return;
        currentBar++;
        playBar(audioCtxRef.current, currentBar, audioCtxRef.current.currentTime + 0.05);
      }, barDurationMs);
    } catch (e) {
      console.warn('[Concert Audio] Web Audio initialization warning:', e);
      setIsPlaying(true);
    }
  }, [playBar]);

  const stopMusic = useCallback(() => {
    setIsPlaying(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      try {
        audioCtxRef.current.suspend();
      } catch {
        // Ignore suspend error
      }
    }
  }, []);

  const toggleMusic = useCallback(() => {
    if (isPlaying) {
      stopMusic();
    } else {
      startMusic();
    }
  }, [isPlaying, startMusic, stopMusic]);

  return {
    isConcertPlaying: isPlaying,
    startMusic,
    stopMusic,
    toggleMusic,
  };
}
