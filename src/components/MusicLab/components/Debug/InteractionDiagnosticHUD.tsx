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
  GitFork,
  Eye,
  Crosshair,
} from 'lucide-react';
import { ValidationResult, InteractionSolution, HumanoidMetrics } from '../../core/types';

interface InteractionDiagnosticHUDProps {
  solution: InteractionSolution | null;
  metrics: HumanoidMetrics | null;
  visible: boolean;
  onToggleVisible: () => void;
  showArmSkeleton?: boolean;
  onToggleArmSkeleton?: () => void;
  onRecalculate?: () => void;
  isPlaying?: boolean;
}

/**
 * Diagnostic HUD Panel (Section 6, 7, 8, 9, 10, 11)
 *
 * Provides live telemetry for:
 * 1. Anatomical Hand Assignment Invariants (Left Hand -> Violin, Right Hand -> Bow)
 * 2. Arm Path Diagnostic & Torso Intersection Detection
 * 3. Reference Comparison against sample_violin.glb
 * 4. Export Buttons: [COPY ARM DIAGNOSTIC], [COPY DEBUG REPORT], [RAW TRANSFORMS]
 */
export const InteractionDiagnosticHUD: React.FC<InteractionDiagnosticHUDProps> = ({
  solution,
  metrics,
  visible,
  onToggleVisible,
  showArmSkeleton = true,
  onToggleArmSkeleton,
  onRecalculate,
  isPlaying = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedArmDiag, setCopiedArmDiag] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [activeTab, setActiveTab] = useState<'armPath' | 'handAssign' | 'checks'>('armPath');

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
  const armPath = validation.armPath;
  const leftArm = armPath?.leftArm;
  const rightArm = armPath?.rightArm;
  const refComp = armPath?.referenceComparison;

  // Copy Complete Arm Path Diagnostic
  const handleCopyArmDiagnostic = async () => {
    if (!armPath || !leftArm || !rightArm || !refComp) return;

    const reportText = `=== ARM PATH DIAGNOSTIC ===
Timestamp: ${new Date().toISOString()}
Character Model: test.vrm
Reference Model: sample_violin.glb (normalized)

LEFT ARM (Anatomical Left, +X)
Shoulder: (${leftArm.shoulderPos.x.toFixed(4)}, ${leftArm.shoulderPos.y.toFixed(4)}, ${leftArm.shoulderPos.z.toFixed(4)})
Elbow:    (${leftArm.elbowPos.x.toFixed(4)}, ${leftArm.elbowPos.y.toFixed(4)}, ${leftArm.elbowPos.z.toFixed(4)})
Wrist:    (${leftArm.wristPos.x.toFixed(4)}, ${leftArm.wristPos.y.toFixed(4)}, ${leftArm.wristPos.z.toFixed(4)})
Hand:     (${leftArm.handPos.x.toFixed(4)}, ${leftArm.handPos.y.toFixed(4)}, ${leftArm.handPos.z.toFixed(4)})

Upper Arm Length: ${leftArm.upperArmLengthMm} mm (Neutral: ${leftArm.neutralUpperArmLengthMm} mm, Stretch: ${leftArm.upperArmStretchPct}%)
Forearm Length:   ${leftArm.forearmLengthMm} mm (Neutral: ${leftArm.neutralForearmLengthMm} mm, Stretch: ${leftArm.forearmStretchPct}%)
Hand Offset:      ${leftArm.handOffsetMm} mm

Elbow Angle:      ${leftArm.elbowAngleDeg} deg
Elbow Direction:  (${leftArm.elbowDirection.x.toFixed(3)}, ${leftArm.elbowDirection.y.toFixed(3)}, ${leftArm.elbowDirection.z.toFixed(3)}) [${leftArm.elbowDirectionDescription}]
Torso Intersection: Upper Arm: ${leftArm.upperArmTorsoIntersection} (${leftArm.upperArmPenetrationMm} mm), Forearm: ${leftArm.forearmTorsoIntersection} (${leftArm.forearmPenetrationMm} mm)
Pole Vector:      (${leftArm.poleVector.x.toFixed(3)}, ${leftArm.poleVector.y.toFixed(3)}, ${leftArm.poleVector.z.toFixed(3)})

RIGHT ARM (Anatomical Right, -X)
Shoulder: (${rightArm.shoulderPos.x.toFixed(4)}, ${rightArm.shoulderPos.y.toFixed(4)}, ${rightArm.shoulderPos.z.toFixed(4)})
Elbow:    (${rightArm.elbowPos.x.toFixed(4)}, ${rightArm.elbowPos.y.toFixed(4)}, ${rightArm.elbowPos.z.toFixed(4)})
Wrist:    (${rightArm.wristPos.x.toFixed(4)}, ${rightArm.wristPos.y.toFixed(4)}, ${rightArm.wristPos.z.toFixed(4)})
Hand:     (${rightArm.handPos.x.toFixed(4)}, ${rightArm.handPos.y.toFixed(4)}, ${rightArm.handPos.z.toFixed(4)})

Upper Arm Length: ${rightArm.upperArmLengthMm} mm (Neutral: ${rightArm.neutralUpperArmLengthMm} mm, Stretch: ${rightArm.upperArmStretchPct}%)
Forearm Length:   ${rightArm.forearmLengthMm} mm (Neutral: ${rightArm.neutralForearmLengthMm} mm, Stretch: ${rightArm.forearmStretchPct}%)
Hand Offset:      ${rightArm.handOffsetMm} mm

Elbow Angle:      ${rightArm.elbowAngleDeg} deg
Elbow Direction:  (${rightArm.elbowDirection.x.toFixed(3)}, ${rightArm.elbowDirection.y.toFixed(3)}, ${rightArm.elbowDirection.z.toFixed(3)}) [${rightArm.elbowDirectionDescription}]
Torso Intersection: Upper Arm: ${rightArm.upperArmTorsoIntersection} (${rightArm.upperArmPenetrationMm} mm), Forearm: ${rightArm.forearmTorsoIntersection} (${rightArm.forearmPenetrationMm} mm)
Pole Vector:      (${rightArm.poleVector.x.toFixed(3)}, ${rightArm.poleVector.y.toFixed(3)}, ${rightArm.poleVector.z.toFixed(3)})

=== REFERENCE COMPARISON (sample_violin.glb) ===
sample_violin LEFT elbow:  (${refComp.sampleLeftElbow.x.toFixed(4)}, ${refComp.sampleLeftElbow.y.toFixed(4)}, ${refComp.sampleLeftElbow.z.toFixed(4)})
current LEFT elbow:        (${refComp.currentLeftElbow.x.toFixed(4)}, ${refComp.currentLeftElbow.y.toFixed(4)}, ${refComp.currentLeftElbow.z.toFixed(4)})
difference:                ${refComp.leftElbowDiffMm} mm

sample_violin RIGHT elbow: (${refComp.sampleRightElbow.x.toFixed(4)}, ${refComp.sampleRightElbow.y.toFixed(4)}, ${refComp.sampleRightElbow.z.toFixed(4)})
current RIGHT elbow:       (${refComp.currentRightElbow.x.toFixed(4)}, ${refComp.currentRightElbow.y.toFixed(4)}, ${refComp.currentRightElbow.z.toFixed(4)})
difference:                ${refComp.rightElbowDiffMm} mm

Reference elbow configuration: ${refComp.referenceMatch}
Pole Vector Mirroring:         ${refComp.poleVectorMirroringStatus}

Notes:
${refComp.notes.map((n) => `- ${n}`).join('\n')}

=== END ARM DIAGNOSTIC ===`;

    try {
      await navigator.clipboard.writeText(reportText);
      setCopiedArmDiag(true);
      setTimeout(() => setCopiedArmDiag(false), 2000);
    } catch (e) {
      console.error('Failed to copy arm diagnostic:', e);
    }
  };

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

=== ARM PATH FINDINGS ===
Left Upper Arm Torso: ${leftArm?.upperArmTorsoIntersection || 'outside body'}
Left Forearm Torso: ${leftArm?.forearmTorsoIntersection || 'outside body'}
Right Upper Arm Torso: ${rightArm?.upperArmTorsoIntersection || 'intersects torso'} (${rightArm?.upperArmPenetrationMm ?? 0}mm)
Right Forearm Torso: ${rightArm?.forearmTorsoIntersection || 'intersects torso'} (${rightArm?.forearmPenetrationMm ?? 0}mm)
Reference Elbow Match: ${refComp?.referenceMatch || 'DIFFERENT'}
Right Elbow Diff from sample_violin: ${refComp?.rightElbowDiffMm ?? 0} mm

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
leftShoulder:  (${solution.leftArmIK.shoulderPos.x.toFixed(4)}, ${solution.leftArmIK.shoulderPos.y.toFixed(4)}, ${solution.leftArmIK.shoulderPos.z.toFixed(4)})
leftElbow:     (${solution.leftArmIK.elbowPos.x.toFixed(4)}, ${solution.leftArmIK.elbowPos.y.toFixed(4)}, ${solution.leftArmIK.elbowPos.z.toFixed(4)})
leftWrist:     (${solution.leftArmIK.wristPos.x.toFixed(4)}, ${solution.leftArmIK.wristPos.y.toFixed(4)}, ${solution.leftArmIK.wristPos.z.toFixed(4)})
rightShoulder: (${solution.rightArmIK.shoulderPos.x.toFixed(4)}, ${solution.rightArmIK.shoulderPos.y.toFixed(4)}, ${solution.rightArmIK.shoulderPos.z.toFixed(4)})
rightElbow:    (${solution.rightArmIK.elbowPos.x.toFixed(4)}, ${solution.rightArmIK.elbowPos.y.toFixed(4)}, ${solution.rightArmIK.elbowPos.z.toFixed(4)})
rightWrist:    (${solution.rightArmIK.wristPos.x.toFixed(4)}, ${solution.rightArmIK.wristPos.y.toFixed(4)}, ${solution.rightArmIK.wristPos.z.toFixed(4)})`;

    try {
      await navigator.clipboard.writeText(rawText);
      setCopiedRaw(true);
      setTimeout(() => setCopiedRaw(false), 2000);
    } catch (e) {
      console.error('Failed to copy raw transforms:', e);
    }
  };

  return (
    <aside
      aria-label="3D Kinematic Interaction Diagnostic Panel"
      className="absolute top-4 right-4 z-30 w-96 max-h-[90vh] flex flex-col rounded-2xl bg-white/95 dark:bg-[#161420]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden transition-all duration-300 select-none text-xs"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#7567C7]" />
          <span className="font-bold text-[#25242A] dark:text-[#F4F2F7]">Kinematic Diagnostics</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Skeleton View Toggle */}
          {onToggleArmSkeleton && (
            <button
              type="button"
              onClick={onToggleArmSkeleton}
              title="Toggle visible 3D arm skeleton overlay"
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
                showArmSkeleton
                  ? 'bg-[#7567C7] text-white border-[#7567C7]'
                  : 'bg-black/5 dark:bg-white/5 text-[#77747D] border-black/5 dark:border-white/5'
              }`}
            >
              <GitFork className="h-3 w-3" />
              <span>ARM SKELETON</span>
            </button>
          )}

          {/* Quality Score Badge */}
          <span className={`px-2 py-0.5 rounded-lg font-mono font-bold text-[11px] border ${badgeColor}`}>
            {validation.score}%
          </span>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-[#77747D] transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Diagnostic Tabs */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('armPath')}
              className={`flex-1 py-1 px-2 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer ${
                activeTab === 'armPath'
                  ? 'bg-white dark:bg-[#252332] text-[#7567C7] dark:text-[#A898F8] shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              Arm Path & Torso
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('handAssign')}
              className={`flex-1 py-1 px-2 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer ${
                activeTab === 'handAssign'
                  ? 'bg-white dark:bg-[#252332] text-[#7567C7] dark:text-[#A898F8] shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              Hand Invariants
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('checks')}
              className={`flex-1 py-1 px-2 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer ${
                activeTab === 'checks'
                  ? 'bg-white dark:bg-[#252332] text-[#7567C7] dark:text-[#A898F8] shadow-xs'
                  : 'text-[#77747D] hover:text-[#25242A] dark:hover:text-white'
              }`}
            >
              Checks ({validation.checks.length})
            </button>
          </div>

          {/* =========================================================================
              TAB 1: ARM PATH & TORSO PENETRATION (Section 4, 5, 6, 7, 8)
              ========================================================================= */}
          {activeTab === 'armPath' && (
            <div className="space-y-2.5">
              {/* Left Arm Card */}
              {leftArm && (
                <div className="p-2.5 rounded-xl bg-cyan-500/5 dark:bg-cyan-500/10 border border-cyan-500/20 space-y-1.5 font-mono text-[10.5px]">
                  <div className="flex items-center justify-between font-bold text-cyan-600 dark:text-cyan-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      LEFT ARM (Anatomical Left, +X)
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] ${
                        leftArm.upperArmTorsoIntersection === 'outside body'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {leftArm.upperArmTorsoIntersection.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[#524E5B] dark:text-[#D1CCE0] text-[10px]">
                    <div>Shoulder: ({leftArm.shoulderPos.x.toFixed(2)}, {leftArm.shoulderPos.y.toFixed(2)}, {leftArm.shoulderPos.z.toFixed(2)})</div>
                    <div>Elbow: ({leftArm.elbowPos.x.toFixed(2)}, {leftArm.elbowPos.y.toFixed(2)}, {leftArm.elbowPos.z.toFixed(2)})</div>
                    <div>Wrist: ({leftArm.wristPos.x.toFixed(2)}, {leftArm.wristPos.y.toFixed(2)}, {leftArm.wristPos.z.toFixed(2)})</div>
                    <div>Hand: ({leftArm.handPos.x.toFixed(2)}, {leftArm.handPos.y.toFixed(2)}, {leftArm.handPos.z.toFixed(2)})</div>
                  </div>

                  <div className="pt-1 border-t border-cyan-500/10 space-y-0.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#77747D]">Upper Arm / Forearm:</span>
                      <span className="font-semibold text-[#25242A] dark:text-white">
                        {leftArm.upperArmLengthMm}mm / {leftArm.forearmLengthMm}mm (Stretch: {leftArm.upperArmStretchPct}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#77747D]">Elbow Flexion Angle:</span>
                      <span className="font-semibold text-[#25242A] dark:text-white">{leftArm.elbowAngleDeg}°</span>
                    </div>
                    <div className="text-[9.5px] text-cyan-700 dark:text-cyan-300">
                      Direction: {leftArm.elbowDirectionDescription}
                    </div>
                  </div>
                </div>
              )}

              {/* Right Arm Card */}
              {rightArm && (
                <div
                  className={`p-2.5 rounded-xl border space-y-1.5 font-mono text-[10.5px] ${
                    rightArm.upperArmTorsoIntersection === 'outside body'
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-red-600 dark:text-red-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      RIGHT ARM (Anatomical Right, -X)
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] ${
                        rightArm.upperArmTorsoIntersection === 'outside body'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {rightArm.upperArmTorsoIntersection.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1 text-[#524E5B] dark:text-[#D1CCE0] text-[10px]">
                    <div>Shoulder: ({rightArm.shoulderPos.x.toFixed(2)}, {rightArm.shoulderPos.y.toFixed(2)}, {rightArm.shoulderPos.z.toFixed(2)})</div>
                    <div>Elbow: ({rightArm.elbowPos.x.toFixed(2)}, {rightArm.elbowPos.y.toFixed(2)}, {rightArm.elbowPos.z.toFixed(2)})</div>
                    <div>Wrist: ({rightArm.wristPos.x.toFixed(2)}, {rightArm.wristPos.y.toFixed(2)}, {rightArm.wristPos.z.toFixed(2)})</div>
                    <div>Hand: ({rightArm.handPos.x.toFixed(2)}, {rightArm.handPos.y.toFixed(2)}, {rightArm.handPos.z.toFixed(2)})</div>
                  </div>

                  <div className="pt-1 border-t border-red-500/10 space-y-0.5 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#77747D]">Upper Arm / Forearm:</span>
                      <span className="font-semibold text-[#25242A] dark:text-white">
                        {rightArm.upperArmLengthMm}mm / {rightArm.forearmLengthMm}mm (Stretch: {rightArm.upperArmStretchPct}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#77747D]">Elbow Flexion Angle:</span>
                      <span className="font-semibold text-[#25242A] dark:text-white">{rightArm.elbowAngleDeg}°</span>
                    </div>
                    <div className="text-[9.5px] text-red-700 dark:text-red-300 font-semibold">
                      Direction: {rightArm.elbowDirectionDescription}
                    </div>
                    {rightArm.upperArmPenetrationMm > 0 && (
                      <div className="text-[9.5px] text-red-600 dark:text-red-400 font-bold">
                        ⚠️ Torso Penetration: {rightArm.upperArmPenetrationMm}mm inside torso cylinder
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reference Model Comparison Card (sample_violin.glb) */}
              {refComp && (
                <div className="p-2.5 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-1.5 text-[10.5px]">
                  <div className="flex items-center justify-between font-bold text-amber-700 dark:text-amber-400 text-[10px] uppercase tracking-wider">
                    <span>Reference Comparison (sample_violin.glb)</span>
                    <span
                      className={`px-1.5 py-0.2 rounded ${
                        refComp.referenceMatch === 'MATCH'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {refComp.referenceMatch}
                    </span>
                  </div>

                  <div className="space-y-1 font-mono text-[10px] text-[#524E5B] dark:text-[#D1CCE0]">
                    <div className="flex justify-between">
                      <span>Left Elbow Diff:</span>
                      <span className="font-semibold text-[#25242A] dark:text-white">{refComp.leftElbowDiffMm} mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Right Elbow Diff:</span>
                      <span className="font-semibold text-red-500">{refComp.rightElbowDiffMm} mm</span>
                    </div>
                  </div>

                  <div className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 font-mono text-[9px] text-[#77747D] dark:text-[#A4A1AA] leading-tight">
                    {refComp.poleVectorMirroringStatus}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 2: HAND INVARIANTS (Section 1)
              ========================================================================= */}
          {activeTab === 'handAssign' && (
            <div className="space-y-2 font-mono text-[10.5px]">
              <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/5 space-y-0.5">
                <div className="flex items-center justify-between font-bold text-[#25242A] dark:text-white">
                  <span>LEFT HAND (Anatomical)</span>
                  <span className={handAssignment?.assignmentValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                    {handAssignment?.assignmentValid ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div className="text-[#524E5B] dark:text-[#D1CCE0]">Bone: <span className="text-[#25242A] dark:text-white font-semibold">{handAssignment?.leftHandBoneName || 'Normalized_J_Bip_L_Hand'}</span></div>
                <div className="text-[#524E5B] dark:text-[#D1CCE0]">Target: <span className="font-semibold text-[#7567C7] dark:text-[#B9B0F2]">VIOLIN NECK</span></div>
                <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Error: {handAssignment?.leftHandTargetErrorMm ?? validation.leftHandReachMm} mm
                </div>
              </div>

              <div className="p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-black/5 dark:border-white/5 space-y-0.5">
                <div className="flex items-center justify-between font-bold text-[#25242A] dark:text-white">
                  <span>RIGHT HAND (Anatomical)</span>
                  <span className={handAssignment?.assignmentValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                    {handAssignment?.assignmentValid ? 'PASS' : 'FAIL'}
                  </span>
                </div>
                <div className="text-[#524E5B] dark:text-[#D1CCE0]">Bone: <span className="text-[#25242A] dark:text-white font-semibold">{handAssignment?.rightHandBoneName || 'Normalized_J_Bip_R_Hand'}</span></div>
                <div className="text-[#524E5B] dark:text-[#D1CCE0]">Target: <span className="font-semibold text-[#7567C7] dark:text-[#B9B0F2]">BOW FROG</span></div>
                <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Error: {handAssignment?.rightHandTargetErrorMm ?? validation.rightHandReachMm} mm
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
              TAB 3: VALIDATION CHECKS
              ========================================================================= */}
          {activeTab === 'checks' && (
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
          )}

          {/* Action Buttons (Section 10) */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-1.5">
            <button
              type="button"
              onClick={handleCopyArmDiagnostic}
              className="w-full py-1.5 px-2.5 rounded-xl bg-[#7567C7] hover:bg-[#6455B8] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer shadow-xs"
            >
              {copiedArmDiag ? <Check className="h-3.5 w-3.5" /> : <GitFork className="h-3.5 w-3.5" />}
              <span>{copiedArmDiag ? 'Arm Diagnostic Copied!' : 'COPY ARM DIAGNOSTIC'}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyDebugReport}
                className="flex-1 py-1.5 px-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#25242A] dark:text-white text-[10.5px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-black/5 dark:border-white/5"
              >
                {copiedReport ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copiedReport ? 'Report Copied' : 'General Report'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyRawSkeleton}
                className="py-1.5 px-2.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#25242A] dark:text-white text-[10.5px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer border border-black/5 dark:border-white/5"
                title="Copy raw bone positions"
              >
                {copiedRaw ? <Check className="h-3 w-3 text-emerald-500" /> : <Code className="h-3 w-3" />}
                <span>Raw</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
