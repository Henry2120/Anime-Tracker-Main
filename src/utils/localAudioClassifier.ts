/**
 * Local Audio File Classifier using Browser-Side Pretrained YAMNet.
 * Processes user-uploaded audio files (.mp3, .wav, .ogg, .m4a, .flac)
 * entirely inside the browser without transmitting audio bytes over the network.
 */

import {
  yamnetService,
  YamnetWindowResult,
  aggregateYamnetDetections,
} from './yamnetAudioClassifier';
import { InstrumentFamily, InstrumentTimelineSegment } from './instrumentNormalization';

export interface LocalAudioAnalysisResult {
  duration: number;
  segments: InstrumentTimelineSegment[];
  allDetectedInstruments: Array<{ name: string; family: InstrumentFamily }>;
  windowResults: YamnetWindowResult[];
  fileName: string;
}

export interface LocalAudioProgressCallback {
  (progress: number, currentSec: number, totalSec: number): void;
}

/**
 * Analyzes a local audio File/Blob using local YAMNet classification.
 */
export async function analyzeLocalAudioFile(
  file: File | Blob,
  fileName: string,
  onProgress?: LocalAudioProgressCallback,
  signal?: AbortSignal
): Promise<LocalAudioAnalysisResult> {
  // 1. Ensure YAMNet model is loaded
  await yamnetService.loadModel();
  if (signal?.aborted) throw new Error('Analysis aborted by user.');

  // 2. Decode raw file bytes into AudioBuffer via Web Audio API
  const arrayBuffer = await file.arrayBuffer();
  if (signal?.aborted) throw new Error('Analysis aborted by user.');

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  let decodedBuffer: AudioBuffer;

  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    try {
      await audioCtx.close();
    } catch {}
  }

  if (signal?.aborted) throw new Error('Analysis aborted by user.');

  const totalDuration = decodedBuffer.duration;
  if (!totalDuration || totalDuration <= 0) {
    throw new Error('Audio file has invalid or zero duration.');
  }

  // 3. Resample to 16,000 Hz Mono
  const mono16kSamples = await YamnetClassifierService_resample(decodedBuffer);
  if (signal?.aborted) throw new Error('Analysis aborted by user.');

  // 4. Window configuration: 0.975s window (15600 samples) with 50% hop (0.487s)
  const sampleRate = 16000;
  const windowLength = Math.round(0.975 * sampleRate); // 15600 samples
  const hopLength = Math.round(0.4875 * sampleRate); // ~0.5s hop

  const totalSamples = mono16kSamples.length;
  const windowResults: YamnetWindowResult[] = [];

  let offset = 0;
  let chunkIndex = 0;

  while (offset + windowLength <= totalSamples) {
    if (signal?.aborted) throw new Error('Analysis aborted by user.');

    const windowSlice = mono16kSamples.subarray(offset, offset + windowLength);
    const windowStart = offset / sampleRate;
    const windowEnd = (offset + windowLength) / sampleRate;

    const result = await yamnetService.classifyChunk(
      windowSlice,
      sampleRate,
      windowStart,
      windowEnd
    );
    windowResults.push(result);

    offset += hopLength;
    chunkIndex++;

    // Yield control to UI thread every 4 chunks (~2 seconds of audio) to prevent UI hitching
    if (chunkIndex % 4 === 0) {
      const progress = Math.min(100, Math.round((offset / totalSamples) * 100));
      onProgress?.(progress, windowEnd, totalDuration);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Handle trailing chunk if remainder exists
  if (offset < totalSamples && totalSamples - offset >= sampleRate * 0.5) {
    const remainder = mono16kSamples.subarray(offset);
    const padded = new Float32Array(windowLength);
    padded.set(remainder);
    const windowStart = offset / sampleRate;
    const windowEnd = totalSamples / sampleRate;
    const result = await yamnetService.classifyChunk(
      padded,
      sampleRate,
      windowStart,
      windowEnd
    );
    windowResults.push(result);
  }

  onProgress?.(100, totalDuration, totalDuration);

  // 5. Aggregate and smooth detections into timeline segments
  const { segments, detectedInstruments } = aggregateYamnetDetections(
    windowResults,
    totalDuration
  );

  return {
    duration: totalDuration,
    segments,
    allDetectedInstruments: detectedInstruments,
    windowResults,
    fileName,
  };
}

/**
 * Resamples AudioBuffer to 16kHz mono Float32Array.
 */
async function YamnetClassifierService_resample(
  audioBuffer: AudioBuffer
): Promise<Float32Array> {
  const targetSampleRate = 16000;
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const originalRate = audioBuffer.sampleRate;

  // Mixdown to mono
  const mono = new Float32Array(length);
  for (let c = 0; c < numChannels; c++) {
    const channelData = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i] / numChannels;
    }
  }

  if (originalRate === targetSampleRate) {
    return mono;
  }

  const targetLength = Math.round((length * targetSampleRate) / originalRate);
  const OfflineCtx =
    window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offlineCtx = new OfflineCtx(1, targetLength, targetSampleRate);

  const sourceBuffer = offlineCtx.createBuffer(1, length, originalRate);
  sourceBuffer.copyToChannel(mono, 0);

  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}
