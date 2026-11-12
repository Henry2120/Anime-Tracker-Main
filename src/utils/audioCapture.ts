/**
 * Dedicated tab-audio capture and windowed chunking for True Live Detection.
 * Uses navigator.mediaDevices.getDisplayMedia with mandatory audio track verification.
 * Respects browser security, permissions policy, and clean resource disposal.
 */

export interface AudioChunkPayload {
  audioBase64: string;
  mimeType: string;
  chunkDuration: number;
  playbackStart: number;
  playbackEnd: number;
  generationId: number;
  isProvisional: boolean;
}

export type LiveCaptureStatus =
  | 'idle'
  | 'requesting_permission'
  | 'capturing'
  | 'paused'
  | 'stopped'
  | 'error';

export interface LiveCaptureError {
  type: 'unsupported' | 'permission_denied' | 'policy_blocked' | 'no_audio_track' | 'unknown';
  message: string;
  actionableHelp?: string;
}

/**
 * Checks if getDisplayMedia is supported by the current browser environment.
 */
export function isTabAudioCaptureSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(navigator?.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function')
  );
}

/**
 * Encodes an ArrayBuffer or Blob into a Base64 string safely.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Session controller managing tab audio stream, window slicing, and timestamp alignment.
 */
export class LiveTabAudioCaptureSession {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunkTimer: any = null;
  private currentGenerationId: number = 0;
  private isRunning: boolean = false;
  private recordedBlobs: Blob[] = [];
  private windowStartTime: number = 0;

  // Window settings: ~8-10 seconds of captured audio
  private readonly windowIntervalMs = 8000;

  private onChunkCallback: ((payload: AudioChunkPayload) => void) | null = null;
  private onStatusChangeCallback: ((status: LiveCaptureStatus, error?: LiveCaptureError) => void) | null = null;
  private getPlaybackTimeFn: () => number = () => 0;

  constructor(options: {
    generationId: number;
    getPlaybackTime: () => number;
    onChunk: (payload: AudioChunkPayload) => void;
    onStatusChange?: (status: LiveCaptureStatus, error?: LiveCaptureError) => void;
  }) {
    this.currentGenerationId = options.generationId;
    this.getPlaybackTimeFn = options.getPlaybackTime;
    this.onChunkCallback = options.onChunk;
    this.onStatusChangeCallback = options.onStatusChange || null;
  }

  /**
   * Prompts the user to select the browser tab with audio sharing and begins capture.
   */
  public async start(): Promise<void> {
    if (!isTabAudioCaptureSupported()) {
      const err: LiveCaptureError = {
        type: 'unsupported',
        message: 'Tab audio capture (getDisplayMedia) is not supported by your current browser.',
        actionableHelp: 'Please use a modern desktop browser such as Chrome, Edge, or Brave.',
      };
      this.onStatusChangeCallback?.('error', err);
      throw err;
    }

    this.onStatusChangeCallback?.('requesting_permission');

    try {
      // Prompt user with display media dialog.
      // Must request video: true because getDisplayMedia requires video, and audio: true for tab audio.
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      // Strict validation: Verify the user actually shared an audio track!
      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        // Stop any video tracks that were granted
        displayStream.getTracks().forEach((t) => t.stop());
        const err: LiveCaptureError = {
          type: 'no_audio_track',
          message: 'No audio track was shared with the application.',
          actionableHelp:
            "When the browser window/tab share dialog appears, select the YouTube tab and make sure to check the 'Share audio' or 'Share tab audio' toggle.",
        };
        this.onStatusChangeCallback?.('error', err);
        throw err;
      }

      this.stream = displayStream;
      this.isRunning = true;
      this.onStatusChangeCallback?.('capturing');

      // Listen for when user clicks "Stop sharing" in the native browser banner
      audioTracks[0].onended = () => {
        console.log('[Live Audio] Tab audio stream ended by user via browser UI.');
        this.stop();
      };

      // Set up MediaRecorder on audio stream
      // Create an audio-only stream to ensure lightweight encoding
      const audioOnlyStream = new MediaStream(audioTracks);

      // Determine best supported mime type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else {
          mimeType = '';
        }
      }

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      this.mediaRecorder = new MediaRecorder(audioOnlyStream, recorderOptions);
      const effectiveMime = this.mediaRecorder.mimeType || 'audio/webm';

      this.windowStartTime = this.getPlaybackTimeFn();

      this.mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (event.data && event.data.size > 0 && this.isRunning) {
          this.recordedBlobs.push(event.data);
        }
      };

      // Start recording in chunks
      this.mediaRecorder.start(1000); // collect timeslices every 1s

      // Schedule window harvest every windowIntervalMs (8s)
      this.scheduleNextWindowHarvest(effectiveMime);
    } catch (err: any) {
      if (err.type) throw err; // already formatted

      const errMsg = err?.message || String(err);
      const isPermissionPolicy =
        errMsg.toLowerCase().includes('permissions policy') ||
        errMsg.toLowerCase().includes('not allowed') ||
        err?.name === 'NotAllowedError';

      const captureErr: LiveCaptureError = {
        type: isPermissionPolicy ? 'policy_blocked' : 'permission_denied',
        message: isPermissionPolicy
          ? 'Screen/Tab capture was blocked by browser or iframe security policy.'
          : 'Tab audio sharing permission was cancelled or denied.',
        actionableHelp: isPermissionPolicy
          ? 'The iframe environment or browser settings may restrict getDisplayMedia. If previewing in an iframe, try opening the preview URL in a standalone browser tab.'
          : 'Click "Start Live Detection" and approve tab audio sharing to enable real-time detection.',
      };

      this.onStatusChangeCallback?.('error', captureErr);
      throw captureErr;
    }
  }

  private scheduleNextWindowHarvest(mimeType: string) {
    if (!this.isRunning) return;

    this.chunkTimer = setTimeout(async () => {
      if (!this.isRunning || !this.mediaRecorder) return;

      const windowEndTime = this.getPlaybackTimeFn();
      const chunkDuration = Math.max(1, Math.round((windowEndTime - this.windowStartTime) * 10) / 10);

      if (this.recordedBlobs.length > 0) {
        const fullBlob = new Blob(this.recordedBlobs, { type: mimeType });
        // Retain the last 2 seconds of blobs for window overlap (~25%)
        const overlapBlobs = this.recordedBlobs.slice(-2);
        this.recordedBlobs = overlapBlobs;

        try {
          const base64Data = await blobToBase64(fullBlob);
          if (this.isRunning && this.onChunkCallback) {
            this.onChunkCallback({
              audioBase64: base64Data,
              mimeType,
              chunkDuration,
              playbackStart: Math.max(0, this.windowStartTime),
              playbackEnd: windowEndTime,
              generationId: this.currentGenerationId,
              isProvisional: true,
            });
          }
        } catch (encodeErr) {
          console.warn('[Live Audio] Chunk base64 encoding failed:', encodeErr);
        }
      }

      this.windowStartTime = windowEndTime;
      this.scheduleNextWindowHarvest(mimeType);
    }, this.windowIntervalMs);
  }

  /**
   * Stops audio capture and completely cleans up all streams, nodes, and timers.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
      this.mediaRecorder = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
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

    this.recordedBlobs = [];
    this.onStatusChangeCallback?.('stopped');
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}
