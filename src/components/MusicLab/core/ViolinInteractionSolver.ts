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
 * Co-solves instrument scale, 3D placement, two-bone arm IK,
 * hand interaction frames, and head/chinrest coupling.
 */
export class ViolinInteractionSolver {
  /**
   * Solves complete interaction for any humanoid VRM character and violin/bow.
   */
  public static solve(adapter: VRMHumanoidAdapter): InteractionSolution {
    // 1. Analyze Character Anatomy & Compute Dynamic Metrics
    const metrics = adapter.computeMetrics();

    // 2. Co-Solve Adaptive Scale
    const scale = ViolinProfile.calculateCandidateScale(metrics);

    // 3. Solve 3D Violin Placement Relative to Chin & Collarbone Shelf
    // Local anchors scaled
    const localChinrest = ViolinProfile.localAnchors.chinRest!.clone().multiplyScalar(scale);
    const localNeck = ViolinProfile.localAnchors.neckTarget!.clone().multiplyScalar(scale);
    const localLeftHandTarget = ViolinProfile.localAnchors.leftHandTarget!.clone().multiplyScalar(scale);
    const localStrings = ViolinProfile.localAnchors.bowContactTarget!.clone().multiplyScalar(scale);

    // World contact points derived from character metrics
    const chinTargetPos = metrics.anchors.chin.clone();
    const shelfPos = metrics.anchors.leftCollarboneShelf.clone();

    // Longitudinal violin vector: pointing forward and outward to player's left
    // Typical classical posture: ~38° to the left, ~12° downward angle
    const angleLeftRad = THREE.MathUtils.degToRad(38);
    const angleDownRad = THREE.MathUtils.degToRad(-12);
    const vLongitudinal = new THREE.Vector3(
      Math.sin(angleLeftRad),
      Math.sin(angleDownRad),
      Math.cos(angleLeftRad) * Math.cos(angleDownRad)
    ).normalize();

    // Desired strings face normal: tilted inward toward player's head and upward
    // Strings face ~42° rolled inward
    const rollAngleRad = THREE.MathUtils.degToRad(42);
    const vBaseUp = new THREE.Vector3(0, 1, 0);
    const vPerp = new THREE.Vector3().crossVectors(vLongitudinal, vBaseUp).normalize();
    const vStringsNormal = new THREE.Vector3()
      .addScaledVector(vBaseUp, Math.cos(rollAngleRad))
      .addScaledVector(vPerp, Math.sin(rollAngleRad))
      .normalize();
    const vLateral = new THREE.Vector3().crossVectors(vLongitudinal, vStringsNormal).normalize();
    // Strict orthogonalization
    vStringsNormal.crossVectors(vLateral, vLongitudinal).normalize();

    const violinRotMat = new THREE.Matrix4().makeBasis(vLateral, vLongitudinal, vStringsNormal);
    const violinQuat = new THREE.Quaternion().setFromRotationMatrix(violinRotMat);

    // Position violin so local chinrest sits precisely at character's chin contact
    const wChinrestOffset = localChinrest.clone().applyQuaternion(violinQuat);
    const violinPos = chinTargetPos.clone().sub(wChinrestOffset);

    const violinTransform: Transform3D = {
      position: violinPos,
      quaternion: violinQuat,
      scale: new THREE.Vector3(scale, scale, scale),
    };

    // Calculate World Anchors on Placed Violin
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

    // Left wrist orientation
    leftArmIK.handQuat = ArmIKSolver.solveHandOrientation('left', leftHandFrame);

    // 5. Solve Head & Torso Posture Relative to Chinrest (Phase 11)
    // Head direction toward chinrest
    const headToChinrest = new THREE.Vector3().subVectors(chinrestWorldPos, metrics.anchors.head).normalize();
    const headTurnDeg = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(Math.atan2(headToChinrest.x, headToChinrest.z)) + 12,
      10,
      25
    );
    const headTiltDeg = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(Math.asin(-headToChinrest.y)) * 0.4,
      5,
      14
    );
    const headNodDeg = 6.0;

    const headEuler = new THREE.Euler(
      THREE.MathUtils.degToRad(headNodDeg),
      THREE.MathUtils.degToRad(headTurnDeg),
      THREE.MathUtils.degToRad(headTiltDeg),
      'YXZ'
    );
    const headRotation = new THREE.Quaternion().setFromEuler(headEuler);
    const neckRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(headNodDeg * 0.4), THREE.MathUtils.degToRad(headTurnDeg * 0.4), 0, 'YXZ')
    );

    // Subtle torso posture: upright with minor counter-balance
    const spineRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, -0.04, -0.02, 'YXZ'));
    const chestRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.01, -0.03, 0.0, 'YXZ'));

    // 6. Solve Bow Placement & Right Arm Bow Grip IK (Phase 5)
    // Bowing stroke direction: perpendicular to violin strings longitudinal axis, in the string plane
    const bowStickDir = new THREE.Vector3().crossVectors(vStringsNormal, vLongitudinal).normalize();
    const bowHairContactWorldPos = playableStringsWorldPos.clone();

    // Local bow anchors
    const bowAcc = ViolinProfile.accessory!;
    const bowGripLocal = bowAcc.localAnchors.gripCenter;
    const bowContactLocal = bowAcc.localAnchors.contactPoint;

    // In bow coordinates, distance from frog grip to contact point along stick:
    const frogToContactDist = (bowContactLocal.y - bowGripLocal.y) * scale;
    // World position of bow frog grip:
    const bowFrogGripWorldPos = bowHairContactWorldPos
      .clone()
      .addScaledVector(bowStickDir, -frogToContactDist);

    // Construct Right Hand Bow Grip Frame (at the bow frog grip point)
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

    // Backtrack required right wrist target from the solved grip center:
    const rHandLen = metrics.handLength.right;
    const rWristTarget = bowFrogGripWorldPos
      .clone()
      .addScaledVector(vStringsNormal, -rHandLen * 0.45)
      .addScaledVector(bowStickDir, -rHandLen * 0.40);

    const rShoulderPos = metrics.anchors.rightUpperArm.clone();
    // Right elbow pole vector: outward and downward in bowing plane
    const rightPoleVec = new THREE.Vector3(0.80, -0.45, 0.40).normalize();

    const rightArmIK = ArmIKSolver.solveArmIK(
      'right',
      rShoulderPos,
      rWristTarget,
      metrics.upperArmLength.right,
      metrics.forearmLength.right,
      rightPoleVec
    );

    // Right wrist orientation aligned to bow grip
    rightArmIK.handQuat = ArmIKSolver.solveHandOrientation('right', rightHandFrame);

    // 7. RIGID ATTACHMENT OF BOW TO RIGHT HAND GRIP FRAME (Phase 5)
    // Hierarchy: Forearm -> Wrist -> Palm -> Fingers -> Grip -> Bow
    // BowRootWorld = GripWorld * inverse(BowGripLocalToRoot)
    const bowFrogGripLocalMat = new THREE.Matrix4().makeBasis(
      bowAcc.axes.lateral,
      bowAcc.axes.longitudinal,
      bowAcc.axes.lateral.clone().cross(bowAcc.axes.longitudinal).normalize()
    ).setPosition(bowGripLocal.clone().multiplyScalar(scale));

    const rightGripWorldMat = new THREE.Matrix4()
      .makeRotationFromQuaternion(rightHandFrame.grip.quaternion)
      .setPosition(rightHandFrame.grip.position);

    const invBowGripLocal = bowFrogGripLocalMat.clone().invert();
    const bowWorldMat = new THREE.Matrix4().multiplyMatrices(rightGripWorldMat, invBowGripLocal);

    const bowPos = new THREE.Vector3();
    const bowQuat = new THREE.Quaternion();
    const bowScl = new THREE.Vector3();
    bowWorldMat.decompose(bowPos, bowQuat, bowScl);

    const accessoryTransform: Transform3D = {
      position: bowPos,
      quaternion: bowQuat,
      scale: new THREE.Vector3(scale, scale, scale),
    };

    // 8. Validate and Score Solution (Phase 12)
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
    // 1. Reset first to neutral
    adapter.resetToRestPose();

    // 2. Spine & Torso
    adapter.setBoneRotation('spine', solution.spineRotation);
    adapter.setBoneRotation('chest', solution.chestRotation);
    if (adapter.hasBone('upperChest')) {
      adapter.setBoneRotation('upperChest', solution.chestRotation);
    }

    // 3. Head & Neck
    adapter.setBoneRotation('neck', solution.neckRotation);
    adapter.setBoneRotation('head', solution.headRotation);

    // 4. Left Arm Chain
    adapter.setBoneRotation('leftUpperArm', solution.leftArmIK.upperArmQuat);
    adapter.setBoneRotation('leftLowerArm', solution.leftArmIK.lowerArmQuat);
    adapter.setBoneRotation('leftHand', solution.leftArmIK.handQuat);

    // 5. Right Arm Chain
    adapter.setBoneRotation('rightUpperArm', solution.rightArmIK.upperArmQuat);
    adapter.setBoneRotation('rightLowerArm', solution.rightArmIK.lowerArmQuat);
    adapter.setBoneRotation('rightHand', solution.rightArmIK.handQuat);

    // 6. Fingers (Phase 10)
    ArmIKSolver.applyFingerPoses(adapter, 'left', solution.leftHandFrame.fingerTargets);
    ArmIKSolver.applyFingerPoses(adapter, 'right', solution.rightHandFrame.fingerTargets);

    // 7. Update skeleton world matrix
    adapter.updateWorldMatrix();
  }
}
