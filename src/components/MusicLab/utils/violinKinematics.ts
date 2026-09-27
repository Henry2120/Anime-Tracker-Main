import * as THREE from 'three';

/**
 * Analytic Two-Bone IK Solver for Humanoid Limbs
 * 
 * Computes exact quaternions for root (upper arm) and mid (lower arm)
 * so that the end effector (hand) reaches targetWorldPos exactly.
 *
 * @param rootNode Upper arm normalized bone node
 * @param midNode Lower arm normalized bone node
 * @param endNode Hand normalized bone node
 * @param targetWorldPos Desired world position for hand
 * @param bendHintWorldDir Desired elbow bend direction in world space
 * @param isLeftArm true if left arm (+X rest bone), false if right arm (-X rest bone)
 */
export function solveTwoBoneIK(
  rootNode: THREE.Object3D,
  midNode: THREE.Object3D,
  endNode: THREE.Object3D,
  targetWorldPos: THREE.Vector3,
  bendHintWorldDir: THREE.Vector3,
  isLeftArm: boolean
): void {
  // 1. Get world positions
  const rootWorldPos = new THREE.Vector3();
  const midWorldPos = new THREE.Vector3();
  const endWorldPos = new THREE.Vector3();

  rootNode.getWorldPosition(rootWorldPos);
  midNode.getWorldPosition(midWorldPos);
  endNode.getWorldPosition(endWorldPos);

  // 2. Bone lengths
  const lenUpper = rootWorldPos.distanceTo(midWorldPos) || 0.22;
  const lenLower = midWorldPos.distanceTo(endWorldPos) || 0.20;

  // 3. Distance to target
  const toTargetWorld = new THREE.Vector3().subVectors(targetWorldPos, rootWorldPos);
  const targetDist = toTargetWorld.length();

  if (targetDist < 1e-4) return;

  const unitTarget = toTargetWorld.clone().normalize();

  // Clamp distance within valid reachable triangle bounds
  const minDist = Math.abs(lenUpper - lenLower) + 0.005;
  const maxDist = lenUpper + lenLower - 0.005;
  const clampedDist = THREE.MathUtils.clamp(targetDist, minDist, maxDist);

  // 4. Law of Cosines
  // Angle at shoulder from target line to upper arm
  const cosAlpha = (lenUpper * lenUpper + clampedDist * clampedDist - lenLower * lenLower) /
    (2 * lenUpper * clampedDist);
  const alpha = Math.acos(THREE.MathUtils.clamp(cosAlpha, -1, 1));

  // Angle at elbow between upper arm and lower arm
  const cosBeta = (lenUpper * lenUpper + lenLower * lenLower - clampedDist * clampedDist) /
    (2 * lenUpper * lenLower);
  const beta = Math.acos(THREE.MathUtils.clamp(cosBeta, -1, 1));
  const elbowBendAngle = Math.PI - beta;

  // 5. Elbow bend plane calculation
  // Project bendHintWorldDir perpendicular to unitTarget
  const hintProj = unitTarget.clone().multiplyScalar(bendHintWorldDir.dot(unitTarget));
  let bendDir = new THREE.Vector3().subVectors(bendHintWorldDir, hintProj);

  if (bendDir.lengthSq() < 1e-4) {
    // Fallback orthogonal direction
    bendDir = Math.abs(unitTarget.y) < 0.9
      ? new THREE.Vector3(0, 1, 0).cross(unitTarget)
      : new THREE.Vector3(1, 0, 0).cross(unitTarget);
  }
  bendDir.normalize();

  // Normal to the limb plane (hinge axis)
  const planeNormal = new THREE.Vector3().crossVectors(unitTarget, bendDir).normalize();

  // 6. Calculate desired elbow position in world space
  const elbowWorldPos = new THREE.Vector3()
    .copy(rootWorldPos)
    .addScaledVector(unitTarget, lenUpper * Math.cos(alpha))
    .addScaledVector(bendDir, lenUpper * Math.sin(alpha));

  // 7. Calculate Upper Arm Rotation
  // Desired upper arm vector in world space
  const desiredUpperWorldDir = new THREE.Vector3().subVectors(elbowWorldPos, rootWorldPos).normalize();

  // Rest direction of bone in its local parent space
  const restDir = isLeftArm ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);

  // Parent world rotation
  const parentWorldQuat = new THREE.Quaternion();
  if (rootNode.parent) {
    rootNode.parent.getWorldQuaternion(parentWorldQuat);
  }

  // Convert desired world dir into root parent local space
  const desiredUpperLocalDir = desiredUpperWorldDir.clone()
    .applyQuaternion(parentWorldQuat.clone().invert())
    .normalize();

  // Base rotation from rest vector to target direction
  const qUpperBase = new THREE.Quaternion().setFromUnitVectors(restDir, desiredUpperLocalDir);

  // Plane normal in parent local space to resolve twist/roll
  const planeNormalLocal = planeNormal.clone()
    .applyQuaternion(parentWorldQuat.clone().invert())
    .normalize();

  // Secondary axis alignment (elbow hinge axis)
  // In normalized VRM, the natural elbow hinge axis is Z
  const restHingeAxis = new THREE.Vector3(0, 0, isLeftArm ? 1 : -1);
  const currentHingeAxis = restHingeAxis.clone().applyQuaternion(qUpperBase);

  // Project both onto plane perpendicular to desiredUpperLocalDir
  const projCurrentHinge = currentHingeAxis.clone()
    .addScaledVector(desiredUpperLocalDir, -currentHingeAxis.dot(desiredUpperLocalDir))
    .normalize();
  const projTargetHinge = planeNormalLocal.clone()
    .addScaledVector(desiredUpperLocalDir, -planeNormalLocal.dot(desiredUpperLocalDir))
    .normalize();

  let qUpper = qUpperBase;
  if (projCurrentHinge.lengthSq() > 1e-4 && projTargetHinge.lengthSq() > 1e-4) {
    const qTwist = new THREE.Quaternion().setFromUnitVectors(projCurrentHinge, projTargetHinge);
    qUpper = qTwist.multiply(qUpperBase);
  }

  rootNode.quaternion.copy(qUpper);
  rootNode.updateMatrixWorld(true);

  // 8. Calculate Lower Arm (Elbow) Rotation
  // Desired lower arm vector in world space
  const desiredLowerWorldDir = new THREE.Vector3().subVectors(targetWorldPos, elbowWorldPos).normalize();

  // Upper arm current world rotation
  const upperWorldQuat = new THREE.Quaternion();
  rootNode.getWorldQuaternion(upperWorldQuat);

  // Convert desired lower arm world direction into upper arm local space
  const desiredLowerLocalDir = desiredLowerWorldDir.clone()
    .applyQuaternion(upperWorldQuat.clone().invert())
    .normalize();

  const qLower = new THREE.Quaternion().setFromUnitVectors(restDir, desiredLowerLocalDir);
  midNode.quaternion.copy(qLower);
  midNode.updateMatrixWorld(true);
}
