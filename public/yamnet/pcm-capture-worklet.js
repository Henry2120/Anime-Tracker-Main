/**
 * AudioWorkletProcessor that downmixes any multi-channel input stream to mono,
 * applies an anti-aliasing low-pass filter, and resamples from the browser
 * AudioContext's native sampleRate (e.g. 44.1 kHz / 48 kHz / 96 kHz) to
 * 16,000 Hz Float32 PCM frames of 15,600 samples (0.975s) for local YAMNet.
 */

const TARGET_SAMPLE_RATE = 16000;
const FRAME_SIZE_SAMPLES = 15600; // 0.975s @ 16 kHz (YAMNet native waveform window)

class YamnetPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.stopped = false;
    this.phase = 0;
    this.lpPrev = 0;
    this.prevFiltered = 0;
    this.hasInitialized = false;
    this.frameBuffer = new Float32Array(FRAME_SIZE_SAMPLES);
    this.writeIndex = 0;
    this.totalTargetSamplesEmitted = 0;

    // 1-pole low-pass coefficient at ~7.2 kHz (below 8 kHz Nyquist for 16 kHz)
    this.needsDownsampleFilter = sampleRate > TARGET_SAMPLE_RATE;
    this.lpAlpha = this.needsDownsampleFilter
      ? 1 - Math.exp((-2 * Math.PI * 7200) / sampleRate)
      : 1;
    this.step = sampleRate / TARGET_SAMPLE_RATE;

    this.port.onmessage = (event) => {
      if (event?.data?.type === 'stop') {
        this.stopped = true;
      } else if (event?.data?.type === 'reset') {
        this.phase = 0;
        this.lpPrev = 0;
        this.prevFiltered = 0;
        this.hasInitialized = false;
        this.writeIndex = 0;
      }
    };
  }

  process(inputs) {
    if (this.stopped) return false;

    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    const numChannels = input.length;
    const blockLength = input[0].length;
    const filtered = new Float32Array(blockLength);

    // 1. Mix all input channels to mono and run anti-aliasing low-pass filter
    for (let i = 0; i < blockLength; i++) {
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        sum += input[ch][i] || 0;
      }
      const mono = sum / numChannels;
      if (this.needsDownsampleFilter) {
        this.lpPrev = this.lpPrev + this.lpAlpha * (mono - this.lpPrev);
        filtered[i] = this.lpPrev;
      } else {
        filtered[i] = mono;
      }
    }

    if (!this.hasInitialized) {
      this.prevFiltered = filtered[0];
      this.hasInitialized = true;
    }

    // 2. Resample to 16,000 Hz using continuous fractional phase across blocks
    while (this.phase < blockLength - 1) {
      const i0 = Math.floor(this.phase);
      const frac = this.phase - i0;
      const s0 = i0 < 0 ? this.prevFiltered : filtered[i0];
      const s1 = filtered[i0 + 1];
      const sample16k = s0 + frac * (s1 - s0);

      this.frameBuffer[this.writeIndex++] = sample16k;

      if (this.writeIndex >= FRAME_SIZE_SAMPLES) {
        let energySum = 0;
        for (let k = 0; k < FRAME_SIZE_SAMPLES; k++) {
          const v = this.frameBuffer[k];
          energySum += v * v;
        }
        const rms = Math.sqrt(energySum / FRAME_SIZE_SAMPLES);
        const completedFrame = this.frameBuffer;
        this.totalTargetSamplesEmitted += FRAME_SIZE_SAMPLES;

        // Transfer ownership zero-copy to main thread
        this.port.postMessage(
          {
            type: 'frame',
            samples: completedFrame,
            sampleRate: TARGET_SAMPLE_RATE,
            sourceSampleRate: sampleRate,
            frameDurationSec: FRAME_SIZE_SAMPLES / TARGET_SAMPLE_RATE,
            rms,
            totalTargetSamples: this.totalTargetSamplesEmitted,
          },
          [completedFrame.buffer]
        );

        this.frameBuffer = new Float32Array(FRAME_SIZE_SAMPLES);
        this.writeIndex = 0;
      }

      this.phase += this.step;
    }

    this.prevFiltered = filtered[blockLength - 1];
    this.phase -= blockLength;

    return true;
  }
}

registerProcessor('yamnet-pcm-processor', YamnetPcmProcessor);
