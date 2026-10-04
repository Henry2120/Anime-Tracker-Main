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
 * Universal Humanoid-Violin Staged Interaction Solver (Part 3, 4, 6, 7, 8, 9, 10)
 *
 * Implements the full staged solve with anatomical shoulder relaxation and
 * orientation verification.
 */
export class ViolinInteractionSolver {
  /**
   * Solves and applies complete interaction for any humanoid VRM character and violin/bow.
   */
  public static solve(adapter: VRMHumanoidAdapter): InteractionSolution {
    // =========================================================================
    // PHASE A — Neutral Analysis
    // =========================================================================
    adapter.resetToRestPose();
    adapter.updateWorldMatrix();
    const metrics = adapter.computeMetrics(true);
    const totalH = metrics.height;

    // Dynamic canonical rest bone directions
    const refLeftUpper = adapter.getRestBoneDirection('leftUpperArm', 'leftLowerArm');
    const refLeftLower = adapter.getRestBoneDirection('leftLowerArm', 'leftHand');
    const refRightUpper = adapter.getRestBoneDirection('rightUpperArm', 'rightLowerArm');
    const refRightLower = adapter.getRestBoneDirection('rightLowerArm', 'rightHand');

    // =========================================================================
    // PHASE B — Global Posture & Asymmetric Shoulder Relaxation (Part 7 & 8)
    // =========================================================================
    const headNodDeg = 6.0;
    const headTurnDeg = 18.0;
    const headTiltDeg = 8.0;

    const headRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(headNodDeg),
        THREE.MathUtils.degToRad(headTurnDeg),
        THREE.MathUtils.degToRad(headTiltDeg),
        'YXZ'
      )
    );
    const neckRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(headNodDeg * 0.35),
        THREE.MathUtils.degToRad(headTurnDeg * 0.35),
        0,
        'YXZ'
      )
    );

    const spineRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, -0.03, -0.015, 'YXZ'));
    const chestRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.01, -0.02, 0.0, 'YXZ'));

    // Asymmetric shoulder accommodation: left clavicle cushions violin, right drops slightly
    const leftShoulderRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.04, 0.08, 0.06, 'YXZ')
    );
    const rightShoulderRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.02, 0.05, -0.03, 'YXZ')
    );

    adapter.setBoneRotation('spine', spineRotation);
    adapter.setBoneRotation('chest', chestRotation);
    if (adapter.hasBone('upperChest')) {
      adapter.setBoneRotation('upperChest', chestRotation);
    }
    adapter.setBoneRotation('neck', neckRotation);
    adapter.setBoneRotation('head', headRotation);
    if (adapter.hasBone('leftShoulder')) {
      adapter.setBoneRotation('leftShoulder', leftShoulderRotation);
    }
    if (adapter.hasBone('rightShoulder')) {
      adapter.setBoneRotation('rightShoulder', rightShoulderRotation);
    }

    adapter.updateWorldMatrix();

    // =========================================================================
    // PHASE C — Recompute Anatomy from CURRENT Posture
    // =========================================================================
    const curHeadPos = adapter.getBoneWorldPosition('head', new THREE.Vector3())!;
    const curLeftShoulderPos = adapter.getBoneWorldPosition('leftUpperArm', new THREE.Vector3())!;
    const curRightShoulderPos = adapter.getBoneWorldPosition('rightUpperArm', new THREE.Vector3())!;

    const parentLeftShoulderQuat = adapter.getParentWorldQuaternion('leftUpperArm');
    const parentRightShoulderQuat = adapter.getParentWorldQuaternion('rightUpperArm');

    // =========================================================================
    // PHASE D — Instrument Placement (sample_violin.glb silhouette calibration)
    // =========================================================================
    const referenceViolinLength = totalH * 0.3394;
    let scale = referenceViolinLength / 0.605;
    if (metrics.isChibi) {
      scale = THREE.MathUtils.clamp(scale * 0.88, 0.52, 0.85);
    } else {
      scale = THREE.MathUtils.clamp(scale, 0.70, 1.15);
    }
    scale = parseFloat(scale.toFixed(4));

    const yawRad = THREE.MathUtils.degToRad(29.4);
    const pitchRad = THREE.MathUtils.degToRad(-20.2);
    const rollRad = THREE.MathUtils.degToRad(42.0);

    const vLongitudinal = new THREE.Vector3(
      Math.sin(yawRad) * Math.cos(pitchRad),
      Math.sin(pitchRad),
      Math.cos(yawRad) * Math.cos(pitchRad)
    ).normalize();

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

    // Chin contact point relative to CURRENT head position:
    const chinTargetPos = curHeadPos.clone().add(
      new THREE.Vector3(0.018 * (totalH / 1.6), -0.065 * (totalH / 1.6), 0.082 * (totalH / 1.6))
    );

    const localChinrest = ViolinProfile.localAnchors.chinRest!.clone().multiplyScalar(scale);
    const wChinrestOffset = localChinrest.clone().applyQuaternion(violinQuat);
    const violinPos = chinTargetPos.clone().sub(wChinrestOffset);

    const violinTransform: Transform3D = {
      position: violinPos,
      quaternion: violinQuat,
      scale: new THREE.Vector3(scale, scale, scale),
    };

    const toWorld = (localVec: THREE.Vector3) =>
      localVec.clone().multiplyScalar(scale).applyQuaternion(violinQuat).add(violinPos);

    const chinrestWorldPos = toWorld(ViolinProfile.localAnchors.chinRest!);
    const neckTargetWorldPos = toWorld(ViolinProfile.localAnchors.leftHandTarget!);
    const playableStringsWorldPos = toWorld(ViolinProfile.localAnchors.bowContactTarget!);

    // =========================================================================
    // PHASE E — Left Hand + Left Arm Solve
    // =========================================================================
    const { frame: leftHandFrame, requiredWristPos: lWristTarget } =
      HandInteractionFrameSolver.solveLeftNeckGripFrame(
        adapter,
        neckTargetWorldPos,
        vLongitudinal,
        vStringsNormal
      );

    // Left elbow pole vector: outward and downward
    const leftPoleVec = new THREE.Vector3(-0.40, -0.75, 0.50).normalize();
    let leftArmIK = ArmIKSolver.solveArmIK(
      'left',
      curLeftShoulderPos,
      lWristTarget,
      metrics.upperArmLength.left,
      metrics.forearmLength.left,
      leftPoleVec,
      parentLeftShoulderQuat,
      refLeftUpper,
      refLeftLower
    );

    const lLowerArmDir = new THREE.Vector3().subVectors(leftArmIK.wristPos, leftArmIK.elbowPos).normalize();
    const lLowerArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(refLeftLower, lLowerArmDir);
    leftArmIK.handQuat = ArmIKSolver.solveHandOrientation('left', leftHandFrame, lLowerArmWorldQuat);

    adapter.setBoneRotation('leftUpperArm', leftArmIK.upperArmQuat);
    adapter.setBoneRotation('leftLowerArm', leftArmIK.lowerArmQuat);
    adapter.setBoneRotation('leftHand', leftArmIK.handQuat);
    ArmIKSolver.applyFingerPoses(adapter, 'left', leftHandFrame.fingerTargets);
    adapter.updateWorldMatrix();

    // =========================================================================
    // PHASE F — Right Hand + Bow Solve
    // =========================================================================
    const bowStickDir = new THREE.Vector3().crossVectors(vStringsNormal, vLongitudinal).normalize();
    const bowHairContactWorldPos = playableStringsWorldPos.clone();

    const bowAcc = ViolinProfile.accessory!;
    const bowGripLocal = bowAcc.localAnchors.gripCenter;
    const bowContactLocal = bowAcc.localAnchors.contactPoint;

    const frogToContactDist = (bowContactLocal.y - bowGripLocal.y) * scale;
    const bowFrogGripWorldPos = bowHairContactWorldPos
      .clone()
      .addScaledVector(bowStickDir, -frogToContactDist);

    const { frame: rightHandFrame, requiredWristPos: rWristTarget } =
      HandInteractionFrameSolver.solveRightBowGripFrame(
        adapter,
        bowFrogGripWorldPos,
        bowStickDir,
        vStringsNormal
      );

    // Right elbow pole vector: outward and downward in bowing plane
    const rightPoleVec = new THREE.Vector3(0.75, -0.45, 0.45).normalize();
    let rightArmIK = ArmIKSolver.solveArmIK(
      'right',
      curRightShoulderPos,
      rWristTarget,
      metrics.upperArmLength.right,
      metrics.forearmLength.right,
      rightPoleVec,
      parentRightShoulderQuat,
      refRightUpper,
      refRightLower
    );

    const rLowerArmDir = new THREE.Vector3().subVectors(rightArmIK.wristPos, rightArmIK.elbowPos).normalize();
    const rLowerArmWorldQuat = new THREE.Quaternion().setFromUnitVectors(refRightLower, rLowerArmDir);
    rightArmIK.handQuat = ArmIKSolver.solveHandOrientation('right', rightHandFrame, rLowerArmWorldQuat);

    // Rigid attachment of bow to right hand grip frame
    const bowYAxis = bowStickDir.clone();
    const bowZAxis = vStringsNormal.clone();
    const bowXAxis = new THREE.Vector3().crossVectors(bowYAxis, bowZAxis).normalize();
    bowZAxis.crossVectors(bowXAxis, bowYAxis).normalize();

    const bowFrogGripWorldMat = new THREE.Matrix4().makeBasis(bowXAxis, bowYAxis, bowZAxis);
    bowFrogGripWorldMat.setPosition(bowFrogGripWorldPos);

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

    adapter.setBoneRotation('rightUpperArm', rightArmIK.upperArmQuat);
    adapter.setBoneRotation('rightLowerArm', rightArmIK.lowerArmQuat);
    adapter.setBoneRotation('rightHand', rightArmIK.handQuat);
    ArmIKSolver.applyFingerPoses(adapter, 'right', rightHandFrame.fingerTargets);
    adapter.updateWorldMatrix();

    // =========================================================================
    // PHASE G — Controlled 2-Pass Refinement
    // =========================================================================
    const actualLeftWristPos = adapter.getBoneWorldPosition('leftHand', new THREE.Vector3())!;
    const actualRightWristPos = adapter.getBoneWorldPosition('rightHand', new THREE.Vector3())!;

    const leftWristDelta = new THREE.Vector3().subVectors(lWristTarget, actualLeftWristPos);
    const rightWristDelta = new THREE.Vector3().subVectors(rWristTarget, actualRightWristPos);

    if (leftWristDelta.length() > 0.002 || rightWristDelta.length() > 0.002) {
      const refinedLWristTarget = lWristTarget.clone().addScaledVector(leftWristDelta, 0.95);
      const refinedRWristTarget = rWristTarget.clone().addScaledVector(rightWristDelta, 0.95);

      leftArmIK = ArmIKSolver.solveArmIK(
        'left',
        curLeftShoulderPos,
        refinedLWristTarget,
        metrics.upperArmLength.left,
        metrics.forearmLength.left,
        leftPoleVec,
        parentLeftShoulderQuat,
        refLeftUpper,
        refLeftLower
      );
      const refinedLLowerDir = new THREE.Vector3().subVectors(leftArmIK.wristPos, leftArmIK.elbowPos).normalize();
      const refinedLLowerQuat = new THREE.Quaternion().setFromUnitVectors(refLeftLower, refinedLLowerDir);
      leftArmIK.handQuat = ArmIKSolver.solveHandOrientation('left', leftHandFrame, refinedLLowerQuat);

      rightArmIK = ArmIKSolver.solveArmIK(
        'right',
        curRightShoulderPos,
        refinedRWristTarget,
        metrics.upperArmLength.right,
        metrics.forearmLength.right,
        rightPoleVec,
        parentRightShoulderQuat,
        refRightUpper,
        refRightLower
      );
      const refinedRLowerDir = new THREE.Vector3().subVectors(rightArmIK.wristPos, rightArmIK.elbowPos).normalize();
      const refinedRLowerQuat = new THREE.Quaternion().setFromUnitVectors(refRightLower, refinedRLowerDir);
      rightArmIK.handQuat = ArmIKSolver.solveHandOrientation('right', rightHandFrame, refinedRLowerQuat);

      adapter.setBoneRotation('leftUpperArm', leftArmIK.upperArmQuat);
      adapter.setBoneRotation('leftLowerArm', leftArmIK.lowerArmQuat);
      adapter.setBoneRotation('leftHand', leftArmIK.handQuat);
      adapter.setBoneRotation('rightUpperArm', rightArmIK.upperArmQuat);
      adapter.setBoneRotation('rightLowerArm', rightArmIK.lowerArmQuat);
      adapter.setBoneRotation('rightHand', rightArmIK.handQuat);
      adapter.updateWorldMatrix();
    }

    // =========================================================================
    // PHASE H — Actual-Pose & Orientation Validation
    // =========================================================================
    const finalActualLeftWrist = adapter.getBoneWorldPosition('leftHand', new THREE.Vector3())!;
    const finalActualLeftHandQuat = adapter.getBoneWorldQuaternion('leftHand', new THREE.Quaternion())!;
    const finalActualRightWrist = adapter.getBoneWorldPosition('rightHand', new THREE.Vector3())!;
    const finalActualRightHandQuat = adapter.getBoneWorldQuaternion('rightHand', new THREE.Quaternion())!;
    const finalActualHead = adapter.getBoneWorldPosition('head', new THREE.Vector3())!;
    const finalActualHeadQuat = adapter.getBoneWorldQuaternion('head', new THREE.Quaternion())!;
    const finalActualLeftElbow = adapter.getBoneWorldPosition('leftLowerArm', new THREE.Vector3())!;
    const finalActualRightElbow = adapter.getBoneWorldPosition('rightLowerArm', new THREE.Vector3())!;

    const leftHandNode = adapter.getBoneNode('leftHand');
    const rightHandNode = adapter.getBoneNode('rightHand');
    const leftHandBoneName = leftHandNode?.name || 'Normalized_J_Bip_L_Hand';
    const rightHandBoneName = rightHandNode?.name || 'Normalized_J_Bip_R_Hand';

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
      boneNames: {
        leftHand: leftHandBoneName,
        rightHand: rightHandBoneName,
      },
      actualBoneTransforms: {
        head: finalActualHead,
        headQuat: finalActualHeadQuat,
        leftWrist: finalActualLeftWrist,
        leftHandQuat: finalActualLeftHandQuat,
        rightWrist: finalActualRightWrist,
        rightHandQuat: finalActualRightHandQuat,
        leftElbow: finalActualLeftElbow,
        rightElbow: finalActualRightElbow,
      },
    });

    return {
      instrumentScale: scale,
      instrumentTransform: violinTransform,
      accessoryTransform,
      leftArmIK,
      rightArmIK,
      leftHandFrame,
      rightHandFrame,
      leftShoulderRotation,
      rightShoulderRotation,
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

    adapter.setBoneRotation('spine', solution.spineRotation);
    adapter.setBoneRotation('chest', solution.chestRotation);
    if (adapter.hasBone('upperChest')) {
      adapter.setBoneRotation('upperChest', solution.chestRotation);
    }

    adapter.setBoneRotation('neck', solution.neckRotation);
    adapter.setBoneRotation('head', solution.headRotation);

    if (solution.leftShoulderRotation && adapter.hasBone('leftShoulder')) {
      adapter.setBoneRotation('leftShoulder', solution.leftShoulderRotation);
    }
    if (solution.rightShoulderRotation && adapter.hasBone('rightShoulder')) {
      adapter.setBoneRotation('rightShoulder', solution.rightShoulderRotation);
    }

    adapter.setBoneRotation('leftUpperArm', solution.leftArmIK.upperArmQuat);
    adapter.setBoneRotation('leftLowerArm', solution.leftArmIK.lowerArmQuat);
    adapter.setBoneRotation('leftHand', solution.leftArmIK.handQuat);

    adapter.setBoneRotation('rightUpperArm', solution.rightArmIK.upperArmQuat);
    adapter.setBoneRotation('rightLowerArm', solution.rightArmIK.lowerArmQuat);
    adapter.setBoneRotation('rightHand', solution.rightArmIK.handQuat);

    ArmIKSolver.applyFingerPoses(adapter, 'left', solution.leftHandFrame.fingerTargets);
    ArmIKSolver.applyFingerPoses(adapter, 'right', solution.rightHandFrame.fingerTargets);

    adapter.updateWorldMatrix();
  }
}
