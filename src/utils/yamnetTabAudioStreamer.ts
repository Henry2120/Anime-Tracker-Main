/**
 * Browser Tab-Audio Streamer & Real-Time YAMNet Classifier.
 * Captures live tab audio via getDisplayMedia and feeds raw audio buffers
 * directly into the browser-local YAMNet classifier.
 * 100% Client-Side. No network requests, zero server load.
 */

import { yamnetService, YamnetDetection } from './yamnetAudioClassifier';

export interface LiveStreamerStatusCallback {
  (
    status:
      | 'idle'
      | 'requesting_permission'
      | 'loading_model'
      | 'capturing'
      | 'paused'
      | 'stopped'
      | 'error',
    error?: {
      type: 'unsupported' | 'permission_denied' | 'policy_blocked' | 'no_audio_track' | 'model_error' | 'unknown';
      message: string;
      actionableHelp?: string;
    }
  ): void;
}

export interface LiveStreamerDetectionCallback {
  (payload: {
    startTime: number;
    endTime: number;
    detections: YamnetDetection[];
    rawTopCategories: Array<{ categoryName: string; score: number }>;
    isSilence: boolean;
  }): void;
}

export class YamnetTabAudioStreamer {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private isRunning: boolean = false;
  private generationId: number = 0;
  private getPlaybackTimeFn: () => number = () => 0;
  private onStatusChange: LiveStreamerStatusCallback | null = null;
  private onDetection: LiveStreamerDetectionCallback | null = null;

  // Audio buffer accumulator: keep ~1.2 seconds of sliding audio
  private accumulatedSamples: number[] = [];
  private lastInferenceTime: number = 0;
  private readonly inferenceIntervalMs = 700; // run inference every 700ms

  constructor(options: {
    generationId: number;
    getPlaybackTime: () => number;
    onStatusChange?: LiveStreamerStatusCallback;
    onDetection: LiveStreamerDetectionCallback;
  }) {
    this.generationId = options.generationId;
    this.getPlaybackTimeFn = options.getPlaybackTime;
    this.onStatusChange = options.onStatusChange || null;
    this.onDetection = options.onDetection;
  }

  /**
   * Prompts user for tab audio capture, initializes YAMNet model, and starts live classification.
   */
  public async start(): Promise<void> {
    if (
      typeof window === 'undefined' ||
      !navigator?.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== 'function'
    ) {
      const err = {
        type: 'unsupported' as const,
        message: 'Tab audio capture (getDisplayMedia) is not supported by your current browser.',
        actionableHelp: 'Please use a modern desktop browser such as Chrome, Edge, or Brave.',
      };
      this.onStatusChange?.('error', err);
      throw err;
    }

    this.onStatusChange?.('requesting_permission');

    let displayStream: MediaStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });
    } catch (captureErr: any) {
      const errMsg = captureErr?.message || String(captureErr);
      const isPolicy =
        errMsg.toLowerCase().includes('permissions policy') ||
        errMsg.toLowerCase().includes('not allowed') ||
        captureErr?.name === 'NotAllowedError';

      const err = {
        type: isPolicy ? ('policy_blocked' as const) : ('permission_denied' as const),
        message: isPolicy
          ? 'Screen/Tab capture was blocked by browser or iframe security policy.'
          : 'Tab audio sharing permission was cancelled or denied.',
        actionableHelp: isPolicy
          ? 'If viewing inside an embedded preview iframe, open the app in a standalone browser window to grant tab audio permissions.'
          : 'Click "Start Tab Audio Detection" and approve tab audio sharing to enable real-time detection.',
      };
      this.onStatusChange?.('error', err);
      throw err;
    }

    // Verify audio track was checked
    const audioTracks = displayStream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      displayStream.getTracks().forEach((t) => t.stop());
      const err = {
        type: 'no_audio_track' as const,
        message: 'No audio track was shared with the application.',
        actionableHelp:
          "When the tab share dialog appears, select the YouTube tab and be sure to check the 'Share audio' or 'Share tab audio' toggle.",
      };
      this.onStatusChange?.('error', err);
      throw err;
    }

    this.stream = displayStream;
    this.isRunning = true;

    // Listen for user stopping via native browser sharing bar
    audioTracks[0].onended = () => {
      console.log('[YAMNet Live] Tab audio ended by user via browser bar.');
      this.stop();
    };

    // Prewarm / load YAMNet model before processing audio
    this.onStatusChange?.('loading_model');
    try {
      await yamnetService.loadModel();
    } catch (modelErr: any) {
      this.stop();
      const err = {
        type: 'model_error' as const,
        message: modelErr?.message || 'Failed to initialize local YAMNet model in WebAssembly.',
        actionableHelp: 'Please check your internet connection or reload the page.',
      };
      this.onStatusChange?.('error', err);
      throw err;
    }

    if (!this.isRunning) return;

    // Initialize Web Audio pipeline
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      this.audioContext = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      this.sourceNode = audioCtx.createMediaStreamSource(audioOnlyStream);

      // ScriptProcessorNode buffer size: 4096 samples
      const bufferSize = 4096;
      this.processorNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      const sampleRate = audioCtx.sampleRate;
      const targetWindowSamples = Math.round(sampleRate * 1.0); // 1.0 second window

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRunning) return;
        const inputData = e.inputBuffer.getChannelData(0);

        // Accumulate mono samples
        for (let i = 0; i < inputData.length; i++) {
          this.accumulatedSamples.push(inputData[i]);
        }

        // Keep buffer bounded to targetWindowSamples
        if (this.accumulatedSamples.length > targetWindowSamples * 1.5) {
          this.accumulatedSamples = this.accumulatedSamples.slice(-targetWindowSamples);
        }

        const now = Date.now();
        if (
          this.accumulatedSamples.length >= targetWindowSamples &&
          now - this.lastInferenceTime >= this.inferenceIntervalMs
        ) {
          this.lastInferenceTime = now;

          const windowSamples = new Float32Array(this.accumulatedSamples.slice(-targetWindowSamples));
          const currentPlayTime = this.getPlaybackTimeFn();
          const windowDuration = windowSamples.length / sampleRate;
          const startTime = Math.max(0, currentPlayTime - windowDuration);
          const endTime = currentPlayTime;

          // Run inference non-blockingly
          yamnetService
            .classifyChunk(windowSamples, sampleRate, startTime, endTime)
            .then((result) => {
              if (!this.isRunning) return;
              this.onDetection?.({
                startTime: result.startTime,
                endTime: result.endTime,
                detections: result.detections,
                rawTopCategories: result.rawTopCategories,
                isSilence: result.isSilence,
              });
            })
            .catch((err) => {
              console.warn('[YAMNet Live] Window classification error:', err);
            });
        }
      };

      this.sourceNode.connect(this.processorNode);
      // Route processor to a dummy destination to keep it active without echoing sound
      const nullGain = audioCtx.createGain();
      nullGain.gain.value = 0;
      this.processorNode.connect(nullGain);
      nullGain.connect(audioCtx.destination);

      this.onStatusChange?.('capturing');
      console.log('[YAMNet Live] Tab audio streaming and live classification started.');
    } catch (pipelineErr: any) {
      this.stop();
      const err = {
        type: 'unknown' as const,
        message: pipelineErr?.message || 'Failed to initialize Web Audio processing pipeline.',
      };
      this.onStatusChange?.('error', err);
      throw err;
    }
  }

  /**
   * Immediately stops all tracks and releases all audio context resources.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.stream = null;
    }

    this.accumulatedSamples = [];
    this.onStatusChange?.('stopped');
    console.log('[YAMNet Live] Tab audio streamer stopped and cleaned up.');
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}
