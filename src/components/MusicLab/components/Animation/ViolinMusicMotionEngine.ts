import * as THREE from 'three';
import { PlaybackState, MusicAnalysisResult } from '../../types';
import { AnatomicalViolinistPoseParams } from '../PoseEditor/anatomicalPosePreset';

export interface MusicalMotionState {
  // Timeline and rhythm
  currentTime: number;
  bpm: number;
  beatDuration: number;
  beatPhase: number;          // 0..1 per single beat
  measurePhase: number;       // 0..1 per 4-beat measure
  phrasePhase: number;        // 0..1 per 16-beat musical phrase
  bowStrokePhase: number;     // 0..1 per 2-beat bowing stroke cycle
  
  // Dynamic trajectory states (continuous velocity & acceleration)
  bowPosition: number;        // -1 (tip / down-bow turnaround) to +1 (frog / up-bow turnaround)
  bowVelocity: number;        // Rate of bow travel with smooth deceleration at endpoints
  
  // Dynamics and energy
  rawIntensity: number;       // 0..1 from current musical section / activity
  smoothedIntensity: number; // 0..1 smoothed over time (attack/decay)
  phraseMultiplier: number;  // 0.85..1.15 phrase-level expressive arc
  isPlaying: boolean;
  
  // Kinematic layer outputs
  torsoSway: number;          // -1..1 lateral weight shift (roll)
  torsoTwist: number;         // -1..1 axial torso turn (yaw)
  torsoLean: number;          // 0..1 rhythmic forward pitch
  headNod: number;            // 0..1 expressive downward nod
  headTilt: number;           // -1..1 expressive listening tilt
  headTurn: number;           // -1..1 gaze direction
  shoulderLift: number;       // -1..1 right shoulder elevation
  armFollowThrough: number;   // -1..1 kinetic arm follow
}

/**
 * Continuous Layered Performance-Motion Engine for Violinist
 *
 * Implements a realistic physical kinetic chain:
 * Music Timing / Phrase -> Bow Stroke Trajectory -> Arm Follow-Through -> Shoulder -> Torso -> Head
 *
 * Base Pose + Continuous Performance Offsets = Final Performance Pose
 */
export class ViolinMusicMotionEngine {
  private smoothedIntensity = 0.0;
  private currentBowPos = 0.0;
  private currentBowVel = 0.0;

  // Smoothing configuration (Attack / Decay in 1/sec)
  private readonly attackRate = 4.2;
  private readonly decayRate = 2.4;

  // Kinetic Layer Movement Ranges (Maximum degrees offset at maximum intensity 1.0)
  // Designed for visible, natural anime violinist performance without breaking anatomical limits
  public static readonly MOTION_RANGES = {
    // 1. Right Arm / Bowing (Primary performance engine)
    rightElbowFlex: 24.0,       // ±24°: Extends to ~38° in down-bow, flexes to ~80° at frog
    rightArmForward: 9.5,       // ±9.5°: Forward stroke travel along bowing plane
    rightArmRaise: 6.5,         // ±6.5°: Elevation change across the stroke
    rightForearmTwist: 8.0,     // ±8.0°: String plane pronation / supination follow-through
    rightShoulderRaise: 3.8,    // ±3.8°: Clavicle elevation on up-bow & phrase crescendo
    rightShoulderForward: 2.8,  // ±2.8°: Shoulder girdle follow-through

    // 2. Torso (Slower phrase-level body sway and expressive weight shifts)
    torsoSideLean: 7.0,         // ±7.0°: Lateral roll sway over 4-beat/8-beat measures
    torsoTwist: 4.8,            // ±4.8°: Axial yaw twist following bowing momentum
    torsoForwardLean: 3.5,      // +3.5°: Expressive forward pitch on downbeats / climaxes

    // 3. Head & Neck (Expressive musical inclination, NOT a 1-beat metronome twitch)
    headNod: 4.5,               // +4.5°: Expressive downward nod on phrase emphasis
    headTilt: 4.0,              // ±4.0°: Listening tilt toward violin
    headTurn: 2.8,              // ±2.8°: Subtle gaze direction along fingerboard

    // 4. Left Arm (Stable violin neck support with minute sympathetic torso follow)
    leftArmRaise: 1.0,          // ±1.0°: Sympathetic breathing follow-through
    leftArmForward: 0.8,        // ±0.8°: Minute posture compliance
    leftShoulderRaise: 0.8,     // ±0.8°: Natural relaxed shoulder support

    // 5. Right Wrist (Subtle supple compliance at turnaround points - grip remains locked)
    rightWristBend: 2.0,        // ±2.0°: Supple wrist arch cushion at frog / tip
    rightWristTurn: 1.5,        // ±1.5°: Subtle wrist turn
  };

  /**
   * Evaluates the continuous musical motion state from playback clock and analysis data
   */
  public update(
    playback: PlaybackState,
    analysis: MusicAnalysisResult | null,
    delta: number
  ): MusicalMotionState {
    const isPlaying = Boolean(playback.isPlaying);
    const currentTime = Math.max(0, playback.currentTime || 0);
    const dt = Math.max(0.001, Math.min(0.05, delta));

    // 1. TEMPO / TIMING (BPM controls speed of musical phases)
    const rawBpm = analysis?.bpm && analysis.bpm > 30 && analysis.bpm < 300 ? analysis.bpm : 120;
    const bpm = THREE.MathUtils.clamp(rawBpm, 50, 220);
    const beatDuration = 60 / bpm; // seconds per musical beat

    // Multi-tier musical phase clocks
    const beatPhase = (currentTime / beatDuration) % 1.0;
    const measurePhase = (currentTime / (beatDuration * 4)) % 1.0;
    const phrasePhase = (currentTime / (beatDuration * 16)) % 1.0;
    // Bowing stroke cycle: 2 beats per full down-up cycle (1 beat down-bow, 1 beat up-bow)
    const strokeDuration = beatDuration * 2;
    const bowStrokePhase = (currentTime / strokeDuration) % 1.0;

    // 2. INTENSITY & PHRASE DYNAMICS (Controls motion amplitude & energy)
    let rawIntensity = 0.0;
    if (isPlaying) {
      if (analysis && analysis.sections && analysis.sections.length > 0) {
        const activeSection = analysis.sections.find(
          (s) => currentTime >= s.start && currentTime <= s.end
        );
        if (activeSection) {
          const isViolinActive = activeSection.activeInstruments?.includes('violin') ?? true;
          rawIntensity = isViolinActive ? activeSection.intensity : activeSection.intensity * 0.45;
        } else {
          rawIntensity = 0.6;
        }
      } else if (analysis && analysis.instrumentActivities && analysis.instrumentActivities.length > 0) {
        const dur = analysis.duration || 1;
        const progress = THREE.MathUtils.clamp(currentTime / dur, 0, 1);
        const violinActivity = analysis.instrumentActivities.find(
          (a) => a.instrumentId === 'violin' && progress >= a.startPercent && progress <= a.endPercent
        );
        rawIntensity = violinActivity ? violinActivity.intensity : 0.55;
      } else {
        rawIntensity = 0.65;
      }
    } else {
      rawIntensity = 0.0;
    }

    rawIntensity = THREE.MathUtils.clamp(rawIntensity, 0.0, 1.0);

    // Temporal smoothing with distinct attack and decay rates
    const rate = rawIntensity >= this.smoothedIntensity ? this.attackRate : this.decayRate;
    const blendFactor = 1.0 - Math.exp(-rate * dt);
    this.smoothedIntensity += (rawIntensity - this.smoothedIntensity) * blendFactor;
    if (this.smoothedIntensity < 0.0001) {
      this.smoothedIntensity = 0.0;
    }

    // Phrase-level expressive arc (subtle ±15% breathing variation across 16 beats)
    const phraseMultiplier = isPlaying
      ? 1.0 + 0.15 * Math.sin(phrasePhase * Math.PI * 2)
      : 1.0;

    // 3. CONTINUOUS BOW STROKE TRAJECTORY (Smooth acceleration / deceleration)
    // Non-linear continuous piecewise cubic Hermite curve with zero turnaround jerk
    let targetBowPos = 0.0;
    let targetBowVel = 0.0;

    if (bowStrokePhase < 0.5) {
      // Down-bow stroke (0.0 -> 0.5): Travels from frog (+1.0) to tip (-1.0)
      const u = bowStrokePhase / 0.5; // 0..1
      // Smooth cubic curve: 1 - 2 * (3u^2 - 2u^3)
      targetBowPos = 1.0 - 2.0 * (3.0 * u * u - 2.0 * u * u * u);
      // Derivative (velocity): -12 * u * (1 - u)
      targetBowVel = -12.0 * u * (1.0 - u);
    } else {
      // Up-bow stroke (0.5 -> 1.0): Returns from tip (-1.0) to frog (+1.0)
      const u = (bowStrokePhase - 0.5) / 0.5; // 0..1
      // Smooth cubic curve: -1 + 2 * (3u^2 - 2u^3)
      targetBowPos = -1.0 + 2.0 * (3.0 * u * u - 2.0 * u * u * u);
      // Derivative (velocity): +12 * u * (1 - u)
      targetBowVel = 12.0 * u * (1.0 - u);
    }

    this.currentBowPos = targetBowPos;
    this.currentBowVel = targetBowVel;

    // 4. KINETIC CHAIN LAYERS WITH PHASE RELATIONSHIPS

    // Torso: Slow measure-level sway (4-beat period) with subtle 8-beat harmonic
    const measureAngle = measurePhase * Math.PI * 2;
    const phraseAngle = phrasePhase * Math.PI * 2;
    const beatAngle = beatPhase * Math.PI * 2;

    // Torso Side-Lean (Roll): Sweeping weight shift with slight phrase modulation
    const torsoSway = Math.sin(measureAngle) * 0.85 + Math.sin(phraseAngle) * 0.25;
    // Torso Twist (Yaw): Follows bowing stroke with natural phase lag (0.2 rad delay)
    const torsoTwist = Math.sin(measureAngle + 0.3) * 0.7 + Math.cos(phraseAngle) * 0.3;
    // Torso Lean (Pitch): Downbeat rhythmic breathing
    const torsoLean = Math.max(0, Math.sin(beatAngle)) * 0.6 + Math.max(0, Math.sin(measureAngle)) * 0.4;

    // Head & Neck: Expressive phrase arc (moves in graceful sympathy with the music)
    const headNod = Math.max(0, Math.sin(measureAngle + 0.4)) * 0.7 + Math.max(0, Math.sin(phraseAngle)) * 0.3;
    const headTilt = -Math.sin(measureAngle + 0.2) * 0.75 - Math.sin(phraseAngle) * 0.25;
    const headTurn = Math.cos(measureAngle) * 0.65;

    // Shoulder & Arm Follow-Through
    const shoulderLift = targetBowPos * 0.6 + Math.sin(measureAngle) * 0.4;
    const armFollowThrough = -targetBowVel * 0.25;

    return {
      currentTime,
      bpm,
      beatDuration,
      beatPhase,
      measurePhase,
      phrasePhase,
      bowStrokePhase,
      bowPosition: this.currentBowPos,
      bowVelocity: this.currentBowVel,
      rawIntensity,
      smoothedIntensity: this.smoothedIntensity,
      phraseMultiplier,
      isPlaying,
      torsoSway,
      torsoTwist,
      torsoLean,
      headNod,
      headTilt,
      headTurn,
      shoulderLift,
      armFollowThrough,
    };
  }

  /**
   * Computes the final effective performance pose parameters:
   * Final Pose = Calibrated Base Pose + Layered Performance Trajectories(motionState)
   */
  public computePoseParams(
    baseParams: AnatomicalViolinistPoseParams,
    state: MusicalMotionState
  ): AnatomicalViolinistPoseParams {
    const energy = state.smoothedIntensity * state.phraseMultiplier;

    // When stopped or settled, return exact calibrated baseline
    if (energy <= 0.0001) {
      return { ...baseParams };
    }

    const MR = ViolinMusicMotionEngine.MOTION_RANGES;

    // 1. Torso Offsets (Expressive measure sway & posture breathing)
    const dTorsoSideLean = state.torsoSway * MR.torsoSideLean * energy;
    const dTorsoTwist = state.torsoTwist * MR.torsoTwist * energy;
    const dTorsoForwardLean = state.torsoLean * MR.torsoForwardLean * energy;

    // 2. Head & Neck Offsets (Expressive musical phrasing)
    const dHeadNod = state.headNod * MR.headNod * energy;
    const dHeadTilt = state.headTilt * MR.headTilt * energy;
    const dHeadTurn = state.headTurn * MR.headTurn * energy;

    // 3. Right Arm / Bowing Kinetic Chain (Primary motion)
    // Bow position (-1 = tip, +1 = frog):
    // In down-bow (pos -> -1), elbow extends; in up-bow (pos -> +1), elbow flexes toward frog
    const dRightElbowFlex = state.bowPosition * MR.rightElbowFlex * energy;
    // Forward travel along bowing plane
    const dRightArmForward = -state.bowPosition * MR.rightArmForward * energy;
    // Elevation adjustments (arm drops slightly at tip, elevates at frog)
    const dRightArmRaise = state.bowPosition * MR.rightArmRaise * energy;
    // Forearm pronation / supination to maintain string contact plane
    const dRightForearmTwist = -state.bowPosition * MR.rightForearmTwist * energy;
    // Shoulder girdle elevation follow-through
    const dRightShoulderRaise = state.shoulderLift * MR.rightShoulderRaise * energy;
    const dRightShoulderForward = state.shoulderLift * MR.rightShoulderForward * energy;

    // 4. Right Wrist Supple Turnaround Cushion (Grip remains locked)
    const dRightWristBend = (1.0 - Math.abs(state.bowPosition)) * MR.rightWristBend * energy;
    const dRightWristTurn = state.bowPosition * MR.rightWristTurn * energy;

    // 5. Left Arm Subtle Sympathetic Follow-Through (Preserving violin support contact)
    const dLeftArmRaise = state.torsoSway * MR.leftArmRaise * energy;
    const dLeftArmForward = state.torsoTwist * MR.leftArmForward * energy;
    const dLeftShoulderRaise = state.torsoSway * MR.leftShoulderRaise * energy;

    return {
      ...baseParams,
      // Torso
      torsoTwist: baseParams.torsoTwist + dTorsoTwist,
      torsoSideLean: baseParams.torsoSideLean + dTorsoSideLean,
      torsoForwardLean: (baseParams.torsoForwardLean || 0) + dTorsoForwardLean,

      // Head
      headTurn: baseParams.headTurn + dHeadTurn,
      headTilt: baseParams.headTilt + dHeadTilt,
      headNod: baseParams.headNod + dHeadNod,

      // Left Shoulder & Arm (Support chain - neck support locked)
      leftShoulderRaise: baseParams.leftShoulderRaise + dLeftShoulderRaise,
      leftShoulderForward: baseParams.leftShoulderForward,
      leftArmRaise: baseParams.leftArmRaise + dLeftArmRaise,
      leftArmForward: baseParams.leftArmForward + dLeftArmForward,
      leftArmTwist: baseParams.leftArmTwist,
      leftElbowFlex: baseParams.leftElbowFlex,
      leftForearmTwist: baseParams.leftForearmTwist,

      // Left Hand (100% LOCKED to preserve violin cradle)
      leftWristTurn: baseParams.leftWristTurn,
      leftWristBend: baseParams.leftWristBend,
      leftWristSideTilt: baseParams.leftWristSideTilt,
      leftFingerCurl: baseParams.leftFingerCurl,
      leftThumbOpposition: baseParams.leftThumbOpposition,

      // Right Shoulder
      rightShoulderRaise: baseParams.rightShoulderRaise + dRightShoulderRaise,
      rightShoulderForward: baseParams.rightShoulderForward + dRightShoulderForward,

      // Right Arm (Bowing engine)
      rightArmRaise: baseParams.rightArmRaise + dRightArmRaise,
      rightArmForward: baseParams.rightArmForward + dRightArmForward,
      rightArmTwist: baseParams.rightArmTwist,
      rightElbowFlex: baseParams.rightElbowFlex + dRightElbowFlex,
      rightForearmTwist: baseParams.rightForearmTwist + dRightForearmTwist,

      // Right Wrist (Supple cushioning only)
      rightWristTurn: baseParams.rightWristTurn + dRightWristTurn,
      rightWristBend: baseParams.rightWristBend + dRightWristBend,
      rightWristSideTilt: baseParams.rightWristSideTilt,

      // Right Fingers & Thumb (100% LOCKED to calibrated bow grip)
      rightFingerCurl: baseParams.rightFingerCurl,
      rightThumbOpposition: baseParams.rightThumbOpposition,
    };
  }

  /**
   * Resets internal smoothed state to immediate zero
   */
  public reset() {
    this.smoothedIntensity = 0.0;
    this.currentBowPos = 0.0;
    this.currentBowVel = 0.0;
  }
}
