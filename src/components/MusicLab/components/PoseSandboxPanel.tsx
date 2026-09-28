import React from 'react';
import { RotateCcw, Eye, X, Activity, Layers, Ruler, Target } from 'lucide-react';
import { Vector3State } from './ViolinPoseSandbox';
import { VRMBodyMetrics } from '../utils/vrmMetrics';
import { ViolinBodyAnchors } from '../utils/violinBodyAnchors';

export interface PoseSandboxPanelProps {
  // Left arm test points
  leftShoulder: Vector3State;
  setLeftShoulder: React.Dispatch<React.SetStateAction<Vector3State>>;
  leftElbow: Vector3State;
  setLeftElbow: React.Dispatch<React.SetStateAction<Vector3State>>;
  leftHand: Vector3State;
  setLeftHand: React.Dispatch<React.SetStateAction<Vector3State>>;
  onResetLeftArm: () => void;

  // Actual bones toggle
  showActualBones: boolean;
  setShowActualBones: React.Dispatch<React.SetStateAction<boolean>>;

  // Violin test transforms
  violinPos: Vector3State;
  setViolinPos: React.Dispatch<React.SetStateAction<Vector3State>>;
  violinRot: Vector3State;
  setViolinRot: React.Dispatch<React.SetStateAction<Vector3State>>;
  violinScale: number;
  setViolinScale: React.Dispatch<React.SetStateAction<number>>;
  onResetViolin: () => void;

  // Read-only character metrics
  characterMetrics?: VRMBodyMetrics | null;

  // Read-only body-relative violin anchors
  violinAnchors?: ViolinBodyAnchors | null;

  // Panel state
  onClose: () => void;
}

/**
 * Reusable Numeric Input Row for Pose Sandbox
 * Immediate feedback: Number changed -> React state -> 3D scene point moves instantly!
 */
const CoordRow: React.FC<{
  label: string;
  value: number;
  step?: number;
  onChange: (val: number) => void;
}> = ({ label, value, step = 0.02, onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleStep = (delta: number) => {
    const updated = Math.round((value + delta) * 1000) / 1000;
    onChange(updated);
  };

  return (
    <div className="flex items-center justify-between gap-1 text-[11px] font-mono">
      <span className="w-4 text-white/60 font-bold">{label}</span>
      <div className="flex items-center gap-1 flex-1">
        <button
          type="button"
          onClick={() => handleStep(-step)}
          className="w-5 h-6 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center font-bold text-xs select-none transition-colors cursor-pointer"
          title={`Decrease by ${step}`}
        >
          -
        </button>
        <input
          type="number"
          step={step}
          value={value}
          onChange={handleChange}
          className="w-full h-6 px-1.5 rounded bg-black/60 border border-white/20 text-white text-center font-mono focus:border-[#00ffff] focus:outline-none focus:ring-1 focus:ring-[#00ffff]/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-xs"
        />
        <button
          type="button"
          onClick={() => handleStep(step)}
          className="w-5 h-6 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center font-bold text-xs select-none transition-colors cursor-pointer"
          title={`Increase by ${step}`}
        >
          +
        </button>
      </div>
    </div>
  );
};

export const PoseSandboxPanel: React.FC<PoseSandboxPanelProps> = ({
  leftShoulder,
  setLeftShoulder,
  leftElbow,
  setLeftElbow,
  leftHand,
  setLeftHand,
  onResetLeftArm,
  showActualBones,
  setShowActualBones,
  violinPos,
  setViolinPos,
  violinRot,
  setViolinRot,
  violinScale,
  setViolinScale,
  onResetViolin,
  characterMetrics,
  violinAnchors,
  onClose,
}) => {
  return (
    <div className="absolute top-3 right-3 bottom-3 w-80 max-w-[calc(100vw-1.5rem)] bg-black/90 backdrop-blur-md rounded-2xl border border-white/15 p-3.5 overflow-y-auto text-xs text-white z-20 shadow-2xl flex flex-col gap-3 font-sans select-none">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
          <Activity className="h-4 w-4" />
          <span className="tracking-wide uppercase text-[11px]">Interactive Pose Sandbox</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer"
          title="Close Pose Sandbox"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="text-[10px] text-white/60 leading-tight">
        Type numbers or use +/- to immediately move 3D points in real time. World coordinates.
      </div>

      {/* ========================================================================= */}
      {/* READ-ONLY CHARACTER METRICS (Extracted directly from loaded VRM skeleton) */}
      {/* ========================================================================= */}
      {characterMetrics && (
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2 text-[11px] font-mono">
          <div className="flex items-center justify-between border-b border-white/10 pb-1">
            <span className="font-bold text-[11px] text-[#C4B9FC] tracking-wider uppercase flex items-center gap-1.5">
              <Ruler className="h-3.5 w-3.5 text-cyan-300" />
              <span>Character Metrics</span>
            </span>
            <span className="text-[9px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              Measured
            </span>
          </div>

          <div className="space-y-0.5 text-white/80">
            <div className="flex justify-between">
              <span className="text-white/60">Height:</span>
              <span className="font-bold text-white">{characterMetrics.characterHeight}m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Shoulder Width:</span>
              <span className="font-bold text-white">
                {characterMetrics.shoulderWidth !== null ? `${characterMetrics.shoulderWidth}m` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Torso:</span>
              <span className="font-bold text-white">
                {characterMetrics.torso.hipsToNeck !== null ? `${characterMetrics.torso.hipsToNeck}m` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Left Arm Breakdown */}
          <div className="pt-1.5 border-t border-white/10 space-y-0.5 text-white/80">
            <div className="font-bold text-amber-300 text-[10px] uppercase tracking-wide">Left Arm</div>
            <div className="flex justify-between pl-2">
              <span className="text-white/60">Upper:</span>
              <span className="text-white">
                {characterMetrics.leftArm.upperArmLength !== null ? `${characterMetrics.leftArm.upperArmLength}m` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-white/60">Forearm:</span>
              <span className="text-white">
                {characterMetrics.leftArm.forearmLength !== null ? `${characterMetrics.leftArm.forearmLength}m` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-white/60">Hand:</span>
              <span className="text-white">
                {characterMetrics.leftArm.handLength !== null ? `${characterMetrics.leftArm.handLength}m` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between pl-2 font-bold text-amber-200">
              <span className="text-white/60">Total:</span>
              <span>
                {characterMetrics.leftArm.totalArmLength !== null ? `${characterMetrics.leftArm.totalArmLength}m` : 'N/A'}
              </span>
            </div>
          </div>

          {/* Right Arm Breakdown */}
          <div className="pt-1.5 border-t border-white/10 space-y-0.5 text-white/80">
            <div className="font-bold text-amber-300 text-[10px] uppercase tracking-wide">Right Arm</div>
            <div className="flex justify-between pl-2">
              <span className="text-white/60">Upper:</span>
              <span className="text-white">
                {characterMetrics.rightArm.upperArmLength !== null ? `${characterMetrics.rightArm.upperArmLength}m` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-white/60">Forearm:</span>
              <span className="text-white">
                {characterMetrics.rightArm.forearmLength !== null ? `${characterMetrics.rightArm.forearmLength}m` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between pl-2">
              <span className="text-white/60">Hand:</span>
              <span className="text-white">
                {characterMetrics.rightArm.handLength !== null ? `${characterMetrics.rightArm.handLength}m` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between pl-2 font-bold text-amber-200">
              <span className="text-white/60">Total:</span>
              <span>
                {characterMetrics.rightArm.totalArmLength !== null ? `${characterMetrics.rightArm.totalArmLength}m` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* READ-ONLY VIOLIN ANCHORS (Calculated from body-relative character frame)  */}
      {/* ========================================================================= */}
      {violinAnchors && (
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2 text-[11px] font-mono">
          <div className="flex items-center justify-between border-b border-white/10 pb-1">
            <span className="font-bold text-[11px] text-[#C4B9FC] tracking-wider uppercase flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-amber-400" />
              <span>Violin Anchors</span>
            </span>
            <span className="text-[9px] text-cyan-300 font-bold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
              Body-Relative
            </span>
          </div>

          <div className="space-y-1.5 text-white/80">
            <div>
              <div className="font-bold text-white text-[10px]">Violin Mount</div>
              <div className="text-[10px] text-white/60 pl-2">
                position: ({violinAnchors.violinMount.worldPosition.x.toFixed(3)}, {violinAnchors.violinMount.worldPosition.y.toFixed(3)}, {violinAnchors.violinMount.worldPosition.z.toFixed(3)})
              </div>
            </div>

            <div>
              <div className="font-bold text-white text-[10px]">Chin Target</div>
              <div className="text-[10px] text-white/60 pl-2">
                position: ({violinAnchors.chinRestTarget.x.toFixed(3)}, {violinAnchors.chinRestTarget.y.toFixed(3)}, {violinAnchors.chinRestTarget.z.toFixed(3)})
              </div>
            </div>

            <div>
              <div className="font-bold text-white text-[10px]">Left Hand Target</div>
              <div className="text-[10px] text-white/60 pl-2">
                position: ({violinAnchors.leftHandTarget.x.toFixed(3)}, {violinAnchors.leftHandTarget.y.toFixed(3)}, {violinAnchors.leftHandTarget.z.toFixed(3)})
              </div>
            </div>

            <div>
              <div className="font-bold text-white text-[10px]">Bow Contact</div>
              <div className="text-[10px] text-white/60 pl-2">
                position: ({violinAnchors.bowContactPoint.x.toFixed(3)}, {violinAnchors.bowContactPoint.y.toFixed(3)}, {violinAnchors.bowContactPoint.z.toFixed(3)})
              </div>
            </div>

            <div>
              <div className="font-bold text-white text-[10px]">Bow Grip</div>
              <div className="text-[10px] text-white/60 pl-2">
                position: ({violinAnchors.bowGripTarget.x.toFixed(3)}, {violinAnchors.bowGripTarget.y.toFixed(3)}, {violinAnchors.bowGripTarget.z.toFixed(3)})
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: LEFT ARM TEST                                                  */}
      {/* ========================================================================= */}
      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
        <div className="flex items-center justify-between border-b border-white/10 pb-1">
          <span className="font-bold text-[11px] text-[#C4B9FC] tracking-wider uppercase">
            LEFT ARM TEST
          </span>
          <span className="text-[9px] text-cyan-300 font-mono">Lines: Cyan</span>
        </div>

        {/* LEFT SHOULDER (Pink) */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#ff00ff]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff00ff] inline-block shadow-[0_0_8px_#ff00ff]" />
            <span>LEFT SHOULDER</span>
          </div>
          <div className="grid grid-cols-1 gap-1 pl-4">
            <CoordRow
              label="X"
              value={leftShoulder.x}
              step={0.02}
              onChange={(x) => setLeftShoulder((prev) => ({ ...prev, x }))}
            />
            <CoordRow
              label="Y"
              value={leftShoulder.y}
              step={0.02}
              onChange={(y) => setLeftShoulder((prev) => ({ ...prev, y }))}
            />
            <CoordRow
              label="Z"
              value={leftShoulder.z}
              step={0.02}
              onChange={(z) => setLeftShoulder((prev) => ({ ...prev, z }))}
            />
          </div>
        </div>

        {/* LEFT ELBOW (Blue) */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0088ff]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0088ff] inline-block shadow-[0_0_8px_#0088ff]" />
            <span>LEFT ELBOW</span>
          </div>
          <div className="grid grid-cols-1 gap-1 pl-4">
            <CoordRow
              label="X"
              value={leftElbow.x}
              step={0.02}
              onChange={(x) => setLeftElbow((prev) => ({ ...prev, x }))}
            />
            <CoordRow
              label="Y"
              value={leftElbow.y}
              step={0.02}
              onChange={(y) => setLeftElbow((prev) => ({ ...prev, y }))}
            />
            <CoordRow
              label="Z"
              value={leftElbow.z}
              step={0.02}
              onChange={(z) => setLeftElbow((prev) => ({ ...prev, z }))}
            />
          </div>
        </div>

        {/* LEFT HAND (Yellow) */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#ffee00]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffee00] inline-block shadow-[0_0_8px_#ffee00]" />
            <span>LEFT HAND</span>
          </div>
          <div className="grid grid-cols-1 gap-1 pl-4">
            <CoordRow
              label="X"
              value={leftHand.x}
              step={0.02}
              onChange={(x) => setLeftHand((prev) => ({ ...prev, x }))}
            />
            <CoordRow
              label="Y"
              value={leftHand.y}
              step={0.02}
              onChange={(y) => setLeftHand((prev) => ({ ...prev, y }))}
            />
            <CoordRow
              label="Z"
              value={leftHand.z}
              step={0.02}
              onChange={(z) => setLeftHand((prev) => ({ ...prev, z }))}
            />
          </div>
        </div>

        {/* RESET LEFT ARM BUTTON */}
        <button
          type="button"
          onClick={onResetLeftArm}
          className="w-full mt-1 py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-white/15"
        >
          <RotateCcw className="h-3 w-3" />
          <span>RESET LEFT ARM</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: ACTUAL VRM BONES TOGGLE                                        */}
      {/* ========================================================================= */}
      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer text-[11px] font-semibold text-white/90">
          <input
            type="checkbox"
            checked={showActualBones}
            onChange={(e) => setShowActualBones(e.target.checked)}
            className="w-4 h-4 rounded text-[#7567C7] focus:ring-0 focus:ring-offset-0 bg-black/60 border-white/30 cursor-pointer"
          />
          <span>Show Actual VRM Bones</span>
        </label>
        <p className="text-[10px] text-white/50 pl-6 leading-tight">
          Displays white/gray markers at actual character joints (Shoulder, UpperArm, LowerArm, Hand) for visual comparison.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: VIOLIN TEST                                                    */}
      {/* ========================================================================= */}
      <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
        <div className="flex items-center justify-between border-b border-white/10 pb-1">
          <span className="font-bold text-[11px] text-[#C4B9FC] tracking-wider uppercase">
            VIOLIN TEST
          </span>
          <div className="flex items-center gap-2 text-[9px] font-mono">
            <span className="text-[#00ff66]">● Neck</span>
            <span className="text-white">● Chin</span>
            <span className="text-[#ff2222]">● Bow</span>
          </div>
        </div>

        {/* Position X, Y, Z */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-white/80">Position</span>
          <div className="grid grid-cols-1 gap-1 pl-4">
            <CoordRow
              label="X"
              value={violinPos.x}
              step={0.02}
              onChange={(x) => setViolinPos((prev) => ({ ...prev, x }))}
            />
            <CoordRow
              label="Y"
              value={violinPos.y}
              step={0.02}
              onChange={(y) => setViolinPos((prev) => ({ ...prev, y }))}
            />
            <CoordRow
              label="Z"
              value={violinPos.z}
              step={0.02}
              onChange={(z) => setViolinPos((prev) => ({ ...prev, z }))}
            />
          </div>
        </div>

        {/* Rotation X, Y, Z */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-white/80">Rotation (radians)</span>
          <div className="grid grid-cols-1 gap-1 pl-4">
            <CoordRow
              label="X"
              value={violinRot.x}
              step={0.05}
              onChange={(x) => setViolinRot((prev) => ({ ...prev, x }))}
            />
            <CoordRow
              label="Y"
              value={violinRot.y}
              step={0.05}
              onChange={(y) => setViolinRot((prev) => ({ ...prev, y }))}
            />
            <CoordRow
              label="Z"
              value={violinRot.z}
              step={0.05}
              onChange={(z) => setViolinRot((prev) => ({ ...prev, z }))}
            />
          </div>
        </div>

        {/* Scale */}
        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-white/80">Scale</span>
          <div className="pl-4">
            <CoordRow
              label="S"
              value={violinScale}
              step={0.05}
              onChange={(s) => setViolinScale(Math.max(0.1, s))}
            />
          </div>
        </div>

        {/* RESET VIOLIN BUTTON */}
        <button
          type="button"
          onClick={onResetViolin}
          className="w-full mt-1 py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-white/15"
        >
          <RotateCcw className="h-3 w-3" />
          <span>RESET VIOLIN</span>
        </button>
      </div>
    </div>
  );
};
