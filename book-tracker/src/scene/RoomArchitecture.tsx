import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BookshelfPosition } from '../types/domain';
import {
  BOOKCASE_DIMENSIONS,
  BOOKCASE_TRANSFORMS,
} from './bookcaseLayout';
import type { ArchiveMaterialLibrary } from './proceduralMaterials';
import type { SceneAtmosphereProfile } from './themeAtmosphere';

interface RoomArchitectureProps {
  materials: ArchiveMaterialLibrary;
  atmosphere: SceneAtmosphereProfile;
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
const NOOP_RAYCAST = () => null;

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
        <mesh position={[0, height / 2, depth / 2 + 0.03]} raycast={NOOP_RAYCAST}>
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
  atmosphere,
  lanternWarmth,
  shadowsEnabled,
  activeViewpoint,
  highlightedShelf,
  onSelectBookshelf,
  onOpenComputer,
  onToggleLantern,
}: RoomArchitectureProps) {
  const [laptopHovered, setLaptopHovered] = useState(false);
  const [lampHovered, setLampHovered] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (laptopHovered || lampHovered) {
      document.body.style.cursor = 'pointer';
      return () => {
        document.body.style.cursor = 'auto';
      };
    }
  }, [laptopHovered, lampHovered]);

  const {
    mergedWalnutGeo,
    mergedWalnutDarkGeo,
    mergedWainscotGeo,
    mergedBrassDarkGeo,
    mergedBrassBrightGeo,
    lampBaseGeo,
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

    // 2. Room ceiling beams, wainscoting, and WIDE triple-bay mullioned library window
    for (const bz of [-2.8, -0.8, 1.2]) {
      walnutParts.push(createTransformedBox(9.4, 0.22, 0.22, 0, 4.32, bz));
    }

    wainscotParts.push(
      createTransformedBox(10.2, 1.04, 0.05, 0, 0.52, -4.41),
      createTransformedBox(0.05, 1.04, 9.4, -4.51, 0.52, -0.4),
      createTransformedBox(0.05, 1.04, 9.4, 4.51, 0.52, -0.4)
    );

    // Wide architectural window casing, deep sill, vertical pilasters & muntins (3.9m wide x 2.18m high)
    walnutParts.push(
      createTransformedBox(4.18, 0.068, 0.16, 0, 1.88, -4.36), // Molded window sill
      createTransformedBox(4.14, 0.09, 0.12, 0, 4.09, -4.38), // Upper window header cornice
      createTransformedBox(0.11, 2.26, 0.12, -2.01, 2.98, -4.38), // Left jamb
      createTransformedBox(0.11, 2.26, 0.12, 2.01, 2.98, -4.38) // Right jamb
    );
    walnutDarkParts.push(
      // Main bay dividers & delicate lattice mullions
      createTransformedBox(0.065, 2.16, 0.075, -0.66, 2.98, -4.375),
      createTransformedBox(0.065, 2.16, 0.075, 0.66, 2.98, -4.375),
      createTransformedBox(0.03, 2.16, 0.04, -1.32, 2.98, -4.375),
      createTransformedBox(0.03, 2.16, 0.04, 0, 2.98, -4.375),
      createTransformedBox(0.03, 2.16, 0.04, 1.32, 2.98, -4.375),
      createTransformedBox(3.92, 0.042, 0.045, 0, 3.55, -4.375),
      createTransformedBox(3.92, 0.034, 0.04, 0, 2.75, -4.375)
    );

    // 3. Detailed Executive Walnut Desk (centered at z = 0.86, tabletop top surface y = 0.776)
    const dz = 0.86;
    walnutParts.push(
      // Main beveled tabletop slab (y: 0.736..0.776) + stepped top edge apron
      createTransformedBox(1.94, 0.036, 0.82, 0, 0.758, dz),
      createTransformedBox(1.88, 0.022, 0.76, 0, 0.732, dz),
      // Twin drawer pedestals with carved front drawer faces
      createTransformedBox(0.38, 0.36, 0.66, -0.71, 0.51, dz),
      createTransformedBox(0.38, 0.36, 0.66, 0.71, 0.51, dz),
      // Left & right raised drawer fronts (facing the seated user at +z)
      createTransformedBox(0.33, 0.135, 0.02, -0.71, 0.59, dz + 0.335),
      createTransformedBox(0.33, 0.145, 0.02, -0.71, 0.43, dz + 0.335),
      createTransformedBox(0.33, 0.135, 0.02, 0.71, 0.59, dz + 0.335),
      createTransformedBox(0.33, 0.145, 0.02, 0.71, 0.43, dz + 0.335),
      // Center pencil drawer face & recessed knee-hole rail
      createTransformedBox(0.96, 0.082, 0.02, 0, 0.665, dz + 0.32),
      // Side panel stretchers
      createTransformedBox(0.036, 0.045, 0.62, -0.87, 0.14, dz),
      createTransformedBox(0.036, 0.045, 0.62, 0.87, 0.14, dz)
    );

    walnutDarkParts.push(
      // Under-tabletop shadow molding & modesty back panel
      createTransformedBox(1.80, 0.088, 0.64, 0, 0.675, dz),
      createTransformedBox(1.66, 0.36, 0.025, 0, 0.51, dz - 0.31),
      // Four sturdy tapered corner legs + pedestal inner stiles
      createTransformedBox(0.062, 0.72, 0.062, -0.87, 0.36, dz - 0.31),
      createTransformedBox(0.062, 0.72, 0.062, 0.87, 0.36, dz - 0.31),
      createTransformedBox(0.062, 0.72, 0.062, -0.87, 0.36, dz + 0.31),
      createTransformedBox(0.062, 0.72, 0.062, 0.87, 0.36, dz + 0.31),
      createTransformedBox(0.048, 0.72, 0.048, -0.53, 0.36, dz + 0.31),
      createTransformedBox(0.048, 0.72, 0.048, 0.53, 0.36, dz + 0.31)
    );

    // Brass dark edge trim & protective leg ferrules
    brassDarkParts.push(
      createTransformedBox(1.94, 0.01, 0.008, 0, 0.742, dz + 0.412),
      createTransformedBox(0.068, 0.055, 0.068, -0.87, 0.0275, dz - 0.31),
      createTransformedBox(0.068, 0.055, 0.068, 0.87, 0.0275, dz - 0.31),
      createTransformedBox(0.068, 0.055, 0.068, -0.87, 0.0275, dz + 0.31),
      createTransformedBox(0.068, 0.055, 0.068, 0.87, 0.0275, dz + 0.31),
      createTransformedBox(0.054, 0.05, 0.054, -0.53, 0.025, dz + 0.31),
      createTransformedBox(0.054, 0.05, 0.054, 0.53, 0.025, dz + 0.31)
    );

    // Bright brass drawer pulls & center knob
    brassBrightParts.push(
      createTransformedBox(0.11, 0.016, 0.018, -0.71, 0.59, dz + 0.352),
      createTransformedBox(0.11, 0.016, 0.018, -0.71, 0.43, dz + 0.352),
      createTransformedBox(0.11, 0.016, 0.018, 0.71, 0.59, dz + 0.352),
      createTransformedBox(0.11, 0.016, 0.018, 0.71, 0.43, dz + 0.352),
      createTransformedBox(0.075, 0.014, 0.016, 0, 0.665, dz + 0.336)
    );

    // Classic stepped LatheGeometry brass banker lamp base
    const baseProfile = [
      new THREE.Vector2(0.001, 0.0),
      new THREE.Vector2(0.095, 0.0),
      new THREE.Vector2(0.095, 0.01),
      new THREE.Vector2(0.082, 0.014),
      new THREE.Vector2(0.078, 0.022),
      new THREE.Vector2(0.056, 0.026),
      new THREE.Vector2(0.044, 0.036),
      new THREE.Vector2(0.022, 0.042),
      new THREE.Vector2(0.016, 0.054),
      new THREE.Vector2(0.001, 0.056),
    ];

    const lampCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 0.24, -0.022),
      new THREE.Vector3(0.032, 0.355, 0.018),
      new THREE.Vector3(0.085, 0.335, 0.074),
    ]);

    return {
      mergedWalnutGeo: createMergedGroupGeometry(walnutParts),
      mergedWalnutDarkGeo: createMergedGroupGeometry(walnutDarkParts),
      mergedWainscotGeo: createMergedGroupGeometry(wainscotParts),
      mergedBrassDarkGeo: createMergedGroupGeometry(brassDarkParts),
      mergedBrassBrightGeo: createMergedGroupGeometry(brassBrightParts),
      lampBaseGeo: new THREE.LatheGeometry(baseProfile, 18),
      lampNeckGeo: new THREE.TubeGeometry(lampCurve, 16, 0.01, 8, false),
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
      lampBaseGeo.dispose();
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
    lampBaseGeo,
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

      {/* Wide Exterior Sky Backdrop, Reflective Window Glass & Theme-Driven Light Shaft */}
      <mesh
        position={[0, 2.98, -4.42]}
        material={materials.windowExteriorMat}
        raycast={NOOP_RAYCAST}
      >
        <planeGeometry args={[3.92, 2.16]} />
      </mesh>
      <mesh
        position={[0, 2.98, -4.362]}
        material={materials.moonGlassMat}
        raycast={NOOP_RAYCAST}
      >
        <planeGeometry args={[3.92, 2.16]} />
      </mesh>
      <mesh position={[0, 2.15, -2.55]} rotation={[-0.42, 0, 0]} raycast={NOOP_RAYCAST}>
        <planeGeometry args={[3.5, 4.4]} />
        <meshBasicMaterial
          color={atmosphere.shaftColor}
          transparent
          opacity={atmosphere.shaftOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Hanging Brass Chandelier / Lantern */}
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
            emissiveIntensity={0.85}
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

      {/* Desk Accessories, Slim Metallic Laptop & Classic Banker Lamp */}
      <group position={[0, 0, 0.86]}>
        {/* Leather Blotter & Parchment Note + Brass Pen */}
        <mesh
          geometry={unitBoxGeo}
          position={[0, 0.779, 0.04]}
          scale={[0.88, 0.006, 0.48]}
          material={materials.blotterMat}
          receiveShadow={shadowsEnabled}
        />
        <mesh
          geometry={unitBoxGeo}
          position={[-0.33, 0.785, 0.12]}
          rotation={[0, 0.18, 0]}
          scale={[0.14, 0.003, 0.20]}
          material={materials.parchmentMat}
        />
        <mesh
          position={[-0.23, 0.79, 0.15]}
          rotation={[Math.PI / 2, 0, -0.35]}
          material={materials.brassMat}
        >
          <cylinderGeometry args={[0.004, 0.003, 0.135, 8]} />
        </mesh>

        {/* SLIM METALLIC LAPTOP WORKSTATION (Clickable) */}
        <group
          position={[0, 0.782, -0.02]}
          onClick={(e) => {
            e.stopPropagation();
            onOpenComputer();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setLaptopHovered(true);
          }}
          onPointerOut={() => setLaptopHovered(false)}
        >
          {/* Base Aluminum Unibody Chassis */}
          <mesh
            geometry={unitBoxGeo}
            position={[0, 0.006, 0]}
            scale={[0.37, 0.011, 0.25]}
            material={materials.laptopChassisMat}
            castShadow={shadowsEnabled}
            receiveShadow={shadowsEnabled}
          />
          {/* Subtle Metallic Rim / Hover Accent */}
          <mesh
            geometry={unitBoxGeo}
            position={[0, 0.006, 0]}
            scale={[0.374, 0.007, 0.254]}
            material={laptopHovered ? materials.brassMat : materials.laptopBezelMat}
          />
          {/* Keyboard & Glass Trackpad Deck */}
          <mesh
            position={[0, 0.0122, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={materials.laptopKeyboardMat}
          >
            <planeGeometry args={[0.352, 0.228]} />
          </mesh>
          {/* Precision Hinge Cylinder Barrel */}
          <mesh
            position={[0, 0.011, -0.12]}
            rotation={[0, 0, Math.PI / 2]}
            material={materials.laptopBezelMat}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.28, 12]} />
          </mesh>

          {/* Hinged Laptop Screen Lid (tilted ~108° for seated eye comfort) */}
          <group position={[0, 0.012, -0.12]} rotation={[-0.31, 0, 0]}>
            {/* Anodized Aluminum Lid Back Shell */}
            <mesh
              geometry={unitBoxGeo}
              position={[0, 0.118, 0]}
              scale={[0.37, 0.232, 0.006]}
              material={materials.laptopChassisMat}
              castShadow={shadowsEnabled}
            />
            {/* Thin Dark Display Bezel */}
            <mesh
              geometry={unitBoxGeo}
              position={[0, 0.118, 0.0025]}
              scale={[0.358, 0.22, 0.0025]}
              material={
                laptopHovered ? materials.brassDarkMat : materials.laptopBezelMat
              }
            />
            {/* Active Book Tracker Screen Plane */}
            <mesh
              position={[0, 0.119, 0.0042]}
              material={materials.monitorScreenMat}
            >
              <planeGeometry args={[0.342, 0.204]} />
            </mesh>
            {/* Subtle Glass Screen Reflection Sheen */}
            <mesh position={[0.06, 0.124, 0.0046]} raycast={NOOP_RAYCAST}>
              <planeGeometry args={[0.16, 0.19]} />
              <meshBasicMaterial
                color="#dceaff"
                transparent
                opacity={laptopHovered ? 0.08 : 0.035}
                depthWrite={false}
              />
            </mesh>
          </group>
        </group>

        {/* CLASSIC BRASS & EMERALD BANKER DESK LAMP (Clickable Warm/Cool Switch) */}
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
          {/* Weighted Stepped Lathe Brass Base */}
          <mesh geometry={lampBaseGeo} material={materials.brassMat} castShadow={shadowsEnabled} />
          {/* Curved Brass Arm */}
          <mesh geometry={lampNeckGeo} material={materials.brassMat} />
          {/* Brass Shade Yoke Swivel Caps */}
          <mesh
            position={[0.085, 0.32, 0.075]}
            rotation={[0.35, -0.45, Math.PI / 2]}
            material={materials.brassMat}
          >
            <cylinderGeometry args={[0.015, 0.015, 0.20, 10]} />
          </mesh>
          {/* Classic Emerald / Sapphire Enameled Shade */}
          <mesh
            position={[0.085, 0.32, 0.075]}
            rotation={[0.35, -0.45, Math.PI / 2]}
            material={materials.emeraldShadeMat}
          >
            <cylinderGeometry args={[0.058, 0.062, 0.185, 16, 1, false, 0, Math.PI]} />
          </mesh>
          {/* Warm Filament Bulb */}
          <mesh position={[0.085, 0.298, 0.075]}>
            <sphereGeometry args={[0.022, 10, 8]} />
            <meshBasicMaterial color={lanternWarmth ? '#ffd68a' : '#9cc1ff'} />
          </mesh>
          {/* Subtle Warm/Cool Light Pool on Desk Surface */}
          <mesh
            position={[0.09, 0.004, 0.08]}
            rotation={[-Math.PI / 2, 0, 0]}
            raycast={NOOP_RAYCAST}
          >
            <circleGeometry args={[0.32, 24]} />
            <meshBasicMaterial
              color={lanternWarmth ? '#f2be6b' : '#7ea8eb'}
              transparent
              opacity={lanternWarmth ? 0.11 : 0.055}
              depthWrite={false}
            />
          </mesh>
          {lampHovered && (
            <mesh position={[0.04, 0.22, 0.04]} raycast={NOOP_RAYCAST}>
              <sphereGeometry args={[0.17, 10, 8]} />
              <meshBasicMaterial
                color={lanternWarmth ? '#f2c679' : '#7797c9'}
                transparent
                opacity={0.08}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>

        {/* Brass Inkwell + Stacked Leather Reference Books */}
        <mesh position={[-0.53, 0.798, -0.14]} material={materials.brassDarkMat}>
          <cylinderGeometry args={[0.022, 0.028, 0.044, 12]} />
        </mesh>
        <group position={[0.68, 0.776, -0.02]}>
          <mesh
            geometry={unitBoxGeo}
            position={[0, 0.018, 0]}
            rotation={[0, -0.12, 0]}
            scale={[0.19, 0.034, 0.25]}
            material={deskGreenBookMat}
            castShadow={shadowsEnabled}
          />
          <mesh
            geometry={unitBoxGeo}
            position={[0.01, 0.05, 0.01]}
            rotation={[0, 0.08, 0]}
            scale={[0.17, 0.03, 0.23]}
            material={deskCrimsonBookMat}
            castShadow={shadowsEnabled}
          />
        </group>
      </group>
    </group>
  );
}
