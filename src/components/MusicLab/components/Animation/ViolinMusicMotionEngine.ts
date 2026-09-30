import * as THREE from 'three';
import { PlaybackState, MusicAnalysisResult, AudioDynamicsPoint } from '../../types';
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
  
  // Real-time time-varying audio dynamics
  rawInstantaneousIntensity: number; // 0..1 exact local audio energy at currentTime
  smoothedIntensity: number;         // 0..1 smoothed over time (attack/decay)
  attackStrength: number;            // 0..1 transient onset spike
  violinEnergy: number;              // 0..1 bowed-string harmonic energy
  effectivePerformanceEnergy: number;// 0..1 combined dynamic + transient energy driving physical amplitude
  dynamicsSource: 'timeline' | 'section' | 'fallback';
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
 * Implements a realistic physical kinetic chain driven by real-time audio dynamics:
 * Time-Varying Audio Dynamics -> Bow Stroke Trajectory -> Arm Follow-Through -> Shoulder -> Torso -> Head
 *
 * Base Pose + Continuous Performance Offsets = Final Performance Pose
 */
export class ViolinMusicMotionEngine {
  private smoothedIntensity = 0.0;
  private attackEnergy = 0.0;
  private currentBowPos = 0.0;
  private currentBowVel = 0.0;

  // Temporal smoothing configuration (Attack / Decay in 1/sec)
  private readonly attackRate = 5.5;  // Fast dynamic response to crescendos
  private readonly decayRate = 2.8;   // Smooth natural decrescendo & release
  private readonly attackDecay = 8.0; // Rapid transient onset decay

  // Kinetic Layer Movement Ranges (Maximum degrees offset at maximum intensity 1.0)
  // Reaches full, expressive fortissimo anime violinist performance at peak energy
  public static readonly MOTION_RANGES = {
    // 1. Right Arm / Bowing (Primary performance engine)
    rightElbowFlex: 28.0,       // ±28°: Extends to ~34° in down-bow tip, flexes to ~90° at frog
    rightArmForward: 12.0,      // ±12.0°: Forward stroke travel along bowing plane
    rightArmRaise: 8.0,         // ±8.0°: Elevation change across the stroke
    rightForearmTwist: 9.5,     // ±9.5°: String plane pronation / supination follow-through
    rightShoulderRaise: 4.5,    // ±4.5°: Clavicle elevation on up-bow & phrase crescendo
    rightShoulderForward: 3.5,  // ±3.5°: Shoulder girdle follow-through

    // 2. Torso (Slower phrase-level body sway and expressive weight shifts)
    torsoSideLean: 8.5,         // ±8.5°: Lateral roll sway over 4-beat/8-beat measures
    torsoTwist: 6.0,            // ±6.0°: Axial yaw twist following bowing momentum
    torsoForwardLean: 4.5,      // +4.5°: Expressive forward pitch on downbeats / climaxes

    // 3. Head & Neck (Expressive musical phrasing, NOT a 1-beat metronome twitch)
    headNod: 5.5,               // +5.5°: Expressive downward nod on phrase emphasis
    headTilt: 4.5,              // ±4.5°: Listening tilt toward violin
    headTurn: 3.2,              // ±3.2°: Subtle gaze direction along fingerboard

    // 4. Left Arm (Stable violin neck support with minute sympathetic torso follow)
    leftArmRaise: 1.2,          // ±1.2°: Sympathetic breathing follow-through
    leftArmForward: 0.8,        // ±0.8°: Minute posture compliance
    leftShoulderRaise: 0.8,     // ±0.8°: Natural relaxed shoulder support

    // 5. Right Wrist (Subtle supple compliance at turnaround points - grip remains locked)
    rightWristBend: 2.2,        // ±2.2°: Supple wrist arch cushion at frog / tip
    rightWristTurn: 1.8,        // ±1.8°: Subtle wrist turn
  };

  /**
   * Retrieves instantaneous time-varying audio dynamics for any point on the playback timeline
   */
  public getDynamicsAtTime(
    currentTime: number,
    analysis: MusicAnalysisResult | null,
    isPlaying: boolean
  ): {
    intensity: number;
    transientStrength: number;
    violinEnergy: number;
    source: 'timeline' | 'section' | 'fallback';
  } {
    if (!isPlaying || currentTime < 0) {
      return { intensity: 0, transientStrength: 0, violinEnergy: 0, source: 'fallback' };
    }

    // 1. Primary: High-resolution (~50ms) time-varying audio dynamics curve
    if (analysis && analysis.dynamicsTimeline && analysis.dynamicsTimeline.length > 0) {
      const timeline = analysis.dynamicsTimeline;
      const hopSeconds = 0.05;
      const frameFloat = currentTime / hopSeconds;
      const index0 = Math.max(0, Math.min(timeline.length - 1, Math.floor(frameFloat)));
      const index1 = Math.min(timeline.length - 1, index0 + 1);

      const p0 = timeline[index0];
      const p1 = timeline[index1];

      if (p0 && p1 && index1 > index0) {
        const alpha = frameFloat - index0;
        return {
          intensity: THREE.MathUtils.lerp(p0.intensity, p1.intensity, alpha),
          transientStrength: THREE.MathUtils.lerp(p0.transientStrength, p1.transientStrength, alpha),
          violinEnergy: THREE.MathUtils.lerp(p0.violinEnergy, p1.violinEnergy, alpha),
          source: 'timeline',
        };
      } else if (p0) {
        return {
          intensity: p0.intensity,
          transientStrength: p0.transientStrength,
          violinEnergy: p0.violinEnergy,
          source: 'timeline',
        };
      }
    }

    // 2. Secondary fallback: High-level section / instrument activity data (for YouTube Gemini analysis)
    if (analysis && analysis.sections && analysis.sections.length > 0) {
      const sections = analysis.sections;
      let activeIndex = -1;
      for (let i = 0; i < sections.length; i++) {
        if (currentTime >= sections[i].start && currentTime <= sections[i].end) {
          activeIndex = i;
          break;
        }
      }

      if (activeIndex >= 0) {
        const currSec = sections[activeIndex];
        const isViolinActive = currSec.activeInstruments?.includes('violin') ?? true;
        const targetInt = isViolinActive ? currSec.intensity : currSec.intensity * 0.45;

        // Smooth 1.5-second cross-fade around section boundaries
        const blendWindow = 1.5;
        let blendedInt = targetInt;

        if (currentTime - currSec.start < blendWindow && activeIndex > 0) {
          const prevSec = sections[activeIndex - 1];
          const prevViolin = prevSec.activeInstruments?.includes('violin') ?? true;
          const prevInt = prevViolin ? prevSec.intensity : prevSec.intensity * 0.45;
          const alpha = (currentTime - currSec.start) / blendWindow;
          // Smooth Hermite blend
          const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
          blendedInt = THREE.MathUtils.lerp(prevInt, targetInt, smoothAlpha);
        } else if (currSec.end - currentTime < blendWindow && activeIndex < sections.length - 1) {
          const nextSec = sections[activeIndex + 1];
          const nextViolin = nextSec.activeInstruments?.includes('violin') ?? true;
          const nextInt = nextViolin ? nextSec.intensity : nextSec.intensity * 0.45;
          const alpha = (currSec.end - currentTime) / blendWindow;
          const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
          blendedInt = THREE.MathUtils.lerp(nextInt, targetInt, smoothAlpha);
        }

        return {
          intensity: blendedInt,
          transientStrength: 0.12,
          violinEnergy: blendedInt,
          source: 'section',
        };
      }
    } else if (analysis && analysis.instrumentActivities && analysis.instrumentActivities.length > 0) {
      const dur = analysis.duration || 1;
      const progress = THREE.MathUtils.clamp(currentTime / dur, 0, 1);
      const violinActivity = analysis.instrumentActivities.find(
        (a) => a.instrumentId === 'violin' && progress >= a.startPercent && progress <= a.endPercent
      );
      const actInt = violinActivity ? violinActivity.intensity : 0.55;
      return {
        intensity: actInt,
        transientStrength: 0.1,
        violinEnergy: actInt,
        source: 'section',
      };
    }

    // 3. Baseline fallback when playing without track metadata
    return {
      intensity: 0.65,
      transientStrength: 0.1,
      violinEnergy: 0.65,
      source: 'fallback',
    };
  }

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
    const strokeDuration = beatDuration * 2;
    const bowStrokePhase = (currentTime / strokeDuration) % 1.0;

    // 2. QUERY TIME-VARYING AUDIO DYNAMICS AT CURRENT PLAYBACK TIME
    const dyn = this.getDynamicsAtTime(currentTime, analysis, isPlaying);
    const rawInstantaneousIntensity = THREE.MathUtils.clamp(dyn.intensity, 0.0, 1.0);
    const attackStrength = THREE.MathUtils.clamp(dyn.transientStrength, 0.0, 1.0);
    const violinEnergy = THREE.MathUtils.clamp(dyn.violinEnergy, 0.0, 1.0);
    const dynamicsSource = dyn.source;

    // Temporal smoothing of continuous dynamics (attack/decay)
    if (isPlaying) {
      const rate = rawInstantaneousIntensity >= this.smoothedIntensity ? this.attackRate : this.decayRate;
      const blendFactor = 1.0 - Math.exp(-rate * dt);
      this.smoothedIntensity += (rawInstantaneousIntensity - this.smoothedIntensity) * blendFactor;

      // Transient attack energy decay
      this.attackEnergy = Math.max(
        attackStrength,
        this.attackEnergy * Math.exp(-this.attackDecay * dt)
      );
    } else {
      // Settle smoothly to 0 on pause
      const blendFactor = 1.0 - Math.exp(-this.decayRate * 2.0 * dt);
      this.smoothedIntensity += (0.0 - this.smoothedIntensity) * blendFactor;
      this.attackEnergy = 0.0;
    }

    if (this.smoothedIntensity < 0.0001) {
      this.smoothedIntensity = 0.0;
    }

    // Combined effective performance energy: sustained dynamics + transient attack punch
    const effectivePerformanceEnergy = THREE.MathUtils.clamp(
      this.smoothedIntensity + this.attackEnergy * 0.35,
      0.0,
      1.0
    );

    // 3. CONTINUOUS BOW STROKE TRAJECTORY (Smooth acceleration / deceleration)
    // Non-linear continuous piecewise cubic Hermite curve with zero turnaround jerk
    let targetBowPos = 0.0;
    let targetBowVel = 0.0;

    if (bowStrokePhase < 0.5) {
      // Down-bow stroke (0.0 -> 0.5): Travels from frog (+1.0) to tip (-1.0)
      const u = bowStrokePhase / 0.5; // 0..1
      // Cubic easing: 1 - 2 * (3u^2 - 2u^3)
      targetBowPos = 1.0 - 2.0 * (3.0 * u * u - 2.0 * u * u * u);
      // Velocity with attack acceleration boost
      const baseVel = -12.0 * u * (1.0 - u);
      targetBowVel = baseVel * (1.0 + this.attackEnergy * 0.5);
    } else {
      // Up-bow stroke (0.5 -> 1.0): Returns from tip (-1.0) to frog (+1.0)
      const u = (bowStrokePhase - 0.5) / 0.5; // 0..1
      // Cubic easing: -1 + 2 * (3u^2 - 2u^3)
      targetBowPos = -1.0 + 2.0 * (3.0 * u * u - 2.0 * u * u * u);
      // Velocity with attack acceleration boost
      const baseVel = 12.0 * u * (1.0 - u);
      targetBowVel = baseVel * (1.0 + this.attackEnergy * 0.5);
    }

    this.currentBowPos = targetBowPos;
    this.currentBowVel = targetBowVel;

    // 4. KINETIC CHAIN LAYERS WITH PHASE RELATIONSHIPS

    // Torso: Slow measure-level sway (4-beat period) with subtle phrase harmonic
    const measureAngle = measurePhase * Math.PI * 2;
    const phraseAngle = phrasePhase * Math.PI * 2;
    const beatAngle = beatPhase * Math.PI * 2;

    // Torso Side-Lean (Roll): Sweeping weight shift responsive to performance energy
    const torsoSway = Math.sin(measureAngle) * 0.85 + Math.sin(phraseAngle) * 0.25;
    // Torso Twist (Yaw): Follows bowing stroke with natural phase lag (0.3 rad delay)
    const torsoTwist = Math.sin(measureAngle + 0.3) * 0.7 + Math.cos(phraseAngle) * 0.3;
    // Torso Lean (Pitch): Downbeat rhythmic breathing + attack impulse
    const torsoLean =
      Math.max(0, Math.sin(beatAngle)) * 0.6 +
      Math.max(0, Math.sin(measureAngle)) * 0.4 +
      this.attackEnergy * 0.25;

    // Head & Neck: Expressive phrase arc (moves in graceful sympathy with the music)
    const headNod =
      Math.max(0, Math.sin(measureAngle + 0.4)) * 0.7 +
      Math.max(0, Math.sin(phraseAngle)) * 0.3 +
      this.attackEnergy * 0.2;
    const headTilt = -Math.sin(measureAngle + 0.2) * 0.75 - Math.sin(phraseAngle) * 0.25;
    const headTurn = Math.cos(measureAngle) * 0.65;

    // Shoulder & Arm Follow-Through
    const shoulderLift = targetBowPos * 0.6 + Math.sin(measureAngle) * 0.4 + this.attackEnergy * 0.2;
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
      rawInstantaneousIntensity,
      smoothedIntensity: this.smoothedIntensity,
      attackStrength: this.attackEnergy,
      violinEnergy,
      effectivePerformanceEnergy,
      dynamicsSource,
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
    const energy = state.effectivePerformanceEnergy;

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
    this.attackEnergy = 0.0;
    this.currentBowPos = 0.0;
    this.currentBowVel = 0.0;
  }
}
