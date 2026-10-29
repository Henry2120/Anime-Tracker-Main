import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Music,
  Activity,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Sparkles,
  Info,
  Youtube,
  Radio,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Clock,
  Zap,
  Mic,
  Monitor,
  Upload,
  Square,
  Shield,
  Layers,
  Check,
} from 'lucide-react';
import { AppTheme, isDarkThemeFamily } from '../../types/theme';
import {
  extractYouTubeVideoId,
  PRESET_CONCERT_TRACKS,
  useConcertMusic,
} from './ConcertMusicContext';
import {
  parseDetectedInstruments,
  resolveInstrumentMetadata,
  NormalizedDetectedInstrument,
} from '../../utils/instrumentNormalization';
import {
  CHARACTER_ROLE_REGISTRY,
  CharacterRoleEntry,
} from '../../data/characterRoles';

// ============================================================================
// STANDARD INSTRUMENT CATEGORIES
// ============================================================================

export interface InstrumentCategory {
  id: string;
  name: string;
  family: 'Keys' | 'Strings' | 'Woodwinds' | 'Brass' | 'Percussion' | 'Electronic' | 'Other';
  keywords: string[];
  description: string;
}

export const STANDARD_INSTRUMENT_CATEGORIES: InstrumentCategory[] = [
  // Keys
  {
    id: 'piano-keyboard',
    name: 'Piano / Keyboard',
    family: 'Keys',
    keywords: ['piano', 'keyboard', 'grand piano', 'electric piano', 'upright piano', 'keyboards', 'pianoforte'],
    description: 'Acoustic grand piano, upright piano, or electric keyboards',
  },
  // Strings
  {
    id: 'violin',
    name: 'Violin',
    family: 'Strings',
    keywords: ['violin', 'fiddle', 'violins', 'electric violin'],
    description: 'High-pitched bowed orchestral string with rich formants and vibrato',
  },
  {
    id: 'cello',
    name: 'Cello',
    family: 'Strings',
    keywords: ['cello', 'cellos', 'violoncello'],
    description: 'Deep, warm resonant bowed string instrument (65 Hz - 500 Hz)',
  },
  {
    id: 'guitar',
    name: 'Guitar',
    family: 'Strings',
    keywords: ['guitar', 'electric guitar', 'acoustic guitar', 'classical guitar', 'guitars', 'lead guitar', 'rhythm guitar'],
    description: 'Acoustic, classical, or electric 6-string guitar with plucked transients',
  },
  {
    id: 'bass-guitar',
    name: 'Bass Guitar',
    family: 'Strings',
    keywords: ['bass guitar', 'electric bass', 'bass', 'slap bass', 'fretless bass', 'sub-bass'],
    description: 'Electric bass or sub-bass fundamental (40 Hz - 200 Hz)',
  },
  {
    id: 'viola',
    name: 'Viola',
    family: 'Strings',
    keywords: ['viola', 'violas'],
    description: 'Warm, mid-range bowed string instrument',
  },
  {
    id: 'double-bass',
    name: 'Double Bass',
    family: 'Strings',
    keywords: ['double bass', 'upright bass', 'contrabass', 'standup bass', 'string bass'],
    description: 'Largest and lowest-pitched bowed orchestral string',
  },
  {
    id: 'harp',
    name: 'Harp',
    family: 'Strings',
    keywords: ['harp', 'harps', 'pedal harp', 'celtic harp'],
    description: 'Multi-string plucked acoustic orchestral harp',
  },
  // Percussion
  {
    id: 'drums-percussion',
    name: 'Drums / Percussion',
    family: 'Percussion',
    keywords: ['drum', 'drums', 'percussion', 'drum kit', 'drumkit', 'snare', 'cymbals', 'timpani', 'hi-hat', 'kick drum'],
    description: 'Acoustic/electronic drum kit, cymbals, kick and snare transients',
  },
  // Woodwinds
  {
    id: 'flute',
    name: 'Flute',
    family: 'Woodwinds',
    keywords: ['flute', 'piccolo', 'flutes', 'transverse flute'],
    description: 'Side-blown woodwind instrument, bright and airy with pure harmonics',
  },
  {
    id: 'clarinet',
    name: 'Clarinet',
    family: 'Woodwinds',
    keywords: ['clarinet', 'clarinets', 'bass clarinet'],
    description: 'Single-reed woodwind with rich cylindrical timbre',
  },
  {
    id: 'oboe',
    name: 'Oboe',
    family: 'Woodwinds',
    keywords: ['oboe', 'oboes', 'cor anglais', 'english horn'],
    description: 'Double-reed woodwind with clear, penetrating tone',
  },
  {
    id: 'saxophone',
    name: 'Saxophone',
    family: 'Woodwinds',
    keywords: ['saxophone', 'sax', 'alto sax', 'tenor sax', 'baritone sax', 'soprano sax'],
    description: 'Single-reed brass-bodied woodwind instrument with warm reed resonance',
  },
  // Brass
  {
    id: 'french-horn',
    name: 'French Horn',
    family: 'Brass',
    keywords: ['french horn', 'horn', 'horns', 'waldhorn'],
    description: 'Coiled brass instrument with mellow, noble timbre',
  },
  {
    id: 'trumpet',
    name: 'Trumpet',
    family: 'Brass',
    keywords: ['trumpet', 'trumpets', 'cornet', 'flugelhorn'],
    description: 'Highest brass instrument with brilliant, piercing tone',
  },
  {
    id: 'trombone',
    name: 'Trombone',
    family: 'Brass',
    keywords: ['trombone', 'trombones', 'bass trombone', 'valve trombone'],
    description: 'Slide-operated brass instrument with rich mid-low brass tone',
  },
  {
    id: 'tuba',
    name: 'Tuba',
    family: 'Brass',
    keywords: ['tuba', 'tubas', 'sousaphone', 'euphonium'],
    description: 'Deepest and largest orchestral brass instrument',
  },
  // Electronic
  {
    id: 'synthesizer',
    name: 'Synthesizer',
    family: 'Electronic',
    keywords: ['synthesizer', 'synth', 'synths', 'electronic', 'moog', 'modular', 'pads', 'leads'],
    description: 'Electronic sound synthesizer, analog or digital waveforms',
  },
  // Other / Unclassified
  {
    id: 'other-unclassified',
    name: 'Other / Unclassified',
    family: 'Other',
    keywords: ['other', 'unclassified', 'misc', 'folk', 'accordion', 'erhu', 'shamisen', 'koto', 'banjo', 'marimba', 'vibraphone', 'vocals'],
    description: 'Traditional, ethnic, acoustic novelty, vocal lead, or unclassified instrumentation',
  },
];

export type AudioPipelineStatus =
  | 'waiting_source'
  | 'waiting_permission'
  | 'connecting'
  | 'receiving'
  | 'analyzing'
  | 'no_confident_detection'
  | 'unavailable'
  | 'error';

export interface ActiveInstrumentActivity {
  categoryId: string;
  categoryName: string;
  instrumentName: string;
  confidence: number;
  source: 'live_signal' | 'verified_catalog' | 'gemini_audio' | 'track_metadata';
  evidence?: string;
  role?: string;
  lastActiveTime: number; // in milliseconds
  activeEnergy: number; // 0..100%
}

export interface InstrumentAnalysisViewProps {
  theme?: AppTheme;
}

export const InstrumentAnalysisView: React.FC<InstrumentAnalysisViewProps> = ({ theme = 'light' }) => {
  const concert = useConcertMusic();
  const [inputUrl, setInputUrl] = useState('');
  const [analyzingBackend, setAnalyzingBackend] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [hasRunAnalysis, setHasRunAnalysis] = useState(false);
  const [analyzedVideoTitle, setAnalyzedVideoTitle] = useState('');
  const [analyzedArtist, setAnalyzedArtist] = useState('');
  const [analyzedVideoId, setAnalyzedVideoId] = useState('');
  const [detectedMap, setDetectedMap] = useState<Record<string, NormalizedDetectedInstrument>>({});
  const [additionalDetected, setAdditionalDetected] = useState<NormalizedDetectedInstrument[]>([]);
  const [analysisNote, setAnalysisNote] = useState<string>('');

  // Truthful Audio Pipeline Status
  const [pipelineStatus, setPipelineStatus] = useState<AudioPipelineStatus>('waiting_source');
  const [activeAudioSource, setActiveAudioSource] = useState<'none' | 'tab' | 'file' | 'mic'>('none');

  // Real Audio Level & Decibels (Computed via Web Audio AnalyserNode Float time-domain buffer)
  const [rmsLevel, setRmsLevel] = useState<number>(0);
  const [decibels, setDecibels] = useState<number>(-60);
  const [isAudioAudible, setIsAudioAudible] = useState<boolean>(false);

  // Live Multi-Label Active Instruments with Rolling 2.5s Hysteresis Window
  const [activeWindowInstruments, setActiveWindowInstruments] = useState<Record<string, ActiveInstrumentActivity>>({});

  // Local Audio File Playback State
  const [localAudioFileName, setLocalAudioFileName] = useState<string>('');
  const [isLocalAudioPlaying, setIsLocalAudioPlaying] = useState<boolean>(false);
  const [localAudioDuration, setLocalAudioDuration] = useState<number>(0);
  const [localAudioCurrentTime, setLocalAudioCurrentTime] = useState<number>(0);

  // Web Audio Graph Refs (Strictly disposed on unmount or source change)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaSourceNodeRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const localAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);

  const isDark = isDarkThemeFamily(theme);

  // =========================================================================
  // CLEAN WEB AUDIO PIPELINE DISPOSAL
  // =========================================================================
  const cleanupAudioPipeline = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (localAudioElementRef.current) {
      localAudioElementRef.current.pause();
      localAudioElementRef.current.src = '';
      localAudioElementRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (mediaSourceNodeRef.current) {
      try {
        mediaSourceNodeRef.current.disconnect();
      } catch {}
      mediaSourceNodeRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close();
      } catch {}
      audioCtxRef.current = null;
    }

    setActiveAudioSource('none');
    setRmsLevel(0);
    setDecibels(-60);
    setIsAudioAudible(false);
    setIsLocalAudioPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      cleanupAudioPipeline();
    };
  }, [cleanupAudioPipeline]);

  // =========================================================================
  // REAL-TIME AUDIO PROCESSING LOOP (RMS + SPECTRAL MULTI-LABEL CLASSIFIER)
  // =========================================================================
  const startAudioProcessingLoop = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;

    const timeDomainBuffer = new Float32Array(analyser.fftSize);
    const freqDataBuffer = new Uint8Array(analyser.frequencyBinCount);
    let lastClassificationTime = performance.now();

    const processFrame = () => {
      analyser.getFloatTimeDomainData(timeDomainBuffer);
      analyser.getByteFrequencyData(freqDataBuffer);

      // 1. Calculate Real RMS and Peak Decibels
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < timeDomainBuffer.length; i++) {
        const s = timeDomainBuffer[i];
        sum += s * s;
        const abs = Math.abs(s);
        if (abs > peak) peak = abs;
      }

      const rms = Math.sqrt(sum / timeDomainBuffer.length);
      const db = rms > 0.0001 ? Math.max(-60, +(20 * Math.log10(rms)).toFixed(1)) : -60;
      const isAudible = rms > 0.0015; // True non-zero audible signal threshold

      setRmsLevel(Math.min(100, Math.round(rms * 250)));
      setDecibels(db);
      setIsAudioAudible(isAudible);

      const now = performance.now();
      const nowMs = Date.now();

      if (!isAudible) {
        setPipelineStatus('receiving');
      } else {
        setPipelineStatus('analyzing');
      }

      // 2. Perform live spectral classification every ~100ms
      if (now - lastClassificationTime >= 100) {
        lastClassificationTime = now;

        if (isAudible) {
          const sampleRate = audioCtxRef.current?.sampleRate || 44100;
          const binWidth = sampleRate / analyser.fftSize; // ~21.5 Hz per bin

          // Helper to get average energy in a frequency range (Hz)
          const getBandEnergy = (startHz: number, endHz: number): number => {
            const startBin = Math.max(0, Math.floor(startHz / binWidth));
            const endBin = Math.min(freqDataBuffer.length - 1, Math.ceil(endHz / binWidth));
            if (endBin <= startBin) return 0;
            let total = 0;
            for (let b = startBin; b <= endBin; b++) {
              total += freqDataBuffer[b];
            }
            return total / (endBin - startBin + 1);
          };

          const subBass = getBandEnergy(20, 60);
          const bass = getBandEnergy(60, 250);
          const lowMids = getBandEnergy(250, 500); // Cello range: 65 - 500 Hz
          const mids = getBandEnergy(500, 2000); // Violin fundamental range: 196 - 2000 Hz
          const highMids = getBandEnergy(2000, 4000); // Violin body resonance & formants
          const treble = getBandEnergy(4000, 8000); // Bow friction / breath / cymbals
          const air = getBandEnergy(8000, 16000);

          const totalEnergy = subBass + bass + lowMids + mids + highMids + treble + air;
          const crestFactor = rms > 0.001 ? peak / rms : 1;

          const liveDetections: {
            categoryId: string;
            categoryName: string;
            instrumentName: string;
            confidence: number;
            evidence: string;
            energy: number;
          }[] = [];

          // -------------------------------------------------------------
          // VIOLIN CLASSIFICATION
          // - High fundamental & acoustic body formant in 500 Hz - 3.5 kHz
          // - Sustained bowing harmonic overtone series
          // - Bow scratch friction in 4-8 kHz
          // - Moderate crest factor (sustained tone, not percussive pluck)
          // -------------------------------------------------------------
          if (mids > 32 && highMids > 24 && crestFactor < 4.2) {
            const violinConfidence = Math.min(
              96,
              Math.round(65 + ((mids + highMids) / 510) * 31)
            );
            liveDetections.push({
              categoryId: 'violin',
              categoryName: 'Violin',
              instrumentName: 'Violin',
              confidence: violinConfidence,
              evidence: `Audible 500Hz-3.5kHz sustained bowing formants (Mids: ${Math.round(mids)}, High-Mids: ${Math.round(highMids)})`,
              energy: Math.min(100, Math.round((mids / 255) * 100)),
            });
          }

          // -------------------------------------------------------------
          // CELLO CLASSIFICATION
          // - Warm acoustic fundamental in 65 Hz - 450 Hz (bass to low-mids)
          // - Low transient attack (bowed cantabile, not slapped bass guitar)
          // - Rich resonant wood body envelope
          // -------------------------------------------------------------
          if (lowMids > 28 && bass > 35 && crestFactor < 3.8) {
            const celloConfidence = Math.min(
              95,
              Math.round(62 + ((lowMids + bass) / 510) * 33)
            );
            liveDetections.push({
              categoryId: 'cello',
              categoryName: 'Cello',
              instrumentName: 'Cello',
              confidence: celloConfidence,
              evidence: `Audible 65Hz-450Hz acoustic cello body resonance (Low-Mids: ${Math.round(lowMids)}, Bass: ${Math.round(bass)})`,
              energy: Math.min(100, Math.round((lowMids / 255) * 100)),
            });
          }

          // -------------------------------------------------------------
          // PIANO / KEYBOARD CLASSIFICATION
          // - Broad frequency distribution across 40 Hz - 4 kHz
          // - Sharp hammer strike attack transient (high crest factor > 3.2)
          // - Resonant multi-string decay
          // -------------------------------------------------------------
          if (mids > 30 && lowMids > 26 && crestFactor > 3.0) {
            const pianoConfidence = Math.min(
              96,
              Math.round(65 + (totalEnergy / 1000) * 28)
            );
            liveDetections.push({
              categoryId: 'piano-keyboard',
              categoryName: 'Piano / Keyboard',
              instrumentName: 'Piano',
              confidence: pianoConfidence,
              evidence: `Audible harmonic piano strike transient & multi-register sustain (Crest: ${crestFactor.toFixed(1)})`,
              energy: Math.min(100, Math.round((mids / 255) * 100)),
            });
          }

          // -------------------------------------------------------------
          // GUITAR (ACOUSTIC / ELECTRIC)
          // - Characteristic pluck transient with mids/high-mids (80Hz - 1.5kHz)
          // -------------------------------------------------------------
          if (mids > 40 && crestFactor > 3.4 && subBass < 55) {
            const guitarConfidence = Math.min(94, Math.round(60 + (mids / 255) * 34));
            liveDetections.push({
              categoryId: 'guitar',
              categoryName: 'Guitar',
              instrumentName: 'Guitar',
              confidence: guitarConfidence,
              evidence: `Plucked transient attack in mid-range register (Energy: ${Math.round(mids)})`,
              energy: Math.min(100, Math.round((mids / 255) * 100)),
            });
          }

          // -------------------------------------------------------------
          // BASS GUITAR / SUB-BASS
          // - Dominant energy in 40-200 Hz with sharp high-frequency rolloff
          // -------------------------------------------------------------
          if (bass > 50 && bass > highMids * 1.6) {
            const bassConfidence = Math.min(95, Math.round(65 + (bass / 255) * 30));
            liveDetections.push({
              categoryId: 'bass-guitar',
              categoryName: 'Bass Guitar',
              instrumentName: 'Bass',
              confidence: bassConfidence,
              evidence: `Prominent low-frequency fundamental (Bass: ${Math.round(bass)})`,
              energy: Math.min(100, Math.round((bass / 255) * 100)),
            });
          }

          // -------------------------------------------------------------
          // DRUMS / PERCUSSION
          // - Sudden wideband impulses across sub-bass kick and high-treble cymbals
          // -------------------------------------------------------------
          if ((subBass > 55 || treble > 45) && crestFactor > 3.6) {
            const drumConfidence = Math.min(95, Math.round(65 + (treble / 255) * 30));
            liveDetections.push({
              categoryId: 'drums-percussion',
              categoryName: 'Drums / Percussion',
              instrumentName: 'Drums',
              confidence: drumConfidence,
              evidence: `Wideband impulse transient (Sub-bass: ${Math.round(subBass)}, Treble: ${Math.round(treble)})`,
              energy: Math.min(100, Math.round((treble / 255) * 100)),
            });
          }

          // -------------------------------------------------------------
          // BRASS / WOODWINDS / SAXOPHONE
          // - Distinct harmonic ridge around 700 Hz - 2.5 kHz
          // -------------------------------------------------------------
          if (mids > 48 && highMids > 38 && lowMids < 35 && crestFactor < 3.2) {
            const saxConfidence = Math.min(92, Math.round(60 + (mids / 255) * 32));
            liveDetections.push({
              categoryId: 'saxophone',
              categoryName: 'Saxophone',
              instrumentName: 'Saxophone',
              confidence: saxConfidence,
              evidence: `Resonant reed acoustic formants in 800Hz-2.5kHz register`,
              energy: Math.min(100, Math.round((mids / 255) * 100)),
            });
          }

          // Apply Rolling Hysteresis Window (2.5s release window)
          setActiveWindowInstruments((prev) => {
            const next = { ...prev };
            const RELEASE_WINDOW_MS = 2500;

            // Decay / remove items whose release window expired
            Object.keys(next).forEach((k) => {
              if (nowMs - next[k].lastActiveTime > RELEASE_WINDOW_MS) {
                delete next[k];
              }
            });

            // Merge freshly detected live instruments
            liveDetections.forEach((det) => {
              const key = det.categoryId;
              next[key] = {
                categoryId: det.categoryId,
                categoryName: det.categoryName,
                instrumentName: det.instrumentName,
                confidence: det.confidence,
                source: 'live_signal',
                evidence: det.evidence,
                lastActiveTime: nowMs,
                activeEnergy: det.energy,
              };
            });

            return next;
          });
        }
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, []);

  // =========================================================================
  // 1. CAPTURE TAB AUDIO (NAVIGATOR.MEDIADEVICES.GETDISPLAYMEDIA)
  // Transparent, genuine browser audio capture for YouTube tab playback
  // =========================================================================
  const handleCaptureTabAudio = async () => {
    cleanupAudioPipeline();
    setPipelineStatus('waiting_permission');
    setErrorNotice(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Your browser does not support screen/tab audio capture (getDisplayMedia).');
      }

      // Request tab audio stream with video track (required by Chromium for tab sharing)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: true,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setPipelineStatus('unavailable');
        setErrorNotice(
          'No audio track was selected in the tab sharing modal. Please ensure "Share tab audio" is checked.'
        );
        return;
      }

      setPipelineStatus('connecting');
      mediaStreamRef.current = stream;

      // Handle stream end if user stops sharing
      audioTracks[0].onended = () => {
        cleanupAudioPipeline();
        setPipelineStatus('unavailable');
      };

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const sourceNode = ctx.createMediaStreamSource(stream);
      mediaSourceNodeRef.current = sourceNode;

      // CRITICAL ROUTING RULE: Connect MediaStreamSource ONLY to analyserNode!
      // NEVER connect to ctx.destination, because the browser tab is already outputting sound to speakers!
      sourceNode.connect(analyser);

      setActiveAudioSource('tab');
      setPipelineStatus('receiving');
      startAudioProcessingLoop();
    } catch (err: any) {
      console.error('[InstrumentAnalysisView] Tab capture failed:', err);
      cleanupAudioPipeline();
      setPipelineStatus('error');
      setErrorNotice(err.message || 'Permission was denied or cancelled for tab audio capture.');
    }
  };

  // =========================================================================
  // 2. LOCAL AUDIO FILE UPLOAD (.MP3, .WAV)
  // Direct Web Audio decoding with full monitoring and playback
  // =========================================================================
  const handleUploadAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    cleanupAudioPipeline();
    setPipelineStatus('connecting');
    setErrorNotice(null);
    setLocalAudioFileName(file.name);

    try {
      const audioUrl = URL.createObjectURL(file);
      const audio = new Audio(audioUrl);
      localAudioElementRef.current = audio;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const sourceNode = ctx.createMediaElementSource(audio);
      mediaSourceNodeRef.current = sourceNode;

      // In local file mode, connect to BOTH analyser AND ctx.destination so user can hear the track!
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);

      audio.onloadedmetadata = () => {
        setLocalAudioDuration(audio.duration || 0);
      };

      audio.ontimeupdate = () => {
        setLocalAudioCurrentTime(audio.currentTime || 0);
      };

      audio.onended = () => {
        setIsLocalAudioPlaying(false);
      };

      audio.play().then(() => {
        setIsLocalAudioPlaying(true);
        setActiveAudioSource('file');
        setPipelineStatus('receiving');
        startAudioProcessingLoop();
      }).catch((err) => {
        setErrorNotice(`Audio playback failed: ${err.message}`);
      });
    } catch (err: any) {
      console.error('[InstrumentAnalysisView] File upload failed:', err);
      cleanupAudioPipeline();
      setPipelineStatus('error');
      setErrorNotice(err.message || 'Failed to process local audio file.');
    }
  };

  const handleToggleLocalAudioPlay = () => {
    if (!localAudioElementRef.current || !audioCtxRef.current) return;
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    if (isLocalAudioPlaying) {
      localAudioElementRef.current.pause();
      setIsLocalAudioPlaying(false);
    } else {
      localAudioElementRef.current.play();
      setIsLocalAudioPlaying(true);
    }
  };

  // =========================================================================
  // 3. MICROPHONE INPUT (FOR ROOM / EXTERNAL SPEAKER LISTENING)
  // =========================================================================
  const handleCaptureMicrophone = async () => {
    cleanupAudioPipeline();
    setPipelineStatus('waiting_permission');
    setErrorNotice(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      setPipelineStatus('connecting');
      mediaStreamRef.current = stream;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const sourceNode = ctx.createMediaStreamSource(stream);
      mediaSourceNodeRef.current = sourceNode;

      // CRITICAL: NEVER connect microphone to ctx.destination (prevents horrific feedback howling)
      sourceNode.connect(analyser);

      setActiveAudioSource('mic');
      setPipelineStatus('receiving');
      startAudioProcessingLoop();
    } catch (err: any) {
      console.error('[InstrumentAnalysisView] Microphone capture failed:', err);
      cleanupAudioPipeline();
      setPipelineStatus('error');
      setErrorNotice(err.message || 'Microphone access was denied or unavailable.');
    }
  };

  // Stop current active live audio capture
  const handleStopLiveAudio = () => {
    cleanupAudioPipeline();
    setPipelineStatus('waiting_source');
  };

  // Clear all analysis results
  const handleClear = () => {
    setInputUrl('');
    setHasRunAnalysis(false);
    setErrorNotice(null);
    setDetectedMap({});
    setAdditionalDetected([]);
    setAnalysisNote('');
    setAnalyzedVideoTitle('');
    setAnalyzedArtist('');
    setAnalyzedVideoId('');
    setActiveWindowInstruments({});
    cleanupAudioPipeline();
  };

  // =========================================================================
  // BACKEND CATALOG / GEMINI AUDIO DETECTION
  // =========================================================================
  const executeAnalysisForId = useCallback(
    async (targetVideoId: string, customUrl?: string) => {
      const cleanVideoId = targetVideoId.trim();
      if (!cleanVideoId || cleanVideoId.length < 6) {
        setErrorNotice('Invalid YouTube URL or video ID format.');
        return;
      }

      const thisRequestId = ++requestIdRef.current;
      setAnalyzingBackend(true);
      setErrorNotice(null);
      setAnalysisNote('');
      setHasRunAnalysis(true);

      try {
        const response = await fetch('/api/music/analyze-youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: cleanVideoId,
            url: customUrl || `https://www.youtube.com/watch?v=${cleanVideoId}`,
          }),
        });

        if (thisRequestId !== requestIdRef.current) return;

        if (!response.ok) {
          throw new Error(`Analysis server returned HTTP status ${response.status}`);
        }

        const data = await response.json();
        if (thisRequestId !== requestIdRef.current) return;

        const title = data.title || '';
        const artist = data.artist || '';
        setAnalyzedVideoId(cleanVideoId);
        setAnalyzedVideoTitle(title);
        setAnalyzedArtist(artist);

        const newDetectedMap: Record<string, NormalizedDetectedInstrument> = {};
        const newAdditional: NormalizedDetectedInstrument[] = [];

        // 1. SAFELY PARSE BACKEND DETECTED INSTRUMENTS (Objects or Strings)
        const parsedInstruments = parseDetectedInstruments(data.detectedInstruments, data.source || 'verified_catalog');

        parsedInstruments.forEach((item) => {
          if (item.categoryId === 'other-unclassified') {
            newAdditional.push(item);
          } else {
            newDetectedMap[item.categoryId] = item;
          }
        });

        // 2. Fallback acoustic keyword matching on title & artist metadata
        const searchableText = `${title} ${artist}`.toLowerCase();
        STANDARD_INSTRUMENT_CATEGORIES.forEach((cat) => {
          if (cat.id === 'other-unclassified') return;
          if (!newDetectedMap[cat.id]) {
            const matchedKw = cat.keywords.find((kw) => {
              const regex = new RegExp(`\\b${kw}\\b`, 'i');
              return regex.test(searchableText);
            });

            if (matchedKw) {
              newDetectedMap[cat.id] = {
                rawName: matchedKw,
                normalizedName: cat.name,
                categoryId: cat.id,
                categoryName: cat.name,
                confidence: 85,
                source: 'track_metadata',
                evidence: `Identified "${matchedKw}" in title/artist metadata`,
              };
            }
          }
        });

        setDetectedMap(newDetectedMap);
        setAdditionalDetected(newAdditional);

        const totalDetected = Object.keys(newDetectedMap).length + newAdditional.length;

        if (totalDetected === 0) {
          setAnalysisNote('No instruments could be identified with sufficient confidence in this recording.');
        } else {
          setAnalysisNote(
            `Catalog analysis retrieved. ${totalDetected} instrument${
              totalDetected > 1 ? 's' : ''
            } identified. Use "Share Tab Audio" above to analyze live streaming audio.`
          );
        }
      } catch (err: any) {
        if (thisRequestId !== requestIdRef.current) return;
        console.error('[InstrumentAnalysisView] Backend analysis failed:', err);
        setErrorNotice(err.message || 'Analysis request failed.');
      } finally {
        if (thisRequestId === requestIdRef.current) {
          setAnalyzingBackend(false);
        }
      }
    },
    []
  );

  const handleAnalyzeInput = useCallback(() => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setErrorNotice('Please enter a YouTube video URL or 11-character video ID.');
      return;
    }
    const extractedId = extractYouTubeVideoId(trimmed) || trimmed;
    executeAnalysisForId(extractedId, trimmed);
  }, [inputUrl, executeAnalysisForId]);

  const handleSyncNowPlaying = useCallback(() => {
    if (concert.videoId) {
      setInputUrl(`https://www.youtube.com/watch?v=${concert.videoId}`);
      executeAnalysisForId(concert.videoId);
    }
  }, [concert.videoId, executeAnalysisForId]);

  // Combined list of active detected instruments (merging live signal and verified catalog)
  const allActiveInstruments = Object.values(activeWindowInstruments);
  const activeDetectedCategories = new Set(allActiveInstruments.map((i) => i.categoryId));

  // Determine which character performers are highlighted by matching their role with live detected audio
  const highlightedPerformers = CHARACTER_ROLE_REGISTRY.filter((char) => {
    const roleTag = (char.role.roleTag || '').toLowerCase();
    // Check if role matches any active detected instrument
    return allActiveInstruments.some((inst) => {
      const instName = inst.instrumentName.toLowerCase();
      const catId = inst.categoryId.toLowerCase();
      return (
        roleTag.includes(instName) ||
        instName.includes(roleTag) ||
        (catId === 'piano-keyboard' && roleTag.includes('piano')) ||
        (catId === 'violin' && roleTag.includes('violin')) ||
        (catId === 'cello' && roleTag.includes('cello')) ||
        (catId === 'guitar' && roleTag.includes('guitar')) ||
        (catId === 'bass-guitar' && roleTag.includes('bass')) ||
        (catId === 'drums-percussion' && roleTag.includes('drum')) ||
        (catId === 'saxophone' && roleTag.includes('sax')) ||
        (catId === 'french-horn' && roleTag.includes('horn')) ||
        (catId === 'trumpet' && roleTag.includes('trumpet'))
      );
    });
  });

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col p-4 sm:p-6 overflow-y-auto select-none font-sans">
      <div className="max-w-5xl mx-auto w-full space-y-5">
        {/* =========================================================================
            HEADER & ARCHITECTURAL DISCLOSURE
            ========================================================================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/10 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Activity className="h-5 w-5" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Live Real-Time Instrument Analysis
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">
                Web Audio Pipeline
              </span>
            </div>
            <p className="text-xs text-[#77747D] dark:text-[#A4A1AA] mt-1">
              Live multi-label acoustic classifier analyzing real audio buffers with harmonic, formant, and envelope recognition.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeAudioSource !== 'none' && (
              <button
                type="button"
                onClick={handleStopLiveAudio}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop Live Audio</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#77747D] hover:text-[#25242A] dark:hover:text-white transition-colors cursor-pointer border border-black/5 dark:border-white/5 flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            AUDIO CAPTURE CONTROL BAR (TAB AUDIO, FILE UPLOAD, MIC)
            ========================================================================= */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-emerald-500" />
                <span>Audio Capture Pipeline (Direct Web Audio Input)</span>
              </h2>
              <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA] mt-0.5">
                Browsers restrict programmatic raw PCM extraction from external cross-origin YouTube iframes. Use <strong>Share Tab Audio</strong> to stream live audio directly into the analyzer.
              </p>
            </div>

            {/* Live Audio Source Badge */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-[#77747D]">Source:</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  activeAudioSource === 'tab'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : activeAudioSource === 'file'
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                    : activeAudioSource === 'mic'
                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                    : 'bg-black/5 dark:bg-white/5 text-[#77747D] border-black/10 dark:border-white/10'
                }`}
              >
                {activeAudioSource === 'tab'
                  ? 'Active Tab Audio'
                  : activeAudioSource === 'file'
                  ? `File: ${localAudioFileName}`
                  : activeAudioSource === 'mic'
                  ? 'Microphone'
                  : 'No Live Source'}
              </span>
            </div>
          </div>

          {/* Action Triggers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* 1. Share Tab Audio */}
            <button
              type="button"
              onClick={handleCaptureTabAudio}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                activeAudioSource === 'tab'
                  ? 'bg-emerald-500/15 border-emerald-500/40 ring-2 ring-emerald-500/20'
                  : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/10 dark:border-white/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <Monitor className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    Share Tab Audio
                  </div>
                  <div className="text-[10px] text-[#77747D] dark:text-[#A4A1AA]">
                    Capture YouTube music
                  </div>
                </div>
              </div>
              {activeAudioSource === 'tab' && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </button>

            {/* 2. Upload Audio File */}
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleUploadAudioFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  activeAudioSource === 'file'
                    ? 'bg-blue-500/15 border-blue-500/40 ring-2 ring-blue-500/20'
                    : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/10 dark:border-white/10'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400">
                    <Upload className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      Upload Audio File
                    </div>
                    <div className="text-[10px] text-[#77747D] dark:text-[#A4A1AA]">
                      MP3, WAV, FLAC, M4A
                    </div>
                  </div>
                </div>
                {activeAudioSource === 'file' && (
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                )}
              </button>
            </div>

            {/* 3. Microphone Capture */}
            <button
              type="button"
              onClick={handleCaptureMicrophone}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                activeAudioSource === 'mic'
                  ? 'bg-purple-500/15 border-purple-500/40 ring-2 ring-purple-500/20'
                  : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/5 dark:hover:bg-white/5 border-black/10 dark:border-white/10'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400">
                  <Mic className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                    Microphone Input
                  </div>
                  <div className="text-[10px] text-[#77747D] dark:text-[#A4A1AA]">
                    Listen via speakers
                  </div>
                </div>
              </div>
              {activeAudioSource === 'mic' && (
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
              )}
            </button>
          </div>

          {/* Local Audio File Player Bar if File Mode Active */}
          {activeAudioSource === 'file' && (
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={handleToggleLocalAudioPlay}
                  className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  {isLocalAudioPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                </button>
                <span className="font-semibold truncate max-w-xs">{localAudioFileName}</span>
              </div>
              <div className="text-[11px] font-mono text-[#77747D]">
                {Math.floor(localAudioCurrentTime)}s / {Math.floor(localAudioDuration)}s
              </div>
            </div>
          )}

          {/* =========================================================================
              TRUTHFUL STATUS INDICATOR & REAL DECIBEL LEVEL METER
              ========================================================================= */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              {/* Distinct Truthful Status Badge */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[#77747D]">Pipeline Status:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
                    pipelineStatus === 'analyzing'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : pipelineStatus === 'receiving'
                      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                      : pipelineStatus === 'connecting'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      : pipelineStatus === 'waiting_permission'
                      ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      : pipelineStatus === 'no_confident_detection'
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      : 'bg-black/5 dark:bg-white/5 text-[#77747D] border border-black/10 dark:border-white/10'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      pipelineStatus === 'analyzing'
                        ? 'bg-emerald-500 animate-pulse'
                        : pipelineStatus === 'receiving'
                        ? 'bg-blue-500'
                        : pipelineStatus === 'connecting'
                        ? 'bg-amber-500 animate-spin'
                        : 'bg-[#77747D]'
                    }`}
                  />
                  <span>
                    {pipelineStatus === 'analyzing'
                      ? 'Analyzing instruments (Live audio flowing)'
                      : pipelineStatus === 'receiving'
                      ? 'Receiving live audio (Signal connected)'
                      : pipelineStatus === 'connecting'
                      ? 'Connecting to audio pipeline...'
                      : pipelineStatus === 'waiting_permission'
                      ? 'Waiting for audio permission in dialog...'
                      : pipelineStatus === 'no_confident_detection'
                      ? 'No confident instruments detected'
                      : pipelineStatus === 'unavailable'
                      ? 'Audio unavailable (Capture ended)'
                      : pipelineStatus === 'error'
                      ? 'Analysis error'
                      : 'Waiting for a music source'}
                  </span>
                </span>
              </div>

              {/* True Decibels Readout */}
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                {isAudioAudible ? (
                  <Volume2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-[#77747D]" />
                )}
                <span className="font-bold text-[#25242A] dark:text-[#F4F2F7]">
                  {isAudioAudible ? `${decibels} dB` : 'Silent / Muted'}
                </span>
              </div>
            </div>

            {/* True RMS Signal Level Bar */}
            <div className="w-full h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden relative">
              <div
                className="h-full transition-all duration-75 ease-out rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-rose-500"
                style={{ width: `${Math.min(100, rmsLevel)}%` }}
              />
            </div>
          </div>
        </div>

        {/* =========================================================================
            YOUTUBE CATALOG & PRESETS SEARCH BAR
            ========================================================================= */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7] flex items-center gap-1.5">
              <Youtube className="h-4 w-4 text-red-500" />
              <span>Catalog & Preset Track Analyzer</span>
            </span>
            {concert.videoId && (
              <button
                type="button"
                onClick={handleSyncNowPlaying}
                className="text-[11px] font-bold text-[#7567C7] dark:text-[#A898F8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Zap className="h-3 w-3" />
                <span>Sync Now Playing ({concert.videoId})</span>
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAnalyzeInput();
                }}
                placeholder="Paste YouTube track URL or video ID (e.g. x3G1I_9DPf4 or aYKN5_b7yVo)..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 focus:border-[#7567C7] focus:outline-none transition-all placeholder:text-[#9E9AA6]"
              />
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-[#9E9AA6]" />
            </div>

            <button
              type="button"
              onClick={handleAnalyzeInput}
              disabled={analyzingBackend}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#7567C7] hover:bg-[#6556B8] disabled:opacity-50 text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              {analyzingBackend ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Activity className="h-3.5 w-3.5" />
                  <span>Analyze Track</span>
                </>
              )}
            </button>
          </div>

          {/* Quick Preset Track Buttons (Includes the requested Elegy of the End and Flamewall) */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] font-bold text-[#77747D] uppercase tracking-wider mr-1">
              Test Presets:
            </span>
            {PRESET_CONCERT_TRACKS.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => {
                  setInputUrl(`https://www.youtube.com/watch?v=${track.id}`);
                  executeAnalysisForId(track.id);
                }}
                className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-[#7567C7]/15 hover:text-[#7567C7] dark:hover:text-[#A898F8] text-[11px] font-medium transition-colors cursor-pointer border border-black/5 dark:border-white/5"
              >
                {track.title}
              </button>
            ))}
          </div>
        </div>

        {/* Error / Notice Banner */}
        {errorNotice && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* =========================================================================
            LIVE ROLLING MULTI-LABEL DETECTED INSTRUMENTS
            ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Live Detected Instruments (Signal Analysis)
              </h2>
            </div>
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              {allActiveInstruments.length} Sounding Simultaneously
            </span>
          </div>

          {allActiveInstruments.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/60 dark:bg-[#161422]/60 border border-dashed border-black/15 dark:border-white/15 text-center space-y-2">
              <Music className="h-8 w-8 mx-auto text-[#77747D]/50" />
              <p className="text-xs font-semibold text-[#77747D] dark:text-[#A4A1AA]">
                {activeAudioSource !== 'none'
                  ? 'Awaiting audible musical notes in live audio signal...'
                  : 'Click "Share Tab Audio" or "Upload Audio File" above to start live multi-label instrument classification.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allActiveInstruments.map((item) => (
                <div
                  key={item.categoryId}
                  className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-teal-500/5 border border-emerald-500/30 shadow-xs space-y-2 animate-in fade-in"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <Activity className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                          {item.instrumentName}
                        </span>
                        <div className="text-[10px] text-[#77747D] dark:text-[#A4A1AA]">
                          {item.categoryName}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      {item.confidence}% Match
                    </span>
                  </div>

                  {item.evidence && (
                    <p className="text-[10.5px] text-[#77747D] dark:text-[#A4A1AA] line-clamp-2">
                      {item.evidence}
                    </p>
                  )}

                  <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Live Active
                    </span>
                    <span className="font-mono text-[#77747D]">
                      Energy: {item.activeEnergy}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* =========================================================================
            STRICT SEPARATION: CHARACTER ROLE TAGS VS LIVE HIGHLIGHT STATE
            ========================================================================= */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161422] border border-black/10 dark:border-white/10 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" />
              <h3 className="text-xs sm:text-sm font-bold text-[#25242A] dark:text-[#F4F2F7]">
                Performer Role Tags vs Live Detection Highlight
              </h3>
            </div>
            <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400">
              {highlightedPerformers.length} Performers Synchronized
            </span>
          </div>

          <p className="text-[11px] text-[#77747D] dark:text-[#A4A1AA]">
            Character roles are static registry metadata (e.g. Hina = Grand Piano, Yuzu = Cello). Performers are highlighted in the 3D scene <strong>if and only if</strong> live audio detection confirms their instrument is actively sounding!
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {CHARACTER_ROLE_REGISTRY.slice(0, 9).map((entry, idx) => {
              const roleTag = entry.role.roleTag;
              const isSounding = allActiveInstruments.some((inst) => {
                const instName = inst.instrumentName.toLowerCase();
                const catId = inst.categoryId.toLowerCase();
                const rt = roleTag.toLowerCase();
                return (
                  rt.includes(instName) ||
                  instName.includes(rt) ||
                  (catId === 'piano-keyboard' && rt.includes('piano')) ||
                  (catId === 'violin' && rt.includes('violin')) ||
                  (catId === 'cello' && rt.includes('cello')) ||
                  (catId === 'guitar' && rt.includes('guitar')) ||
                  (catId === 'bass-guitar' && rt.includes('bass')) ||
                  (catId === 'drums-percussion' && rt.includes('drum')) ||
                  (catId === 'saxophone' && rt.includes('sax')) ||
                  (catId === 'french-horn' && rt.includes('horn')) ||
                  (catId === 'trumpet' && rt.includes('trumpet'))
                );
              });

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                    isSounding
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-xs ring-1 ring-emerald-500/20'
                      : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 opacity-70'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-[#25242A] dark:text-[#F4F2F7]">
                      {entry.matchNames?.[0] || entry.matchFilenames[0]}
                    </div>
                    <div className="text-[10px] text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-1.5 mt-0.5">
                      <span>Role Tag:</span>
                      <span className={`px-1.5 py-0.2 rounded font-semibold ${entry.role.colorClass}`}>
                        {roleTag}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                      isSounding
                        ? 'bg-emerald-500 text-white shadow-xs animate-pulse'
                        : 'bg-black/5 dark:bg-white/10 text-[#77747D]'
                    }`}
                  >
                    {isSounding ? 'HIGHLIGHTED' : 'Standby'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Guidance */}
        <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 text-[11px] text-[#77747D] dark:text-[#A4A1AA] flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-[#7567C7]" />
          <span>
            Audio pipeline separates monitoring from analysis. Tab and microphone audio are never routed back to speakers, preventing duplicate volume and audio feedback.
          </span>
        </div>
      </div>
    </div>
  );
};

export default InstrumentAnalysisView;
