import React from 'react';
import * as THREE from 'three';
import { InteractionSolution } from '../../core/types';

interface InteractionDebugOverlayProps {
  solution: InteractionSolution | null;
  visible: boolean;
}

/**
 * 3D Scene Debug Visualizer (Phase 13)
 * Color Code:
 * 🟢 Green: Wrist joints
 * 🔵 Blue: Palm centers
 * 🟡 Yellow: Grip centers
 * 🔴 Red: Finger target regions
 * 🟣 Purple: Instrument attachment targets
 */
export const InteractionDebugOverlay: React.FC<InteractionDebugOverlayProps> = ({
  solution,
  visible,
}) => {
  if (!visible || !solution) return null;

  const { leftHandFrame, rightHandFrame, leftArmIK, rightArmIK, validation } = solution;

  // Key landmark positions
  const lWrist = leftHandFrame.wrist.position;
  const lPalm = leftHandFrame.palm.position;
  const lGrip = leftHandFrame.grip.position;

  const rWrist = rightHandFrame.wrist.position;
  const rPalm = rightHandFrame.palm.position;
  const rGrip = rightHandFrame.grip.position;

  // Instrument targets
  const lShoulder = leftArmIK.shoulderPos;
  const lElbow = leftArmIK.elbowPos;
  const rShoulder = rightArmIK.shoulderPos;
  const rElbow = rightArmIK.elbowPos;

  return (
    <group name="InteractionDebugOverlay">
      {/* 🟢 Wrists */}
      <mesh position={lWrist}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color="#10B981" wireframe={false} />
      </mesh>
      <mesh position={rWrist}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color="#10B981" wireframe={false} />
      </mesh>

      {/* 🔵 Palms */}
      <mesh position={lPalm}>
        <sphereGeometry args={[0.014, 16, 16]} />
        <meshBasicMaterial color="#3B82F6" wireframe={false} />
      </mesh>
      <mesh position={rPalm}>
        <sphereGeometry args={[0.014, 16, 16]} />
        <meshBasicMaterial color="#3B82F6" wireframe={false} />
      </mesh>

      {/* 🟡 Grip Centers */}
      <mesh position={lGrip}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color="#EAB308" wireframe={false} />
      </mesh>
      <mesh position={rGrip}>
        <sphereGeometry args={[0.015, 16, 16]} />
        <meshBasicMaterial color="#EAB308" wireframe={false} />
      </mesh>

      {/* 🟣 Instrument Targets */}
      <mesh position={leftArmIK.targetPos}>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color="#A855F7" wireframe />
      </mesh>
      <mesh position={rightArmIK.targetPos}>
        <sphereGeometry args={[0.018, 16, 16]} />
        <meshBasicMaterial color="#A855F7" wireframe />
      </mesh>

      {/* Elbows */}
      <mesh position={lElbow}>
        <sphereGeometry args={[0.012, 12, 12]} />
        <meshBasicMaterial color="#06B6D4" wireframe />
      </mesh>
      <mesh position={rElbow}>
        <sphereGeometry args={[0.012, 12, 12]} />
        <meshBasicMaterial color="#06B6D4" wireframe />
      </mesh>

      {/* Left Arm IK Line Chain */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                lShoulder.x, lShoulder.y, lShoulder.z,
                lElbow.x, lElbow.y, lElbow.z,
                lWrist.x, lWrist.y, lWrist.z,
                lGrip.x, lGrip.y, lGrip.z,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#10B981" linewidth={2} />
      </line>

      {/* Right Arm IK Line Chain */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                rShoulder.x, rShoulder.y, rShoulder.z,
                rElbow.x, rElbow.y, rElbow.z,
                rWrist.x, rWrist.y, rWrist.z,
                rGrip.x, rGrip.y, rGrip.z,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#3B82F6" linewidth={2} />
      </line>
    </group>
  );
};
