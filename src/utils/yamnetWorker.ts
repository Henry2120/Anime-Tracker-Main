/// <reference lib="webworker" />
import { AudioClassifier, FilesetResolver } from '@mediapipe/tasks-audio';
import {
  YamnetTemporalTracker,
  YAMNET_MODEL_PATH,
  YAMNET_WASM_BASE_PATH,
  YamnetFrameResult,
} from './yamnetClassifier';

type WorkerRequest =
  | { id: number; type: 'init' }
  | { id: number; type: 'reset' }
  | { id: number; type: 'dispose' }
  | {
      id: number;
      type: 'classify';
      samples16k: Float32Array;
      playbackStart: number;
      playbackEnd: number;
      inputRms?: number;
    };

let classifier: AudioClassifier | null = null;
let initPromise: Promise<AudioClassifier> | null = null;
const tracker = new YamnetTemporalTracker();

async function ensureClassifier(): Promise<AudioClassifier> {
  if (classifier) return classifier;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      let audioFileset: any;
      try {
        // ES-module worker builds prefer audio_wasm_module_internal.js when available
        audioFileset = await (FilesetResolver.forAudioTasks as any)(YAMNET_WASM_BASE_PATH, true);
      } catch {
        audioFileset = await FilesetResolver.forAudioTasks(YAMNET_WASM_BASE_PATH);
      }

      const candidateMaxResults = [521, 128, 64];
      let instance: AudioClassifier | null = null;
      let lastErr: unknown = null;

      for (const maxResults of candidateMaxResults) {
        try {
          instance = await AudioClassifier.createFromOptions(audioFileset, {
            baseOptions: {
              modelAssetPath: YAMNET_MODEL_PATH,
            },
            maxResults,
          });
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!instance) {
        throw lastErr || new Error('Failed to create MediaPipe AudioClassifier inside Worker');
      }

      instance.setDefaultSampleRate(16000);
      classifier = instance;
      return instance;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!msg) return;

  try {
    if (msg.type === 'init') {
      await ensureClassifier();
      self.postMessage({ id: msg.id, ok: true });
      return;
    }

    if (msg.type === 'reset') {
      tracker.reset();
      self.postMessage({ id: msg.id, ok: true });
      return;
    }

    if (msg.type === 'dispose') {
      tracker.reset();
      if (classifier) {
        try {
          classifier.close();
        } catch {}
        classifier = null;
      }
      initPromise = null;
      self.postMessage({ id: msg.id, ok: true });
      return;
    }

    if (msg.type === 'classify') {
      const cls = await ensureClassifier();
      const results = cls.classify(msg.samples16k, 16000);
      const categories = results?.[0]?.classifications?.[0]?.categories || [];
      const frameResult: YamnetFrameResult = tracker.processCategories({
        categories,
        playbackStart: msg.playbackStart,
        playbackEnd: msg.playbackEnd,
        inputRms: msg.inputRms,
        samples16k: msg.samples16k,
      });

      self.postMessage({ id: msg.id, ok: true, result: frameResult });
    }
  } catch (err: any) {
    self.postMessage({
      id: msg.id,
      ok: false,
      error: err?.message || String(err),
    });
  }
};
