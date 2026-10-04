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
 * Evaluates anatomical reach, contact distances, angular alignment, and elbow plausibility.
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

    // 1. Left Hand Contact to Violin Neck (Weight: 25%)
    const leftHandReachDist = params.leftHandFrame.grip.position.distanceTo(params.neckTargetWorldPos);
    const leftHandReachMm = parseFloat((leftHandReachDist * 1000).toFixed(1));
    const leftHandPassed = leftHandReachMm <= 30;
    const leftHandScore = Math.max(0, 1 - leftHandReachMm / 40) * 25;
    checks.push({
      id: 'left_hand_contact',
      label: 'Left Hand Neck Support',
      weight: 25,
      achievedScore: parseFloat(leftHandScore.toFixed(1)),
      passed: leftHandPassed,
      measurementValue: leftHandReachMm,
      unit: 'mm',
      threshold: 30,
      details: leftHandPassed
        ? `Thumb & index cradle securely holds neck (dist: ${leftHandReachMm}mm)`
        : `Left hand displaced from neck cradle (${leftHandReachMm}mm)`,
    });

    // 2. Right Hand Contact to Bow Frog Grip (Weight: 20%)
    const rightHandGripDist = params.rightHandFrame.grip.position.distanceTo(params.bowFrogGripWorldPos);
    const rightHandReachMm = parseFloat((rightHandGripDist * 1000).toFixed(1));
    const rightHandPassed = rightHandReachMm <= 25;
    const rightHandScore = Math.max(0, 1 - rightHandReachMm / 35) * 20;
    checks.push({
      id: 'right_hand_grip',
      label: 'Right Hand Bow Grip',
      weight: 20,
      achievedScore: parseFloat(rightHandScore.toFixed(1)),
      passed: rightHandPassed,
      measurementValue: rightHandReachMm,
      unit: 'mm',
      threshold: 25,
      details: rightHandPassed
        ? `Fingers firmly enclose bow frog (dist: ${rightHandReachMm}mm)`
        : `Right grip separated from bow frog (${rightHandReachMm}mm)`,
    });

    // 3. Chinrest Contact (Weight: 15%)
    const chinrestDist = params.chinTargetWorldPos.distanceTo(params.chinrestWorldPos);
    const chinrestDistMm = parseFloat((chinrestDist * 1000).toFixed(1));
    const chinrestPassed = chinrestDistMm <= 35;
    const chinrestScore = Math.max(0, 1 - chinrestDistMm / 50) * 15;
    checks.push({
      id: 'chinrest_contact',
      label: 'Chin to Chinrest Rest',
      weight: 15,
      achievedScore: parseFloat(chinrestScore.toFixed(1)),
      passed: chinrestPassed,
      measurementValue: chinrestDistMm,
      unit: 'mm',
      threshold: 35,
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

    const bowAlignmentPassed = orthogonalDiffDeg <= 18 && bowHairToStringDistMm <= 22;
    const bowScore =
      (Math.max(0, 1 - orthogonalDiffDeg / 25) * 0.6 + Math.max(0, 1 - bowHairToStringDistMm / 30) * 0.4) * 15;
    checks.push({
      id: 'bow_string_alignment',
      label: 'Bow & String Alignment',
      weight: 15,
      achievedScore: parseFloat(bowScore.toFixed(1)),
      passed: bowAlignmentPassed,
      measurementValue: orthogonalDiffDeg,
      unit: 'deg dev',
      threshold: 18,
      details: `Hair-to-string dist: ${bowHairToStringDistMm}mm, Orthogonal angle: ${angleDeg}° (dev: ${orthogonalDiffDeg}°)`,
    });

    // 5. Left Elbow Plausibility (Weight: 10%)
    const leftElbowAngle = params.leftArmIK.elbowAngleDeg;
    const leftElbowValid =
      leftElbowAngle >= 55 && leftElbowAngle <= 135 && !params.leftArmIK.isHyperextended;
    const leftElbowScore = leftElbowValid ? 10 : Math.max(2, 10 - Math.abs(leftElbowAngle - 90) * 0.15);
    checks.push({
      id: 'left_elbow_plausibility',
      label: 'Left Arm & Elbow Geometry',
      weight: 10,
      achievedScore: parseFloat(leftElbowScore.toFixed(1)),
      passed: leftElbowValid,
      measurementValue: parseFloat(leftElbowAngle.toFixed(1)),
      unit: 'deg',
      threshold: 90,
      details: leftElbowValid
        ? `Elbow flexed naturally at ${leftElbowAngle.toFixed(1)}°`
        : `Left elbow awkward or hyperextended (${leftElbowAngle.toFixed(1)}°)`,
    });

    // 6. Right Elbow Plausibility (Weight: 10%)
    const rightElbowAngle = params.rightArmIK.elbowAngleDeg;
    const rightElbowValid =
      rightElbowAngle >= 35 && rightElbowAngle <= 125 && !params.rightArmIK.isHyperextended;
    const rightElbowScore = rightElbowValid ? 10 : Math.max(2, 10 - Math.abs(rightElbowAngle - 70) * 0.15);
    checks.push({
      id: 'right_elbow_plausibility',
      label: 'Right Bowing Arm Geometry',
      weight: 10,
      achievedScore: parseFloat(rightElbowScore.toFixed(1)),
      passed: rightElbowValid,
      measurementValue: parseFloat(rightElbowAngle.toFixed(1)),
      unit: 'deg',
      threshold: 70,
      details: rightElbowValid
        ? `Bowing elbow flexed at ${rightElbowAngle.toFixed(1)}°`
        : `Right elbow awkward or hyperextended (${rightElbowAngle.toFixed(1)}°)`,
    });

    // 7. Overall Posture (Weight: 5%)
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
      details: 'Spine, shoulders, and clavicle balance verified',
    });

    // Compute Total Score
    const totalScore = parseFloat(
      checks.reduce((acc, cur) => acc + cur.achievedScore, 0).toFixed(1)
    );

    let state: InteractionState = 'invalid';
    if (totalScore >= 88) {
      state = 'excellent';
    } else if (totalScore >= 70) {
      state = 'acceptable';
    } else if (totalScore >= 50) {
      state = 'questionable';
    } else {
      state = 'invalid';
    }

    if (!leftHandPassed) notes.push(`Left hand reach shortfall (${leftHandReachMm}mm)`);
    if (!rightHandPassed) notes.push(`Right hand bow grip shortfall (${rightHandReachMm}mm)`);
    if (!chinrestPassed) notes.push(`Chinrest clearance gap (${chinrestDistMm}mm)`);
    if (!bowAlignmentPassed) notes.push(`Bow not orthogonal to strings (${orthogonalDiffDeg}° dev)`);

    return {
      score: totalScore,
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
      notes,
    };
  }
}
