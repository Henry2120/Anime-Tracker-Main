import { MusicAnalysisResult } from '../types';
import { instrumentDetector } from '../services/detector';

/**
 * In-browser Web Audio Analyzer helper
 * Delegates to the instrument detector service
 */
export async function analyzeLocalAudioFile(file: File): Promise<{
  analysis: MusicAnalysisResult;
  audioBuffer: AudioBuffer;
}> {
  if (!file) {
    throw new Error('No audio file provided.');
  }

  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioCtx = new AudioContextClass();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const analysis = await instrumentDetector.detectLocalAudio(audioBuffer, file.name);

    return { analysis, audioBuffer };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown audio decode failure';
    console.error('[MusicLab Audio Analyzer] Decoding failed:', errorMsg);
    throw new Error(`This audio format could not be analyzed by your browser. (${errorMsg})`);
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}
