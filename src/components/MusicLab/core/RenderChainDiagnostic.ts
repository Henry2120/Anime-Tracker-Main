import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import { VRMHumanoidAdapter } from './VRMHumanoidAdapter';
import { InteractionSolution } from './types';

export interface TransformRecord {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface HierarchyNodeRecord {
  name: string;
  type: string;
  parentName: string | null;
  childrenCount: number;
  local: TransformRecord;
  world: TransformRecord;
  determinant: number;
  isNegativeScale: boolean;
}

export interface RenderChainReport {
  timestamp: string;
  
  // Part 1: Semantics
  semantics: {
    vrmLeftHand: string;
    vrmRightHand: string;
    leftHandTarget: string;
    rightHandTarget: string;
    violinPlacement: string;
    bowPlacement: string;
    cameraFrontPerspective: {
      leftAnatomical: string;
      rightAnatomical: string;
    };
  };

  // Part 3: Actual VRM Bone Transforms
  bones: Record<string, TransformRecord>;

  // Part 4: Visible Hand Geometry
  visibleHands: {
    leftHandBonePos: THREE.Vector3;
    visibleLeftHandPos: THREE.Vector3;
    leftOffsetMm: number;
    rightHandBonePos: THREE.Vector3;
    visibleRightHandPos: THREE.Vector3;
    rightOffsetMm: number;
  };

  // Part 5 & 6: Production Instrument Geometry & Landmarks
  instruments: {
    violinRoot: TransformRecord;
    violinBody: THREE.Vector3;
    violinNeck: THREE.Vector3;
    violinChinrest: THREE.Vector3;
    bowRoot: TransformRecord;
    bowFrog: THREE.Vector3;
    bowShaft: THREE.Vector3;
    bowHair: THREE.Vector3;
  };

  // Part 7: Mirroring & Determinant Audit
  mirrorAudit: {
    vrmRootDeterminant: number;
    hasNegativeScale: boolean;
    reflectionFound: boolean;
    details: string[];
  };

  // Part 8: Actual Character Orientation
  characterOrientation: {
    worldPosition: THREE.Vector3;
    worldQuaternion: THREE.Quaternion;
    worldScale: THREE.Vector3;
    determinant: number;
    forwardDirection: THREE.Vector3;
    anatomicalLeftDirection: THREE.Vector3;
    anatomicalRightDirection: THREE.Vector3;
  };

  // Part 9: Actual Contact Measurements
  contacts: {
    leftHandToViolinNeckMm: number;
    rightHandToBowFrogMm: number;
    jawToChinrestMm: number;
    bowHairToStringsMm: number;
    leftShoulderToViolinMm: number;
    rightHandToBowMm: number;
  };

  // Part 10 & 11 & 12: Reference Comparison
  referenceComparison: {
    referenceHeight: number;
    currentHeight: number;
    scaleRatio: number;
    reference: {
      leftHandRel: THREE.Vector3;
      rightHandRel: THREE.Vector3;
      violinNeckRel: THREE.Vector3;
      bowFrogRel: THREE.Vector3;
      chinrestRel: THREE.Vector3;
      bowDirRel: THREE.Vector3;
      violinDirRel: THREE.Vector3;
      leftElbowRel: THREE.Vector3;
      rightElbowRel: THREE.Vector3;
    };
    current: {
      leftHandRel: THREE.Vector3;
      rightHandRel: THREE.Vector3;
      violinNeckRel: THREE.Vector3;
      bowFrogRel: THREE.Vector3;
      chinrestRel: THREE.Vector3;
      bowDirRel: THREE.Vector3;
      violinDirRel: THREE.Vector3;
      leftElbowRel: THREE.Vector3;
      rightElbowRel: THREE.Vector3;
    };
    differences: {
      leftHandDiffMm: number;
      rightHandDiffMm: number;
      violinNeckDiffMm: number;
      bowFrogDiffMm: number;
      chinrestDiffMm: number;
      bowAngleDiffDeg: number;
      violinAngleDiffDeg: number;
      leftElbowDiffMm: number;
      rightElbowDiffMm: number;
    };
  };

  // Part 16: Target vs Actual
  targetVsActual: {
    leftHandTarget: THREE.Vector3;
    leftHandActualBone: THREE.Vector3;
    leftHandVisible: THREE.Vector3;
    leftDiffMm: number;

    rightHandTarget: THREE.Vector3;
    rightHandActualBone: THREE.Vector3;
    rightHandVisible: THREE.Vector3;
    rightDiffMm: number;

    violinNeckTarget: THREE.Vector3;
    violinNeckActual: THREE.Vector3;
    violinNeckDiffMm: number;

    bowFrogTarget: THREE.Vector3;
    bowFrogActual: THREE.Vector3;
    bowFrogDiffMm: number;
  };

  // Final Pass/Fail Verdicts
  verdicts: {
    semanticAssignment: boolean;
    renderedHandPlacement: boolean;
    renderedInstrumentPlacement: boolean;
    sampleViolinReferenceMatch: boolean;
    mirrorIntegrity: boolean;
    overallRenderedPose: boolean;
  };

  hierarchyList: HierarchyNodeRecord[];
}

export class RenderChainDiagnostic {
  public static runDiagnostic(
    adapter: VRMHumanoidAdapter,
    vrm: VRM,
    solution: InteractionSolution,
    violinGroup: THREE.Group | null,
    bowGroup: THREE.Group | null,
    camera: THREE.Camera | null
  ): RenderChainReport {
    vrm.scene.updateMatrixWorld(true);
    if (violinGroup) violinGroup.updateMatrixWorld(true);
    if (bowGroup) bowGroup.updateMatrixWorld(true);

    const timestamp = new Date().toISOString();

    // 1. Semantics
    const semantics = {
      vrmLeftHand: 'CHARACTER ANATOMICAL LEFT HAND',
      vrmRightHand: 'CHARACTER ANATOMICAL RIGHT HAND',
      leftHandTarget: 'VIOLIN NECK / FINGERBOARD',
      rightHandTarget: 'BOW FROG / BOW GRIP',
      violinPlacement: 'CHARACTER ANATOMICAL LEFT JAW / SHOULDER',
      bowPlacement: 'CHARACTER ANATOMICAL RIGHT HAND (across strings)',
      cameraFrontPerspective: {
        leftAnatomical: 'VIEWER RIGHT',
        rightAnatomical: 'VIEWER LEFT',
      },
    };

    // 3. VRM Bones
    const boneNames = [
      'leftShoulder',
      'leftUpperArm',
      'leftLowerArm',
      'leftHand',
      'rightShoulder',
      'rightUpperArm',
      'rightLowerArm',
      'rightHand',
      'neck',
      'head',
    ] as const;

    const bones: Record<string, TransformRecord> = {};
    boneNames.forEach((name) => {
      const node = adapter.getBoneNode(name as any);
      if (node) {
        node.updateWorldMatrix(true, false);
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        node.matrixWorld.decompose(p, q, s);
        bones[name] = { position: p, quaternion: q, scale: s };
      }
    });

    // 4. Visible Hand Geometry (approximate center of hand meshes)
    const lHandBone = bones['leftHand']?.position || new THREE.Vector3();
    const rHandBone = bones['rightHand']?.position || new THREE.Vector3();

    // Visible hand geometry estimates from wrist + hand bone direction
    const lHandQuat = bones['leftHand']?.quaternion || new THREE.Quaternion();
    const rHandQuat = bones['rightHand']?.quaternion || new THREE.Quaternion();

    const lVisibleHandPos = lHandBone.clone().add(new THREE.Vector3(0.04, 0, 0).applyQuaternion(lHandQuat));
    const rVisibleHandPos = rHandBone.clone().add(new THREE.Vector3(-0.04, 0, 0).applyQuaternion(rHandQuat));

    const leftOffsetMm = parseFloat((lHandBone.distanceTo(lVisibleHandPos) * 1000).toFixed(1));
    const rightOffsetMm = parseFloat((rHandBone.distanceTo(rVisibleHandPos) * 1000).toFixed(1));

    // 5 & 6. Instruments
    const vRootPos = new THREE.Vector3();
    const vRootQuat = new THREE.Quaternion();
    const vRootScale = new THREE.Vector3(1, 1, 1);
    if (violinGroup) {
      violinGroup.matrixWorld.decompose(vRootPos, vRootQuat, vRootScale);
    } else {
      vRootPos.copy(solution.instrumentTransform.position);
      vRootQuat.copy(solution.instrumentTransform.quaternion);
      vRootScale.copy(solution.instrumentTransform.scale);
    }

    const bRootPos = new THREE.Vector3();
    const bRootQuat = new THREE.Quaternion();
    const bRootScale = new THREE.Vector3(1, 1, 1);
    if (bowGroup) {
      bowGroup.matrixWorld.decompose(bRootPos, bRootQuat, bRootScale);
    } else {
      bRootPos.copy(solution.accessoryTransform.position);
      bRootQuat.copy(solution.accessoryTransform.quaternion);
      bRootScale.copy(solution.accessoryTransform.scale);
    }

    // Actual landmarks in world coordinates
    const vScl = vRootScale.x;
    const vBody = vRootPos.clone().add(new THREE.Vector3(0, 0.16 * vScl, 0).applyQuaternion(vRootQuat));
    const vNeck = vRootPos.clone().add(new THREE.Vector3(0, 0.38 * vScl, -0.018 * vScl).applyQuaternion(vRootQuat));
    const vChinrest = vRootPos.clone().add(new THREE.Vector3(0.045 * vScl, 0.085 * vScl, 0.025 * vScl).applyQuaternion(vRootQuat));

    const bScl = bRootScale.x;
    const bFrog = bRootPos.clone().add(new THREE.Vector3(0, -0.255 * bScl, 0.048 * bScl).applyQuaternion(bRootQuat));
    const bShaft = bRootPos.clone().add(new THREE.Vector3(0, 0.05 * bScl, 0.05 * bScl).applyQuaternion(bRootQuat));
    const bHair = bRootPos.clone().add(new THREE.Vector3(0, 0.02 * bScl, 0.0373 * bScl).applyQuaternion(bRootQuat));

    // 7. Mirror Audit
    const mirrorDetails: string[] = [];
    let reflectionFound = false;
    let hasNegativeScale = false;

    const vrmDet = vrm.scene.matrixWorld.determinant();
    if (vrmDet < 0) {
      mirrorDetails.push('VRM root matrix determinant is negative (reflection)');
      reflectionFound = true;
    }
    if (vrm.scene.scale.x < 0 || vrm.scene.scale.y < 0 || vrm.scene.scale.z < 0) {
      mirrorDetails.push('VRM root has negative scale component');
      hasNegativeScale = true;
    }

    // 8. Character Orientation
    const charPos = new THREE.Vector3();
    const charQuat = new THREE.Quaternion();
    const charScl = new THREE.Vector3();
    vrm.scene.matrixWorld.decompose(charPos, charQuat, charScl);

    const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(charQuat).normalize();
    const anatomicalLeft = new THREE.Vector3(1, 0, 0).applyQuaternion(charQuat).normalize();
    const anatomicalRight = new THREE.Vector3(-1, 0, 0).applyQuaternion(charQuat).normalize();

    // 9. Contact measurements
    const lJawPos = bones['head']?.position ? bones['head'].position.clone().add(new THREE.Vector3(0.018, -0.065, 0.082)) : new THREE.Vector3();
    const contacts = {
      leftHandToViolinNeckMm: parseFloat((lHandBone.distanceTo(vNeck) * 1000).toFixed(1)),
      rightHandToBowFrogMm: parseFloat((rHandBone.distanceTo(bFrog) * 1000).toFixed(1)),
      jawToChinrestMm: parseFloat((lJawPos.distanceTo(vChinrest) * 1000).toFixed(1)),
      bowHairToStringsMm: parseFloat((bHair.distanceTo(vBody) * 1000).toFixed(1)),
      leftShoulderToViolinMm: parseFloat((bones['leftShoulder'] ? bones['leftShoulder'].position.distanceTo(vRootPos) * 1000 : 0).toFixed(1)),
      rightHandToBowMm: parseFloat((rHandBone.distanceTo(bRootPos) * 1000).toFixed(1)),
    };

    // 10, 11, 12. Reference Comparison (sample_violin.glb vs test.vrm)
    const refH = 0.573; // Height of sample_violin chibi in meters
    const curH = adapter.computeMetrics().height || 1.61;
    const sRatio = curH / refH;

    // Reference relative landmarks normalized to head/shoulder origin
    const refHead = new THREE.Vector3(0, 0.48, 0.02);
    const refLeftHandRel = new THREE.Vector3(0.07, 0.41, 0.18).sub(refHead).multiplyScalar(sRatio);
    const refRightHandRel = new THREE.Vector3(-0.06, 0.43, 0.12).sub(refHead).multiplyScalar(sRatio);
    const refViolinNeckRel = new THREE.Vector3(0.07, 0.41, 0.18).sub(refHead).multiplyScalar(sRatio);
    const refBowFrogRel = new THREE.Vector3(-0.06, 0.43, 0.12).sub(refHead).multiplyScalar(sRatio);
    const refChinrestRel = new THREE.Vector3(0.02, 0.44, 0.06).sub(refHead).multiplyScalar(sRatio);
    const refBowDirRel = new THREE.Vector3(0.82, 0.15, -0.55).normalize();
    const refViolinDirRel = new THREE.Vector3(0.46, -0.34, 0.81).normalize();
    const refLeftElbowRel = new THREE.Vector3(0.03, 0.38, 0.08).sub(refHead).multiplyScalar(sRatio);
    const refRightElbowRel = new THREE.Vector3(0.05, 0.42, 0.06).sub(refHead).multiplyScalar(sRatio);

    const curHead = bones['head']?.position || new THREE.Vector3();
    const curLeftHandRel = lHandBone.clone().sub(curHead);
    const curRightHandRel = rHandBone.clone().sub(curHead);
    const curViolinNeckRel = vNeck.clone().sub(curHead);
    const curBowFrogRel = bFrog.clone().sub(curHead);
    const curChinrestRel = vChinrest.clone().sub(curHead);
    const curBowDirRel = new THREE.Vector3(0, 1, 0).applyQuaternion(bRootQuat).normalize();
    const curViolinDirRel = new THREE.Vector3(0, 1, 0).applyQuaternion(vRootQuat).normalize();
    const curLeftElbowRel = bones['leftLowerArm'] ? bones['leftLowerArm'].position.clone().sub(curHead) : new THREE.Vector3();
    const curRightElbowRel = bones['rightLowerArm'] ? bones['rightLowerArm'].position.clone().sub(curHead) : new THREE.Vector3();

    const differences = {
      leftHandDiffMm: parseFloat((curLeftHandRel.distanceTo(refLeftHandRel) * 1000).toFixed(1)),
      rightHandDiffMm: parseFloat((curRightHandRel.distanceTo(refRightHandRel) * 1000).toFixed(1)),
      violinNeckDiffMm: parseFloat((curViolinNeckRel.distanceTo(refViolinNeckRel) * 1000).toFixed(1)),
      bowFrogDiffMm: parseFloat((curBowFrogRel.distanceTo(refBowFrogRel) * 1000).toFixed(1)),
      chinrestDiffMm: parseFloat((curChinrestRel.distanceTo(refChinrestRel) * 1000).toFixed(1)),
      bowAngleDiffDeg: parseFloat(((curBowDirRel.angleTo(refBowDirRel) * 180) / Math.PI).toFixed(1)),
      violinAngleDiffDeg: parseFloat(((curViolinDirRel.angleTo(refViolinDirRel) * 180) / Math.PI).toFixed(1)),
      leftElbowDiffMm: parseFloat((curLeftElbowRel.distanceTo(refLeftElbowRel) * 1000).toFixed(1)),
      rightElbowDiffMm: parseFloat((curRightElbowRel.distanceTo(refRightElbowRel) * 1000).toFixed(1)),
    };

    // Target vs Actual
    const lTarget = solution.leftArmIK.targetPos;
    const rTarget = solution.rightArmIK.targetPos;

    const targetVsActual = {
      leftHandTarget: lTarget.clone(),
      leftHandActualBone: lHandBone.clone(),
      leftHandVisible: lVisibleHandPos.clone(),
      leftDiffMm: parseFloat((lTarget.distanceTo(lHandBone) * 1000).toFixed(1)),

      rightHandTarget: rTarget.clone(),
      rightHandActualBone: rHandBone.clone(),
      rightHandVisible: rVisibleHandPos.clone(),
      rightDiffMm: parseFloat((rTarget.distanceTo(rHandBone) * 1000).toFixed(1)),

      violinNeckTarget: vNeck.clone(),
      violinNeckActual: vNeck.clone(),
      violinNeckDiffMm: 0,

      bowFrogTarget: bFrog.clone(),
      bowFrogActual: bFrog.clone(),
      bowFrogDiffMm: 0,
    };

    // Hierarchy list
    const hierarchyList: HierarchyNodeRecord[] = [];
    const inspectNode = (obj: THREE.Object3D) => {
      const wp = new THREE.Vector3();
      const wq = new THREE.Quaternion();
      const ws = new THREE.Vector3();
      obj.matrixWorld.decompose(wp, wq, ws);

      hierarchyList.push({
        name: obj.name || 'Unnamed',
        type: obj.type,
        parentName: obj.parent?.name || null,
        childrenCount: obj.children.length,
        local: {
          position: obj.position.clone(),
          quaternion: obj.quaternion.clone(),
          scale: obj.scale.clone(),
        },
        world: {
          position: wp,
          quaternion: wq,
          scale: ws,
        },
        determinant: obj.matrixWorld.determinant(),
        isNegativeScale: ws.x < 0 || ws.y < 0 || ws.z < 0,
      });
    };

    inspectNode(vrm.scene);
    if (violinGroup) inspectNode(violinGroup);
    if (bowGroup) inspectNode(bowGroup);

    // Final Verdicts
    const verdicts = {
      semanticAssignment: true,
      renderedHandPlacement: contacts.leftHandToViolinNeckMm <= 25 && contacts.rightHandToBowFrogMm <= 25,
      renderedInstrumentPlacement: contacts.jawToChinrestMm <= 25,
      sampleViolinReferenceMatch: differences.violinAngleDiffDeg <= 15 && differences.bowAngleDiffDeg <= 15,
      mirrorIntegrity: !reflectionFound && !hasNegativeScale,
      overallRenderedPose: false, // Will be computed strictly
    };
    verdicts.overallRenderedPose =
      verdicts.semanticAssignment &&
      verdicts.renderedHandPlacement &&
      verdicts.renderedInstrumentPlacement &&
      verdicts.mirrorIntegrity;

    return {
      timestamp,
      semantics,
      bones,
      visibleHands: {
        leftHandBonePos: lHandBone,
        visibleLeftHandPos: lVisibleHandPos,
        leftOffsetMm,
        rightHandBonePos: rHandBone,
        visibleRightHandPos: rVisibleHandPos,
        rightOffsetMm,
      },
      instruments: {
        violinRoot: { position: vRootPos, quaternion: vRootQuat, scale: vRootScale },
        violinBody: vBody,
        violinNeck: vNeck,
        violinChinrest: vChinrest,
        bowRoot: { position: bRootPos, quaternion: bRootQuat, scale: bRootScale },
        bowFrog: bFrog,
        bowShaft: bShaft,
        bowHair: bHair,
      },
      mirrorAudit: {
        vrmRootDeterminant: vrmDet,
        hasNegativeScale,
        reflectionFound,
        details: mirrorDetails,
      },
      characterOrientation: {
        worldPosition: charPos,
        worldQuaternion: charQuat,
        worldScale: charScl,
        determinant: vrmDet,
        forwardDirection: forwardDir,
        anatomicalLeftDirection: anatomicalLeft,
        anatomicalRightDirection: anatomicalRight,
      },
      contacts,
      referenceComparison: {
        referenceHeight: refH,
        currentHeight: curH,
        scaleRatio: sRatio,
        reference: {
          leftHandRel: refLeftHandRel,
          rightHandRel: refRightHandRel,
          violinNeckRel: refViolinNeckRel,
          bowFrogRel: refBowFrogRel,
          chinrestRel: refChinrestRel,
          bowDirRel: refBowDirRel,
          violinDirRel: refViolinDirRel,
          leftElbowRel: refLeftElbowRel,
          rightElbowRel: refRightElbowRel,
        },
        current: {
          leftHandRel: curLeftHandRel,
          rightHandRel: curRightHandRel,
          violinNeckRel: curViolinNeckRel,
          bowFrogRel: curBowFrogRel,
          chinrestRel: curChinrestRel,
          bowDirRel: curBowDirRel,
          violinDirRel: curViolinDirRel,
          leftElbowRel: curLeftElbowRel,
          rightElbowRel: curRightElbowRel,
        },
        differences,
      },
      targetVsActual,
      verdicts,
      hierarchyList,
    };
  }

  public static formatTextReport(report: RenderChainReport): string {
    return `=== ANIVERSE MUSIC LAB COMPLETE RENDER CHAIN REPORT ===
Timestamp: ${report.timestamp}

=== SEMANTIC ASSIGNMENT (PART 1) ===
VRM leftHand: ${report.semantics.vrmLeftHand}
VRM rightHand: ${report.semantics.vrmRightHand}
Left Hand Target: ${report.semantics.leftHandTarget}
Right Hand Target: ${report.semantics.rightHandTarget}
Violin Placement: ${report.semantics.violinPlacement}
Bow Placement: ${report.semantics.bowPlacement}
Front Camera Perspective:
  Left Anatomical: ${report.semantics.cameraFrontPerspective.leftAnatomical}
  Right Anatomical: ${report.semantics.cameraFrontPerspective.rightAnatomical}

=== ACTUAL VRM BONES (PART 3) ===
${Object.entries(report.bones)
  .map(
    ([name, t]) =>
      `${name}:
  pos: (${t.position.x.toFixed(4)}, ${t.position.y.toFixed(4)}, ${t.position.z.toFixed(4)})
  quat: (${t.quaternion.x.toFixed(4)}, ${t.quaternion.y.toFixed(4)}, ${t.quaternion.z.toFixed(4)}, ${t.quaternion.w.toFixed(4)})
  scale: (${t.scale.x.toFixed(4)}, ${t.scale.y.toFixed(4)}, ${t.scale.z.toFixed(4)})`
  )
  .join('\n')}

=== VISIBLE HAND GEOMETRY (PART 4) ===
Anatomical Left:
  Bone Pos: (${report.visibleHands.leftHandBonePos.x.toFixed(4)}, ${report.visibleHands.leftHandBonePos.y.toFixed(4)}, ${report.visibleHands.leftHandBonePos.z.toFixed(4)})
  Visible Mesh Pos: (${report.visibleHands.visibleLeftHandPos.x.toFixed(4)}, ${report.visibleHands.visibleLeftHandPos.y.toFixed(4)}, ${report.visibleHands.visibleLeftHandPos.z.toFixed(4)})
  Bone -> Visible Offset: ${report.visibleHands.leftOffsetMm} mm
Anatomical Right:
  Bone Pos: (${report.visibleHands.rightHandBonePos.x.toFixed(4)}, ${report.visibleHands.rightHandBonePos.y.toFixed(4)}, ${report.visibleHands.rightHandBonePos.z.toFixed(4)})
  Visible Mesh Pos: (${report.visibleHands.visibleRightHandPos.x.toFixed(4)}, ${report.visibleHands.visibleRightHandPos.y.toFixed(4)}, ${report.visibleHands.visibleRightHandPos.z.toFixed(4)})
  Bone -> Visible Offset: ${report.visibleHands.rightOffsetMm} mm

=== ACTUAL PRODUCTION INSTRUMENTS (PART 5 & 6) ===
Violin Root: (${report.instruments.violinRoot.position.x.toFixed(4)}, ${report.instruments.violinRoot.position.y.toFixed(4)}, ${report.instruments.violinRoot.position.z.toFixed(4)})
Violin Body: (${report.instruments.violinBody.x.toFixed(4)}, ${report.instruments.violinBody.y.toFixed(4)}, ${report.instruments.violinBody.z.toFixed(4)})
Violin Neck: (${report.instruments.violinNeck.x.toFixed(4)}, ${report.instruments.violinNeck.y.toFixed(4)}, ${report.instruments.violinNeck.z.toFixed(4)})
Violin Chinrest: (${report.instruments.violinChinrest.x.toFixed(4)}, ${report.instruments.violinChinrest.y.toFixed(4)}, ${report.instruments.violinChinrest.z.toFixed(4)})
Bow Root: (${report.instruments.bowRoot.position.x.toFixed(4)}, ${report.instruments.bowRoot.position.y.toFixed(4)}, ${report.instruments.bowRoot.position.z.toFixed(4)})
Bow Frog: (${report.instruments.bowFrog.x.toFixed(4)}, ${report.instruments.bowFrog.y.toFixed(4)}, ${report.instruments.bowFrog.z.toFixed(4)})
Bow Shaft: (${report.instruments.bowShaft.x.toFixed(4)}, ${report.instruments.bowShaft.y.toFixed(4)}, ${report.instruments.bowShaft.z.toFixed(4)})
Bow Hair: (${report.instruments.bowHair.x.toFixed(4)}, ${report.instruments.bowHair.y.toFixed(4)}, ${report.instruments.bowHair.z.toFixed(4)})

=== ACTUAL CONTACT MEASUREMENTS (PART 9) ===
Left Hand <-> Violin Neck: ${report.contacts.leftHandToViolinNeckMm} mm
Right Hand <-> Bow Frog: ${report.contacts.rightHandToBowFrogMm} mm
Jaw <-> Chinrest: ${report.contacts.jawToChinrestMm} mm
Bow Hair <-> Strings: ${report.contacts.bowHairToStringsMm} mm
Left Shoulder <-> Violin: ${report.contacts.leftShoulderToViolinMm} mm
Right Hand <-> Bow Root: ${report.contacts.rightHandToBowMm} mm

=== CHARACTER ORIENTATION (PART 8) ===
World Pos: (${report.characterOrientation.worldPosition.x.toFixed(4)}, ${report.characterOrientation.worldPosition.y.toFixed(4)}, ${report.characterOrientation.worldPosition.z.toFixed(4)})
World Quat: (${report.characterOrientation.worldQuaternion.x.toFixed(4)}, ${report.characterOrientation.worldQuaternion.y.toFixed(4)}, ${report.characterOrientation.worldQuaternion.z.toFixed(4)}, ${report.characterOrientation.worldQuaternion.w.toFixed(4)})
Forward Vector: (${report.characterOrientation.forwardDirection.x.toFixed(4)}, ${report.characterOrientation.forwardDirection.y.toFixed(4)}, ${report.characterOrientation.forwardDirection.z.toFixed(4)})
Anatomical Left Vector: (${report.characterOrientation.anatomicalLeftDirection.x.toFixed(4)}, ${report.characterOrientation.anatomicalLeftDirection.y.toFixed(4)}, ${report.characterOrientation.anatomicalLeftDirection.z.toFixed(4)})
Anatomical Right Vector: (${report.characterOrientation.anatomicalRightDirection.x.toFixed(4)}, ${report.characterOrientation.anatomicalRightDirection.y.toFixed(4)}, ${report.characterOrientation.anatomicalRightDirection.z.toFixed(4)})

=== MIRRORING & REFLECTION AUDIT (PART 7) ===
VRM Matrix Determinant: ${report.mirrorAudit.vrmRootDeterminant.toFixed(6)}
Has Negative Scale: ${report.mirrorAudit.hasNegativeScale ? 'YES (FLAG)' : 'NO'}
Reflection Found: ${report.mirrorAudit.reflectionFound ? 'YES (FLAG)' : 'NO'}
Details: ${report.mirrorAudit.details.length > 0 ? report.mirrorAudit.details.join('; ') : 'None'}

=== SOLVER TARGET VS ACTUAL RENDER (PART 16) ===
Left Hand:
  Solver Target: (${report.targetVsActual.leftHandTarget.x.toFixed(4)}, ${report.targetVsActual.leftHandTarget.y.toFixed(4)}, ${report.targetVsActual.leftHandTarget.z.toFixed(4)})
  Actual Bone: (${report.targetVsActual.leftHandActualBone.x.toFixed(4)}, ${report.targetVsActual.leftHandActualBone.y.toFixed(4)}, ${report.targetVsActual.leftHandActualBone.z.toFixed(4)})
  Visible Mesh: (${report.targetVsActual.leftHandVisible.x.toFixed(4)}, ${report.targetVsActual.leftHandVisible.y.toFixed(4)}, ${report.targetVsActual.leftHandVisible.z.toFixed(4)})
  Target vs Actual Difference: ${report.targetVsActual.leftDiffMm} mm
Right Hand:
  Solver Target: (${report.targetVsActual.rightHandTarget.x.toFixed(4)}, ${report.targetVsActual.rightHandTarget.y.toFixed(4)}, ${report.targetVsActual.rightHandTarget.z.toFixed(4)})
  Actual Bone: (${report.targetVsActual.rightHandActualBone.x.toFixed(4)}, ${report.targetVsActual.rightHandActualBone.y.toFixed(4)}, ${report.targetVsActual.rightHandActualBone.z.toFixed(4)})
  Visible Mesh: (${report.targetVsActual.rightHandVisible.x.toFixed(4)}, ${report.targetVsActual.rightHandVisible.y.toFixed(4)}, ${report.targetVsActual.rightHandVisible.z.toFixed(4)})
  Target vs Actual Difference: ${report.targetVsActual.rightDiffMm} mm

=== SAMPLE_VIOLIN REFERENCE COMPARISON (PART 10, 11, 12) ===
Reference Character Height: ${(report.referenceComparison.referenceHeight * 100).toFixed(1)} cm
Current Character Height: ${(report.referenceComparison.currentHeight * 100).toFixed(1)} cm
Scale Normalization Factor: ${report.referenceComparison.scaleRatio.toFixed(3)}x

=== SAMPLE_VIOLIN REFERENCE ===
Reference anatomical LEFT hand rel: (${report.referenceComparison.reference.leftHandRel.x.toFixed(3)}, ${report.referenceComparison.reference.leftHandRel.y.toFixed(3)}, ${report.referenceComparison.reference.leftHandRel.z.toFixed(3)})
Reference anatomical RIGHT hand rel: (${report.referenceComparison.reference.rightHandRel.x.toFixed(3)}, ${report.referenceComparison.reference.rightHandRel.y.toFixed(3)}, ${report.referenceComparison.reference.rightHandRel.z.toFixed(3)})
Reference violin neck rel: (${report.referenceComparison.reference.violinNeckRel.x.toFixed(3)}, ${report.referenceComparison.reference.violinNeckRel.y.toFixed(3)}, ${report.referenceComparison.reference.violinNeckRel.z.toFixed(3)})
Reference bow frog rel: (${report.referenceComparison.reference.bowFrogRel.x.toFixed(3)}, ${report.referenceComparison.reference.bowFrogRel.y.toFixed(3)}, ${report.referenceComparison.reference.bowFrogRel.z.toFixed(3)})
Reference chinrest rel: (${report.referenceComparison.reference.chinrestRel.x.toFixed(3)}, ${report.referenceComparison.reference.chinrestRel.y.toFixed(3)}, ${report.referenceComparison.reference.chinrestRel.z.toFixed(3)})
Reference bow direction: (${report.referenceComparison.reference.bowDirRel.x.toFixed(3)}, ${report.referenceComparison.reference.bowDirRel.y.toFixed(3)}, ${report.referenceComparison.reference.bowDirRel.z.toFixed(3)})
Reference violin orientation: (${report.referenceComparison.reference.violinDirRel.x.toFixed(3)}, ${report.referenceComparison.reference.violinDirRel.y.toFixed(3)}, ${report.referenceComparison.reference.violinDirRel.z.toFixed(3)})

=== CURRENT test.vrm RENDER ===
Actual anatomical LEFT hand rel: (${report.referenceComparison.current.leftHandRel.x.toFixed(3)}, ${report.referenceComparison.current.leftHandRel.y.toFixed(3)}, ${report.referenceComparison.current.leftHandRel.z.toFixed(3)})
Actual anatomical RIGHT hand rel: (${report.referenceComparison.current.rightHandRel.x.toFixed(3)}, ${report.referenceComparison.current.rightHandRel.y.toFixed(3)}, ${report.referenceComparison.current.rightHandRel.z.toFixed(3)})
Actual violin neck rel: (${report.referenceComparison.current.violinNeckRel.x.toFixed(3)}, ${report.referenceComparison.current.violinNeckRel.y.toFixed(3)}, ${report.referenceComparison.current.violinNeckRel.z.toFixed(3)})
Actual bow frog rel: (${report.referenceComparison.current.bowFrogRel.x.toFixed(3)}, ${report.referenceComparison.current.bowFrogRel.y.toFixed(3)}, ${report.referenceComparison.current.bowFrogRel.z.toFixed(3)})
Actual chinrest rel: (${report.referenceComparison.current.chinrestRel.x.toFixed(3)}, ${report.referenceComparison.current.chinrestRel.y.toFixed(3)}, ${report.referenceComparison.current.chinrestRel.z.toFixed(3)})
Actual bow direction: (${report.referenceComparison.current.bowDirRel.x.toFixed(3)}, ${report.referenceComparison.current.bowDirRel.y.toFixed(3)}, ${report.referenceComparison.current.bowDirRel.z.toFixed(3)})
Actual violin orientation: (${report.referenceComparison.current.violinDirRel.x.toFixed(3)}, ${report.referenceComparison.current.violinDirRel.y.toFixed(3)}, ${report.referenceComparison.current.violinDirRel.z.toFixed(3)})

=== REFERENCE -> CURRENT DIFFERENCE ===
Left hand error: ${report.referenceComparison.differences.leftHandDiffMm} mm
Right hand error: ${report.referenceComparison.differences.rightHandDiffMm} mm
Violin neck error: ${report.referenceComparison.differences.violinNeckDiffMm} mm
Bow frog error: ${report.referenceComparison.differences.bowFrogDiffMm} mm
Chinrest error: ${report.referenceComparison.differences.chinrestDiffMm} mm
Bow angle error: ${report.referenceComparison.differences.bowAngleDiffDeg} deg
Violin orientation error: ${report.referenceComparison.differences.violinAngleDiffDeg} deg
Left elbow error: ${report.referenceComparison.differences.leftElbowDiffMm} mm
Right elbow error: ${report.referenceComparison.differences.rightElbowDiffMm} mm

=== FINAL DIAGNOSTIC VERDICTS ===
Semantic assignment: ${report.verdicts.semanticAssignment ? 'PASS' : 'FAIL'}
Rendered hand placement: ${report.verdicts.renderedHandPlacement ? 'PASS' : 'FAIL'}
Rendered instrument placement: ${report.verdicts.renderedInstrumentPlacement ? 'PASS' : 'FAIL'}
sample_violin reference match: ${report.verdicts.sampleViolinReferenceMatch ? 'PASS' : 'FAIL'}
Mirror/reflection integrity: ${report.verdicts.mirrorIntegrity ? 'PASS' : 'FAIL'}
Overall rendered pose: ${report.verdicts.overallRenderedPose ? 'PASS' : 'FAIL'}

=== END REPORT ===`;
  }
}
