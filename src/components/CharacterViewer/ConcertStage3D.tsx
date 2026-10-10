import React from 'react';
import { ViewerEnvironment } from './types';

interface ConcertStage3DProps {
  environment?: ViewerEnvironment;
  selectedSlotIndex?: number | null;
  onSelectSlot?: (slotIndex: number) => void;
}

/**
 * Physical concert stage is intentionally removed.
 * Characters stand freely in their 3D concert formation with subtle natural contact shadows.
 */
export const ConcertStage3D: React.FC<ConcertStage3DProps> = () => {
  return null;
};

