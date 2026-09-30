import * as THREE from 'three';
import { PlaybackState, MusicAnalysisResult } from '../../types';
import { AnatomicalViolinistPoseParams } from '../PoseEditor/anatomicalPosePreset';

export interface MusicalMotionState {
  // Timeline and rhythm
  currentTime: number;
  bpm: number;
  beatDuration: number;
  beatPhase: number;       // 0..1 per single beat
  measurePhase: number;    // 0..1 per 4-beat measure
  bowStrokePhase: number;  // 0..1 per 2-beat bowing stroke cycle
  
  // Dynamics and energy
  rawIntensity: number;       // 0..1 from current musical section / activity
  smoothedIntensity: number; // 0..1 smoothed over time (attack/decay)
  isPlaying: boolean;
  
  // Motion amplitude and components
  torsoSway: number;        // -1..1
  torsoTwist: number;       // -1..1
  torsoLean: number;        // -1..1
  headNod: number;          // -1..1
  headTilt: number;         // -1..1
  headTurn: number;         // -1..1
  bowStroke: number;        // -1 (up-bow) to +1 (down-bow)
  bowEnergy: number;        // 0..1
  fingerSpring: number;     // -1..1
}

/**
 * Core Music-Driven 3D Motion Engine for Violinist Performance
 *
 * Translates playback timeline, BPM tempo, and musical section intensity into
 * deterministic, phase-based, biologically constrained skeletal motion layers.
 */
export class ViolinMusicMotionEngine {
  private smoothedIntensity = 0.0;
  private lastTime = 0.0;

  // Temporal smoothing configuration (attack / decay rates in 1/sec)
  private attackRate = 3.8;
  private decayRate = 2.4;

  // Motion Amplitude Bounds (maximum degrees offset at intensity = 1.0)
  public static readonly MAX_OFFSETS = {
    // Torso: Rhythmic sway and expressive breathing
    torsoSideLean: 2.4,     // ±2.4° roll sway on 4-beat measure
    torsoTwist: 1.6,        // ±1.6° yaw twist
    torsoForwardLean: 2.0,  // +2.0° pitch nod on downbeats

    // Head: Subtle musical nodding and neck tilt in harmony with torso
    headNod: 2.4,           // ±2.4° nod on downbeats
    headTilt: 1.8,          // ±1.8° tilt
    headTurn: 1.2,          // ±1.2° turn

    // Right Arm / Bowing: Cyclic down-bow / up-bow stroke
    rightElbowFlex: 12.0,   // ±12.0° elbow stroke (extends in down-bow, flexes in up-bow)
    rightArmRaise: 4.2,     // ±4.2° bowing elevation
    rightArmForward: 5.0,   // ±5.0° forward stroke travel
    rightForearmTwist: 3.5, // ±3.5° bowing forearm pronation compensation

    // Left Arm: Stable support posture with subtle sympathetic breathing
    leftArmRaise: 0.8,      // ±0.8° sympathetic torso breathing
    leftArmForward: 0.6,    // ±0.6°

    // Right Wrist & Fingers: Dynamic compliant flexibility on bow stroke reversal
    rightWristBend: 3.5,    // ±3.5° wrist flexion at frog/tip turnarounds
    rightWristTurn: 2.5,    // ±2.5°
    rightFingerCurl: 5.0,   // ±5.0° dynamic finger spring
    rightThumbOpposition: 3.0, // ±3.0°
  };

  /**
   * Evaluates the current musical motion state from playback clock and analysis data
   */
  public update(
    playback: PlaybackState,
    analysis: MusicAnalysisResult | null,
    delta: number
  ): MusicalMotionState {
    const isPlaying = Boolean(playback.isPlaying);
    const currentTime = Math.max(0, playback.currentTime || 0);
    const dt = Math.max(0.001, Math.min(0.1, delta));

    // 1. TEMPO / SPEED: BPM to musical beat duration
    const rawBpm = analysis?.bpm && analysis.bpm > 30 && analysis.bpm < 300 ? analysis.bpm : 120;
    const bpm = THREE.MathUtils.clamp(rawBpm, 50, 220);
    const beatDuration = 60 / bpm; // seconds per beat

    // 2. PHASE-BASED RHYTHMIC TIMING: Continuous periodic phases
    // beatPhase: 0..1 per single beat
    const beatPhase = (currentTime / beatDuration) % 1.0;
    // measurePhase: 0..1 per 4-beat bar
    const measurePhase = (currentTime / (beatDuration * 4)) % 1.0;
    // bowStrokePhase: 0..1 per 2-beat bowing cycle (1 beat down-bow, 1 beat up-bow)
    const bowStrokePhase = (currentTime / (beatDuration * 2)) % 1.0;

    // 3. INTENSITY: Resolve raw target intensity from active sections / activities
    let rawIntensity = 0.0;
    if (isPlaying) {
      if (analysis && analysis.sections && analysis.sections.length > 0) {
        // Find current active section
        const activeSection = analysis.sections.find(
          (s) => currentTime >= s.start && currentTime <= s.end
        );
        if (activeSection) {
          const isViolinActive = activeSection.activeInstruments?.includes('violin') ?? true;
          rawIntensity = isViolinActive ? activeSection.intensity : activeSection.intensity * 0.4;
        } else {
          rawIntensity = 0.55;
        }
      } else if (analysis && analysis.instrumentActivities && analysis.instrumentActivities.length > 0) {
        const dur = analysis.duration || 1;
        const progress = THREE.MathUtils.clamp(currentTime / dur, 0, 1);
        const violinActivity = analysis.instrumentActivities.find(
          (a) => a.instrumentId === 'violin' && progress >= a.startPercent && progress <= a.endPercent
        );
        rawIntensity = violinActivity ? violinActivity.intensity : 0.5;
      } else {
        // Default musical active baseline when playing without metadata
        rawIntensity = 0.6;
      }
    } else {
      // Stopped / Paused: Target intensity decays to zero
      rawIntensity = 0.0;
    }

    rawIntensity = THREE.MathUtils.clamp(rawIntensity, 0.0, 1.0);

    // 4. TEMPORAL INTENSITY SMOOTHING (Attack / Decay)
    const rate = rawIntensity >= this.smoothedIntensity ? this.attackRate : this.decayRate;
    const blendFactor = 1.0 - Math.exp(-rate * dt);
    this.smoothedIntensity += (rawIntensity - this.smoothedIntensity) * blendFactor;
    if (this.smoothedIntensity < 0.0005) {
      this.smoothedIntensity = 0.0;
    }

    // 5. PHASE HARMONICS (Smooth trigonometric curves)
    const beatAngle = beatPhase * Math.PI * 2;
    const measureAngle = measurePhase * Math.PI * 2;
    const bowAngle = bowStrokePhase * Math.PI * 2;

    const torsoSway = Math.sin(measureAngle);
    const torsoTwist = Math.cos(measureAngle);
    const torsoLean = Math.sin(beatAngle) * 0.5 + 0.5;

    const headNod = Math.sin(beatAngle + 0.35);
    const headTilt = -Math.sin(measureAngle + 0.25);
    const headTurn = Math.cos(measureAngle);

    const bowStroke = Math.sin(bowAngle); // -1 (up-bow) to +1 (down-bow)
    const bowEnergy = this.smoothedIntensity;
    const fingerSpring = -Math.cos(bowAngle);

    this.lastTime = currentTime;

    return {
      currentTime,
      bpm,
      beatDuration,
      beatPhase,
      measurePhase,
      bowStrokePhase,
      rawIntensity,
      smoothedIntensity: this.smoothedIntensity,
      isPlaying,
      torsoSway,
      torsoTwist,
      torsoLean,
      headNod,
      headTilt,
      headTurn,
      bowStroke,
      bowEnergy,
      fingerSpring,
    };
  }

  /**
   * Computes the final effective performance pose parameters:
   * Effective Pose = Base Pose + Clamped Motion Offsets(motionState)
   */
  public computePoseParams(
    baseParams: AnatomicalViolinistPoseParams,
    state: MusicalMotionState
  ): AnatomicalViolinistPoseParams {
    const s = state.smoothedIntensity;

    if (s <= 0.0001) {
      return { ...baseParams };
    }

    const MO = ViolinMusicMotionEngine.MAX_OFFSETS;

    // 1. Torso Motion Offsets
    const dTorsoLean = state.torsoSway * MO.torsoSideLean * s;
    const dTorsoTwist = state.torsoTwist * MO.torsoTwist * s;
    const dTorsoForward = state.torsoLean * MO.torsoForwardLean * s;

    // 2. Head Motion Offsets
    const dHeadNod = state.headNod * MO.headNod * s;
    const dHeadTilt = state.headTilt * MO.headTilt * s;
    const dHeadTurn = state.headTurn * MO.headTurn * s;

    // 3. Right Arm / Bowing Stroke Offsets
    // In down-bow (state.bowStroke > 0), arm extends and moves forward; in up-bow, arm flexes and retracts
    const dRightElbowFlex = -state.bowStroke * MO.rightElbowFlex * s;
    const dRightArmRaise = -Math.cos(state.bowStrokePhase * Math.PI * 2) * MO.rightArmRaise * s;
    const dRightArmForward = state.bowStroke * MO.rightArmForward * s;
    const dRightForearmTwist = -state.bowStroke * MO.rightForearmTwist * s;

    // 4. Left Arm Subtle Sympathetic Breathing (Preserving neck cradle stability)
    const dLeftArmRaise = state.torsoSway * MO.leftArmRaise * s;
    const dLeftArmForward = state.torsoTwist * MO.leftArmForward * s;

    // 5. Right Wrist & Hand Compliant Cushioning
    const dRightWristBend = Math.cos(state.bowStrokePhase * Math.PI * 2) * MO.rightWristBend * s;
    const dRightWristTurn = state.bowStroke * MO.rightWristTurn * s;
    const dRightFingerCurl = state.fingerSpring * MO.rightFingerCurl * s;
    const dRightThumbOppose = state.fingerSpring * MO.rightThumbOpposition * s;

    return {
      ...baseParams,
      // Torso
      torsoTwist: baseParams.torsoTwist + dTorsoTwist,
      torsoSideLean: baseParams.torsoSideLean + dTorsoLean,
      torsoForwardLean: (baseParams.torsoForwardLean || 0) + dTorsoForward,

      // Head
      headTurn: baseParams.headTurn + dHeadTurn,
      headTilt: baseParams.headTilt + dHeadTilt,
      headNod: baseParams.headNod + dHeadNod,

      // Left Arm
      leftArmRaise: baseParams.leftArmRaise + dLeftArmRaise,
      leftArmForward: baseParams.leftArmForward + dLeftArmForward,
      leftArmTwist: baseParams.leftArmTwist,
      leftElbowFlex: baseParams.leftElbowFlex,
      leftForearmTwist: baseParams.leftForearmTwist,

      // Left Hand (Firmly Locked)
      leftWristTurn: baseParams.leftWristTurn,
      leftWristBend: baseParams.leftWristBend,
      leftWristSideTilt: baseParams.leftWristSideTilt,
      leftFingerCurl: baseParams.leftFingerCurl,
      leftThumbOpposition: baseParams.leftThumbOpposition,

      // Right Arm
      rightArmRaise: baseParams.rightArmRaise + dRightArmRaise,
      rightArmForward: baseParams.rightArmForward + dRightArmForward,
      rightArmTwist: baseParams.rightArmTwist,
      rightElbowFlex: baseParams.rightElbowFlex + dRightElbowFlex,
      rightForearmTwist: baseParams.rightForearmTwist + dRightForearmTwist,

      // Right Hand & Grip
      rightWristTurn: baseParams.rightWristTurn + dRightWristTurn,
      rightWristBend: baseParams.rightWristBend + dRightWristBend,
      rightWristSideTilt: baseParams.rightWristSideTilt,
      rightFingerCurl: THREE.MathUtils.clamp(baseParams.rightFingerCurl + dRightFingerCurl, 0, 90),
      rightThumbOpposition: THREE.MathUtils.clamp(baseParams.rightThumbOpposition + dRightThumbOppose, 0, 70),
    };
  }

  /**
   * Resets internal smoothed state to immediate zero
   */
  public reset() {
    this.smoothedIntensity = 0.0;
    this.lastTime = 0.0;
  }
}
