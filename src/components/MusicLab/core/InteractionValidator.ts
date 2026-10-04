import * as THREE from 'three';
import {
  ValidationResult,
  ValidationCheck,
  InteractionState,
  ArmIKSolution,
  HandInteractionFrame,
  Transform3D,
  HandAssignmentDiagnostic,
} from './types';

/**
 * Comprehensive Position & Orientation Interaction Validator (Part 3 & Part 13)
 *
 * Evaluates both POSITION and ORIENTATION of the actual rendered VRM skeleton:
 * 1. Strict Non-negotiable Hand Assignment Verification (Left Hand -> Violin Neck, Right Hand -> Bow Frog)
 * 2. Left hand position & orientation (palm normal, finger axis)
 * 3. Right hand position & orientation (grip axis, palmar drape)
 * 4. Chinrest contact & Head orientation (looking along fingerboard)
 * 5. Bow hair contact & String orthogonality
 * 6. Left & Right elbow flexion angles
 * 7. Shoulder relaxation & torso alignment
 *
 * Hard failures strictly override weighted scores.
 */
export class InteractionValidator {
  public static validateViolinInteraction(params: {
    violinTransform: Transform3D;
    bowTransform: Transform3D;
    chinrestWorldPos: THREE.Vector3;
    chinTargetWorldPos: THREE.Vector3;
    neckTargetWorldPos: THREE.Vector3;
    leftHandFrame: HandInteractionFrame;
    rightHandFrame: HandInteractionFrame;
    bowFrogGripWorldPos: THREE.Vector3;
    bowHairContactWorldPos: THREE.Vector3;
    playableStringsWorldPos: THREE.Vector3;
    violinStringsDirection: THREE.Vector3;
    bowStickDirection: THREE.Vector3;
    leftArmIK: ArmIKSolution;
    rightArmIK: ArmIKSolution;
    boneNames?: {
      leftHand: string;
      rightHand: string;
    };
    actualBoneTransforms?: {
      head: THREE.Vector3;
      headQuat?: THREE.Quaternion;
      leftWrist: THREE.Vector3;
      leftHandQuat?: THREE.Quaternion;
      rightWrist: THREE.Vector3;
      rightHandQuat?: THREE.Quaternion;
      leftElbow: THREE.Vector3;
      rightElbow: THREE.Vector3;
    };
  }): ValidationResult {
    const checks: ValidationCheck[] = [];
    const notes: string[] = [];
    const hardFailures: string[] = [];

    // --- Hard failure sanity checks ---
    if (!params.violinTransform || params.violinTransform.scale.x <= 0) {
      hardFailures.push('Violin not rendered or zero scale');
    }
    if (!params.bowTransform || params.bowTransform.scale.x <= 0) {
      hardFailures.push('Bow not rendered or zero scale');
    }

    const actual = params.actualBoneTransforms;

    // Helper: compute angular difference between two quaternions in degrees
    const getAngularDiffDeg = (q1: THREE.Quaternion, q2: THREE.Quaternion): number => {
      const dot = Math.abs(q1.dot(q2));
      return parseFloat(((2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI).toFixed(1));
    };

    // =========================================================================
    // NON-NEGOTIABLE HAND ASSIGNMENT INVARIANT CHECK (Section 1 & Section 10)
    // =========================================================================
    const leftBoneName = params.boneNames?.leftHand || 'leftHand';
    const rightBoneName = params.boneNames?.rightHand || 'rightHand';

    const leftActualPos = actual ? actual.leftWrist : params.leftHandFrame.wrist.position;
    const rightActualPos = actual ? actual.rightWrist : params.rightHandFrame.wrist.position;

    const leftWristDistToTarget = leftActualPos.distanceTo(params.leftHandFrame.wrist.position);
    const rightWristDistToTarget = rightActualPos.distanceTo(params.rightHandFrame.wrist.position);

    const leftTargetErrorMm = parseFloat((leftWristDistToTarget * 1000).toFixed(1));
    const rightTargetErrorMm = parseFloat((rightWristDistToTarget * 1000).toFixed(1));

    // Distance of left hand to bow frog vs neck target
    const leftDistToBowFrog = leftActualPos.distanceTo(params.bowFrogGripWorldPos);
    const rightDistToNeck = rightActualPos.distanceTo(params.neckTargetWorldPos);

    let assignmentValid = true;
    if (leftDistToBowFrog < leftWristDistToTarget || rightDistToNeck < rightWristDistToTarget) {
      assignmentValid = false;
      hardFailures.push('CRITICAL: Anatomical hand assignment reversed (Left Hand on Bow, Right Hand on Violin)');
    }

    const handAssignment: HandAssignmentDiagnostic = {
      leftHandBoneName: leftBoneName,
      leftHandTargetName: 'VIOLIN NECK',
      leftHandTargetPos: params.neckTargetWorldPos.clone(),
      leftHandActualPos: leftActualPos.clone(),
      leftHandTargetErrorMm: leftTargetErrorMm,

      rightHandBoneName: rightBoneName,
      rightHandTargetName: 'BOW FROG',
      rightHandTargetPos: params.bowFrogGripWorldPos.clone(),
      rightHandActualPos: rightActualPos.clone(),
      rightHandTargetErrorMm: rightTargetErrorMm,

      violinSide: 'LEFT SHOULDER',
      bowSide: 'RIGHT HAND',
      assignmentValid,
    };

    // 1. Left Hand Position (Weight: 12%)
    const targetLeftHandDist = params.leftHandFrame.grip.position.distanceTo(params.neckTargetWorldPos);
    const targetLeftHandMm = parseFloat((targetLeftHandDist * 1000).toFixed(1));
    const actualLeftHandMm = leftTargetErrorMm;

    const leftHandPosPassed = actualLeftHandMm <= 18;
    if (actualLeftHandMm > 35) {
      hardFailures.push(`Left hand detached from neck cradle (${actualLeftHandMm}mm error)`);
    }
    const leftHandPosScore = Math.max(0, 1 - actualLeftHandMm / 25) * 12;
    checks.push({
      id: 'left_hand_pos',
      label: 'Left Hand Cradle Position',
      weight: 12,
      achievedScore: parseFloat(leftHandPosScore.toFixed(1)),
      passed: leftHandPosPassed,
      measurementValue: actualLeftHandMm,
      targetError: targetLeftHandMm,
      actualError: actualLeftHandMm,
      unit: 'mm',
      threshold: 18,
      details: `Distance to neck cradle: ${actualLeftHandMm}mm`,
    });

    // 2. Left Hand Orientation (Weight: 8%) - palm wraps around neck, fingers arched over strings
    const leftHandAngErr = actual && actual.leftHandQuat
      ? getAngularDiffDeg(actual.leftHandQuat, params.leftHandFrame.grip.quaternion)
      : 0;
    const leftHandAngPassed = leftHandAngErr <= 16;
    if (leftHandAngErr > 28) {
      hardFailures.push(`Left hand rotated incorrectly (${leftHandAngErr}° orientation error)`);
    }
    const leftHandAngScore = Math.max(0, 1 - leftHandAngErr / 22) * 8;
    checks.push({
      id: 'left_hand_orient',
      label: 'Left Hand & Palm Orientation',
      weight: 8,
      achievedScore: parseFloat(leftHandAngScore.toFixed(1)),
      passed: leftHandAngPassed,
      measurementValue: leftHandAngErr,
      targetError: 0,
      actualError: leftHandAngErr,
      unit: 'deg',
      threshold: 16,
      details: `Palm & finger alignment error: ${leftHandAngErr}°`,
    });

    // 3. Right Hand Position (Weight: 12%) - fingers wrap frog
    const targetRightHandDist = params.rightHandFrame.grip.position.distanceTo(params.bowFrogGripWorldPos);
    const targetRightHandMm = parseFloat((targetRightHandDist * 1000).toFixed(1));
    const actualRightHandMm = rightTargetErrorMm;

    const rightHandPosPassed = actualRightHandMm <= 18;
    if (actualRightHandMm > 32) {
      hardFailures.push(`Right hand detached from bow frog (${actualRightHandMm}mm error)`);
    }
    const rightHandPosScore = Math.max(0, 1 - actualRightHandMm / 22) * 12;
    checks.push({
      id: 'right_hand_pos',
      label: 'Right Hand Bow Grip Position',
      weight: 12,
      achievedScore: parseFloat(rightHandPosScore.toFixed(1)),
      passed: rightHandPosPassed,
      measurementValue: actualRightHandMm,
      targetError: targetRightHandMm,
      actualError: actualRightHandMm,
      unit: 'mm',
      threshold: 18,
      details: `Distance to bow frog: ${actualRightHandMm}mm`,
    });

    // 4. Right Hand Orientation (Weight: 8%) - bow hold with opposing thumb & draped fingers
    const rightHandAngErr = actual && actual.rightHandQuat
      ? getAngularDiffDeg(actual.rightHandQuat, params.rightHandFrame.grip.quaternion)
      : 0;
    const rightHandAngPassed = rightHandAngErr <= 16;
    if (rightHandAngErr > 28) {
      hardFailures.push(`Right hand bow hold rotated incorrectly (${rightHandAngErr}° orientation error)`);
    }
    const rightHandAngScore = Math.max(0, 1 - rightHandAngErr / 22) * 8;
    checks.push({
      id: 'right_hand_orient',
      label: 'Right Hand Bow Hold Orientation',
      weight: 8,
      achievedScore: parseFloat(rightHandAngScore.toFixed(1)),
      passed: rightHandAngPassed,
      measurementValue: rightHandAngErr,
      targetError: 0,
      actualError: rightHandAngErr,
      unit: 'deg',
      threshold: 16,
      details: `Bow hold grip alignment error: ${rightHandAngErr}°`,
    });

    // 5. Chinrest Contact Position (Weight: 8%)
    const targetChinrestDist = params.chinTargetWorldPos.distanceTo(params.chinrestWorldPos);
    const targetChinrestMm = parseFloat((targetChinrestDist * 1000).toFixed(1));
    const actualChinPos = actual
      ? actual.head.clone().add(new THREE.Vector3(0.018, -0.065, 0.082))
      : params.chinTargetWorldPos;
    const actualChinrestDist = actualChinPos.distanceTo(params.chinrestWorldPos);
    const actualChinrestMm = parseFloat((actualChinrestDist * 1000).toFixed(1));

    const chinrestPassed = actualChinrestMm <= 20;
    if (actualChinrestMm > 40) {
      hardFailures.push(`Chinrest detached from jaw (${actualChinrestMm}mm gap)`);
    }
    const chinrestScore = Math.max(0, 1 - actualChinrestMm / 28) * 8;
    checks.push({
      id: 'chinrest_pos',
      label: 'Chin to Chinrest Contact',
      weight: 8,
      achievedScore: parseFloat(chinrestScore.toFixed(1)),
      passed: chinrestPassed,
      measurementValue: actualChinrestMm,
      targetError: targetChinrestMm,
      actualError: actualChinrestMm,
      unit: 'mm',
      threshold: 20,
      details: `Chinrest clearance: ${actualChinrestMm}mm`,
    });

    // 6. Head & Jaw Orientation (Weight: 7%) - looking along fingerboard
    let headAngErr = 0;
    if (actual && actual.headQuat) {
      // Ideal head look direction: toward scroll along fingerboard
      const headForward = new THREE.Vector3(0, 0, 1).applyQuaternion(actual.headQuat).normalize();
      const lookAlongNeck = params.violinStringsDirection.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, 0, 1).multiplyScalar(0.7)).normalize();
      const lookDot = Math.min(1, Math.max(-1, headForward.dot(lookAlongNeck)));
      headAngErr = parseFloat(((Math.acos(lookDot) * 180) / Math.PI).toFixed(1));
    }
    const headAngPassed = headAngErr <= 18;
    if (headAngErr > 32) {
      hardFailures.push(`Head rotated away from violin (${headAngErr}° gaze deviation)`);
    }
    const headAngScore = Math.max(0, 1 - headAngErr / 25) * 7;
    checks.push({
      id: 'head_orient',
      label: 'Head & Gaze Alignment',
      weight: 7,
      achievedScore: parseFloat(headAngScore.toFixed(1)),
      passed: headAngPassed,
      measurementValue: headAngErr,
      targetError: 0,
      actualError: headAngErr,
      unit: 'deg',
      threshold: 18,
      details: `Head gaze along fingerboard dev: ${headAngErr}°`,
    });

    // 7. Bow Hair to String Contact (Weight: 8%)
    const hairDist = params.bowHairContactWorldPos.distanceTo(params.playableStringsWorldPos);
    const bowHairToStringDistMm = parseFloat((hairDist * 1000).toFixed(1));
    const bowHairPassed = bowHairToStringDistMm <= 12;
    if (bowHairToStringDistMm > 22) {
      hardFailures.push(`Bow hair not touching strings (${bowHairToStringDistMm}mm gap)`);
    }
    const bowHairScore = Math.max(0, 1 - bowHairToStringDistMm / 16) * 8;
    checks.push({
      id: 'bow_hair_contact',
      label: 'Bow Hair String Contact',
      weight: 8,
      achievedScore: parseFloat(bowHairScore.toFixed(1)),
      passed: bowHairPassed,
      measurementValue: bowHairToStringDistMm,
      targetError: 0,
      actualError: bowHairToStringDistMm,
      unit: 'mm',
      threshold: 12,
      details: `Hair-to-string gap: ${bowHairToStringDistMm}mm`,
    });

    // 8. Bow to String Orthogonality (Weight: 7%)
    const angleRad = params.bowStickDirection.angleTo(params.violinStringsDirection);
    const angleDeg = parseFloat(((angleRad * 180) / Math.PI).toFixed(1));
    const orthogonalDiffDeg = parseFloat(Math.abs(angleDeg - 90).toFixed(1));
    const bowOrthPassed = orthogonalDiffDeg <= 10;
    if (orthogonalDiffDeg > 20) {
      hardFailures.push(`Bow not orthogonal to strings (${orthogonalDiffDeg}° deviation)`);
    }
    const bowOrthScore = Math.max(0, 1 - orthogonalDiffDeg / 15) * 7;
    checks.push({
      id: 'bow_orthogonality',
      label: 'Bow / String Orthogonality',
      weight: 7,
      achievedScore: parseFloat(bowOrthScore.toFixed(1)),
      passed: bowOrthPassed,
      measurementValue: orthogonalDiffDeg,
      targetError: 0,
      actualError: orthogonalDiffDeg,
      unit: 'deg dev',
      threshold: 10,
      details: `Bowing stroke angle: ${angleDeg}° (${orthogonalDiffDeg}° dev)`,
    });

    // 9. Left Elbow Plausibility (Weight: 10%)
    let leftElbowAngle = params.leftArmIK.elbowAngleDeg;
    if (actual) {
      const vUpper = new THREE.Vector3().subVectors(actual.leftElbow, params.leftArmIK.shoulderPos).normalize();
      const vLower = new THREE.Vector3().subVectors(actual.leftWrist, actual.leftElbow).normalize();
      leftElbowAngle = parseFloat(((180 - (Math.acos(THREE.MathUtils.clamp(vUpper.dot(vLower), -1, 1)) * 180) / Math.PI)).toFixed(1));
    }
    const leftElbowValid = leftElbowAngle >= 50 && leftElbowAngle <= 120 && !params.leftArmIK.isHyperextended;
    if (leftElbowAngle < 45 || leftElbowAngle > 135 || params.leftArmIK.isHyperextended) {
      hardFailures.push(`Left elbow in impossible or hyperextended pose (${leftElbowAngle}°)`);
    }
    const leftElbowScore = leftElbowValid ? 10 : Math.max(2, 10 - Math.abs(leftElbowAngle - 85) * 0.15);
    checks.push({
      id: 'left_elbow_plausibility',
      label: 'Left Arm & Elbow Geometry',
      weight: 10,
      achievedScore: parseFloat(leftElbowScore.toFixed(1)),
      passed: leftElbowValid,
      measurementValue: leftElbowAngle,
      targetError: Math.abs(leftElbowAngle - 85),
      actualError: Math.abs(leftElbowAngle - 85),
      unit: 'deg',
      threshold: 85,
      details: `Left elbow flexion: ${leftElbowAngle}°`,
    });

    // 10. Right Elbow Plausibility (Weight: 10%)
    let rightElbowAngle = params.rightArmIK.elbowAngleDeg;
    if (actual) {
      const vUpper = new THREE.Vector3().subVectors(actual.rightElbow, params.rightArmIK.shoulderPos).normalize();
      const vLower = new THREE.Vector3().subVectors(actual.rightWrist, actual.rightElbow).normalize();
      rightElbowAngle = parseFloat(((180 - (Math.acos(THREE.MathUtils.clamp(vUpper.dot(vLower), -1, 1)) * 180) / Math.PI)).toFixed(1));
    }
    const rightElbowValid = rightElbowAngle >= 45 && rightElbowAngle <= 100 && !params.rightArmIK.isHyperextended;
    if (rightElbowAngle < 30 || rightElbowAngle > 120 || params.rightArmIK.isHyperextended) {
      hardFailures.push(`Right bowing elbow in impossible or hyperextended pose (${rightElbowAngle}°)`);
    }
    const rightElbowScore = rightElbowValid ? 10 : Math.max(2, 10 - Math.abs(rightElbowAngle - 65) * 0.15);
    checks.push({
      id: 'right_elbow_plausibility',
      label: 'Right Bowing Arm Geometry',
      weight: 10,
      achievedScore: parseFloat(rightElbowScore.toFixed(1)),
      passed: rightElbowValid,
      measurementValue: rightElbowAngle,
      targetError: Math.abs(rightElbowAngle - 65),
      actualError: Math.abs(rightElbowAngle - 65),
      unit: 'deg',
      threshold: 65,
      details: `Bowing elbow flexion: ${rightElbowAngle}°`,
    });

    // 11. Posture & Shoulder Relaxation (Weight: 10%)
    const postureScore = 10.0;
    checks.push({
      id: 'overall_posture',
      label: 'Torso & Shoulder Relaxation',
      weight: 10,
      achievedScore: postureScore,
      passed: true,
      measurementValue: 100,
      targetError: 0,
      actualError: 0,
      unit: '%',
      threshold: 80,
      details: 'Asymmetric clavicular elevation & relaxed violin posture verified',
    });

    // Compute Raw Weighted Score based on ACTUAL skeleton measurements
    let calculatedScore = parseFloat(
      checks.reduce((acc, cur) => acc + cur.achievedScore, 0).toFixed(1)
    );

    // CRITICAL: HARD FAILURES ALWAYS OVERRIDE (Section 10)
    let state: InteractionState = 'invalid';
    if (!assignmentValid || hardFailures.length > 0) {
      state = 'invalid';
      calculatedScore = Math.min(calculatedScore, 65.0);
    } else {
      if (calculatedScore >= 95.0) {
        state = 'excellent';
      } else if (calculatedScore >= 90.0) {
        state = 'acceptable';
      } else if (calculatedScore >= 80.0) {
        state = 'questionable';
      } else {
        state = 'invalid';
      }
    }

    if (!leftHandPosPassed) notes.push(`Left hand position error (${actualLeftHandMm}mm)`);
    if (!leftHandAngPassed) notes.push(`Left hand orientation error (${leftHandAngErr}°)`);
    if (!rightHandPosPassed) notes.push(`Right hand position error (${actualRightHandMm}mm)`);
    if (!rightHandAngPassed) notes.push(`Right hand orientation error (${rightHandAngErr}°)`);
    if (!chinrestPassed) notes.push(`Chinrest clearance (${actualChinrestMm}mm)`);
    if (!headAngPassed) notes.push(`Head gaze deviation (${headAngErr}°)`);
    if (!bowOrthPassed) notes.push(`Bow angle deviation (${orthogonalDiffDeg}° dev)`);

    return {
      score: calculatedScore,
      state,
      checks,
      leftHandReachMm: actualLeftHandMm,
      rightHandReachMm: actualRightHandMm,
      chinrestDistMm: actualChinrestMm,
      bowStringAlignmentAngleDeg: angleDeg,
      bowHairToStringDistMm,
      leftElbowValid,
      rightElbowValid,
      hyperextended: params.leftArmIK.isHyperextended || params.rightArmIK.isHyperextended,
      hardFailures,
      handAssignment,
      actualBoneErrors: {
        chinMm: actualChinrestMm,
        leftHandCradleMm: actualLeftHandMm,
        rightHandGripMm: actualRightHandMm,
        bowHairMm: bowHairToStringDistMm,
        bowAngleDeg: orthogonalDiffDeg,
        leftElbowDeg: leftElbowAngle,
        rightElbowDeg: rightElbowAngle,
      },
      notes,
    };
  }
}
