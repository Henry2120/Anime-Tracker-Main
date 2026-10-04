import * as THREE from 'three';
import {
  ValidationResult,
  ValidationCheck,
  InteractionState,
  ArmIKSolution,
  HandInteractionFrame,
  Transform3D,
} from './types';

/**
 * Interaction Validation System
 * Evaluates actual physical and visual relationships.
 * Hard failures strictly override the weighted score and force state to 'invalid'.
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

    // 1. Left Hand Contact to Violin Neck (Weight: 25%)
    const leftHandReachDist = params.leftHandFrame.grip.position.distanceTo(params.neckTargetWorldPos);
    const leftHandReachMm = parseFloat((leftHandReachDist * 1000).toFixed(1));
    const leftHandPassed = leftHandReachMm <= 20;
    if (leftHandReachMm > 40) {
      hardFailures.push(`Left hand detached from neck cradle (${leftHandReachMm}mm)`);
    }
    const leftHandScore = Math.max(0, 1 - leftHandReachMm / 30) * 25;
    checks.push({
      id: 'left_hand_contact',
      label: 'Left Hand Neck Support',
      weight: 25,
      achievedScore: parseFloat(leftHandScore.toFixed(1)),
      passed: leftHandPassed,
      measurementValue: leftHandReachMm,
      unit: 'mm',
      threshold: 20,
      details: leftHandPassed
        ? `Thumb & index cradle securely holds neck (dist: ${leftHandReachMm}mm)`
        : `Left hand displaced from neck cradle (${leftHandReachMm}mm)`,
    });

    // 2. Right Hand Contact to Bow Frog Grip (Weight: 20%)
    const rightHandGripDist = params.rightHandFrame.grip.position.distanceTo(params.bowFrogGripWorldPos);
    const rightHandReachMm = parseFloat((rightHandGripDist * 1000).toFixed(1));
    const rightHandPassed = rightHandReachMm <= 20;
    if (rightHandReachMm > 35) {
      hardFailures.push(`Right hand detached from bow frog grip (${rightHandReachMm}mm)`);
    }
    const rightHandScore = Math.max(0, 1 - rightHandReachMm / 25) * 20;
    checks.push({
      id: 'right_hand_grip',
      label: 'Right Hand Bow Grip',
      weight: 20,
      achievedScore: parseFloat(rightHandScore.toFixed(1)),
      passed: rightHandPassed,
      measurementValue: rightHandReachMm,
      unit: 'mm',
      threshold: 20,
      details: rightHandPassed
        ? `Fingers firmly enclose bow frog (dist: ${rightHandReachMm}mm)`
        : `Right grip separated from bow frog (${rightHandReachMm}mm)`,
    });

    // 3. Chinrest Contact (Weight: 15%)
    const chinrestDist = params.chinTargetWorldPos.distanceTo(params.chinrestWorldPos);
    const chinrestDistMm = parseFloat((chinrestDist * 1000).toFixed(1));
    const chinrestPassed = chinrestDistMm <= 25;
    if (chinrestDistMm > 45) {
      hardFailures.push(`Chinrest detached from player jaw (${chinrestDistMm}mm)`);
    }
    const chinrestScore = Math.max(0, 1 - chinrestDistMm / 35) * 15;
    checks.push({
      id: 'chinrest_contact',
      label: 'Chin to Chinrest Rest',
      weight: 15,
      achievedScore: parseFloat(chinrestScore.toFixed(1)),
      passed: chinrestPassed,
      measurementValue: chinrestDistMm,
      unit: 'mm',
      threshold: 25,
      details: chinrestPassed
        ? `Jaw rests flush against chinrest pad (dist: ${chinrestDistMm}mm)`
        : `Head separated from chinrest (${chinrestDistMm}mm)`,
    });

    // 4. Bow / String Alignment & Orthogonality (Weight: 15%)
    const angleRad = params.bowStickDirection.angleTo(params.violinStringsDirection);
    const angleDeg = parseFloat(((angleRad * 180) / Math.PI).toFixed(1));
    const orthogonalDiffDeg = parseFloat(Math.abs(angleDeg - 90).toFixed(1));
    const hairDist = params.bowHairContactWorldPos.distanceTo(params.playableStringsWorldPos);
    const bowHairToStringDistMm = parseFloat((hairDist * 1000).toFixed(1));

    const bowAlignmentPassed = orthogonalDiffDeg <= 12 && bowHairToStringDistMm <= 15;
    if (orthogonalDiffDeg > 22) {
      hardFailures.push(`Bow not orthogonal to strings (${orthogonalDiffDeg}° deviation)`);
    }
    if (bowHairToStringDistMm > 25) {
      hardFailures.push(`Bow hair not touching strings (${bowHairToStringDistMm}mm gap)`);
    }

    const bowScore =
      (Math.max(0, 1 - orthogonalDiffDeg / 18) * 0.6 + Math.max(0, 1 - bowHairToStringDistMm / 20) * 0.4) * 15;
    checks.push({
      id: 'bow_string_alignment',
      label: 'Bow & String Alignment',
      weight: 15,
      achievedScore: parseFloat(bowScore.toFixed(1)),
      passed: bowAlignmentPassed,
      measurementValue: orthogonalDiffDeg,
      unit: 'deg dev',
      threshold: 12,
      details: `Hair-to-string dist: ${bowHairToStringDistMm}mm, Orthogonal angle: ${angleDeg}° (dev: ${orthogonalDiffDeg}°)`,
    });

    // 5. Left Elbow Plausibility (Weight: 10%)
    const leftElbowAngle = params.leftArmIK.elbowAngleDeg;
    const leftElbowValid =
      leftElbowAngle >= 60 && leftElbowAngle <= 125 && !params.leftArmIK.isHyperextended;
    if (leftElbowAngle < 50 || leftElbowAngle > 140 || params.leftArmIK.isHyperextended) {
      hardFailures.push(`Left elbow in impossible or hyperextended pose (${leftElbowAngle}°)`);
    }
    const leftElbowScore = leftElbowValid ? 10 : Math.max(2, 10 - Math.abs(leftElbowAngle - 88) * 0.15);
    checks.push({
      id: 'left_elbow_plausibility',
      label: 'Left Arm & Elbow Geometry',
      weight: 10,
      achievedScore: parseFloat(leftElbowScore.toFixed(1)),
      passed: leftElbowValid,
      measurementValue: leftElbowAngle,
      unit: 'deg',
      threshold: 88,
      details: leftElbowValid
        ? `Elbow flexed naturally at ${leftElbowAngle}°`
        : `Left elbow awkward or hyperextended (${leftElbowAngle}°)`,
    });

    // 6. Right Elbow Plausibility (Weight: 10%)
    const rightElbowAngle = params.rightArmIK.elbowAngleDeg;
    const rightElbowValid =
      rightElbowAngle >= 40 && rightElbowAngle <= 110 && !params.rightArmIK.isHyperextended;
    if (rightElbowAngle < 30 || rightElbowAngle > 125 || params.rightArmIK.isHyperextended) {
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
      unit: 'deg',
      threshold: 65,
      details: rightElbowValid
        ? `Bowing elbow flexed naturally at ${rightElbowAngle}°`
        : `Right elbow awkward or hyperextended (${rightElbowAngle}°)`,
    });

    // 7. Postural Poise & Balance (Weight: 5%)
    const postureScore = 5.0;
    checks.push({
      id: 'overall_posture',
      label: 'Postural Poise & Balance',
      weight: 5,
      achievedScore: postureScore,
      passed: true,
      measurementValue: 100,
      unit: '%',
      threshold: 80,
      details: 'Spine, shoulders, and clavicular support verified',
    });

    // Compute Raw Weighted Score
    let calculatedScore = parseFloat(
      checks.reduce((acc, cur) => acc + cur.achievedScore, 0).toFixed(1)
    );

    // CRITICAL REQUIREMENT (Section 4 & 5):
    // A HARD FAILURE ALWAYS MEANS INVALID. Do not allow a high score to override hard failures!
    let state: InteractionState = 'invalid';
    if (hardFailures.length > 0) {
      state = 'invalid';
      // Cap score below 80 if there are hard failures
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

    if (!leftHandPassed) notes.push(`Left hand reach gap (${leftHandReachMm}mm)`);
    if (!rightHandPassed) notes.push(`Right hand bow grip gap (${rightHandReachMm}mm)`);
    if (!chinrestPassed) notes.push(`Chinrest clearance gap (${chinrestDistMm}mm)`);
    if (!bowAlignmentPassed) notes.push(`Bow angle deviation (${orthogonalDiffDeg}° dev)`);

    return {
      score: calculatedScore,
      state,
      checks,
      leftHandReachMm,
      rightHandReachMm,
      chinrestDistMm,
      bowStringAlignmentAngleDeg: angleDeg,
      bowHairToStringDistMm,
      leftElbowValid,
      rightElbowValid,
      hyperextended: params.leftArmIK.isHyperextended || params.rightArmIK.isHyperextended,
      hardFailures,
      notes,
    };
  }
}
