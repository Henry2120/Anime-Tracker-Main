import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';
import {
  RAW_VIOLIN_LANDMARKS,
  RAW_BOW_LANDMARKS,
  extractAnatomicalLandmarks,
  solveInstrumentFitting,
  evaluateDiagnostics,
  InstrumentDiagnosticsData,
  AnatomicalContactLandmarks,
  InstrumentFitSolution,
} from './ViolinCalibration';

export type { InstrumentDiagnosticsData };

export interface ViolinAndBowPropsProps {
  vrm: VRM | null;
  activePreset: 'tpose' | 'violinistBase';
  showViolin?: boolean;
  showBow?: boolean;
  showInstrumentAxes?: boolean;
  showContactDiagnostics?: boolean;
  onDiagnosticsUpdate?: (diag: InstrumentDiagnosticsData | null) => void;
}

/**
 * Independent 3D Instrument Props Component for 3D Character Viewport
 *
 * Implements deterministic anatomical fitting:
 * - Violin is positioned from chin target & left hand support cradle with anatomically calibrated string plane tilt.
 * - Bow is gripped between thumb distal pad and curled index/middle finger cradle, crossing the violin strings
 *   with strict 90.0° orthogonality and hair resting flush on the strings (zero gap, zero palm penetration).
 */
export const ViolinAndBowProps: React.FC<ViolinAndBowPropsProps> = ({
  vrm,
  activePreset,
  showViolin = true,
  showBow = true,
  showInstrumentAxes = false,
  showContactDiagnostics = false,
  onDiagnosticsUpdate,
}) => {
  const violinRootRef = useRef<THREE.Group>(null);
  const bowRootRef = useRef<THREE.Group>(null);

  const [violinModel, setViolinModel] = useState<THREE.Group | null>(null);
  const [bowModel, setBowModel] = useState<THREE.Group | null>(null);
  const [isAssetLoaded, setIsAssetLoaded] = useState(false);

  // Load raw GLB asset and extract pristine Violin and Bow subtrees
  useEffect(() => {
    let isMounted = true;
    const loader = new GLTFLoader();

    loader.load(
      '/music-lab/musicians/violinist.glb',
      (gltf) => {
        if (!isMounted) return;

        const originalViolin = gltf.scene.getObjectByName('Violin_Instrument');
        const originalBow = gltf.scene.getObjectByName('Violin_Bow');

        if (originalViolin) {
          const vClone = originalViolin.clone(true) as THREE.Group;
          // Reset local position & rotation of root node so children define pristine local space:
          vClone.position.set(0, 0, 0);
          vClone.quaternion.identity();
          vClone.scale.set(1, 1, 1);

          vClone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (mesh.material) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach((m) => {
                  if (m && 'map' in m && m.map) {
                    (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                  }
                  m.needsUpdate = true;
                });
              }
            }
          });

          setViolinModel(vClone);
        }

        if (originalBow) {
          const bClone = originalBow.clone(true) as THREE.Group;
          // Reset local position & rotation of root node so children define pristine local space:
          bClone.position.set(0, 0, 0);
          bClone.quaternion.identity();
          bClone.scale.set(1, 1, 1);

          bClone.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              if (mesh.material) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach((m) => {
                  if (m && 'map' in m && m.map) {
                    (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                  }
                  m.needsUpdate = true;
                });
              }
            }
          });

          setBowModel(bClone);
        }

        setIsAssetLoaded(true);
      },
      undefined,
      (err) => {
        console.warn('Failed to load violinist.glb', err);
      }
    );

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute canonical fitting solution dynamically from posed character landmarks
  const anatomicalLandmarks = useMemo<AnatomicalContactLandmarks | null>(() => {
    if (!vrm) return null;
    return extractAnatomicalLandmarks(vrm);
  }, [vrm, activePreset]);

  const fitSolution = useMemo<InstrumentFitSolution | null>(() => {
    if (!anatomicalLandmarks) return null;
    return solveInstrumentFitting(anatomicalLandmarks);
  }, [anatomicalLandmarks]);

  // Apply solved deterministic transforms onto ViolinRoot and BowRoot
  useEffect(() => {
    if (!fitSolution) return;

    if (violinRootRef.current) {
      violinRootRef.current.position.copy(fitSolution.violinPosition);
      violinRootRef.current.quaternion.copy(fitSolution.violinQuaternion);
      violinRootRef.current.updateMatrixWorld(true);
    }

    if (bowRootRef.current) {
      bowRootRef.current.position.copy(fitSolution.bowPosition);
      bowRootRef.current.quaternion.copy(fitSolution.bowQuaternion);
      bowRootRef.current.updateMatrixWorld(true);
    }
  }, [fitSolution, activePreset, isAssetLoaded]);

  // Evaluate comprehensive diagnostics
  const diagnostics = useMemo<InstrumentDiagnosticsData | null>(() => {
    if (!fitSolution || !anatomicalLandmarks || !isAssetLoaded) return null;
    return evaluateDiagnostics(fitSolution, anatomicalLandmarks);
  }, [fitSolution, anatomicalLandmarks, isAssetLoaded]);

  useEffect(() => {
    onDiagnosticsUpdate?.(diagnostics);
  }, [diagnostics, onDiagnosticsUpdate]);

  // Visibility based on active preset & toggles
  const isVisiblePreset = activePreset === 'violinistBase';
  const shouldRenderViolin = isVisiblePreset && isAssetLoaded && !!violinModel && showViolin;
  const shouldRenderBow = isVisiblePreset && isAssetLoaded && !!bowModel && showBow;

  return (
    <>
      {/* 1. Canonical Violin Root */}
      <group
        ref={violinRootRef}
        name="CanonicalViolinRoot"
        position={fitSolution?.violinPosition || [0, 0, 0]}
        quaternion={fitSolution?.violinQuaternion || [0, 0, 0, 1]}
        visible={shouldRenderViolin}
      >
        {violinModel && <primitive object={violinModel} />}
        {showInstrumentAxes && <axesHelper args={[0.25]} />}
      </group>

      {/* 2. Canonical Bow Root */}
      <group
        ref={bowRootRef}
        name="CanonicalBowRoot"
        position={fitSolution?.bowPosition || [0, 0, 0]}
        quaternion={fitSolution?.bowQuaternion || [0, 0, 0, 1]}
        visible={shouldRenderBow}
      >
        {bowModel && <primitive object={bowModel} />}
        {showInstrumentAxes && <axesHelper args={[0.25]} />}
      </group>

      {/* 3. Calibration & Contact Visual Markers */}
      {showContactDiagnostics && diagnostics && anatomicalLandmarks && isVisiblePreset && (
        <group name="InstrumentCalibrationMarkers">
          {/* Violin Contact Markers */}
          {showViolin && (
            <>
              {/* Chinrest Marker (Cyan) & Chin Target (Yellow Wireframe) */}
              <mesh position={diagnostics.chinrestPos}>
                <sphereGeometry args={[0.009, 16, 16]} />
                <meshBasicMaterial color="#00F0FF" />
              </mesh>
              <mesh position={anatomicalLandmarks.chinContactTarget}>
                <sphereGeometry args={[0.007, 16, 16]} />
                <meshBasicMaterial color="#FBBF24" wireframe />
              </mesh>

              {/* Shoulder Support Back (Blue) & Shoulder Shelf Target (Sky) */}
              {diagnostics.wShoulderBack && (
                <mesh position={diagnostics.wShoulderBack}>
                  <sphereGeometry args={[0.009, 16, 16]} />
                  <meshBasicMaterial color="#3B82F6" />
                </mesh>
              )}
              <mesh position={anatomicalLandmarks.shoulderShelfTarget}>
                <sphereGeometry args={[0.007, 16, 16]} />
                <meshBasicMaterial color="#60A5FA" wireframe />
              </mesh>

              {/* Neck Center (Emerald) & Left Cradle Target (Lime Wireframe) */}
              <mesh position={diagnostics.violinNeckPos}>
                <sphereGeometry args={[0.010, 16, 16]} />
                <meshBasicMaterial color="#10B981" />
              </mesh>
              <mesh position={anatomicalLandmarks.leftHandCradleTarget}>
                <sphereGeometry args={[0.008, 16, 16]} />
                <meshBasicMaterial color="#84CC16" wireframe />
              </mesh>

              {/* Scroll / Head Tip (Teal) */}
              {diagnostics.wScrollTip && (
                <mesh position={diagnostics.wScrollTip}>
                  <sphereGeometry args={[0.009, 16, 16]} />
                  <meshBasicMaterial color="#14B8A6" />
                </mesh>
              )}

              {/* Playable String Lane (Pink) */}
              {diagnostics.wPlayableStrings && (
                <mesh position={diagnostics.wPlayableStrings}>
                  <sphereGeometry args={[0.008, 16, 16]} />
                  <meshBasicMaterial color="#EC4899" />
                </mesh>
              )}
            </>
          )}

          {/* Bow Contact Markers */}
          {showBow && (
            <>
              {/* Bow Frog (Orange) */}
              <mesh position={diagnostics.bowFrogPos}>
                <sphereGeometry args={[0.009, 16, 16]} />
                <meshBasicMaterial color="#F97316" />
              </mesh>

              {/* Bow Grip (Amber) & Right Grip Target (Gold Wireframe) */}
              {diagnostics.wBowGrip && (
                <mesh position={diagnostics.wBowGrip}>
                  <sphereGeometry args={[0.009, 16, 16]} />
                  <meshBasicMaterial color="#F59E0B" />
                </mesh>
              )}
              <mesh position={anatomicalLandmarks.rightGripTarget}>
                <sphereGeometry args={[0.008, 16, 16]} />
                <meshBasicMaterial color="#FDE047" wireframe />
              </mesh>

              {/* Right Palm Center (Purple Wireframe) - Visualizing Clear separation from bow */}
              <mesh position={anatomicalLandmarks.rightPalmCenter}>
                <sphereGeometry args={[0.008, 16, 16]} />
                <meshBasicMaterial color="#A855F7" wireframe />
              </mesh>

              {/* Bow Hair Contact Point on Strings (Magenta) */}
              {diagnostics.wBowHairContact && (
                <mesh position={diagnostics.wBowHairContact}>
                  <sphereGeometry args={[0.008, 16, 16]} />
                  <meshBasicMaterial color="#D946EF" />
                </mesh>
              )}

              {/* Bow Tip (White) */}
              {diagnostics.wBowTip && (
                <mesh position={diagnostics.wBowTip}>
                  <sphereGeometry args={[0.007, 16, 16]} />
                  <meshBasicMaterial color="#FFFFFF" />
                </mesh>
              )}
            </>
          )}
        </group>
      )}
    </>
  );
};
