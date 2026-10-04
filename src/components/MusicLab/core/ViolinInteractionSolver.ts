import * as THREE from 'three';
import { VRMHumanoidAdapter } from './VRMHumanoidAdapter';
import { ViolinProfile } from '../profiles/ViolinProfile';
import { ArmIKSolver } from './ArmIKSolver';
import { HandInteractionFrameSolver } from './HandInteractionFrame';
import { InteractionValidator } from './InteractionValidator';
import {
  InteractionSolution,
  Transform3D,
  HumanoidMetrics,
} from './types';

/**
 * Universal Humanoid-Violin Interaction Solver
 *
 * Grounded in calibrated anatomical spatial ratios derived from /public/models/sample_violin.glb:
 * - Violin length to character height ratio: ~0.3394
 * - Longitudinal axis orientation: Yaw +29.4° (turned left), Pitch -20.2° (down-angled), Roll +42.0° (rolled inward)
 * - Chinrest rests comfortably under player jaw; violin rests on left clavicular shelf
 * - Hierarchy: Forearm -> Wrist -> Palm -> Fingers -> Grip -> Bow
 * - Both arms solved using analytical two-bone IK with local inverse-parent quaternion compensation.
 */
export class ViolinInteractionSolver {
  /**
   * Solves complete interaction for any humanoid VRM character and violin/bow.
   */
  public static solve(adapter: VRMHumanoidAdapter): InteractionSolution {
    // 1. Analyze Character Anatomy & Compute Dynamic Metrics
    const metrics = adapter.computeMetrics();
    const totalH = metrics.height;

    // 2. Co-Solve Adaptive Scale grounded in sample_violin.glb normalized reference
    // Canonical length of violin.glb is 0.605m. Reference ratio is 0.3394 * totalH
    const referenceViolinLength = totalH * 0.3394;
    let scale = referenceViolinLength / 0.605;
    if (metrics.isChibi) {
      scale = THREE.MathUtils.clamp(scale * 0.88, 0.52, 0.85);
    } else {
      scale = THREE.MathUtils.clamp(scale, 0.70, 1.15);
    }
    scale = parseFloat(scale.toFixed(4));

    // 3. Solve 3D Violin Placement Relative to Chin & Collarbone Shelf
    // Reference orientation angles from sample_violin.glb:
    const yawRad = THREE.MathUtils.degToRad(29.4);
    const pitchRad = THREE.MathUtils.degToRad(-20.2);
    const rollRad = THREE.MathUtils.degToRad(42.0);

    // Longitudinal vector: points along the fingerboard to scroll
    const vLongitudinal = new THREE.Vector3(
      Math.sin(yawRad) * Math.cos(pitchRad),
      Math.sin(pitchRad),
      Math.cos(yawRad) * Math.cos(pitchRad)
    ).normalize();

    // Strings face normal: rolled inward toward the player's chin
    const vBaseUp = new THREE.Vector3(0, 1, 0);
    const vPerp = new THREE.Vector3().crossVectors(vLongitudinal, vBaseUp).normalize();
    const vStringsNormal = new THREE.Vector3()
      .addScaledVector(vBaseUp, Math.cos(rollRad))
      .addScaledVector(vPerp, Math.sin(rollRad))
      .normalize();
    const vLateral = new THREE.Vector3().crossVectors(vLongitudinal, vStringsNormal).normalize();
    vStringsNormal.crossVectors(vLateral, vLongitudinal).normalize();

    const violinRotMat = new THREE.Matrix4().makeBasis(vLateral, vLongitudinal, vStringsNormal);
    const violinQuat = new THREE.Quaternion().setFromRotationMatrix(violinRotMat);

    // Chin contact point on character: derived dynamically from head/jaw
    const headWorldPos = metrics.anchors.head.clone();
    const chinTargetPos = headWorldPos.clone().add(
      new THREE.Vector3(0.018 * (totalH / 1.6), -0.065 * (totalH / 1.6), 0.082 * (totalH / 1.6))
    );

    // Position violin so local chinrest sits exactly under chinTargetPos
    const localChinrest = ViolinProfile.localAnchors.chinRest!.clone().multiplyScalar(scale);
    const wChinrestOffset = localChinrest.clone().applyQuaternion(violinQuat);
    const violinPos = chinTargetPos.clone().sub(wChinrestOffset);

    const violinTransform: Transform3D = {
      position: violinPos,
      quaternion: violinQuat,
      scale: new THREE.Vector3(scale, scale, scale),
    };

    // World Anchors on Placed Violin
    const toWorld = (localVec: THREE.Vector3) =>
      localVec.clone().multiplyScalar(scale).applyQuaternion(violinQuat).add(violinPos);

    const chinrestWorldPos = toWorld(ViolinProfile.localAnchors.chinRest!);
    const neckTargetWorldPos = toWorld(ViolinProfile.localAnchors.leftHandTarget!);
    const playableStringsWorldPos = toWorld(ViolinProfile.localAnchors.bowContactTarget!);

    // 4. Solve Left Hand Neck Support & Left Arm IK
    const { frame: leftHandFrame, requiredWristPos: lWristTarget } =
      HandInteractionFrameSolver.solveLeftNeckGripFrame(
        adapter,
        neckTargetWorldPos,
        vLongitudinal,
        vStringsNormal
      );

    const lShoulderPos = metrics.anchors.leftUpperArm.clone();
    // Left elbow pole vector: comfortably downward and slightly forward-left
    const leftPoleVec = new THREE.Vector3(-0.35, -0.85, 0.40).normalize();

    const leftArmIK = ArmIKSolver.solveArmIK(
      'left',
      lShoulderPos,
      lWristTarget,
      metrics.upperArmLength.left,
      metrics.forearmLength.left,
      leftPoleVec
    );

    // Compute left lowerArm world orientation for child hand local quaternion
    const lLowerArmDir = new THREE.Vector3().subVectors(leftArmIK.wristPos, leftArmIK.elbowPos).normalize();
    const lLowerArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), lLowerArmDir);
    leftArmIK.handQuat = ArmIKSolver.solveHandOrientation('left', leftHandFrame, lLowerArmWorldQuat);

    // 5. Solve Head & Torso Posture Relative to Chinrest
    const headToChinrest = new THREE.Vector3().subVectors(chinrestWorldPos, metrics.anchors.head).normalize();
    const headTurnDeg = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(Math.atan2(headToChinrest.x, headToChinrest.z)) + 10,
      12,
      24
    );
    const headTiltDeg = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(Math.asin(-headToChinrest.y)) * 0.4,
      6,
      14
    );
    const headNodDeg = 6.0;

    const headRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(headNodDeg),
        THREE.MathUtils.degToRad(headTurnDeg),
        THREE.MathUtils.degToRad(headTiltDeg),
        'YXZ'
      )
    );
    const neckRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(headNodDeg * 0.35), THREE.MathUtils.degToRad(headTurnDeg * 0.35), 0, 'YXZ')
    );

    const spineRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, -0.03, -0.015, 'YXZ'));
    const chestRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.01, -0.02, 0.0, 'YXZ'));

    // 6. Solve Bow Placement & Right Arm Bow Grip IK
    // Bowing stick direction: orthogonal to violin strings in string plane
    const bowStickDir = new THREE.Vector3().crossVectors(vStringsNormal, vLongitudinal).normalize();
    const bowHairContactWorldPos = playableStringsWorldPos.clone();

    // Local bow anchors
    const bowAcc = ViolinProfile.accessory!;
    const bowGripLocal = bowAcc.localAnchors.gripCenter;
    const bowContactLocal = bowAcc.localAnchors.contactPoint;

    // Frog throat is at -0.255m; contact point is at +0.020m -> distance is ~0.275m * scale
    const frogToContactDist = (bowContactLocal.y - bowGripLocal.y) * scale;
    const bowFrogGripWorldPos = bowHairContactWorldPos
      .clone()
      .addScaledVector(bowStickDir, -frogToContactDist);

    // Right hand bow grip frame
    const mockWristTransform: Transform3D = {
      position: bowFrogGripWorldPos.clone().add(new THREE.Vector3(0.02, -0.04, -0.02)),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
    };

    const rightHandFrame = HandInteractionFrameSolver.solveRightBowGripFrame(
      adapter,
      mockWristTransform,
      bowStickDir,
      vStringsNormal
    );

    // Backtrack required right wrist target from grip center along forearm corridor:
    const rHandLen = metrics.handLength.right;
    const rWristTarget = bowFrogGripWorldPos
      .clone()
      .addScaledVector(vStringsNormal, -rHandLen * 0.45)
      .addScaledVector(bowStickDir, -rHandLen * 0.38);

    const rShoulderPos = metrics.anchors.rightUpperArm.clone();
    // Right elbow pole vector: outward and downward in bowing plane
    const rightPoleVec = new THREE.Vector3(0.75, -0.40, 0.50).normalize();

    const rightArmIK = ArmIKSolver.solveArmIK(
      'right',
      rShoulderPos,
      rWristTarget,
      metrics.upperArmLength.right,
      metrics.forearmLength.right,
      rightPoleVec
    );

    // Compute right lowerArm world orientation for child hand local quaternion
    const rLowerArmDir = new THREE.Vector3().subVectors(rightArmIK.wristPos, rightArmIK.elbowPos).normalize();
    const rLowerArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(-1, 0, 0), rLowerArmDir);
    rightArmIK.handQuat = ArmIKSolver.solveHandOrientation('right', rightHandFrame, rLowerArmWorldQuat);

    // 7. RIGID ATTACHMENT OF BOW TO RIGHT HAND GRIP FRAME
    // Hierarchy: Forearm -> Wrist -> Palm -> Fingers -> Grip -> Bow
    // Bow stick aligns with bowStickDir; hair faces -vStringsNormal (into strings)
    const bowYAxis = bowStickDir.clone();
    const bowZAxis = vStringsNormal.clone();
    const bowXAxis = new THREE.Vector3().crossVectors(bowYAxis, bowZAxis).normalize();
    bowZAxis.crossVectors(bowXAxis, bowYAxis).normalize();

    const bowFrogGripWorldMat = new THREE.Matrix4().makeBasis(bowXAxis, bowYAxis, bowZAxis);
    bowFrogGripWorldMat.setPosition(bowFrogGripWorldPos);

    // In canonical bow coordinates (where meshes are extracted):
    // Frog grip center is at (0, -0.255 * scale, 0.048 * scale)
    const bowFrogGripLocalMat = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ).setPosition(bowGripLocal.clone().multiplyScalar(scale));

    const invBowFrogGripLocal = bowFrogGripLocalMat.clone().invert();
    const bowWorldMat = new THREE.Matrix4().multiplyMatrices(bowFrogGripWorldMat, invBowFrogGripLocal);

    const bowPos = new THREE.Vector3();
    const bowQuat = new THREE.Quaternion();
    const bowScl = new THREE.Vector3();
    bowWorldMat.decompose(bowPos, bowQuat, bowScl);

    const accessoryTransform: Transform3D = {
      position: bowPos,
      quaternion: bowQuat,
      scale: new THREE.Vector3(scale, scale, scale),
    };

    // 8. Validate and Score Solution (Phase 12 & Phase 4/5/6)
    const validation = InteractionValidator.validateViolinInteraction({
      violinTransform,
      bowTransform: accessoryTransform,
      chinrestWorldPos,
      chinTargetWorldPos: chinTargetPos,
      neckTargetWorldPos,
      leftHandFrame,
      rightHandFrame,
      bowFrogGripWorldPos,
      bowHairContactWorldPos,
      playableStringsWorldPos,
      violinStringsDirection: vLongitudinal,
      bowStickDirection: bowStickDir,
      leftArmIK,
      rightArmIK,
    });

    return {
      instrumentScale: scale,
      instrumentTransform: violinTransform,
      accessoryTransform,
      leftArmIK,
      rightArmIK,
      leftHandFrame,
      rightHandFrame,
      headRotation,
      neckRotation,
      spineRotation,
      chestRotation,
      validation,
    };
  }

  /**
   * Applies the solved interaction pose onto the character's humanoid bones.
   */
  public static applySolutionToModel(
    adapter: VRMHumanoidAdapter,
    solution: InteractionSolution
  ): void {
    adapter.resetToRestPose();

    // 1. Spine & Torso
    adapter.setBoneRotation('spine', solution.spineRotation);
    adapter.setBoneRotation('chest', solution.chestRotation);
    if (adapter.hasBone('upperChest')) {
      adapter.setBoneRotation('upperChest', solution.chestRotation);
    }

    // 2. Head & Neck
    adapter.setBoneRotation('neck', solution.neckRotation);
    adapter.setBoneRotation('head', solution.headRotation);

    // 3. Left Arm Chain
    adapter.setBoneRotation('leftUpperArm', solution.leftArmIK.upperArmQuat);
    adapter.setBoneRotation('leftLowerArm', solution.leftArmIK.lowerArmQuat);
    adapter.setBoneRotation('leftHand', solution.leftArmIK.handQuat);

    // 4. Right Arm Chain
    adapter.setBoneRotation('rightUpperArm', solution.rightArmIK.upperArmQuat);
    adapter.setBoneRotation('rightLowerArm', solution.rightArmIK.lowerArmQuat);
    adapter.setBoneRotation('rightHand', solution.rightArmIK.handQuat);

    // 5. Fingers
    ArmIKSolver.applyFingerPoses(adapter, 'left', solution.leftHandFrame.fingerTargets);
    ArmIKSolver.applyFingerPoses(adapter, 'right', solution.rightHandFrame.fingerTargets);

    adapter.updateWorldMatrix();
  }
}
