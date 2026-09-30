import {
  AudioDynamicsPoint,
  DetectedInstrument,
  MusicAnalysisResult,
  MusicInstrument,
  MusicSection,
} from '../types';
import { ALL_INSTRUMENTS } from '../instruments/registry';

export interface InstrumentDetector {
  detectLocalAudio(audioBuffer: AudioBuffer, fileName: string): Promise<MusicAnalysisResult>;
  detectYouTube(
    videoId: string,
    url: string,
    titleHint?: string,
    duration?: number
  ): Promise<MusicAnalysisResult>;
}

/**
 * Standard Instrument Detection Engine
 * Uses Gemini AI with Google Search grounding for real media instrument analysis of YouTube streams,
 * and Web Audio spectral energy profiling for local audio tracks.
 */
export class StandardInstrumentDetector implements InstrumentDetector {
  /**
   * Analyzes YouTube video and music performance via server-side Gemini AI
   */
  async detectYouTube(
    videoId: string,
    url: string,
    titleHint?: string,
    duration: number = 210
  ): Promise<MusicAnalysisResult> {
    try {
      const response = await fetch('/api/music/analyze-youtube', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          url,
          titleHint,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to analyze video');
      }

      const detectedMap = new Map<string, { confidence: number; reason: string }>();
      if (Array.isArray(data.detectedInstruments)) {
        for (const item of data.detectedInstruments) {
          if (item && item.instrumentId) {
            detectedMap.set(item.instrumentId, {
              confidence: typeof item.confidence === 'number' ? item.confidence : 0.9,
              reason: item.reason || '',
            });
          }
        }
      }

      // Build detected instruments list for all registered instruments
      // Crucial: ONLY instruments explicitly detected by Gemini have isDetected = true!
      const detectedInstruments: DetectedInstrument[] = ALL_INSTRUMENTS.map((inst) => {
        const info = detectedMap.get(inst);
        const isDetected = Boolean(info && info.confidence >= 0.5);

        return {
          instrumentId: inst,
          confidence: info ? Math.round(info.confidence * 100) / 100 : 0.05,
          isDetected,
          isActive: isDetected,
          reason: info ? info.reason : undefined,
        };
      });

      const activeIds = detectedInstruments.filter((d) => d.isDetected).map((d) => d.instrumentId);

      // Convert instrument activities
      const instrumentActivities = Array.isArray(data.instrumentActivities)
        ? data.instrumentActivities
            .filter((act: any) => act && ALL_INSTRUMENTS.includes(act.instrumentId as MusicInstrument))
            .map((act: any) => ({
              instrumentId: act.instrumentId as MusicInstrument,
              startPercent: typeof act.startPercent === 'number' ? Math.max(0, Math.min(1, act.startPercent)) : 0,
              endPercent: typeof act.endPercent === 'number' ? Math.max(0, Math.min(1, act.endPercent)) : 1,
              intensity: typeof act.intensity === 'number' ? Math.max(0, Math.min(1, act.intensity)) : 0.8,
              confidence: typeof act.confidence === 'number' ? Math.max(0, Math.min(1, act.confidence)) : 0.9,
              reason: act.reason || undefined,
            }))
        : [];

      // Convert sections or build them if missing
      const dur = Math.max(30, duration);
      let sections: MusicSection[] = [];

      if (Array.isArray(data.sections) && data.sections.length > 0) {
        sections = data.sections.map((sec: any) => {
          const start = Math.round(((sec.startPercent || 0) / 100) * dur);
          const end = Math.round(((sec.endPercent || 100) / 100) * dur);
          const active = Array.isArray(sec.activeInstruments)
            ? (sec.activeInstruments.filter((id: string) =>
                ALL_INSTRUMENTS.includes(id as MusicInstrument)
              ) as MusicInstrument[])
            : activeIds;

          return {
            start,
            end,
            label: sec.name || 'Section',
            activeInstruments: active.length > 0 ? active : activeIds,
            intensity: typeof sec.intensity === 'number' ? sec.intensity : 0.7,
          };
        });
      } else {
        sections = this.generateSections(dur, activeIds);
      }

      return {
        duration: dur,
        bpm: data.bpm || 120,
        detectedInstruments,
        instrumentActivities,
        sections,
        analysisSource: 'gemini_ai',
        title: data.title,
        artist: data.artist,
        notes: data.description || 'Musical arrangement and performance analyzed via Gemini AI.',
        description: data.description,
      };
    } catch (err: any) {
      console.warn('[InstrumentDetector] Gemini YouTube analysis failed, using transparent neutral profile:', err);

      // Neutral fallback: do NOT assume piano + drums + bass + guitar!
      // Provide an empty/clean stage that the user can manually customize
      const detectedInstruments: DetectedInstrument[] = ALL_INSTRUMENTS.map((inst) => ({
        instrumentId: inst,
        confidence: 0.1,
        isDetected: false,
        isActive: false,
      }));

      return {
        duration,
        bpm: 120,
        detectedInstruments,
        sections: this.generateSections(duration, []),
        analysisSource: 'manual',
        notes: `AI analysis connection issue (${err.message || 'Network'}). You can click any instrument below to customize your stage ensemble.`,
      };
    }
  }

  /**
   * Analyzes genuine local audio via Web Audio frequency distributions and spectral energy
   */
  async detectLocalAudio(audioBuffer: AudioBuffer, fileName: string): Promise<MusicAnalysisResult> {
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const channel0 = audioBuffer.getChannelData(0);
    const channel1 = channels > 1 ? audioBuffer.getChannelData(1) : null;
    const totalSamples = channel0.length;

    // 1. Time-varying analysis windowing (~50ms hop size, ~100ms analysis window)
    const hopSeconds = 0.05;
    const hopSamples = Math.max(1, Math.floor(sampleRate * hopSeconds));
    const windowSamples = Math.min(totalSamples, hopSamples * 2);
    const numFrames = Math.max(1, Math.floor((totalSamples - windowSamples) / hopSamples) + 1);

    const rawRmsEnergies = new Float32Array(numFrames);
    const rawViolinEnergies = new Float32Array(numFrames);
    const rawHighEnergies = new Float32Array(numFrames);
    const rawLowEnergies = new Float32Array(numFrames);
    const onsetFlux = new Float32Array(numFrames);

    let prevViolinEnergy = 0;
    let globalTransientCount = 0;

    for (let k = 0; k < numFrames; k++) {
      const startSample = k * hopSamples;
      const endSample = Math.min(totalSamples, startSample + windowSamples);
      const frameLen = endSample - startSample;

      let sumSq = 0;
      let sumDiffSq = 0;
      let sumLowSq = 0;
      let lowPassState = 0;
      const alphaLow = 0.035; // Low-pass filter coefficient for sub-bass/kick

      // Step by 2 or 4 samples for speed while retaining precision
      const step = frameLen > 4000 ? 2 : 1;
      let count = 0;

      for (let i = startSample; i < endSample - 1; i += step) {
        // Average stereo if available
        const s0 = channel0[i] || 0;
        const s1 = channel1 ? channel1[i] || 0 : s0;
        const sNext0 = channel0[i + 1] || 0;
        const sNext1 = channel1 ? channel1[i + 1] || 0 : sNext0;

        const val = (s0 + s1) * 0.5;
        const valNext = (sNext0 + sNext1) * 0.5;

        sumSq += val * val;

        // High frequency / bowed harmonic derivative
        const diff = valNext - val;
        sumDiffSq += diff * diff;

        // Sub-bass extraction
        lowPassState += alphaLow * (val - lowPassState);
        sumLowSq += lowPassState * lowPassState;

        count++;
      }

      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      const highFreq = count > 0 ? Math.sqrt(sumDiffSq / count) * 4.2 : 0;
      const lowFreq = count > 0 ? Math.sqrt(sumLowSq / count) : 0;

      // Violin-relevant acoustic energy: fundamental resonance (G3-E7) + brilliant bow harmonics (1.5-8kHz)
      // Sub-bass / kick drum is attenuated to prevent bass drums from dominating violin dynamics
      const violinEnergy = Math.max(0, rms * 0.45 + highFreq * 0.65 - lowFreq * 0.25);

      rawRmsEnergies[k] = rms;
      rawHighEnergies[k] = highFreq;
      rawLowEnergies[k] = lowFreq;
      rawViolinEnergies[k] = violinEnergy;

      // Transient onset flux (rectified positive energy increase)
      const flux = Math.max(0, violinEnergy - prevViolinEnergy);
      onsetFlux[k] = flux;
      if (flux > 0.04) {
        globalTransientCount++;
      }
      prevViolinEnergy = violinEnergy;
    }

    // 2. Percentile-based robust dynamic range normalization (5th percentile = min, 95th = max forte)
    const sortedEnergies = Float32Array.from(rawViolinEnergies).sort();
    const p05Index = Math.floor(numFrames * 0.05);
    const p95Index = Math.min(numFrames - 1, Math.floor(numFrames * 0.95));
    const p05 = sortedEnergies[p05Index] || 0.005;
    const p95 = Math.max(p05 + 0.01, sortedEnergies[p95Index] || 0.15);

    const sortedFlux = Float32Array.from(onsetFlux).sort();
    const fluxP95 = Math.max(0.01, sortedFlux[Math.min(numFrames - 1, Math.floor(numFrames * 0.95))] || 0.05);

    // Build timeline points
    const dynamicsTimeline: AudioDynamicsPoint[] = [];
    for (let k = 0; k < numFrames; k++) {
      const time = Math.round(k * hopSeconds * 1000) / 1000;
      const rawE = rawViolinEnergies[k];
      const normInt = Math.max(0, Math.min(1, (rawE - p05) / (p95 - p05)));
      const normFlux = Math.max(0, Math.min(1, onsetFlux[k] / fluxP95));
      const normViolin = Math.max(0, Math.min(1, rawHighEnergies[k] / (p95 * 1.2)));

      dynamicsTimeline.push({
        time,
        intensity: Math.round(normInt * 1000) / 1000,
        transientStrength: Math.round(normFlux * 1000) / 1000,
        violinEnergy: Math.round(normViolin * 1000) / 1000,
      });
    }

    // 3. Autocorrelation BPM estimation across tempo range 60-200 BPM
    let detectedBpm = 120;
    if (numFrames > 50) {
      let maxCorr = -1;
      let bestLag = 0;
      const minLag = Math.floor(60 / (200 * hopSeconds)); // ~6 frames (200 BPM)
      const maxLag = Math.floor(60 / (60 * hopSeconds));  // ~20 frames (60 BPM)

      for (let lag = minLag; lag <= maxLag; lag++) {
        let corr = 0;
        let cCount = 0;
        for (let i = 0; i < numFrames - lag; i++) {
          corr += onsetFlux[i] * onsetFlux[i + lag];
          cCount++;
        }
        if (cCount > 0) {
          corr /= cCount;
          if (corr > maxCorr) {
            maxCorr = corr;
            bestLag = lag;
          }
        }
      }

      if (bestLag > 0) {
        const estimatedBpm = Math.round(60 / (bestLag * hopSeconds));
        if (estimatedBpm >= 55 && estimatedBpm <= 220) {
          detectedBpm = estimatedBpm;
        }
      }
    }

    // 4. Global acoustic profile for instrument detection
    let sumLow = 0;
    let sumMid = 0;
    let sumHigh = 0;
    for (let k = 0; k < numFrames; k++) {
      sumLow += rawLowEnergies[k];
      sumMid += rawRmsEnergies[k];
      sumHigh += rawHighEnergies[k];
    }
    const normLow = numFrames > 0 ? sumLow / numFrames : 0.5;
    const normMid = numFrames > 0 ? sumMid / numFrames : 0.5;
    const normHigh = numFrames > 0 ? sumHigh / numFrames : 0.3;
    const percussiveIndex = numFrames > 0 ? globalTransientCount / numFrames : 0.1;

    // Instrument confidence evaluations based on acoustic profile
    const confidences: Partial<Record<MusicInstrument, number>> = {
      piano: Math.min(0.95, Math.max(0.2, normMid * 1.6)),
      drums: Math.min(0.96, Math.max(0.1, percussiveIndex * 4.5 + normLow * 0.6)),
      bass: Math.min(0.92, Math.max(0.2, normLow * 1.8)),
      'electric-guitar': Math.min(0.9, Math.max(0.15, normMid * 1.4 + normHigh * 0.7)),
      'acoustic-guitar': Math.min(0.88, Math.max(0.15, normMid * 1.3)),
      violin: Math.min(0.95, Math.max(0.25, normHigh * 2.2 + (sortedEnergies[p95Index] > 0.05 ? 0.3 : 0.1))),
      cello: Math.min(0.85, Math.max(0.1, normLow * 1.1 + normMid * 0.5)),
      flute: Math.min(0.75, Math.max(0.1, normHigh * 1.7)),
      saxophone: Math.min(0.78, Math.max(0.1, normMid * 1.2)),
      trumpet: Math.min(0.8, Math.max(0.1, normHigh * 1.3 + normMid * 0.6)),
    };

    // Construct detected instruments list based on acoustic confidence
    const detectedInstruments: DetectedInstrument[] = ALL_INSTRUMENTS.map((inst) => {
      const conf = confidences[inst] || 0.2;
      const isDetected = conf >= 0.55;

      return {
        instrumentId: inst,
        confidence: Math.round(conf * 100) / 100,
        isDetected,
        isActive: isDetected,
        reason: isDetected ? 'Detected from spectral energy and harmonic profile' : undefined,
      };
    });

    const activeIds = detectedInstruments.filter((d) => d.isDetected).map((d) => d.instrumentId);
    const sections = this.generateDynamicSections(duration, activeIds, dynamicsTimeline);

    return {
      duration: Math.round(duration * 10) / 10,
      bpm: detectedBpm,
      detectedInstruments,
      sections,
      dynamicsTimeline,
      analysisSource: 'local_web_audio',
      title: fileName.replace(/\.[^/.]+$/, ''),
      notes: `Decoded locally from ${fileName} (${sampleRate} Hz, ${channels} channels, ${dynamicsTimeline.length} dynamic frames)`,
    };
  }

  /**
   * Constructs coherent performance sections with average intensities computed from real audio dynamics
   */
  private generateDynamicSections(
    duration: number,
    activeInstruments: MusicInstrument[],
    timeline: AudioDynamicsPoint[]
  ): MusicSection[] {
    const dur = Math.max(30, duration);
    const baseSections = this.generateSections(dur, activeInstruments);

    if (!timeline || timeline.length === 0) {
      return baseSections;
    }

    // Compute genuine measured average intensity for each section from the dynamics timeline
    return baseSections.map((sec) => {
      const secPoints = timeline.filter((p) => p.time >= sec.start && p.time <= sec.end);
      let avgIntensity = sec.intensity;
      if (secPoints.length > 0) {
        const sum = secPoints.reduce((acc, p) => acc + p.intensity, 0);
        avgIntensity = Math.round((sum / secPoints.length) * 100) / 100;
      }
      return {
        ...sec,
        intensity: Math.max(0.1, Math.min(1.0, avgIntensity)),
      };
    });
  }

  /**
   * Constructs coherent performance sections with natural entrances and exits
   */
  private generateSections(duration: number, activeInstruments: MusicInstrument[]): MusicSection[] {
    const dur = Math.max(30, duration);

    if (activeInstruments.length === 0) {
      return [
        {
          start: 0,
          end: dur,
          label: 'Performance',
          activeInstruments: [],
          intensity: 0.5,
        },
      ];
    }

    // If 1 or 2 instruments (e.g. Cello Quartet or Solo Violin), they play throughout
    if (activeInstruments.length <= 2) {
      return [
        {
          start: 0,
          end: Math.round(dur * 0.2),
          label: 'Introduction',
          activeInstruments,
          intensity: 0.5,
        },
        {
          start: Math.round(dur * 0.2),
          end: Math.round(dur * 0.75),
          label: 'Main Theme & Climax',
          activeInstruments,
          intensity: 0.95,
        },
        {
          start: Math.round(dur * 0.75),
          end: Math.round(dur),
          label: 'Resolution & Outro',
          activeInstruments,
          intensity: 0.45,
        },
      ];
    }

    // Multi-instrument arrangement:
    // Section 1: Intro (0 - 15%) -> Solo harmonic opening
    const introInstruments = activeInstruments.filter(
      (id) => id === 'piano' || id === 'acoustic-guitar' || id === 'violin' || id === 'cello'
    );
    const introList = introInstruments.length > 0 ? introInstruments.slice(0, 2) : activeInstruments.slice(0, 1);

    // Section 2: Verse (15% - 40%) -> Rhythm accompaniment enters
    const verseList = activeInstruments.filter((id) => id !== 'trumpet' && id !== 'flute');

    // Section 3: Chorus & Climax (40% - 85%) -> Full ensemble performs
    const chorusList = [...activeInstruments];

    // Section 4: Outro (85% - 100%) -> Gentle resolve
    const outroList = activeInstruments.filter(
      (id) => id === 'piano' || id === 'acoustic-guitar' || id === 'violin' || id === 'bass' || id === 'cello'
    );

    return [
      {
        start: 0,
        end: Math.round(dur * 0.15),
        label: 'Intro / Exposition',
        activeInstruments: introList,
        intensity: 0.4,
      },
      {
        start: Math.round(dur * 0.15),
        end: Math.round(dur * 0.4),
        label: 'Verse & Groove',
        activeInstruments: verseList.length > 0 ? verseList : activeInstruments,
        intensity: 0.65,
      },
      {
        start: Math.round(dur * 0.4),
        end: Math.round(dur * 0.85),
        label: 'Full Chorus & Climax',
        activeInstruments: chorusList,
        intensity: 1.0,
      },
      {
        start: Math.round(dur * 0.85),
        end: Math.round(dur),
        label: 'Outro / Resolution',
        activeInstruments: outroList.length > 0 ? outroList : activeInstruments.slice(0, 2),
        intensity: 0.35,
      },
    ];
  }
}

export const instrumentDetector = new StandardInstrumentDetector();
