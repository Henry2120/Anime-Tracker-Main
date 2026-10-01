import * as THREE from 'three';
import { PlaybackState, MusicAnalysisResult, PerformanceSignal, PerformanceSource } from '../../types';
import { AnatomicalViolinistPoseParams } from '../PoseEditor/anatomicalPosePreset';

export interface MusicalMotionState {
  // Authoritative timeline and rhythm
  currentTime: number;
  bpm: number;
  beatDuration: number;
  beatPhase: number;          // 0..1 per single beat
  measurePhase: number;       // 0..1 per 4-beat measure
  phrasePhase: number;        // 0..1 per 16-beat musical phrase
  bowStrokePhase: number;     // 0..1 per 2-beat bowing stroke cycle
  
  // Dynamic physical bow trajectory states
  bowPosition: number;        // -1 (tip / down-bow turnaround) to +1 (frog / up-bow turnaround)
  bowVelocity: number;        // Rate of bow travel with asymmetric acceleration/deceleration
  
  // Unified runtime performance signal
  signal: PerformanceSignal;
  
  // Dynamics & kinetic energy driving physical amplitude
  smoothedIntensity: number;         // 0..1 smoothed intensity
  attackEnergy: number;              // 0..1 transient attack envelope (0 -> peak -> decay -> 0)
  effectivePerformanceEnergy: number;// 0..1 combined energy driving physical joint displacement
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
 * Continuous Physical Performance-Motion Engine for Violinist
 *
 * Implements a realistic physical kinetic chain:
 * Authoritative Clock & Signal -> Asymmetric Bow Gestures -> Arm -> Shoulder -> Torso -> Head
 *
 * Base Pose + Continuous Performance Offsets = Final Performance Pose
 */
export class ViolinMusicMotionEngine {
  private smoothedIntensity = 0.0;
  private attackEnergy = 0.0;
  private currentBowPos = 0.0;
  private currentBowVel = 0.0;

  // Smoothing configuration (Attack / Decay in 1/sec)
  private readonly attackRate = 6.0;   // Fast dynamic response to audio energy increases
  private readonly decayRate = 3.0;    // Smooth natural decay on decrescendo & release
  private readonly attackDecay = 7.5;  // Transient onset impulse decay (0 -> peak -> decay -> 0)

  // Maximum Physical Joint Excursions (degrees at maximum fortissimo energy 1.0)
  public static readonly MOTION_RANGES = {
    // 1. Right Arm / Bowing (Primary performance engine)
    rightElbowFlex: 28.0,       // ±28°: Extends to ~34° at tip in down-bow, flexes to ~90° at frog
    rightArmForward: 12.0,      // ±12.0°: Forward stroke travel along string plane
    rightArmRaise: 8.0,         // ±8.0°: Elevation change across the stroke
    rightForearmTwist: 9.5,     // ±9.5°: String plane pronation / supination follow-through
    rightShoulderRaise: 4.5,    // ±4.5°: Clavicle elevation on up-bow & fortissimo crescendo
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
   * Evaluates the unified runtime performance signal from the current playback state and analysis data
   */
  public getCurrentPerformanceSignal(
    currentTime: number,
    analysis: MusicAnalysisResult | null,
    isPlaying: boolean,
    manualBpm = 120,
    manualIntensity = 0.65
  ): PerformanceSignal {
    if (!isPlaying || currentTime < 0) {
      const source: PerformanceSource = analysis?.dynamicsTimeline && analysis.dynamicsTimeline.length > 0
        ? 'precomputed_audio'
        : analysis?.analysisSource === 'gemini_ai' || (analysis?.sections && analysis.sections.length > 0)
        ? 'gemini_section'
        : 'manual';

      return {
        source,
        intensity: 0.0,
        violinEnergy: 0.0,
        transientStrength: 0.0,
        onset: false,
        onsetStrength: 0.0,
        bpm: analysis?.bpm || manualBpm,
      };
    }

    // MODE 1: Precomputed Audio (Local Audio with high-resolution dynamics timeline)
    if (analysis && analysis.dynamicsTimeline && analysis.dynamicsTimeline.length > 0) {
      const timeline = analysis.dynamicsTimeline;
      const hopSeconds = 0.05;
      const frameFloat = currentTime / hopSeconds;
      const index0 = Math.max(0, Math.min(timeline.length - 1, Math.floor(frameFloat)));
      const index1 = Math.min(timeline.length - 1, index0 + 1);

      const p0 = timeline[index0];
      const p1 = timeline[index1];

      let intensity = 0;
      let transientStrength = 0;
      let violinEnergy = 0;

      if (p0 && p1 && index1 > index0) {
        const alpha = frameFloat - index0;
        intensity = THREE.MathUtils.lerp(p0.intensity, p1.intensity, alpha);
        transientStrength = THREE.MathUtils.lerp(p0.transientStrength, p1.transientStrength, alpha);
        violinEnergy = THREE.MathUtils.lerp(p0.violinEnergy, p1.violinEnergy, alpha);
      } else if (p0) {
        intensity = p0.intensity;
        transientStrength = p0.transientStrength;
        violinEnergy = p0.violinEnergy;
      }

      const onset = transientStrength > 0.28;
      const onsetStrength = onset ? THREE.MathUtils.clamp((transientStrength - 0.28) / 0.72, 0.0, 1.0) : 0.0;

      return {
        source: 'precomputed_audio',
        intensity: THREE.MathUtils.clamp(intensity, 0.0, 1.0),
        violinEnergy: THREE.MathUtils.clamp(violinEnergy, 0.0, 1.0),
        transientStrength: THREE.MathUtils.clamp(transientStrength, 0.0, 1.0),
        onset,
        onsetStrength,
        bpm: analysis.bpm && analysis.bpm > 30 ? analysis.bpm : 120,
      };
    }

    // MODE 2: Gemini Section Fallback (YouTube official iframe playback)
    if (analysis && analysis.sections && analysis.sections.length > 0) {
      const sections = analysis.sections;
      let activeIndex = -1;
      for (let i = 0; i < sections.length; i++) {
        if (currentTime >= sections[i].start && currentTime <= sections[i].end) {
          activeIndex = i;
          break;
        }
      }

      // If between section bounds or outside, clamp to closest section
      if (activeIndex < 0) {
        if (currentTime <= sections[0].start) {
          activeIndex = 0;
        } else if (currentTime >= sections[sections.length - 1].end) {
          activeIndex = sections.length - 1;
        } else {
          let minDistance = Infinity;
          for (let i = 0; i < sections.length; i++) {
            const mid = (sections[i].start + sections[i].end) / 2;
            const dist = Math.abs(currentTime - mid);
            if (dist < minDistance) {
              minDistance = dist;
              activeIndex = i;
            }
          }
        }
      }

      const currSec = sections[activeIndex];
      const isViolinActive = currSec.activeInstruments?.includes('violin') ?? true;
      let targetInt = isViolinActive ? currSec.intensity : currSec.intensity * 0.45;

      // Check if detailed instrument activity exists for violin
      if (analysis.instrumentActivities && analysis.instrumentActivities.length > 0) {
        const totalDur = analysis.duration || 210;
        const progress = totalDur > 0 ? currentTime / totalDur : 0;
        const violinAct = analysis.instrumentActivities.find(
          (a) => a.instrumentId === 'violin' && progress >= a.startPercent && progress <= a.endPercent
        );
        if (violinAct) {
          targetInt = Math.max(targetInt, violinAct.intensity);
        }
      }

      // Smooth 1.5-second Hermite cross-fade across section boundaries
      const blendWindow = 1.5;
      let blendedInt = targetInt;

      if (currentTime - currSec.start < blendWindow && activeIndex > 0) {
        const prevSec = sections[activeIndex - 1];
        const prevViolin = prevSec.activeInstruments?.includes('violin') ?? true;
        const prevInt = prevViolin ? prevSec.intensity : prevSec.intensity * 0.45;
        const alpha = Math.max(0, Math.min(1, (currentTime - currSec.start) / blendWindow));
        const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
        blendedInt = THREE.MathUtils.lerp(prevInt, targetInt, smoothAlpha);
      } else if (currSec.end - currentTime < blendWindow && activeIndex < sections.length - 1) {
        const nextSec = sections[activeIndex + 1];
        const nextViolin = nextSec.activeInstruments?.includes('violin') ?? true;
        const nextInt = nextViolin ? nextSec.intensity : nextSec.intensity * 0.45;
        const alpha = Math.max(0, Math.min(1, (currSec.end - currentTime) / blendWindow));
        const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
        blendedInt = THREE.MathUtils.lerp(nextInt, targetInt, smoothAlpha);
      }

      const finalInt = THREE.MathUtils.clamp(blendedInt, 0.1, 1.0);

      return {
        source: 'gemini_section',
        intensity: finalInt,
        violinEnergy: finalInt,
        transientStrength: 0.0, // Truthful: No artificial transients fabricated for section fallback
        onset: false,
        onsetStrength: 0.0,
        bpm: analysis.bpm && analysis.bpm > 30 ? analysis.bpm : 120,
      };
    }

    // MODE 3: Manual / Stage Test Mode
    return {
      source: 'manual',
      intensity: THREE.MathUtils.clamp(manualIntensity, 0.0, 1.0),
      violinEnergy: THREE.MathUtils.clamp(manualIntensity, 0.0, 1.0),
      transientStrength: 0.0,
      onset: false,
      onsetStrength: 0.0,
      bpm: manualBpm,
    };
  }

  /**
   * Evaluates the continuous musical motion state from playback clock and analysis data
   */
  public update(
    playback: PlaybackState,
    analysis: MusicAnalysisResult | null,
    delta: number,
    manualBpm = 120,
    manualIntensity = 0.65
  ): MusicalMotionState {
    const isPlaying = Boolean(playback.isPlaying);
    const currentTime = Math.max(0, playback.currentTime || 0);
    const dt = Math.max(0.001, Math.min(0.05, delta));

    // 1. GET RUNTIME PERFORMANCE SIGNAL
    const signal = this.getCurrentPerformanceSignal(currentTime, analysis, isPlaying, manualBpm, manualIntensity);

    // 2. TEMPO & RHYTHMIC TIMING (BPM controls speed of musical phases)
    const bpm = THREE.MathUtils.clamp(signal.bpm, 50, 220);
    const beatDuration = 60 / bpm; // seconds per musical beat

    const beatPhase = (currentTime / beatDuration) % 1.0;
    const measurePhase = (currentTime / (beatDuration * 4)) % 1.0;
    const phrasePhase = (currentTime / (beatDuration * 16)) % 1.0;
    const strokeDuration = beatDuration * 2;
    const bowStrokePhase = (currentTime / strokeDuration) % 1.0;

    // 3. DYNAMICS & ATTACK ENVELOPE (0 -> Peak -> Exponential Decay -> 0)
    if (isPlaying) {
      const rate = signal.intensity >= this.smoothedIntensity ? this.attackRate : this.decayRate;
      const blendFactor = 1.0 - Math.exp(-rate * dt);
      this.smoothedIntensity += (signal.intensity - this.smoothedIntensity) * blendFactor;

      // Transient attack energy envelope (sharp rise on onset flux, smooth rapid decay)
      if (signal.onset && signal.transientStrength > this.attackEnergy) {
        this.attackEnergy = signal.transientStrength;
      } else {
        this.attackEnergy *= Math.exp(-this.attackDecay * dt);
      }
    } else {
      // Settle smoothly to zero on pause
      const blendFactor = 1.0 - Math.exp(-this.decayRate * 2.0 * dt);
      this.smoothedIntensity += (0.0 - this.smoothedIntensity) * blendFactor;
      this.attackEnergy *= Math.exp(-this.attackDecay * 2.0 * dt);
    }

    if (this.smoothedIntensity < 0.0001) this.smoothedIntensity = 0.0;
    if (this.attackEnergy < 0.001) this.attackEnergy = 0.0;

    // Combined effective performance energy: sustained dynamics + transient attack punch
    const effectivePerformanceEnergy = THREE.MathUtils.clamp(
      this.smoothedIntensity + this.attackEnergy * 0.35,
      0.0,
      1.0
    );

    // 4. PHYSICAL BOW GESTURE TRAJECTORY (Asymmetric Acceleration -> Draw -> Deceleration -> Turnaround)
    let targetBowPos = 0.0;
    let targetBowVel = 0.0;

    if (bowStrokePhase < 0.5) {
      // Down-bow stroke (0.0 -> 0.5): Travels from frog (+1.0) to tip (-1.0)
      const u = bowStrokePhase / 0.5; // 0..1
      // Asymmetric power curve with brisk attack acceleration and cushioned tip deceleration
      targetBowPos = 1.0 - 2.0 * (4.0 * Math.pow(u, 3) - 3.0 * Math.pow(u, 4));
      // Continuous derivative with attack boost
      const baseVel = -24.0 * (Math.pow(u, 2) - Math.pow(u, 3));
      targetBowVel = baseVel * (1.0 + this.attackEnergy * 0.6);
    } else {
      // Up-bow stroke (0.5 -> 1.0): Returns from tip (-1.0) to frog (+1.0)
      const u = (bowStrokePhase - 0.5) / 0.5; // 0..1
      // Smooth cubic Hermite return stroke
      targetBowPos = -1.0 + 2.0 * (3.0 * u * u - 2.0 * u * u * u);
      const baseVel = 12.0 * u * (1.0 - u);
      targetBowVel = baseVel * (1.0 + this.attackEnergy * 0.6);
    }

    this.currentBowPos = targetBowPos;
    this.currentBowVel = targetBowVel;

    // 5. KINETIC CHAIN LAYERS WITH PHASE RELATIONSHIPS

    const measureAngle = measurePhase * Math.PI * 2;
    const phraseAngle = phrasePhase * Math.PI * 2;
    const beatAngle = beatPhase * Math.PI * 2;

    // Torso Side-Lean (Roll): Sweeping weight shift with phrase harmonic
    const torsoSway = Math.sin(measureAngle) * 0.85 + Math.sin(phraseAngle) * 0.25;
    // Torso Twist (Yaw): Follows bowing momentum with natural phase delay (0.3 rad)
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
      signal,
      smoothedIntensity: this.smoothedIntensity,
      attackEnergy: this.attackEnergy,
      effectivePerformanceEnergy,
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
   * Final Pose = Calibrated Base Pose + Layered Non-Linear Performance Offsets(motionState)
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

    // Non-linear kinetic response curves for realistic dynamic range
    // Soft: subtle and compact; Forte: broad, expressive; Fortissimo: maximum anime concert reach
    const elbowEnergy = Math.pow(energy, 1.15);
    const armEnergy = Math.pow(energy, 1.2);
    const shoulderEnergy = Math.pow(energy, 1.4);
    const torsoEnergy = Math.pow(energy, 1.5);
    const headEnergy = Math.pow(energy, 1.3);

    // 1. Torso Offsets (Expressive measure sway & posture breathing)
    const dTorsoSideLean = state.torsoSway * MR.torsoSideLean * torsoEnergy;
    const dTorsoTwist = state.torsoTwist * MR.torsoTwist * torsoEnergy;
    const dTorsoForwardLean = state.torsoLean * MR.torsoForwardLean * torsoEnergy;

    // 2. Head & Neck Offsets (Expressive musical phrasing)
    const dHeadNod = state.headNod * MR.headNod * headEnergy;
    const dHeadTilt = state.headTilt * MR.headTilt * headEnergy;
    const dHeadTurn = state.headTurn * MR.headTurn * headEnergy;

    // 3. Right Arm / Bowing Kinetic Chain (Primary motion)
    // Bow position (-1 = tip, +1 = frog):
    // In down-bow (pos -> -1), elbow extends; in up-bow (pos -> +1), elbow flexes toward frog
    const dRightElbowFlex = state.bowPosition * MR.rightElbowFlex * elbowEnergy;
    // Forward travel along bowing plane
    const dRightArmForward = -state.bowPosition * MR.rightArmForward * armEnergy;
    // Elevation adjustments (arm drops slightly at tip, elevates at frog)
    const dRightArmRaise = state.bowPosition * MR.rightArmRaise * armEnergy;
    // Forearm pronation / supination to maintain string contact plane
    const dRightForearmTwist = -state.bowPosition * MR.rightForearmTwist * elbowEnergy;
    // Shoulder girdle elevation follow-through
    const dRightShoulderRaise = state.shoulderLift * MR.rightShoulderRaise * shoulderEnergy;
    const dRightShoulderForward = state.shoulderLift * MR.rightShoulderForward * shoulderEnergy;

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
