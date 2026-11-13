/**
 * Local Web Audio tab-audio capture and 16 kHz mono Float32 PCM streaming
 * for browser-side MediaPipe YAMNet Live Detection.
 *
 * Uses navigator.mediaDevices.getDisplayMedia with mandatory audio track verification
 * and an AudioWorkletProcessor (/yamnet/pcm-capture-worklet.js) that downmixes multi-channel
 * input to mono, anti-alias filters, and resamples cleanly to 16,000 Hz PCM.
 */

export const YAMNET_WORKLET_PATH = '/yamnet/pcm-capture-worklet.js';
export const YAMNET_TARGET_SAMPLE_RATE = 16000;

export interface PcmFramePayload {
  samples16k: Float32Array;
  sampleRate: 16000;
  sourceSampleRate: number;
  frameDurationSec: number;
  rms: number;
  generationId: number;
}

export type LiveCaptureStatus =
  | 'idle'
  | 'requesting_permission'
  | 'capturing'
  | 'paused'
  | 'stopped'
  | 'error';

export interface LiveCaptureError {
  type:
    | 'unsupported'
    | 'permission_denied'
    | 'policy_blocked'
    | 'no_audio_track'
    | 'worklet_error'
    | 'unknown';
  message: string;
  actionableHelp?: string;
}

/**
 * Checks if getDisplayMedia and Web Audio AudioWorklet are supported by the current browser.
 */
export function isTabAudioCaptureSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(navigator?.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') &&
    typeof AudioContext !== 'undefined'
  );
}

/**
 * Detects whether the app is currently hosted inside a nested iframe.
 */
export function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Downmixes & resamples an arbitrary sample-rate block/buffer to 16 kHz mono Float32 PCM.
 * Exported as a reusable pure DSP helper (also tested independently in unit tests).
 */
export function downsampleTo16kMono(
  channels: Float32Array[],
  sourceSampleRate: number,
  targetSampleRate: number = YAMNET_TARGET_SAMPLE_RATE
): Float32Array {
  if (!channels.length || channels[0].length === 0) {
    return new Float32Array(0);
  }

  const numChannels = channels.length;
  const inputLen = channels[0].length;
  const mono = new Float32Array(inputLen);

  for (let i = 0; i < inputLen; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      sum += channels[ch][i] || 0;
    }
    mono[i] = sum / numChannels;
  }

  if (!sourceSampleRate || sourceSampleRate === targetSampleRate) {
    return mono;
  }

  // Anti-aliasing low-pass filter before downsampling
  let filtered = mono;
  if (sourceSampleRate > targetSampleRate) {
    filtered = new Float32Array(inputLen);
    const alpha = 1 - Math.exp((-2 * Math.PI * 7200) / sourceSampleRate);
    let lpPrev = mono[0];
    filtered[0] = lpPrev;
    for (let i = 1; i < inputLen; i++) {
      lpPrev = lpPrev + alpha * (mono[i] - lpPrev);
      filtered[i] = lpPrev;
    }
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLen = Math.max(1, Math.floor(inputLen / ratio));
  const out = new Float32Array(outputLen);

  for (let j = 0; j < outputLen; j++) {
    const srcPos = j * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(inputLen - 1, i0 + 1);
    const frac = srcPos - i0;
    out[j] = filtered[i0] + frac * (filtered[i1] - filtered[i0]);
  }

  return out;
}

/**
 * Session controller managing browser tab audio stream, AudioWorklet 16 kHz PCM extraction,
 * single-session lifecycle guarantees, and clean disposal of all Web Audio resources.
 */
export class LiveTabAudioCaptureSession {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;
  private currentGenerationId: number = 0;
  private isRunning: boolean = false;
  private isDisposed: boolean = false;

  private onFrameCallback: ((payload: PcmFramePayload) => void) | null = null;
  private onStatusChangeCallback:
    | ((status: LiveCaptureStatus, error?: LiveCaptureError) => void)
    | null = null;

  constructor(options: {
    generationId: number;
    onFrame: (payload: PcmFramePayload) => void;
    onStatusChange?: (status: LiveCaptureStatus, error?: LiveCaptureError) => void;
  }) {
    this.currentGenerationId = options.generationId;
    this.onFrameCallback = options.onFrame;
    this.onStatusChangeCallback = options.onStatusChange || null;
  }

  /**
   * Prompts the user to select the browser tab with audio sharing and begins 16 kHz PCM capture.
   */
  public async start(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Cannot start a disposed LiveTabAudioCaptureSession.');
    }

    if (!isTabAudioCaptureSupported()) {
      const err: LiveCaptureError = {
        type: 'unsupported',
        message: 'Tab audio capture (getDisplayMedia + Web Audio) is not supported in this browser.',
        actionableHelp: 'Please use a modern desktop Chromium browser (Chrome, Edge, or Brave).',
      };
      this.onStatusChangeCallback?.('error', err);
      throw err;
    }

    this.onStatusChangeCallback?.('requesting_permission');

    try {
      // Request video: true (browser requirement for getDisplayMedia tab sharing) + raw unprocessed audio.
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      if (this.isDisposed) {
        displayStream.getTracks().forEach((t) => t.stop());
        return;
      }

      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        const err: LiveCaptureError = {
          type: 'no_audio_track',
          message: 'No audio track was shared with the application.',
          actionableHelp:
            'In the browser share dialog, select the Chromium tab playing this video and make sure the "Also share tab audio" toggle is turned ON.',
        };
        this.onStatusChangeCallback?.('error', err);
        throw err;
      }

      this.stream = displayStream;

      // Stop gracefully if user clicks the browser banner "Stop sharing"
      audioTracks[0].onended = () => {
        if (!this.isDisposed && this.isRunning) {
          this.stop();
        }
      };

      // Initialize Web Audio pipeline with AudioWorklet for clean off-main-thread resampling
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      this.audioContext = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (!ctx.audioWorklet) {
        this.cleanupInternal();
        const err: LiveCaptureError = {
          type: 'worklet_error',
          message: 'AudioWorklet is unavailable in this browser context.',
          actionableHelp:
            'AudioWorklet requires a secure HTTPS or localhost origin. Open the app in a standalone HTTPS Chrome tab.',
        };
        this.onStatusChangeCallback?.('error', err);
        throw err;
      }

      await ctx.audioWorklet.addModule(YAMNET_WORKLET_PATH);

      if (this.isDisposed) {
        this.cleanupInternal();
        return;
      }

      // Build an audio-only MediaStream so video frames do not overhead the audio graph
      const audioOnlyStream = new MediaStream(audioTracks);
      const source = ctx.createMediaStreamSource(audioOnlyStream);
      const worklet = new AudioWorkletNode(ctx, 'yamnet-pcm-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      // Connect via a zero-gain sink so Chromium drives the AudioWorklet graph without feedback/echo
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      this.sourceNode = source;
      this.workletNode = worklet;
      this.silentGainNode = silentGain;

      worklet.port.onmessage = (event: MessageEvent) => {
        if (!this.isRunning || this.isDisposed) return;
        const data = event.data;
        if (data?.type === 'frame' && data.samples instanceof Float32Array) {
          this.onFrameCallback?.({
            samples16k: data.samples,
            sampleRate: YAMNET_TARGET_SAMPLE_RATE,
            sourceSampleRate: typeof data.sourceSampleRate === 'number' ? data.sourceSampleRate : ctx.sampleRate,
            frameDurationSec:
              typeof data.frameDurationSec === 'number'
                ? data.frameDurationSec
                : data.samples.length / YAMNET_TARGET_SAMPLE_RATE,
            rms: typeof data.rms === 'number' ? data.rms : 0,
            generationId: this.currentGenerationId,
          });
        }
      };

      source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(ctx.destination);

      this.isRunning = true;
      this.onStatusChangeCallback?.('capturing');
    } catch (err: any) {
      this.cleanupInternal();

      if (err && typeof err === 'object' && 'type' in err && 'message' in err) {
        throw err;
      }

      const errMsg = err?.message || String(err);
      const lower = errMsg.toLowerCase();
      const inIframe = isRunningInIframe();
      const isPolicy =
        lower.includes('permissions policy') ||
        lower.includes('disallowed by permissions policy') ||
        (inIframe && (err?.name === 'NotAllowedError' || lower.includes('not allowed')));

      const captureErr: LiveCaptureError = {
        type: isPolicy ? 'policy_blocked' : 'permission_denied',
        message: isPolicy
          ? 'Tab audio sharing was blocked by the surrounding iframe Permissions Policy.'
          : 'Tab audio sharing permission was cancelled or denied.',
        actionableHelp: isPolicy
          ? 'Open AniVerse directly in a standalone Chrome tab (e.g. your Cloud Run HTTPS URL) instead of inside an embedded preview iframe, then share this tab with audio.'
          : 'Click "Start Live Detection", select the tab playing YouTube, and enable "Share tab audio".',
      };

      this.onStatusChangeCallback?.('error', captureErr);
      throw captureErr;
    }
  }

  private cleanupInternal(): void {
    this.isRunning = false;

    if (this.workletNode) {
      try {
        this.workletNode.port.postMessage({ type: 'stop' });
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.silentGainNode) {
      try {
        this.silentGainNode.disconnect();
      } catch {}
      this.silentGainNode = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.onended = null;
          track.stop();
        } catch {}
      });
      this.stream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }

  /**
   * Stops capture immediately and releases every Web Audio node, stream track, and AudioContext.
   */
  public stop(): void {
    const wasActive = this.isRunning || this.stream !== null || this.audioContext !== null;
    this.isDisposed = true;
    this.cleanupInternal();
    if (wasActive) {
      this.onStatusChangeCallback?.('stopped');
    }
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}
