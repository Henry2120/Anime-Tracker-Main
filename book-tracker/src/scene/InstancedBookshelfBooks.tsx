import { useEffect, useMemo, useRef } from 'react';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import type { BookshelfPosition, Shelf } from '../types/domain';
import {
  BOOKSHELF_POSITIONS,
  getBooksForShelfPosition,
} from '../utils/bookshelfPlacement';
import { getDeterministicBookSpineStyle } from '../utils/bookSpine';
import {
  BOOKCASE_TRANSFORMS,
  computeLocalBookSlot,
  localBookSlotToWorld,
} from './bookcaseLayout';
import type { ArchiveMaterialLibrary } from './proceduralMaterials';

export interface InstancedBookPlacement {
  book: EnrichedBookRecord;
  shelf: BookshelfPosition;
  local: { x: number; y: number; z: number };
  world: [number, number, number];
  rotationY: number;
  width: number;
  height: number;
  depth: number;
  colorHex: string;
}

interface InstancedBookshelfBooksProps {
  books: EnrichedBookRecord[];
  shelves: Shelf[];
  materials: ArchiveMaterialLibrary;
  maxBooksPerShelf: number;
  shadowsEnabled: boolean;
  activeShelf: BookshelfPosition | null;
  hiddenBook: { workId: string; shelf: BookshelfPosition } | null;
  onHoverBook: (hovered: { book: EnrichedBookRecord; shelf: BookshelfPosition } | null) => void;
  onSelectBook: (
    book: EnrichedBookRecord,
    shelf: BookshelfPosition,
    worldPos: [number, number, number]
  ) => void;
}

const MAX_INSTANCE_CAPACITY = 512;

const _dummyPos = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyEuler = new THREE.Euler();
const _dummyMatrix = new THREE.Matrix4();
const _tmpColor = new THREE.Color();
const _forwardOffset = new THREE.Vector3();

export function InstancedBookshelfBooks({
  books,
  shelves,
  materials,
  maxBooksPerShelf,
  shadowsEnabled,
  activeShelf,
  hiddenBook,
  onHoverBook,
  onSelectBook,
}: InstancedBookshelfBooksProps) {
  const { invalidate } = useThree();

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const pagesRef = useRef<THREE.InstancedMesh>(null);
  const bandRef = useRef<THREE.InstancedMesh>(null);

  const hoveredIndexRef = useRef<number | null>(null);
  const pullProgressRef = useRef<Float32Array>(new Float32Array(MAX_INSTANCE_CAPACITY));
  const animatingHoverRef = useRef(false);

  const unitBoxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => {
    return () => {
      unitBoxGeo.dispose();
    };
  }, [unitBoxGeo]);

  // Precompute deterministic book instances across Left, Middle, and Right bookcases
  const placements = useMemo<InstancedBookPlacement[]>(() => {
    const list: InstancedBookPlacement[] = [];
    const capPerShelf = Math.min(160, Math.max(16, maxBooksPerShelf));

    for (const shelf of BOOKSHELF_POSITIONS) {
      const shelfBooks = getBooksForShelfPosition(books, shelves, shelf).slice(
        0,
        capPerShelf
      );
      const tf = BOOKCASE_TRANSFORMS[shelf];

      shelfBooks.forEach((book, idx) => {
        if (list.length >= MAX_INSTANCE_CAPACITY) return;
        const spine = getDeterministicBookSpineStyle({
          workId: book.work.id,
          pageCount: book.primaryEdition.pageCount,
          format: book.primaryEdition.format,
        });
        const bookWidth = Math.max(0.022, Math.min(0.035, spine.widthPx * 0.00062));
        const bookHeight = Math.max(0.185, Math.min(0.275, spine.heightPx * 0.00118));
        const bookDepth = 0.21;

        const local = computeLocalBookSlot({
          slotIndex: idx,
          spineThickness: bookWidth,
          bookHeight,
          bookDepth,
        });
        const worldVec = localBookSlotToWorld(shelf, local);

        list.push({
          book,
          shelf,
          local,
          world: [worldVec.x, worldVec.y, worldVec.z],
          rotationY: tf.rotationY,
          width: bookWidth,
          height: bookHeight,
          depth: bookDepth,
          colorHex: spine.leatherHex,
        });
      });
    }

    return list;
  }, [books, shelves, maxBooksPerShelf]);

  const applyInstanceTransforms = (
    index: number,
    p: InstancedBookPlacement,
    pullOffset: number,
    hidden: boolean
  ) => {
    const body = bodyRef.current;
    const pages = pagesRef.current;
    const band = bandRef.current;
    if (!body || !pages || !band) return;

    _dummyEuler.set(0, p.rotationY, 0);
    _dummyQuat.setFromEuler(_dummyEuler);

    if (hidden) {
      _dummyPos.set(0, -50, 0);
      _dummyScale.set(0.0001, 0.0001, 0.0001);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      body.setMatrixAt(index, _dummyMatrix);
      pages.setMatrixAt(index, _dummyMatrix);
      band.setMatrixAt(index, _dummyMatrix);
      return;
    }

    _forwardOffset.set(0, 0, pullOffset).applyQuaternion(_dummyQuat);

    // 1. Main leather cover & spine block
    _dummyPos.set(
      p.world[0] + _forwardOffset.x,
      p.world[1],
      p.world[2] + _forwardOffset.z
    );
    _dummyScale.set(p.width, p.height, p.depth);
    _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
    body.setMatrixAt(index, _dummyMatrix);

    // 2. Cream paper block tucked inside covers (slightly proud at top edge)
    _dummyPos.set(
      p.world[0] + _forwardOffset.x,
      p.world[1] + 0.002,
      p.world[2] + _forwardOffset.z
    );
    _dummyScale.set(p.width * 0.78, p.height * 0.96, p.depth * 0.96);
    _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
    pages.setMatrixAt(index, _dummyMatrix);

    // 3. Antique gold foil spine band on upper spine
    _forwardOffset
      .set(0, p.height * 0.28, p.depth * 0.502 + pullOffset)
      .applyQuaternion(_dummyQuat);
    _dummyPos.set(
      p.world[0] + _forwardOffset.x,
      p.world[1] + _forwardOffset.y,
      p.world[2] + _forwardOffset.z
    );
    _dummyScale.set(p.width * 0.96, 0.011, 0.004);
    _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
    band.setMatrixAt(index, _dummyMatrix);
  };

  // Sync instance matrices & colors whenever library books or hiddenWorkId changes
  useEffect(() => {
    const body = bodyRef.current;
    const pages = pagesRef.current;
    const band = bandRef.current;
    if (!body || !pages || !band) return;

    const count = placements.length;
    body.count = count;
    pages.count = count;
    band.count = count;

    for (let i = 0; i < count; i++) {
      const p = placements[i];
      const isHidden =
        hiddenBook !== null && p.book.work.id === hiddenBook.workId && p.shelf === hiddenBook.shelf;
      const pull = pullProgressRef.current[i] * 0.055;
      applyInstanceTransforms(i, p, pull, isHidden);
      _tmpColor.set(p.colorHex);
      body.setColorAt(i, _tmpColor);
    }

    body.instanceMatrix.needsUpdate = true;
    pages.instanceMatrix.needsUpdate = true;
    band.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;

    body.computeBoundingSphere();
    pages.computeBoundingSphere();
    band.computeBoundingSphere();
    invalidate();
  }, [placements, hiddenBook, invalidate]);

  // Smooth pull-out animation for hovered book on focused shelf (demand-driven!)
  useFrame((_, rawDelta) => {
    if (!animatingHoverRef.current) return;
    const body = bodyRef.current;
    const pages = pagesRef.current;
    const band = bandRef.current;
    if (!body || !pages || !band) return;

    const dt = Math.min(0.05, rawDelta || 0.016);
    const hoveredIdx = hoveredIndexRef.current;
    let stillMoving = false;

    for (let i = 0; i < placements.length; i++) {
      const target = hoveredIdx === i ? 1 : 0;
      const current = pullProgressRef.current[i];
      if (Math.abs(current - target) > 0.005) {
        const next = THREE.MathUtils.damp(current, target, 12, dt);
        pullProgressRef.current[i] = next;
        const p = placements[i];
        const isHidden =
          hiddenBook !== null && p.book.work.id === hiddenBook.workId && p.shelf === hiddenBook.shelf;
        applyInstanceTransforms(i, p, next * 0.055, isHidden);
        stillMoving = true;
      } else if (current !== target) {
        pullProgressRef.current[i] = target;
        const p = placements[i];
        const isHidden =
          hiddenBook !== null && p.book.work.id === hiddenBook.workId && p.shelf === hiddenBook.shelf;
        applyInstanceTransforms(i, p, target * 0.055, isHidden);
      }
    }

    body.instanceMatrix.needsUpdate = true;
    pages.instanceMatrix.needsUpdate = true;
    band.instanceMatrix.needsUpdate = true;

    if (stillMoving) {
      invalidate();
    } else {
      animatingHoverRef.current = false;
    }
  });

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!activeShelf) return;
    if (e.instanceId === undefined) return;
    const item = placements[e.instanceId];
    if (!item || item.shelf !== activeShelf) return;
    e.stopPropagation();

    if (hoveredIndexRef.current !== e.instanceId) {
      hoveredIndexRef.current = e.instanceId;
      animatingHoverRef.current = true;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'pointer';
      }
      onHoverBook({ book: item.book, shelf: item.shelf });
      invalidate();
    }
  };

  const handlePointerOut = () => {
    if (hoveredIndexRef.current !== null) {
      hoveredIndexRef.current = null;
      animatingHoverRef.current = true;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'auto';
      }
      onHoverBook(null);
      invalidate();
    }
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!activeShelf || e.instanceId === undefined) return;
    const item = placements[e.instanceId];
    if (!item || item.shelf !== activeShelf) return;
    e.stopPropagation();
    onSelectBook(item.book, item.shelf, item.world);
  };

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[unitBoxGeo, materials.bookBodyMat, MAX_INSTANCE_CAPACITY]}
        frustumCulled={false}
        castShadow={shadowsEnabled}
        receiveShadow={shadowsEnabled}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      />
      <instancedMesh
        ref={pagesRef}
        args={[unitBoxGeo, materials.bookPagesMat, MAX_INSTANCE_CAPACITY]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={bandRef}
        args={[unitBoxGeo, materials.bookGoldBandMat, MAX_INSTANCE_CAPACITY]}
        frustumCulled={false}
      />
    </group>
  );
}
