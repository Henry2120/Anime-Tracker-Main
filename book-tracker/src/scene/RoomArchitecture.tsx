import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BookshelfPosition } from '../types/domain';
import {
  BOOKCASE_DIMENSIONS,
  BOOKCASE_TRANSFORMS,
} from './bookcaseLayout';
import type { ArchiveMaterialLibrary } from './proceduralMaterials';

interface RoomArchitectureProps {
  materials: ArchiveMaterialLibrary;
  lanternWarmth: boolean;
  shadowsEnabled: boolean;
  activeViewpoint: 'room' | 'computer' | 'shelf_left' | 'shelf_middle' | 'shelf_right' | 'inspect_book';
  highlightedShelf: BookshelfPosition | null;
  onSelectBookshelf: (pos: BookshelfPosition) => void;
  onOpenComputer: () => void;
  onToggleLantern: () => void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function createTransformedBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
  rx = 0
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  _e.set(rx, ry, 0);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(1, 1, 1);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

function createBookcaseBox(
  tf: { position: [number, number, number]; rotationY: number },
  w: number,
  h: number,
  d: number,
  lx: number,
  ly: number,
  lz: number
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(lx, ly, lz);
  _e.set(0, tf.rotationY, 0);
  _q.setFromEuler(_e);
  _p.set(tf.position[0], tf.position[1], tf.position[2]);
  _s.set(1, 1, 1);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

function createMergedGroupGeometry(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BoxGeometry(0.1, 0.1, 0.1);
}

function BookcaseInteractiveCrown({
  position,
  materials,
  clickableAsBay,
  highlighted,
  onClick,
}: {
  position: BookshelfPosition;
  materials: ArchiveMaterialLibrary;
  clickableAsBay: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  const tf = BOOKCASE_TRANSFORMS[position];
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!clickableAsBay && hovered) {
      setHovered(false);
    }
  }, [clickableAsBay, hovered]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (hovered && clickableAsBay) {
      document.body.style.cursor = 'pointer';
      return () => {
        document.body.style.cursor = 'auto';
      };
    }
  }, [hovered, clickableAsBay]);

  const { width, height, depth } = BOOKCASE_DIMENSIONS;

  return (
    <group position={tf.position} rotation={[0, tf.rotationY, 0]}>
      {/* Engraved Brass Library Crown Plaque */}
      <mesh
        position={[0, height - 0.05, depth / 2 + 0.05]}
        scale={[0.38, 0.048, 0.012]}
        material={
          hovered || highlighted ? materials.brassMat : materials.brassDarkMat
        }
      >
        <boxGeometry args={[1, 1, 1]} />
      </mesh>

      {/* Subtle Warm Hover / Target Highlight Rim */}
      {(hovered || highlighted) && (
        <mesh position={[0, height / 2, depth / 2 + 0.03]}>
          <planeGeometry args={[width + 0.02, height]} />
          <meshBasicMaterial
            color="#d6bd8a"
            transparent
            opacity={highlighted ? 0.12 : 0.06}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Simplified Raycast Proxy when Room or Computer Camera is Active */}
      {clickableAsBay && (
        <mesh
          position={[0, height / 2, depth / 2 + 0.04]}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function RoomArchitecture({
  materials,
  lanternWarmth,
  shadowsEnabled,
  activeViewpoint,
  highlightedShelf,
  onSelectBookshelf,
  onOpenComputer,
  onToggleLantern,
}: RoomArchitectureProps) {
  const [monitorHovered, setMonitorHovered] = useState(false);
  const [lampHovered, setLampHovered] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (monitorHovered || lampHovered) {
      document.body.style.cursor = 'pointer';
      return () => {
        document.body.style.cursor = 'auto';
      };
    }
  }, [monitorHovered, lampHovered]);

  // Shared unit primitives + batched architectural meshes (cuts draw calls from ~90 down to ~22!)
  const {
    mergedWalnutGeo,
    mergedWalnutDarkGeo,
    mergedWainscotGeo,
    mergedBrassDarkGeo,
    mergedBrassBrightGeo,
    lampNeckGeo,
    unitBoxGeo,
    deskGreenBookMat,
    deskCrimsonBookMat,
  } = useMemo(() => {
    const { width, height, depth } = BOOKCASE_DIMENSIONS;
    const sideThick = 0.048;
    const innerW = width - sideThick * 2;
    const shelfYCenters = [1.84, 1.32, 0.80, 0.28];

    const walnutParts: THREE.BufferGeometry[] = [];
    const walnutDarkParts: THREE.BufferGeometry[] = [];
    const wainscotParts: THREE.BufferGeometry[] = [];
    const brassDarkParts: THREE.BufferGeometry[] = [];
    const brassBrightParts: THREE.BufferGeometry[] = [];

    // 1. Batch all 3 physical walnut bookcases into single merged draw calls
    for (const pos of ['left', 'middle', 'right'] as BookshelfPosition[]) {
      const tf = BOOKCASE_TRANSFORMS[pos];
      walnutDarkParts.push(
        createBookcaseBox(tf, width - 0.02, height - 0.06, 0.024, 0, height / 2, -depth / 2 + 0.015),
        createBookcaseBox(tf, width + 0.03, 0.14, depth + 0.02, 0, 0.07, 0.01),
        createBookcaseBox(tf, width + 0.12, 0.035, depth + 0.07, 0, height + 0.015, 0.03)
      );

      walnutParts.push(
        createBookcaseBox(tf, sideThick, height, depth, -width / 2 + sideThick / 2, height / 2, 0),
        createBookcaseBox(tf, sideThick, height, depth, width / 2 - sideThick / 2, height / 2, 0),
        createBookcaseBox(tf, 0.044, 2.18, depth - 0.03, 0, 1.24, 0.01),
        createBookcaseBox(tf, width + 0.08, 0.1, depth + 0.05, 0, height - 0.05, 0.02)
      );
      for (const sy of shelfYCenters) {
        walnutParts.push(createBookcaseBox(tf, innerW, 0.034, depth - 0.02, 0, sy, 0.01));
      }
    }

    // 2. Room ceiling beams & gothic window mullions + wainscoting
    for (const bz of [-2.8, -0.8, 1.2]) {
      walnutParts.push(createTransformedBox(9.4, 0.22, 0.22, 0, 4.32, bz));
    }

    wainscotParts.push(
      createTransformedBox(10.2, 1.04, 0.05, 0, 0.52, -4.41),
      createTransformedBox(0.05, 1.04, 9.4, -4.51, 0.52, -0.4),
      createTransformedBox(0.05, 1.04, 9.4, 4.51, 0.52, -0.4)
    );

    walnutDarkParts.push(
      createTransformedBox(1.82, 2.35, 0.04, 0, 2.95, -4.41),
      createTransformedBox(0.05, 2.14, 0.03, 0, 2.95, -4.355),
      createTransformedBox(0.035, 2.14, 0.03, -0.42, 2.95, -4.355),
      createTransformedBox(0.035, 2.14, 0.03, 0.42, 2.95, -4.355),
      createTransformedBox(1.58, 0.04, 0.03, 0, 3.3, -4.355)
    );

    // 3. Foreground wooden desk structural parts (desk group offset z = 0.86)
    const dz = 0.86;
    walnutParts.push(
      createTransformedBox(1.92, 0.052, 0.8, 0, 0.75, dz),
      createTransformedBox(0.36, 0.34, 0.68, -0.71, 0.53, dz),
      createTransformedBox(0.36, 0.34, 0.68, 0.71, 0.53, dz)
    );
    walnutDarkParts.push(
      createTransformedBox(1.74, 0.09, 0.68, 0, 0.68, dz),
      createTransformedBox(0.055, 0.72, 0.055, -0.86, 0.36, dz - 0.32),
      createTransformedBox(0.055, 0.72, 0.055, 0.86, 0.36, dz - 0.32),
      createTransformedBox(0.055, 0.72, 0.055, -0.86, 0.36, dz + 0.32),
      createTransformedBox(0.055, 0.72, 0.055, 0.86, 0.36, dz + 0.32),
      // Keyboard frame
      createTransformedBox(0.38, 0.016, 0.135, 0, 0.785, dz + 0.12, 0, 0.08)
    );

    // Brass dark ferrules & desktop edge molding
    brassDarkParts.push(
      createTransformedBox(1.92, 0.012, 0.008, 0, 0.728, dz + 0.402),
      createTransformedBox(0.06, 0.05, 0.06, -0.86, 0.025, dz - 0.32),
      createTransformedBox(0.06, 0.05, 0.06, 0.86, 0.025, dz - 0.32),
      createTransformedBox(0.06, 0.05, 0.06, -0.86, 0.025, dz + 0.32),
      createTransformedBox(0.06, 0.05, 0.06, 0.86, 0.025, dz + 0.32)
    );

    // Bright brass drawer pulls & hanging brass pen
    brassBrightParts.push(
      createTransformedBox(0.12, 0.018, 0.018, -0.71, 0.6, dz + 0.345),
      createTransformedBox(0.12, 0.018, 0.018, -0.71, 0.44, dz + 0.345),
      createTransformedBox(0.12, 0.018, 0.018, 0.71, 0.6, dz + 0.345),
      createTransformedBox(0.12, 0.018, 0.018, 0.71, 0.44, dz + 0.345)
    );

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0, 0.23, -0.02),
      new THREE.Vector3(0.03, 0.34, 0.02),
      new THREE.Vector3(0.08, 0.32, 0.07),
    ]);

    return {
      mergedWalnutGeo: createMergedGroupGeometry(walnutParts),
      mergedWalnutDarkGeo: createMergedGroupGeometry(walnutDarkParts),
      mergedWainscotGeo: createMergedGroupGeometry(wainscotParts),
      mergedBrassDarkGeo: createMergedGroupGeometry(brassDarkParts),
      mergedBrassBrightGeo: createMergedGroupGeometry(brassBrightParts),
      lampNeckGeo: new THREE.TubeGeometry(curve, 14, 0.009, 7, false),
      unitBoxGeo: new THREE.BoxGeometry(1, 1, 1),
      deskGreenBookMat: new THREE.MeshStandardMaterial({ color: '#1f3b32', roughness: 0.72 }),
      deskCrimsonBookMat: new THREE.MeshStandardMaterial({ color: '#4e242a', roughness: 0.7 }),
    };
  }, []);

  useEffect(() => {
    return () => {
      mergedWalnutGeo.dispose();
      mergedWalnutDarkGeo.dispose();
      mergedWainscotGeo.dispose();
      mergedBrassDarkGeo.dispose();
      mergedBrassBrightGeo.dispose();
      lampNeckGeo.dispose();
      unitBoxGeo.dispose();
      deskGreenBookMat.dispose();
      deskCrimsonBookMat.dispose();
    };
  }, [
    mergedWalnutGeo,
    mergedWalnutDarkGeo,
    mergedWainscotGeo,
    mergedBrassDarkGeo,
    mergedBrassBrightGeo,
    lampNeckGeo,
    unitBoxGeo,
    deskGreenBookMat,
    deskCrimsonBookMat,
  ]);

  const bayClickEnabled = activeViewpoint === 'room' || activeViewpoint === 'computer';

  return (
    <group>
      {/* Batched Architectural Walnut, Dark Trim, Wainscot & Brass Meshes */}
      <mesh
        geometry={mergedWalnutGeo}
        material={materials.walnutMat}
        castShadow={shadowsEnabled}
        receiveShadow={shadowsEnabled}
      />
      <mesh
        geometry={mergedWalnutDarkGeo}
        material={materials.walnutDarkMat}
        receiveShadow={shadowsEnabled}
      />
      <mesh geometry={mergedWainscotGeo} material={materials.wainscotMat} />
      <mesh geometry={mergedBrassDarkGeo} material={materials.brassDarkMat} />
      <mesh geometry={mergedBrassBrightGeo} material={materials.brassMat} />

      {/* Floor, Runner Rug, Stone Walls & Ceiling */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -0.4]}
        material={materials.floorParquetMat}
        receiveShadow={shadowsEnabled}
      >
        <planeGeometry args={[10.5, 9.6]} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.008, -0.9]}
        material={materials.runnerRugMat}
        receiveShadow={shadowsEnabled}
      >
        <planeGeometry args={[1.95, 5.2]} />
      </mesh>
      <mesh
        position={[0, 2.25, -4.45]}
        material={materials.stoneWallMat}
        receiveShadow={shadowsEnabled}
      >
        <planeGeometry args={[10.5, 4.7]} />
      </mesh>
      <mesh
        position={[-4.55, 2.25, -0.4]}
        rotation={[0, Math.PI / 2, 0]}
        material={materials.stoneWallMat}
        receiveShadow={shadowsEnabled}
      >
        <planeGeometry args={[9.6, 4.7]} />
      </mesh>
      <mesh
        position={[4.55, 2.25, -0.4]}
        rotation={[0, -Math.PI / 2, 0]}
        material={materials.stoneWallMat}
        receiveShadow={shadowsEnabled}
      >
        <planeGeometry args={[9.6, 4.7]} />
      </mesh>
      <mesh
        position={[0, 2.25, 4.1]}
        rotation={[0, Math.PI, 0]}
        material={materials.stoneWallMat}
      >
        <planeGeometry args={[10.5, 4.7]} />
      </mesh>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 4.45, -0.4]}
        material={materials.walnutDarkMat}
      >
        <planeGeometry args={[10.5, 9.6]} />
      </mesh>

      {/* Gothic Moonlit Window Pane & Light Shaft */}
      <mesh position={[0, 2.95, -4.372]} material={materials.moonGlassMat}>
        <planeGeometry args={[1.56, 2.12]} />
      </mesh>
      <mesh position={[0, 2.1, -2.55]} rotation={[-0.42, 0, 0]}>
        <planeGeometry args={[1.85, 4.2]} />
        <meshBasicMaterial
          color="#8bb1eb"
          transparent
          opacity={0.042}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Hanging Brass Archive Chandelier / Lantern */}
      <group position={[0, 3.35, -0.8]}>
        <mesh position={[0, 0.5, 0]} material={materials.brassDarkMat}>
          <cylinderGeometry args={[0.012, 0.012, 1.0, 8]} />
        </mesh>
        <mesh position={[0, 0, 0]} material={materials.brassMat}>
          <cylinderGeometry args={[0.16, 0.12, 0.05, 12]} />
        </mesh>
        <mesh position={[0, -0.14, 0]}>
          <cylinderGeometry args={[0.11, 0.09, 0.24, 8]} />
          <meshStandardMaterial
            color={lanternWarmth ? '#f2c16b' : '#85aae6'}
            emissive={lanternWarmth ? '#e59d3c' : '#5884cf'}
            emissiveIntensity={0.9}
            roughness={0.3}
          />
        </mesh>
        <mesh position={[0, -0.28, 0]} material={materials.brassMat}>
          <coneGeometry args={[0.12, 0.07, 12]} />
        </mesh>
      </group>

      {/* Interactive Bookcase Crown Plaques & Click Raycast Bays */}
      {(['left', 'middle', 'right'] as BookshelfPosition[]).map((pos) => (
        <BookcaseInteractiveCrown
          key={pos}
          position={pos}
          materials={materials}
          clickableAsBay={bayClickEnabled}
          highlighted={highlightedShelf === pos}
          onClick={() => onSelectBookshelf(pos)}
        />
      ))}

      {/* Desk Accessories, Physical Computer Workstation & Banker Lamp */}
      <group position={[0, 0, 0.86]}>
        {/* Leather Blotter & Parchment */}
        <mesh
          geometry={unitBoxGeo}
          position={[0, 0.779, 0.08]}
          scale={[0.84, 0.006, 0.44]}
          material={materials.blotterMat}
          receiveShadow={shadowsEnabled}
        />
        <mesh
          geometry={unitBoxGeo}
          position={[-0.31, 0.785, 0.14]}
          rotation={[0, 0.16, 0]}
          scale={[0.15, 0.003, 0.21]}
          material={materials.parchmentMat}
        />
        <mesh
          position={[-0.22, 0.79, 0.16]}
          rotation={[Math.PI / 2, 0, -0.35]}
          material={materials.brassMat}
        >
          <cylinderGeometry args={[0.004, 0.003, 0.14, 8]} />
        </mesh>

        {/* PHYSICAL COMPUTER MONITOR & KEYBOARD (Clickable Workstation) */}
        <group
          position={[0, 0.776, -0.18]}
          onClick={(e) => {
            e.stopPropagation();
            onOpenComputer();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setMonitorHovered(true);
          }}
          onPointerOut={() => setMonitorHovered(false)}
        >
          <mesh
            geometry={unitBoxGeo}
            position={[0, 0.01, 0.02]}
            scale={[0.28, 0.018, 0.18]}
            material={materials.slateMonitorMat}
          />
          <mesh
            geometry={unitBoxGeo}
            position={[0, 0.11, -0.02]}
            scale={[0.055, 0.2, 0.04]}
            material={materials.brassDarkMat}
          />
          <group position={[0, 0.285, 0]} rotation={[-0.06, 0, 0]}>
            <mesh
              geometry={unitBoxGeo}
              scale={[0.68, 0.41, 0.036]}
              material={materials.slateMonitorMat}
              castShadow={shadowsEnabled}
            />
            <mesh
              geometry={unitBoxGeo}
              position={[0, 0, 0.002]}
              scale={[0.692, 0.422, 0.024]}
              material={
                monitorHovered ? materials.brassMat : materials.brassDarkMat
              }
            />
            <mesh
              position={[0, 0.008, 0.019]}
              material={materials.monitorScreenMat}
            >
              <planeGeometry args={[0.625, 0.355]} />
            </mesh>
          </group>
        </group>

        {/* Keycap block & Mouse (clickable too) */}
        <group
          position={[0, 0.785, 0.12]}
          onClick={(e) => {
            e.stopPropagation();
            onOpenComputer();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setMonitorHovered(true);
          }}
          onPointerOut={() => setMonitorHovered(false)}
        >
          <mesh
            geometry={unitBoxGeo}
            position={[0, 0.012, 0]}
            rotation={[0.08, 0, 0]}
            scale={[0.34, 0.008, 0.1]}
            material={materials.keycapMat}
          />
          <mesh
            position={[0.26, 0.01, 0.01]}
            scale={[1, 0.65, 1.45]}
            material={materials.slateMonitorMat}
          >
            <sphereGeometry args={[0.032, 10, 8]} />
          </mesh>
        </group>

        {/* PHYSICAL BRASS BANKER DESK LAMP (Clickable Warm/Moonlight Switch) */}
        <group
          position={[-0.72, 0.776, -0.09]}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLantern();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setLampHovered(true);
          }}
          onPointerOut={() => setLampHovered(false)}
        >
          <mesh position={[0, 0.012, 0]} material={materials.brassMat}>
            <cylinderGeometry args={[0.085, 0.095, 0.024, 16]} />
          </mesh>
          <mesh geometry={lampNeckGeo} material={materials.brassMat} />
          <mesh
            position={[0.085, 0.315, 0.075]}
            rotation={[0.35, -0.45, Math.PI / 2]}
            material={materials.emeraldShadeMat}
          >
            <cylinderGeometry args={[0.056, 0.056, 0.17, 12, 1, true, 0, Math.PI]} />
          </mesh>
          <mesh position={[0.085, 0.295, 0.075]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshBasicMaterial color={lanternWarmth ? '#ffd280' : '#9cc1ff'} />
          </mesh>
          {lampHovered && (
            <mesh position={[0, 0.18, 0]}>
              <sphereGeometry args={[0.16, 10, 8]} />
              <meshBasicMaterial
                color={lanternWarmth ? '#f2c679' : '#7797c9'}
                transparent
                opacity={0.08}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>

        {/* Inkwell + Stacked Reference Books */}
        <mesh position={[-0.53, 0.798, -0.12]} material={materials.brassDarkMat}>
          <cylinderGeometry args={[0.024, 0.03, 0.044, 10]} />
        </mesh>
        <group position={[0.68, 0.776, -0.02]}>
          <mesh
            geometry={unitBoxGeo}
            position={[0, 0.018, 0]}
            rotation={[0, -0.12, 0]}
            scale={[0.19, 0.034, 0.25]}
            material={deskGreenBookMat}
          />
          <mesh
            geometry={unitBoxGeo}
            position={[0.01, 0.05, 0.01]}
            rotation={[0, 0.08, 0]}
            scale={[0.17, 0.03, 0.23]}
            material={deskCrimsonBookMat}
          />
        </group>
      </group>
    </group>
  );
}
