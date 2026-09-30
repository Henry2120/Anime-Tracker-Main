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

  // Load standalone Violin and Bow models from /music-lab/instruments/
  useEffect(() => {
    let isMounted = true;
    const loader = new GLTFLoader();

    const loadViolin = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        '/music-lab/instruments/violin.glb',
        (gltf) => {
          const vGroup = new THREE.Group();
          vGroup.name = 'CanonicalViolinGroup';

          let foundMesh: THREE.Mesh | null = null;
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && !foundMesh) {
              foundMesh = child as THREE.Mesh;
            }
          });

          if (foundMesh) {
            const cloned = (foundMesh as THREE.Mesh).clone(true);
            cloned.position.set(0, 0, 0);
            cloned.quaternion.identity();
            // Scale from cm to SI meters (0.01)
            cloned.scale.set(0.01, 0.01, 0.01);
            cloned.castShadow = true;
            cloned.receiveShadow = true;

            if (cloned.material) {
              const mats = Array.isArray(cloned.material) ? cloned.material : [cloned.material];
              mats.forEach((m) => {
                if (m && 'map' in m && m.map) {
                  (m.map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
                }
                m.needsUpdate = true;
              });
            }

            vGroup.add(cloned);
          }
          resolve(vGroup);
        },
        undefined,
        reject
      );
    });

    const loadBow = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        '/music-lab/instruments/bow.glb',
        (gltf) => {
          const bGroup = new THREE.Group();
          bGroup.name = 'CanonicalBowGroup';

          const bowSubtree = gltf.scene.getObjectByName('Violin_Bowobjcleanermaterialmergergles');
          if (bowSubtree) {
            const cloned = bowSubtree.clone(true);
            cloned.position.set(0, 0, 0);
            cloned.quaternion.identity();
            // Scale from cm to SI meters (0.01)
            cloned.scale.set(0.01, 0.01, 0.01);
            cloned.traverse((child) => {
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
            bGroup.add(cloned);
          } else {
            gltf.scene.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mClone = (child as THREE.Mesh).clone(true);
                mClone.position.set(0, 0, 0);
                mClone.quaternion.identity();
                mClone.scale.set(0.01, 0.01, 0.01);
                bGroup.add(mClone);
              }
            });
          }
          resolve(bGroup);
        },
        undefined,
        reject
      );
    });

    Promise.all([loadViolin, loadBow])
      .then(([vGrp, bGrp]) => {
        if (!isMounted) return;
        setViolinModel(vGrp);
        setBowModel(bGrp);
        setIsAssetLoaded(true);
      })
      .catch((err) => {
        console.warn('Failed to load standalone instruments:', err);
      });

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
