import React from 'react';
import * as THREE from 'three';
import { CONCERT_STAGE_CONFIG, getConcertSlotTransform } from './concertConfig';
import { ViewerEnvironment } from './types';

interface ConcertStage3DProps {
  environment: ViewerEnvironment;
  selectedSlotIndex?: number | null;
  onSelectSlot?: (slotIndex: number) => void;
}

export const ConcertStage3D: React.FC<ConcertStage3DProps> = ({
  environment,
  selectedSlotIndex,
  onSelectSlot,
}) => {
  const isDark = environment === 'dark';
  const isSakura = environment === 'sakura';

  const stageFloorColor = isDark ? '#181525' : isSakura ? '#FCEEEF' : '#ECE8E1';
  const riserColor = isDark ? '#231E35' : isSakura ? '#F7DFE3' : '#DFDAD0';
  const edgeTrimColor = isDark ? '#7567C7' : isSakura ? '#F472B6' : '#8B5CF6';

  return (
    <group name="ConcertStageGroup">
      {/* =========================================================================
          1. MAIN FRONT STAGE PLATFORM (Y = 0.0 surface)
          ========================================================================= */}
      <mesh position={[0, -0.06, 0.1]} receiveShadow>
        <boxGeometry args={[CONCERT_STAGE_CONFIG.stageWidth, 0.12, CONCERT_STAGE_CONFIG.stageDepth]} />
        <meshStandardMaterial
          color={stageFloorColor}
          roughness={0.45}
          metalness={0.1}
        />
      </mesh>

      {/* Front Stage Edge Trim */}
      <mesh position={[0, 0.002, 2.25]}>
        <boxGeometry args={[CONCERT_STAGE_CONFIG.stageWidth, 0.015, 0.05]} />
        <meshStandardMaterial
          color={edgeTrimColor}
          emissive={edgeTrimColor}
          emissiveIntensity={0.35}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>

      {/* =========================================================================
          2. ELEVATED BACK ROW RISER (Top surface at exactly Y = 0.50)
          Center at Y = 0.25, height = 0.50, depth = 1.8, Z = -0.85
          ========================================================================= */}
      <group position={[0, 0, CONCERT_STAGE_CONFIG.backRowZ]}>
        <mesh position={[0, CONCERT_STAGE_CONFIG.riserHeight / 2, 0]} receiveShadow castShadow>
          <boxGeometry
            args={[
              CONCERT_STAGE_CONFIG.riserWidth,
              CONCERT_STAGE_CONFIG.riserHeight,
              CONCERT_STAGE_CONFIG.riserDepth,
            ]}
          />
          <meshStandardMaterial
            color={riserColor}
            roughness={0.4}
            metalness={0.12}
          />
        </mesh>

        {/* Riser Front Step Trim / Glow Strip */}
        <mesh position={[0, CONCERT_STAGE_CONFIG.riserHeight, CONCERT_STAGE_CONFIG.riserDepth / 2]}>
          <boxGeometry args={[CONCERT_STAGE_CONFIG.riserWidth, 0.02, 0.04]} />
          <meshStandardMaterial
            color={edgeTrimColor}
            emissive={edgeTrimColor}
            emissiveIntensity={0.6}
            roughness={0.2}
            metalness={0.6}
          />
        </mesh>
      </group>

      {/* =========================================================================
          3. 10 SLOT STAGE FLOOR MARKERS (Interactive position rings)
          ========================================================================= */}
      {Array.from({ length: 10 }).map((_, slotIdx) => {
        const slot = getConcertSlotTransform(slotIdx);
        const isSelected = selectedSlotIndex === slotIdx;
        const markerY = slot.isElevated ? CONCERT_STAGE_CONFIG.backRowY + 0.003 : 0.003;

        return (
          <group
            key={`slot-marker-${slotIdx}`}
            position={[slot.position.x, markerY, slot.position.z]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectSlot?.(slotIdx);
            }}
          >
            {/* Base Circle */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <ringGeometry args={[0.38, 0.44, 32]} />
              <meshBasicMaterial
                color={isSelected ? '#38BDF8' : edgeTrimColor}
                transparent
                opacity={isSelected ? 0.85 : 0.28}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
