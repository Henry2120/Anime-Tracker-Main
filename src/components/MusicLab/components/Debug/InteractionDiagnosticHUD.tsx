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
} from 'lucide-react';
import { ValidationResult, InteractionSolution, HumanoidMetrics } from '../../core/types';

interface InteractionDiagnosticHUDProps {
  solution: InteractionSolution | null;
  metrics: HumanoidMetrics | null;
  visible: boolean;
  onToggleVisible: () => void;
  onRecalculate?: () => void;
}

/**
 * Diagnostic HUD Panel (Phase 13)
 * Displays real-time kinematic interaction scores, reach measurements, and joint diagnostics.
 */
export const InteractionDiagnosticHUD: React.FC<InteractionDiagnosticHUDProps> = ({
  solution,
  metrics,
  visible,
  onToggleVisible,
  onRecalculate,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!solution || !visible) return null;

  const { validation } = solution;
  const isExcellent = validation.state === 'excellent';
  const isAcceptable = validation.state === 'acceptable';
  const isQuestionable = validation.state === 'questionable';

  const badgeColor = isExcellent
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
    : isAcceptable
    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    : isQuestionable
    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';

  return (
    <aside
      aria-label="Violin Interaction Diagnostics"
      className="absolute top-4 left-4 z-30 max-w-sm w-full bg-white/95 dark:bg-[#1A1824]/95 backdrop-blur-md rounded-2xl border border-black/10 dark:border-white/10 shadow-xl overflow-hidden font-sans text-xs transition-all"
    >
      {/* Header bar */}
      <div className="p-3 bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#7567C7]" />
          <span className="font-bold text-[#25242A] dark:text-[#F4F2F7] tracking-tight">
            VIOLIN INTERACTION
          </span>
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
          {/* Anatomical Scale & Metrics Summary */}
          {metrics && (
            <div className="p-2 rounded-xl bg-black/5 dark:bg-white/5 text-[11px] space-y-1">
              <div className="text-[10px] font-bold text-[#77747D] dark:text-[#9E9AA6] uppercase tracking-wider">
                Humanoid Proportions
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[#524E5B] dark:text-[#D1CCE0]">
                <span>Height: <strong className="text-[#25242A] dark:text-white">{(metrics.height * 100).toFixed(0)}cm</strong></span>
                <span>Type: <strong className="text-[#25242A] dark:text-white">{metrics.isChibi ? 'Chibi / Mini' : 'Standard Proportional'}</strong></span>
                <span>Left Reach: <strong className="text-[#25242A] dark:text-white">{(metrics.armReach.left * 100).toFixed(0)}cm</strong></span>
                <span>Violin Scale: <strong className="text-[#7567C7] dark:text-[#B9B0F2]">{(solution.instrumentScale * 100).toFixed(0)}%</strong></span>
              </div>
            </div>
          )}

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

                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                  <span className={check.passed ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-red-500 font-bold'}>
                    {check.measurementValue} {check.unit}
                  </span>
                  <span className="text-[10px] text-[#77747D] opacity-60">
                    ({check.achievedScore}/{check.weight})
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Diagnostic Warnings if any check fails */}
          {validation.notes.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span>Kinematic Constraints</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 opacity-90">
                {validation.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Legend */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5 text-[10px] text-[#77747D] dark:text-[#9E9AA6] flex flex-wrap gap-2">
            <span className="flex items-center gap-1">🟢 Wrist</span>
            <span className="flex items-center gap-1">🔵 Palm</span>
            <span className="flex items-center gap-1">🟡 Grip</span>
            <span className="flex items-center gap-1">🟣 Instrument Target</span>
          </div>
        </div>
      )}
    </aside>
  );
};
