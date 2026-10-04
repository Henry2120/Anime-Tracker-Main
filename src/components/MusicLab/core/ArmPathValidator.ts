import * as THREE from 'three';
import {
  ArmSegmentDiagnostic,
  ReferenceComparison,
  ArmPathDiagnostic,
  ArmChainWorldTransforms,
  HumanoidMetrics,
} from './types';

export class ArmPathValidator {
  /**
   * Distance from line segment AB to vertical cylinder (torso proxy)
   */
  private static testSegmentTorsoIntersection(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    torsoCenterXZ: THREE.Vector2,
    torsoMinY: number,
    torsoMaxY: number,
    torsoRadius: number
  ): {
    status: 'outside body' | 'intersects torso' | 'deeply inside torso';
    penetrationMm: number;
    minDist: number;
  } {
    // Sample 12 points along segment p1 -> p2
    let minDist = Infinity;
    const steps = 12;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = THREE.MathUtils.lerp(p1.x, p2.x, t);
      const y = THREE.MathUtils.lerp(p1.y, p2.y, t);
      const z = THREE.MathUtils.lerp(p1.z, p2.z, t);

      // Check if within vertical torso bounds
      if (y >= torsoMinY - 0.05 && y <= torsoMaxY + 0.05) {
        const distXZ = Math.hypot(x - torsoCenterXZ.x, z - torsoCenterXZ.y);
        if (distXZ < minDist) {
          minDist = distXZ;
        }
      }
    }

    if (minDist === Infinity) {
      minDist = 0.5; // Far outside vertical bounds
    }

    if (minDist >= torsoRadius) {
      return {
        status: 'outside body',
        penetrationMm: 0,
        minDist,
      };
    }

    const penetration = (torsoRadius - minDist) * 1000;
    if (minDist < torsoRadius * 0.45) {
      return {
        status: 'deeply inside torso',
        penetrationMm: parseFloat(penetration.toFixed(1)),
        minDist,
      };
    }

    return {
      status: 'intersects torso',
      penetrationMm: parseFloat(penetration.toFixed(1)),
      minDist,
    };
  }

  /**
   * Evaluate complete Arm Path Diagnostics from actual world transforms
   */
  public static evaluateArmPaths(
    transforms: ArmChainWorldTransforms,
    metrics: HumanoidMetrics,
    leftPoleVector: THREE.Vector3,
    rightPoleVector: THREE.Vector3,
    spineWorldPos: THREE.Vector3,
    chestWorldPos: THREE.Vector3
  ): ArmPathDiagnostic {
    const totalH = metrics.height;
    const scaleFactor = totalH / 1.61;

    // Torso collision volume: capsule cylinder from spine to chest
    const torsoCenterXZ = new THREE.Vector2(
      (spineWorldPos.x + chestWorldPos.x) * 0.5,
      (spineWorldPos.z + chestWorldPos.z) * 0.5
    );
    const torsoMinY = Math.min(spineWorldPos.y, chestWorldPos.y) - 0.12 * scaleFactor;
    const torsoMaxY = Math.max(spineWorldPos.y, chestWorldPos.y) + 0.18 * scaleFactor;
    const torsoRadius = 0.135 * scaleFactor; // ~13.5cm radius torso

    // -------------------------------------------------------------------------
    // LEFT ARM EVALUATION
    // -------------------------------------------------------------------------
    const lShoulder = transforms.leftUpperArm; // Joint
    const lElbow = transforms.leftElbow;
    const lWrist = transforms.leftWrist;
    const lHand = transforms.leftHand;

    const lUpperLen = lShoulder.distanceTo(lElbow);
    const lForearmLen = lElbow.distanceTo(lWrist);
    const lHandOffset = lWrist.distanceTo(lHand);

    const neutralLUpper = metrics.upperArmLength.left;
    const neutralLForearm = metrics.forearmLength.left;

    const lUpperStretchPct = ((lUpperLen - neutralLUpper) / neutralLUpper) * 100;
    const lForearmStretchPct = ((lForearmLen - neutralLForearm) / neutralLForearm) * 100;

    // Left Elbow bend angle and direction
    const lUpperVec = new THREE.Vector3().subVectors(lElbow, lShoulder);
    const lForearmVec = new THREE.Vector3().subVectors(lWrist, lElbow);
    const lElbowAngleDeg = THREE.MathUtils.radToDeg(
      lUpperVec.clone().normalize().angleTo(lForearmVec.clone().normalize())
    );

    // Elbow protrusion vector from shoulder-wrist chord
    const lChordMid = new THREE.Vector3().addVectors(lShoulder, lWrist).multiplyScalar(0.5);
    const lElbowDir = new THREE.Vector3().subVectors(lElbow, lChordMid).normalize();

    let lElbowDesc = '';
    if (lElbow.x < 0.04) {
      lElbowDesc = 'Inward / medial (tucked close to chest midline)';
    } else {
      lElbowDesc = 'Outward / lateral (+X anatomical left, under violin)';
    }

    const lUpperTorso = this.testSegmentTorsoIntersection(
      lShoulder,
      lElbow,
      torsoCenterXZ,
      torsoMinY,
      torsoMaxY,
      torsoRadius
    );
    const lForearmTorso = this.testSegmentTorsoIntersection(
      lElbow,
      lWrist,
      torsoCenterXZ,
      torsoMinY,
      torsoMaxY,
      torsoRadius
    );

    const leftArmDiag: ArmSegmentDiagnostic = {
      shoulderPos: lShoulder.clone(),
      elbowPos: lElbow.clone(),
      wristPos: lWrist.clone(),
      handPos: lHand.clone(),
      upperArmLengthMm: parseFloat((lUpperLen * 1000).toFixed(1)),
      forearmLengthMm: parseFloat((lForearmLen * 1000).toFixed(1)),
      handOffsetMm: parseFloat((lHandOffset * 1000).toFixed(1)),
      neutralUpperArmLengthMm: parseFloat((neutralLUpper * 1000).toFixed(1)),
      neutralForearmLengthMm: parseFloat((neutralLForearm * 1000).toFixed(1)),
      upperArmStretchPct: parseFloat(lUpperStretchPct.toFixed(2)),
      forearmStretchPct: parseFloat(lForearmStretchPct.toFixed(2)),
      elbowAngleDeg: parseFloat(lElbowAngleDeg.toFixed(1)),
      elbowDirection: lElbowDir,
      elbowDirectionDescription: lElbowDesc,
      upperArmTorsoIntersection: lUpperTorso.status,
      forearmTorsoIntersection: lForearmTorso.status,
      upperArmPenetrationMm: lUpperTorso.penetrationMm,
      forearmPenetrationMm: lForearmTorso.penetrationMm,
      poleVector: leftPoleVector.clone(),
    };

    // -------------------------------------------------------------------------
    // RIGHT ARM EVALUATION
    // -------------------------------------------------------------------------
    const rShoulder = transforms.rightUpperArm; // Joint
    const rElbow = transforms.rightElbow;
    const rWrist = transforms.rightWrist;
    const rHand = transforms.rightHand;

    const rUpperLen = rShoulder.distanceTo(rElbow);
    const rForearmLen = rElbow.distanceTo(rWrist);
    const rHandOffset = rWrist.distanceTo(rHand);

    const neutralRUpper = metrics.upperArmLength.right;
    const neutralRForearm = metrics.forearmLength.right;

    const rUpperStretchPct = ((rUpperLen - neutralRUpper) / neutralRUpper) * 100;
    const rForearmStretchPct = ((rForearmLen - neutralRForearm) / neutralRForearm) * 100;

    const rUpperVec = new THREE.Vector3().subVectors(rElbow, rShoulder);
    const rForearmVec = new THREE.Vector3().subVectors(rWrist, rElbow);
    const rElbowAngleDeg = THREE.MathUtils.radToDeg(
      rUpperVec.clone().normalize().angleTo(rForearmVec.clone().normalize())
    );

    const rChordMid = new THREE.Vector3().addVectors(rShoulder, rWrist).multiplyScalar(0.5);
    const rElbowDir = new THREE.Vector3().subVectors(rElbow, rChordMid).normalize();

    let rElbowDesc = '';
    if (rElbow.x > 0.0) {
      rElbowDesc = 'Crossing chest into +X (Anatomical Left side through torso)';
    } else {
      rElbowDesc = 'Outward / lateral (-X anatomical right)';
    }

    const rUpperTorso = this.testSegmentTorsoIntersection(
      rShoulder,
      rElbow,
      torsoCenterXZ,
      torsoMinY,
      torsoMaxY,
      torsoRadius
    );
    const rForearmTorso = this.testSegmentTorsoIntersection(
      rElbow,
      rWrist,
      torsoCenterXZ,
      torsoMinY,
      torsoMaxY,
      torsoRadius
    );

    const rightArmDiag: ArmSegmentDiagnostic = {
      shoulderPos: rShoulder.clone(),
      elbowPos: rElbow.clone(),
      wristPos: rWrist.clone(),
      handPos: rHand.clone(),
      upperArmLengthMm: parseFloat((rUpperLen * 1000).toFixed(1)),
      forearmLengthMm: parseFloat((rForearmLen * 1000).toFixed(1)),
      handOffsetMm: parseFloat((rHandOffset * 1000).toFixed(1)),
      neutralUpperArmLengthMm: parseFloat((neutralRUpper * 1000).toFixed(1)),
      neutralForearmLengthMm: parseFloat((neutralRForearm * 1000).toFixed(1)),
      upperArmStretchPct: parseFloat(rUpperStretchPct.toFixed(2)),
      forearmStretchPct: parseFloat(rForearmStretchPct.toFixed(2)),
      elbowAngleDeg: parseFloat(rElbowAngleDeg.toFixed(1)),
      elbowDirection: rElbowDir,
      elbowDirectionDescription: rElbowDesc,
      upperArmTorsoIntersection: rUpperTorso.status,
      forearmTorsoIntersection: rForearmTorso.status,
      upperArmPenetrationMm: rUpperTorso.penetrationMm,
      forearmPenetrationMm: rForearmTorso.penetrationMm,
      poleVector: rightPoleVector.clone(),
    };

    // -------------------------------------------------------------------------
    // REFERENCE COMPARISON (sample_violin.glb)
    // -------------------------------------------------------------------------
    // Normalized sample_violin landmark references scaled to character height:
    const refLeftElbow = new THREE.Vector3(
      0.1295 * scaleFactor,
      1.2031 * scaleFactor,
      0.4968 * scaleFactor
    );
    const refRightElbow = new THREE.Vector3(
      -0.3567 * scaleFactor,
      1.2041 * scaleFactor,
      0.0507 * scaleFactor
    );

    const leftElbowDiffMm = lElbow.distanceTo(refLeftElbow) * 1000;
    const rightElbowDiffMm = rElbow.distanceTo(refRightElbow) * 1000;

    const isMatch = leftElbowDiffMm < 120 && rightElbowDiffMm < 120;

    const poleMirrorStatus =
      rightPoleVector.x > 0
        ? 'POLE MISMATCH: Right pole vector X is +0.75 (pointing to anatomical left/chest) instead of negative X (anatomical right lateral)'
        : 'POLE OK: Right pole vector correctly points outward to negative X';

    const notes: string[] = [];
    if (rUpperTorso.status !== 'outside body' || rForearmTorso.status !== 'outside body') {
      notes.push(
        `Right arm penetrates torso (Upper: ${rUpperTorso.status} [${rUpperTorso.penetrationMm}mm], Forearm: ${rForearmTorso.status} [${rForearmTorso.penetrationMm}mm]).`
      );
    }
    if (rightElbowDiffMm > 150) {
      notes.push(
        `Right elbow is displaced by ${rightElbowDiffMm.toFixed(0)}mm from reference (sample_violin is at -0.357m X, current is at +0.097m X).`
      );
    }

    return {
      leftArm: leftArmDiag,
      rightArm: rightArmDiag,
      boneTransforms: transforms,
      referenceComparison: {
        sampleLeftElbow: refLeftElbow,
        currentLeftElbow: lElbow.clone(),
        leftElbowDiffMm: parseFloat(leftElbowDiffMm.toFixed(1)),
        sampleRightElbow: refRightElbow,
        currentRightElbow: rElbow.clone(),
        rightElbowDiffMm: parseFloat(rightElbowDiffMm.toFixed(1)),
        referenceMatch: isMatch ? 'MATCH' : 'DIFFERENT',
        poleVectorMirroringStatus: poleMirrorStatus,
        notes,
      },
      summary: `Left arm ${lUpperTorso.status}, Right arm ${rUpperTorso.status} (penetration: ${rUpperTorso.penetrationMm}mm). Reference comparison: ${
        isMatch ? 'MATCH' : 'DIFFERENT'
      }.`,
    };
  }
}
