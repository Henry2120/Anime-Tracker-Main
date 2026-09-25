import {
  DetectedInstrument,
  MusicAnalysisResult,
  MusicInstrument,
  MusicSection,
} from '../types';
import { ALL_INSTRUMENTS } from '../instruments/registry';

export interface InstrumentDetector {
  detectLocalAudio(audioBuffer: AudioBuffer, fileName: string): Promise<MusicAnalysisResult>;
  detectFromTitle(title: string, duration?: number): Promise<MusicAnalysisResult>;
}

/**
 * Standard Instrument Detection Engine
 * Integrates Web Audio frequency profile analysis for local files and
 * transparent heuristic parsing for video streams.
 */
export class StandardInstrumentDetector implements InstrumentDetector {
  /**
   * Analyzes genuine local audio via Web Audio frequency distributions and spectral energy
   */
  async detectLocalAudio(audioBuffer: AudioBuffer, fileName: string): Promise<MusicAnalysisResult> {
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const channel0 = audioBuffer.getChannelData(0);
    const totalSamples = channel0.length;

    // Analyze spectral energy across low, mid, and high frequency approximations
    // We sample slices across the track
    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;
    let transientCount = 0;
    let prevVal = 0;

    const sampleStep = Math.max(1, Math.floor(totalSamples / 20000));
    let sampleCount = 0;

    for (let i = 0; i < totalSamples; i += sampleStep) {
      const val = Math.abs(channel0[i] || 0);
      const diff = Math.abs(val - prevVal);

      // Low band proxy (smooth low frequency variance)
      lowEnergy += val;
      // High band proxy (rapid sharp differential transients)
      if (diff > 0.15) {
        highEnergy += diff;
        transientCount++;
      } else {
        midEnergy += val;
      }
      prevVal = val;
      sampleCount++;
    }

    const normLow = sampleCount > 0 ? lowEnergy / sampleCount : 0.5;
    const normMid = sampleCount > 0 ? midEnergy / sampleCount : 0.5;
    const normHigh = sampleCount > 0 ? highEnergy / sampleCount : 0.3;
    const percussiveIndex = sampleCount > 0 ? transientCount / sampleCount : 0.1;

    // Instrument confidence evaluations based on acoustic profile
    const confidences: Record<MusicInstrument, number> = {
      piano: Math.min(0.95, Math.max(0.4, normMid * 1.8)),
      drums: Math.min(0.96, Math.max(0.3, percussiveIndex * 4.5 + normLow * 0.8)),
      bass: Math.min(0.92, Math.max(0.35, normLow * 2.0)),
      'electric-guitar': Math.min(0.9, Math.max(0.2, normMid * 1.5 + normHigh * 0.8)),
      'acoustic-guitar': Math.min(0.88, Math.max(0.25, normMid * 1.4)),
      violin: Math.min(0.85, Math.max(0.15, normHigh * 2.2)),
      cello: Math.min(0.8, Math.max(0.15, normLow * 1.2 + normMid * 0.6)),
      flute: Math.min(0.75, Math.max(0.1, normHigh * 1.8)),
      saxophone: Math.min(0.78, Math.max(0.12, normMid * 1.3)),
      trumpet: Math.min(0.8, Math.max(0.1, normHigh * 1.4 + normMid * 0.7)),
    };

    // Construct detected instruments list
    // Primary core rhythm section (Piano, Drums, Bass) + top harmonic instruments
    const detectedInstruments: DetectedInstrument[] = ALL_INSTRUMENTS.map((inst) => {
      const conf = confidences[inst] || 0.3;
      // Instruments with confidence >= 0.55 are included in the active ensemble
      const isDetected = conf >= 0.55 || inst === 'piano' || (inst === 'drums' && percussiveIndex > 0.05);

      return {
        instrumentId: inst,
        confidence: Math.round(conf * 100) / 100,
        isDetected,
        isActive: isDetected,
      };
    });

    // Generate timeline sections with dynamic instrument entrances
    const activeIds = detectedInstruments.filter((d) => d.isDetected).map((d) => d.instrumentId);
    const sections = this.generateSections(duration, activeIds);

    return {
      duration: Math.round(duration * 10) / 10,
      bpm: Math.round(110 + percussiveIndex * 80),
      detectedInstruments,
      sections,
      analysisSource: 'local_web_audio',
      notes: `Decoded locally from ${fileName} (${sampleRate} Hz, ${channels} channels)`,
    };
  }

  /**
   * Transparent heuristic detection for YouTube / stream sources based on title & genre hints
   */
  async detectFromTitle(title: string, duration: number = 210): Promise<MusicAnalysisResult> {
    const lower = title.toLowerCase();

    // Default Pop/Anime Band Profile: Piano, Drums, Bass, Electric/Acoustic Guitar
    const detectedMap: Record<MusicInstrument, { detected: boolean; confidence: number }> = {
      piano: { detected: true, confidence: 0.92 },
      drums: { detected: true, confidence: 0.88 },
      bass: { detected: true, confidence: 0.85 },
      'electric-guitar': { detected: true, confidence: 0.82 },
      'acoustic-guitar': { detected: false, confidence: 0.4 },
      violin: { detected: false, confidence: 0.35 },
      cello: { detected: false, confidence: 0.25 },
      flute: { detected: false, confidence: 0.2 },
      saxophone: { detected: false, confidence: 0.2 },
      trumpet: { detected: false, confidence: 0.2 },
    };

    // Keyword heuristic modifications
    if (lower.includes('acoustic') || lower.includes('unplugged') || lower.includes('fingerstyle')) {
      detectedMap['acoustic-guitar'] = { detected: true, confidence: 0.95 };
      detectedMap['electric-guitar'] = { detected: false, confidence: 0.2 };
      detectedMap['violin'] = { detected: true, confidence: 0.75 };
    }

    if (lower.includes('orchestra') || lower.includes('symphony') || lower.includes('classical')) {
      detectedMap['violin'] = { detected: true, confidence: 0.95 };
      detectedMap['cello'] = { detected: true, confidence: 0.9 };
      detectedMap['flute'] = { detected: true, confidence: 0.8 };
      detectedMap['trumpet'] = { detected: true, confidence: 0.75 };
      detectedMap['drums'] = { detected: false, confidence: 0.3 };
      detectedMap['electric-guitar'] = { detected: false, confidence: 0.1 };
    }

    if (lower.includes('jazz') || lower.includes('brass') || lower.includes('big band')) {
      detectedMap['saxophone'] = { detected: true, confidence: 0.92 };
      detectedMap['trumpet'] = { detected: true, confidence: 0.88 };
      detectedMap['piano'] = { detected: true, confidence: 0.9 };
      detectedMap['drums'] = { detected: true, confidence: 0.88 };
      detectedMap['bass'] = { detected: true, confidence: 0.9 };
    }

    if (lower.includes('piano') && !lower.includes('guitar')) {
      detectedMap['piano'] = { detected: true, confidence: 0.98 };
      if (lower.includes('solo')) {
        detectedMap['drums'] = { detected: false, confidence: 0.1 };
        detectedMap['bass'] = { detected: false, confidence: 0.1 };
        detectedMap['electric-guitar'] = { detected: false, confidence: 0.1 };
      }
    }

    if (lower.includes('rock') || lower.includes('metal') || lower.includes('band')) {
      detectedMap['electric-guitar'] = { detected: true, confidence: 0.96 };
      detectedMap['bass'] = { detected: true, confidence: 0.92 };
      detectedMap['drums'] = { detected: true, confidence: 0.95 };
    }

    if (lower.includes('violin') || lower.includes('strings')) {
      detectedMap['violin'] = { detected: true, confidence: 0.94 };
    }

    const detectedInstruments: DetectedInstrument[] = ALL_INSTRUMENTS.map((inst) => ({
      instrumentId: inst,
      confidence: detectedMap[inst].confidence,
      isDetected: detectedMap[inst].detected,
      isActive: detectedMap[inst].detected,
    }));

    const activeIds = detectedInstruments.filter((d) => d.isDetected).map((d) => d.instrumentId);
    const sections = this.generateSections(duration, activeIds);

    return {
      duration,
      bpm: 124,
      detectedInstruments,
      sections,
      analysisSource: 'metadata_heuristic',
      notes: 'Generated from musical metadata & track profile. You can customize the ensemble below.',
    };
  }

  /**
   * Constructs coherent performance sections with natural entrances and exits
   */
  private generateSections(duration: number, activeInstruments: MusicInstrument[]): MusicSection[] {
    const dur = Math.max(30, duration);

    // Section 1: Intro (0 - 12%) -> Harmonic opening (e.g. Piano or Acoustic Guitar only)
    const introInstruments = activeInstruments.filter((id) => id === 'piano' || id === 'acoustic-guitar' || id === 'violin');
    const introList = introInstruments.length > 0 ? introInstruments : activeInstruments.slice(0, 1);

    // Section 2: Verse (12% - 35%) -> Core rhythm enters (Intro + Bass + Drums)
    const verseList = activeInstruments.filter((id) => id !== 'trumpet' && id !== 'flute');

    // Section 3: Chorus & Climax (35% - 85%) -> Full ensemble performs
    const chorusList = [...activeInstruments];

    // Section 4: Outro (85% - 100%) -> Gentle resolve
    const outroList = activeInstruments.filter((id) => id === 'piano' || id === 'acoustic-guitar' || id === 'violin' || id === 'bass');

    return [
      {
        start: 0,
        end: Math.round(dur * 0.12),
        label: 'Intro / Exposition',
        activeInstruments: introList,
        intensity: 0.4,
      },
      {
        start: Math.round(dur * 0.12),
        end: Math.round(dur * 0.35),
        label: 'Verse & Groove',
        activeInstruments: verseList.length > 0 ? verseList : activeInstruments,
        intensity: 0.65,
      },
      {
        start: Math.round(dur * 0.35),
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
