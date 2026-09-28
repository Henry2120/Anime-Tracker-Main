// TEMPORARY VIOLIN POSE DEBUG
import React, { useState } from 'react';
import {
  RotateCcw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { DiagnosticTuningValues, ViolinDebugNumericData } from './ViolinPoseDebugger';

export interface ViolinPoseDiagnosticPanelProps {
  tuningValues: DiagnosticTuningValues;
  actualData: ViolinDebugNumericData | null;
  onUpdateTuningValues: (updater: (prev: DiagnosticTuningValues) => DiagnosticTuningValues) => void;
  onResetLeftArm: () => void;
  onResetRightArm: () => void;
  onResetViolin: () => void;
  onResetBow: () => void;
  onResetAll: () => void;
}

/**
 * Interactive Diagnostic Controls Panel
 * Allows live real-time editing of 3D diagnostic coordinates and rotations.
 * Provides live comparison against actual bone positions, resets, and clipboard export.
 */
export const ViolinPoseDiagnosticPanel: React.FC<ViolinPoseDiagnosticPanelProps> = ({
  tuningValues,
  actualData,
  onUpdateTuningValues,
  onResetLeftArm,
  onResetRightArm,
  onResetViolin,
  onResetBow,
  onResetAll,
}) => {
  const [activeTab, setActiveTab] = useState<'left' | 'right' | 'violin' | 'bow'>('left');
  const [copied, setCopied] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const handleValueChange = (
    category: 'leftShoulder' | 'leftElbow' | 'leftHand' | 'leftHandTarget' |
              'rightShoulder' | 'rightElbow' | 'rightHand' | 'rightHandTarget' |
              'violinPos' | 'violinRot' | 'bowPos' | 'bowRot',
    axis: 'x' | 'y' | 'z',
    val: number
  ) => {
    onUpdateTuningValues((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [axis]: Number(val),
      },
    }));
  };

  const handleCopyValues = () => {
    const formatted = `// Exported Violin Pose Diagnostic Values
export const DIAGNOSTIC_VIOLIN_POSE = {
  leftArm: {
    shoulder: { x: ${tuningValues.leftShoulder.x.toFixed(3)}, y: ${tuningValues.leftShoulder.y.toFixed(3)}, z: ${tuningValues.leftShoulder.z.toFixed(3)} },
    elbow: { x: ${tuningValues.leftElbow.x.toFixed(3)}, y: ${tuningValues.leftElbow.y.toFixed(3)}, z: ${tuningValues.leftElbow.z.toFixed(3)} },
    hand: { x: ${tuningValues.leftHand.x.toFixed(3)}, y: ${tuningValues.leftHand.y.toFixed(3)}, z: ${tuningValues.leftHand.z.toFixed(3)} },
    target: { x: ${tuningValues.leftHandTarget.x.toFixed(3)}, y: ${tuningValues.leftHandTarget.y.toFixed(3)}, z: ${tuningValues.leftHandTarget.z.toFixed(3)} },
  },
  rightArm: {
    shoulder: { x: ${tuningValues.rightShoulder.x.toFixed(3)}, y: ${tuningValues.rightShoulder.y.toFixed(3)}, z: ${tuningValues.rightShoulder.z.toFixed(3)} },
    elbow: { x: ${tuningValues.rightElbow.x.toFixed(3)}, y: ${tuningValues.rightElbow.y.toFixed(3)}, z: ${tuningValues.rightElbow.z.toFixed(3)} },
    hand: { x: ${tuningValues.rightHand.x.toFixed(3)}, y: ${tuningValues.rightHand.y.toFixed(3)}, z: ${tuningValues.rightHand.z.toFixed(3)} },
    target: { x: ${tuningValues.rightHandTarget.x.toFixed(3)}, y: ${tuningValues.rightHandTarget.y.toFixed(3)}, z: ${tuningValues.rightHandTarget.z.toFixed(3)} },
  },
  violin: {
    position: { x: ${tuningValues.violinPos.x.toFixed(3)}, y: ${tuningValues.violinPos.y.toFixed(3)}, z: ${tuningValues.violinPos.z.toFixed(3)} },
    rotation: { x: ${tuningValues.violinRot.x.toFixed(3)}, y: ${tuningValues.violinRot.y.toFixed(3)}, z: ${tuningValues.violinRot.z.toFixed(3)} },
  },
  bow: {
    position: { x: ${tuningValues.bowPos.x.toFixed(3)}, y: ${tuningValues.bowPos.y.toFixed(3)}, z: ${tuningValues.bowPos.z.toFixed(3)} },
    rotation: { x: ${tuningValues.bowRot.x.toFixed(3)}, y: ${tuningValues.bowRot.y.toFixed(3)}, z: ${tuningValues.bowRot.z.toFixed(3)} },
  },
};`;

    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const renderAxisControl = (
    label: string,
    category: 'leftShoulder' | 'leftElbow' | 'leftHand' | 'leftHandTarget' |
              'rightShoulder' | 'rightElbow' | 'rightHand' | 'rightHandTarget' |
              'violinPos' | 'violinRot' | 'bowPos' | 'bowRot',
    actualCoord?: { x: number; y: number; z: number } | null,
    min = -2.0,
    max = 2.0,
    step = 0.005
  ) => {
    const cur = tuningValues[category];

    return (
      <div className="p-2 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-white/90">{label}</span>
          {actualCoord && (
            <span className="text-[9px] text-white/50 font-mono">
              Actual: [{actualCoord.x.toFixed(2)}, {actualCoord.y.toFixed(2)}, {actualCoord.z.toFixed(2)}]
            </span>
          )}
        </div>

        {(['x', 'y', 'z'] as const).map((axis) => {
          const val = cur[axis];
          const axisColor = axis === 'x' ? 'text-red-400' : axis === 'y' ? 'text-emerald-400' : 'text-blue-400';

          return (
            <div key={axis} className="flex items-center gap-2">
              <span className={`w-3 text-[10px] font-bold uppercase font-mono ${axisColor}`}>{axis}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={val}
                onChange={(e) => handleValueChange(category, axis, parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <input
                type="number"
                step={step}
                value={val}
                onChange={(e) => handleValueChange(category, axis, parseFloat(e.target.value) || 0)}
                className="w-16 px-1.5 py-0.5 rounded bg-black/60 border border-white/20 text-white text-[10px] font-mono text-right focus:outline-hidden focus:border-amber-400"
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="absolute top-3 right-3 max-w-[360px] w-full max-h-[92%] overflow-y-auto rounded-2xl bg-black/92 backdrop-blur-md border border-amber-500/50 text-white shadow-2xl p-3 space-y-2.5 z-20 font-sans select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/15">
        <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
          <Sliders className="h-4 w-4" />
          <span>DIAGNOSTIC POSE SANDBOX</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyValues}
            className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer shadow-xs"
            title="Copy all current diagnostic values as TypeScript object"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied!' : 'Copy Values'}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="p-1 text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Category Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-white/5 rounded-xl border border-white/10 text-[10px] font-bold">
            {[
              { id: 'left', label: 'Left Arm' },
              { id: 'right', label: 'Right Arm' },
              { id: 'violin', label: 'Violin' },
              { id: 'bow', label: 'Bow' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-1 rounded-lg transition-all cursor-pointer text-center ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-black shadow-xs font-bold'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {activeTab === 'left' && (
              <>
                <div className="flex items-center justify-between text-[10px] text-pink-300 font-bold px-1">
                  <span>LEFT ARM SKELETON & TARGET</span>
                  <button
                    type="button"
                    onClick={onResetLeftArm}
                    className="text-[9px] text-amber-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Reset Left</span>
                  </button>
                </div>
                {renderAxisControl('Left Shoulder Joint', 'leftShoulder', actualData?.leftShoulder)}
                {renderAxisControl('Left Elbow Joint', 'leftElbow', actualData?.leftElbow)}
                {renderAxisControl('Left Hand Joint', 'leftHand', actualData?.leftHand)}
                {renderAxisControl('🎯 Left Hand IK Target', 'leftHandTarget', actualData?.leftHandTarget)}
              </>
            )}

            {activeTab === 'right' && (
              <>
                <div className="flex items-center justify-between text-[10px] text-orange-300 font-bold px-1">
                  <span>RIGHT ARM SKELETON & TARGET</span>
                  <button
                    type="button"
                    onClick={onResetRightArm}
                    className="text-[9px] text-amber-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Reset Right</span>
                  </button>
                </div>
                {renderAxisControl('Right Shoulder Joint', 'rightShoulder', actualData?.rightShoulder)}
                {renderAxisControl('Right Elbow Joint', 'rightElbow', actualData?.rightElbow)}
                {renderAxisControl('Right Hand Joint', 'rightHand', actualData?.rightHand)}
                {renderAxisControl('🎯 Right Hand IK Target', 'rightHandTarget', actualData?.rightHandTarget)}
              </>
            )}

            {activeTab === 'violin' && (
              <>
                <div className="flex items-center justify-between text-[10px] text-emerald-300 font-bold px-1">
                  <span>VIOLIN POSITION & ROTATION</span>
                  <button
                    type="button"
                    onClick={onResetViolin}
                    className="text-[9px] text-amber-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Reset Violin</span>
                  </button>
                </div>
                {renderAxisControl('Violin Position (Local/Chest)', 'violinPos', actualData?.violinBodyCenter)}
                {renderAxisControl('Violin Rotation (Euler Rad)', 'violinRot', null, -Math.PI, Math.PI, 0.01)}
              </>
            )}

            {activeTab === 'bow' && (
              <>
                <div className="flex items-center justify-between text-[10px] text-amber-300 font-bold px-1">
                  <span>BOW POSITION & ROTATION</span>
                  <button
                    type="button"
                    onClick={onResetBow}
                    className="text-[9px] text-amber-300 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    <span>Reset Bow</span>
                  </button>
                </div>
                {renderAxisControl('Bow Position (World/Strings)', 'bowPos', actualData?.bowContactPoint)}
                {renderAxisControl('Bow Rotation (Euler Rad)', 'bowRot', null, -Math.PI, Math.PI, 0.01)}
              </>
            )}
          </div>

          {/* Reset All Bar */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
            <button
              type="button"
              onClick={onResetAll}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center gap-1 transition-all cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset All Diagnostics</span>
            </button>
            <span className="text-[9px] text-white/40 italic">Live 3D sync active</span>
          </div>
        </>
      )}
    </div>
  );
};
