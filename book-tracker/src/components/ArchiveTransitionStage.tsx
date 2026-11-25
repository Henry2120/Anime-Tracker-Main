import type { ReactNode } from 'react';

export type ArchiveTransitionKind = 'enter-wing' | 'zoom-shelf' | 'step-back';

interface ArchiveTransitionStageProps {
  transitionKey: string;
  kind?: ArchiveTransitionKind;
  children: ReactNode;
}

/**
 * Shared spatial camera transition container for moving smoothly across
 * Midnight Archive wings, zooming into walnut bookshelves, or stepping back to the Grand Hall.
 */
export function ArchiveTransitionStage({
  transitionKey,
  kind = 'enter-wing',
  children,
}: ArchiveTransitionStageProps) {
  const animClass =
    kind === 'zoom-shelf'
      ? 'archive-transition-zoom-shelf'
      : kind === 'step-back'
        ? 'archive-transition-step-back'
        : 'archive-transition-enter-wing';

  return (
    <div key={transitionKey} className={`${animClass} w-full`}>
      {children}
    </div>
  );
}
