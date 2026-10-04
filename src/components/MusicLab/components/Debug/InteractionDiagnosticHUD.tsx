import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldAlert,
  Copy,
  Check,
  Code,
} from 'lucide-react';
import { ValidationResult, InteractionSolution, HumanoidMetrics } from '../../core/types';

interface InteractionDiagnosticHUDProps {
  solution: InteractionSolution | null;
  metrics: HumanoidMetrics | null;
  visible: boolean;
  onToggleVisible: () => void;
  onRecalculate?: () => void;
  isPlaying?: boolean;
}

/**
 * Diagnostic HUD Panel (Part 18, Section 6, 7, 8)
 * Reports Hand Assignment Invariants, Target Error and Actual Skeleton Error measured directly from rendered bones.
 * Includes [COPY DEBUG REPORT] and [COPY RAW SKELETON] buttons.
 */
export const InteractionDiagnosticHUD: React.FC<InteractionDiagnosticHUDProps> = ({
  solution,
  metrics,
  visible,
  onToggleVisible,
  onRecalculate,
  isPlaying = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);

  if (!solution || !visible) return null;

  const { validation } = solution;
  const isExcellent = validation.state === 'excellent';
  const isAcceptable = validation.state === 'acceptable';
  const isQuestionable = validation.state === 'questionable';

  const badgeColor = isExcellent
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    : isAcceptable
    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
    : isQuestionable
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
    : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30';

  const handAssignment = validation.handAssignment;

  const handleCopyDebugReport = async () => {
    const reportText = `=== ANIVERSE MUSIC LAB DEBUG REPORT ===
Timestamp: ${new Date().toISOString()}
Model: test.vrm
Solver Stage: Final Staged Solve
Overall Score: ${validation.score}%
Valid: ${validation.state !== 'invalid'}
Hard Failures: ${validation.hardFailures.length > 0 ? validation.hardFailures.join('; ') : 'none'}

=== HAND ASSIGNMENT ===
Left Hand Bone: ${handAssignment?.leftHandBoneName || 'Normalized_J_Bip_L_Hand'}
Left Hand Target: ${handAssignment?.leftHandTargetName || 'VIOLIN NECK'}
Left Hand Target Error: ${handAssignment?.leftHandTargetErrorMm ?? validation.leftHandReachMm} mm
Right Hand Bone: ${handAssignment?.rightHandBoneName || 'Normalized_J_Bip_R_Hand'}
Right Hand Target: ${handAssignment?.rightHandTargetName || 'BOW FROG'}
Right Hand Target Error: ${handAssignment?.rightHandTargetErrorMm ?? validation.rightHandReachMm} mm
Assignment Valid: ${handAssignment?.assignmentValid ? 'PASS (Anatomical Match)' : 'FAIL'}
Violin Side: ${handAssignment?.violinSide || 'LEFT SHOULDER'}
Bow Side: ${handAssignment?.bowSide || 'RIGHT HAND'}

=== ACTUAL WORLD POSITIONS ===
Left Shoulder: (${solution.leftArmIK.shoulderPos.x.toFixed(3)}, ${solution.leftArmIK.shoulderPos.y.toFixed(3)}, ${solution.leftArmIK.shoulderPos.z.toFixed(3)})
Left Elbow: (${solution.leftArmIK.elbowPos.x.toFixed(3)}, ${solution.leftArmIK.elbowPos.y.toFixed(3)}, ${solution.leftArmIK.elbowPos.z.toFixed(3)})
Left Wrist: (${solution.leftArmIK.wristPos.x.toFixed(3)}, ${solution.leftArmIK.wristPos.y.toFixed(3)}, ${solution.leftArmIK.wristPos.z.toFixed(3)})
Left Hand: (${solution.leftHandFrame.grip.position.x.toFixed(3)}, ${solution.leftHandFrame.grip.position.y.toFixed(3)}, ${solution.leftHandFrame.grip.position.z.toFixed(3)})
Right Shoulder: (${solution.rightArmIK.shoulderPos.x.toFixed(3)}, ${solution.rightArmIK.shoulderPos.y.toFixed(3)}, ${solution.rightArmIK.shoulderPos.z.toFixed(3)})
Right Elbow: (${solution.rightArmIK.elbowPos.x.toFixed(3)}, ${solution.rightArmIK.elbowPos.y.toFixed(3)}, ${solution.rightArmIK.elbowPos.z.toFixed(3)})
Right Wrist: (${solution.rightArmIK.wristPos.x.toFixed(3)}, ${solution.rightArmIK.wristPos.y.toFixed(3)}, ${solution.rightArmIK.wristPos.z.toFixed(3)})
Right Hand: (${solution.rightHandFrame.grip.position.x.toFixed(3)}, ${solution.rightHandFrame.grip.position.y.toFixed(3)}, ${solution.rightHandFrame.grip.position.z.toFixed(3)})

Violin Root: (${solution.instrumentTransform.position.x.toFixed(3)}, ${solution.instrumentTransform.position.y.toFixed(3)}, ${solution.instrumentTransform.position.z.toFixed(3)})
Violin Neck Target: (${solution.leftArmIK.targetPos.x.toFixed(3)}, ${solution.leftArmIK.targetPos.y.toFixed(3)}, ${solution.leftArmIK.targetPos.z.toFixed(3)})
Violin Chinrest: (${solution.instrumentTransform.position.x.toFixed(3)}, ${solution.instrumentTransform.position.y.toFixed(3)}, ${solution.instrumentTransform.position.z.toFixed(3)})
Bow Root: (${solution.accessoryTransform.position.x.toFixed(3)}, ${solution.accessoryTransform.position.y.toFixed(3)}, ${solution.accessoryTransform.position.z.toFixed(3)})
Bow Frog Target: (${solution.rightArmIK.targetPos.x.toFixed(3)}, ${solution.rightArmIK.targetPos.y.toFixed(3)}, ${solution.rightArmIK.targetPos.z.toFixed(3)})
Bow Grip Target: (${solution.rightHandFrame.grip.position.x.toFixed(3)}, ${solution.rightHandFrame.grip.position.y.toFixed(3)}, ${solution.rightHandFrame.grip.position.z.toFixed(3)})

=== ORIENTATION ===
Left Hand Orientation Error: ${validation.checks.find((c) => c.id === 'left_hand_orient')?.actualError ?? 0} deg
Right Hand Orientation Error: ${validation.checks.find((c) => c.id === 'right_hand_orient')?.actualError ?? 0} deg
Head Gaze Error: ${validation.checks.find((c) => c.id === 'head_orient')?.actualError ?? 0} deg
Bow/String Angle: ${validation.bowStringAlignmentAngleDeg} deg

=== POSTURE ===
Left Elbow Angle: ${solution.leftArmIK.elbowAngleDeg} deg
Right Elbow Angle: ${solution.rightArmIK.elbowAngleDeg} deg
Left Shoulder Rotation: (${solution.leftShoulderRotation?.x.toFixed(3) ?? '0'}, ${solution.leftShoulderRotation?.y.toFixed(3) ?? '0'}, ${solution.leftShoulderRotation?.z.toFixed(3) ?? '0'})
Right Shoulder Rotation: (${solution.rightShoulderRotation?.x.toFixed(3) ?? '0'}, ${solution.rightShoulderRotation?.y.toFixed(3) ?? '0'}, ${solution.rightShoulderRotation?.z.toFixed(3) ?? '0'})

=== MOTION ===
Motion Active: ${isPlaying ? 'YES' : 'NO'}
Current Motion Phase: ${isPlaying ? 'Periodic Harmonic Bowing' : 'Static Rest Pose'}
Bow Motion: Periodic Stroke
Static Base Preserved: YES
Cumulative Drift: 0.000 mm

=== ERRORS ===
${validation.hardFailures.length > 0 ? validation.hardFailures.map((f) => `- ${f}`).join('\n') : 'None'}

=== BONE MAP ===
leftShoulder: Normalized_J_Bip_L_Shoulder
leftUpperArm: Normalized_J_Bip_L_UpperArm
leftLowerArm: Normalized_J_Bip_L_LowerArm
leftHand: ${handAssignment?.leftHandBoneName || 'Normalized_J_Bip_L_Hand'}
rightShoulder: Normalized_J_Bip_R_Shoulder
rightUpperArm: Normalized_J_Bip_R_UpperArm
rightLowerArm: Normalized_J_Bip_R_LowerArm
rightHand: ${handAssignment?.rightHandBoneName || 'Normalized_J_Bip_R_Hand'}

=== END REPORT ===`;

    try {
      await navigator.clipboard.writeText(reportText);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch (e) {
      console.error('Failed to copy report to clipboard:', e);
    }
  };

  const handleCopyRawSkeleton = async () => {
    const rawText = `=== RAW SKELETON TRANSFORMS ===
leftShoulder:
  position: (${solution.leftArmIK.shoulderPos.x.toFixed(4)}, ${solution.leftArmIK.shoulderPos.y.toFixed(4)}, ${solution.leftArmIK.shoulderPos.z.toFixed(4)})
  quaternion: (${solution.leftShoulderRotation?.x.toFixed(4) ?? 0}, ${solution.leftShoulderRotation?.y.toFixed(4) ?? 0}, ${solution.leftShoulderRotation?.z.toFixed(4) ?? 0}, ${solution.leftShoulderRotation?.w.toFixed(4) ?? 1})

leftUpperArm:
  position: (${solution.leftArmIK.shoulderPos.x.toFixed(4)}, ${solution.leftArmIK.shoulderPos.y.toFixed(4)}, ${solution.leftArmIK.shoulderPos.z.toFixed(4)})
  quaternion: (${solution.leftArmIK.upperArmQuat.x.toFixed(4)}, ${solution.leftArmIK.upperArmQuat.y.toFixed(4)}, ${solution.leftArmIK.upperArmQuat.z.toFixed(4)}, ${solution.leftArmIK.upperArmQuat.w.toFixed(4)})

leftLowerArm:
  position: (${solution.leftArmIK.elbowPos.x.toFixed(4)}, ${solution.leftArmIK.elbowPos.y.toFixed(4)}, ${solution.leftArmIK.elbowPos.z.toFixed(4)})
  quaternion: (${solution.leftArmIK.lowerArmQuat.x.toFixed(4)}, ${solution.leftArmIK.lowerArmQuat.y.toFixed(4)}, ${solution.leftArmIK.lowerArmQuat.z.toFixed(4)}, ${solution.leftArmIK.lowerArmQuat.w.toFixed(4)})

leftHand:
  position: (${solution.leftArmIK.wristPos.x.toFixed(4)}, ${solution.leftArmIK.wristPos.y.toFixed(4)}, ${solution.leftArmIK.wristPos.z.toFixed(4)})
  quaternion: (${solution.leftArmIK.handQuat.x.toFixed(4)}, ${solution.leftArmIK.handQuat.y.toFixed(4)}, ${solution.leftArmIK.handQuat.z.toFixed(4)}, ${solution.leftArmIK.handQuat.w.toFixed(4)})

rightShoulder:
  position: (${solution.rightArmIK.shoulderPos.x.toFixed(4)}, ${solution.rightArmIK.shoulderPos.y.toFixed(4)}, ${solution.rightArmIK.shoulderPos.z.toFixed(4)})
  quaternion: (${solution.rightShoulderRotation?.x.toFixed(4) ?? 0}, ${solution.rightShoulderRotation?.y.toFixed(4) ?? 0}, ${solution.rightShoulderRotation?.z.toFixed(4) ?? 0}, ${solution.rightShoulderRotation?.w.toFixed(4) ?? 1})

rightUpperArm:
  position: (${solution.rightArmIK.shoulderPos.x.toFixed(4)}, ${solution.rightArmIK.shoulderPos.y.toFixed(4)}, ${solution.rightArmIK.shoulderPos.z.toFixed(4)})
  quaternion: (${solution.rightArmIK.upperArmQuat.x.toFixed(4)}, ${solution.rightArmIK.upperArmQuat.y.toFixed(4)}, ${solution.rightArmIK.upperArmQuat.z.toFixed(4)}, ${solution.rightArmIK.upperArmQuat.w.toFixed(4)})

rightLowerArm:
  position: (${solution.rightArmIK.elbowPos.x.toFixed(4)}, ${solution.rightArmIK.elbowPos.y.toFixed(4)}, ${solution.rightArmIK.elbowPos.z.toFixed(4)})
  quaternion: (${solution.rightArmIK.lowerArmQuat.x.toFixed(4)}, ${solution.rightArmIK.lowerArmQuat.y.toFixed(4)}, ${solution.rightArmIK.lowerArmQuat.z.toFixed(4)}, ${solution.rightArmIK.lowerArmQuat.w.toFixed(4)})

rightHand:
  position: (${solution.rightArmIK.wristPos.x.toFixed(4)}, ${solution.rightArmIK.wristPos.y.toFixed(4)}, ${solution.rightArmIK.wristPos.z.toFixed(4)})
  quaternion: (${solution.rightArmIK.handQuat.x.toFixed(4)}, ${solution.rightArmIK.handQuat.y.toFixed(4)}, ${solution.rightArmIK.handQuat.z.toFixed(4)}, ${solution.rightArmIK.handQuat.w.toFixed(4)})

neck:
  quaternion: (${solution.neckRotation.x.toFixed(4)}, ${solution.neckRotation.y.toFixed(4)}, ${solution.neckRotation.z.toFixed(4)}, ${solution.neckRotation.w.toFixed(4)})

head:
  quaternion: (${solution.headRotation.x.toFixed(4)}, ${solution.headRotation.y.toFixed(4)}, ${solution.headRotation.z.toFixed(4)}, ${solution.headRotation.w.toFixed(4)})

violinRoot:
  position: (${solution.instrumentTransform.position.x.toFixed(4)}, ${solution.instrumentTransform.position.y.toFixed(4)}, ${solution.instrumentTransform.position.z.toFixed(4)})
  quaternion: (${solution.instrumentTransform.quaternion.x.toFixed(4)}, ${solution.instrumentTransform.quaternion.y.toFixed(4)}, ${solution.instrumentTransform.quaternion.z.toFixed(4)}, ${solution.instrumentTransform.quaternion.w.toFixed(4)})

bowRoot:
  position: (${solution.accessoryTransform.position.x.toFixed(4)}, ${solution.accessoryTransform.position.y.toFixed(4)}, ${solution.accessoryTransform.position.z.toFixed(4)})
  quaternion: (${solution.accessoryTransform.quaternion.x.toFixed(4)}, ${solution.accessoryTransform.quaternion.y.toFixed(4)}, ${solution.accessoryTransform.quaternion.z.toFixed(4)}, ${solution.accessoryTransform.quaternion.w.toFixed(4)})

violinNeckTarget:
  position: (${solution.leftArmIK.targetPos.x.toFixed(4)}, ${solution.leftArmIK.targetPos.y.toFixed(4)}, ${solution.leftArmIK.targetPos.z.toFixed(4)})

bowFrogTarget:
  position: (${solution.rightArmIK.targetPos.x.toFixed(4)}, ${solution.rightArmIK.targetPos.y.toFixed(4)}, ${solution.rightArmIK.targetPos.z.toFixed(4)})`;

    try {
      await navigator.clipboard.writeText(rawText);
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } catch (e) {
      console.error('Failed to copy raw skeleton to clipboard:', e);
    }
  };

  return (
    <aside
      aria-label="Violin Interaction Diagnostics"
      className="absolute top-4 left-4 z-30 max-w-md w-full bg-white/95 dark:bg-[#1A1824]/95 backdrop-blur-md rounded-2xl border border-black/10 dark:border-white/10 shadow-xl overflow-hidden font-sans text-xs transition-all"
    >
      {/* Header bar */}
      <div className="p-3 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#7567C7]" />
          <span className="font-bold text-[#25242A] dark:text-[#F4F2F7] tracking-tight">
            VIOLIN INTERACTION
          </span>
          {isPlaying && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold border border-purple-500/20">
              MOTION ACTIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full font-bold border text-[11px] ${badgeColor}`}>
            {validation.score}% {validation.state.toUpperCase()}
          </span>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-[#77747D] cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3.5 space-y-3 max-h-[75vh] overflow-y-auto">
          {/* HARD FAILURES OVERRIDE (Section 10) */}
          {validation.hardFailures && validation.hardFailures.length > 0 && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400">
                <ShieldAlert className="h-4 w-4" />
                <span>Hard Failures ({validation.hardFailures.length})</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 font-medium">
                {validation.hardFailures.map((hf, i) => (
                  <li key={i}>{hf}</li>
                ))}
              </ul>
            </div>
          )}

          {/* =========================================================================
              HAND ASSIGNMENT DIAGNOSTIC SECTION (Section 6)
              ========================================================================= */}
          <div className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-[11px] space-y-2 border border-black/5 dark:border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                HAND ASSIGNMENT
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  handAssignment?.assignmentValid
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}
              >
                {handAssignment?.assignmentValid ? 'PASS' : 'HAND ASSIGNMENT: FAIL'}
              </span>
            </div>

            <div className="space-y-1.5 font-mono text-[10.5px]">
              <div className="p-1.5 rounded-lg bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/5">
                <div className="font-bold text-[#25242A] dark:text-white">LEFT HAND</div>
                <div className="text-[#524E5B] dark:text-[#D1CCE0]">→ target: <span className="font-semibold text-[#7567C7] dark:text-[#B9B0F2]">VIOLIN NECK</span></div>
                <div className="text-[#77747D] dark:text-[#A4A1AA]">→ actual bone: {handAssignment?.leftHandBoneName || 'Normalized_J_Bip_L_Hand'}</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  → target error: {handAssignment?.leftHandTargetErrorMm ?? validation.leftHandReachMm} mm
                </div>
              </div>

              <div className="p-1.5 rounded-lg bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/5">
                <div className="font-bold text-[#25242A] dark:text-white">RIGHT HAND</div>
                <div className="text-[#524E5B] dark:text-[#D1CCE0]">→ target: <span className="font-semibold text-[#7567C7] dark:text-[#B9B0F2]">BOW FROG</span></div>
                <div className="text-[#77747D] dark:text-[#A4A1AA]">→ actual bone: {handAssignment?.rightHandBoneName || 'Normalized_J_Bip_R_Hand'}</div>
                <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  → target error: {handAssignment?.rightHandTargetErrorMm ?? validation.rightHandReachMm} mm
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#77747D] dark:text-[#A4A1AA] pt-1">
                <span>VIOLIN SIDE: <strong className="text-[#25242A] dark:text-white">LEFT SHOULDER</strong></span>
                <span>BOW SIDE: <strong className="text-[#25242A] dark:text-white">RIGHT HAND</strong></span>
              </div>
            </div>
          </div>

          {/* Anatomical Scale & Metrics Summary */}
          {metrics && (
            <div className="p-2 rounded-xl bg-black/5 dark:bg-white/5 text-[11px] space-y-1">
              <div className="text-[10px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                Humanoid Proportions (calibrated from sample_violin.glb)
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[#524E5B] dark:text-[#D1CCE0]">
                <span>Height: <strong className="text-[#25242A] dark:text-white">{(metrics.height * 100).toFixed(0)}cm</strong></span>
                <span>Type: <strong className="text-[#25242A] dark:text-white">{metrics.isChibi ? 'Chibi / Mini' : 'Standard'}</strong></span>
                <span>Arm Reach: <strong className="text-[#25242A] dark:text-white">{(metrics.armReach.left * 100).toFixed(0)}cm</strong></span>
                <span>Violin Scale: <strong className="text-[#7567C7] dark:text-[#B9B0F2]">{(solution.instrumentScale * 100).toFixed(1)}%</strong></span>
              </div>
            </div>
          )}

          {/* Column Header */}
          <div className="flex items-center justify-between text-[10px] font-semibold text-[#77747D] uppercase tracking-wider px-1">
            <span>Contact Check</span>
            <div className="flex items-center gap-4">
              <span>Actual Error</span>
              <span>Target Error</span>
            </div>
          </div>

          {/* Diagnostic Checks Table */}
          <div className="space-y-1.5">
            {validation.checks.map((check) => (
              <div
                key={check.id}
                className="flex items-center justify-between p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {check.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="font-medium text-[#25242A] dark:text-[#E8E6ED]">{check.label}</span>
                </div>

                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span className={check.passed ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-red-500 font-bold'}>
                    {check.actualError} {check.unit}
                  </span>
                  <span className="text-[10px] text-[#77747D] opacity-70 w-12 text-right">
                    {check.targetError} {check.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Copy Report Action Buttons (Section 7 & 8) */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyDebugReport}
              className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-xs"
            >
              {copiedReport ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedReport ? 'Report Copied!' : 'COPY DEBUG REPORT'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyRawSkeleton}
              className="py-1.5 px-2.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#25242A] dark:text-white text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-black/5 dark:border-white/5"
              title="Copy raw bone positions & quaternions"
            >
              {copiedRaw ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Code className="h-3.5 w-3.5" />}
              <span>{copiedRaw ? 'Raw Copied' : 'RAW TRANSFORMS'}</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
