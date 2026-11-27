import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { EnrichedBookRecord } from '../hooks/useLibraryData';
import type { BookshelfPosition, Edition } from '../types/domain';
import { getDeterministicBookSpineStyle } from '../utils/bookSpine';
import {
  BOOKCASE_TRANSFORMS,
  computeLocalBookSlot,
  localBookSlotToWorld,
} from './bookcaseLayout';
import { getHeroBookCoverTexture } from './proceduralMaterials';

function DetailedHeroBook({
  workId,
  title,
  author,
  edition,
  scale = 1,
}: {
  workId: string;
  title: string;
  author: string;
  edition?: Edition;
  scale?: number;
}) {
  const spineStyle = useMemo(
    () =>
      getDeterministicBookSpineStyle({
        workId,
        pageCount: edition?.pageCount,
        format: edition?.format,
      }),
    [workId, edition?.pageCount, edition?.format]
  );

  const coverTexture = useMemo(
    () =>
      getHeroBookCoverTexture({
        key: `${workId}:${edition?.id ?? 'default'}:${edition?.coverUrl ?? ''}`,
        title,
        author,
        coverHex: spineStyle.leatherHex,
        foilHex: spineStyle.foilColor,
        coverUrl: edition?.coverUrl,
      }),
    [workId, edition?.id, edition?.coverUrl, title, author, spineStyle]
  );

  const width = Math.max(0.028, Math.min(0.048, spineStyle.widthPx * 0.00076)) * scale;
  const height = Math.max(0.21, Math.min(0.29, spineStyle.heightPx * 0.00125)) * scale;
  const depth = 0.21 * scale;

  return (
    <group>
      {/* Back Cover & Spine Base */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={spineStyle.leatherHex} roughness={0.62} metalness={0.08} />
      </mesh>
      {/* Ivory Page Block */}
      <mesh position={[0.001, 0, -0.002]}>
        <boxGeometry args={[width * 0.78, height * 0.95, depth * 0.95]} />
        <meshStandardMaterial color="#e6dac0" roughness={0.86} />
      </mesh>
      {/* Detailed Front Cover Plane */}
      <mesh position={[width * 0.504, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[depth * 0.97, height * 0.97]} />
        <meshStandardMaterial map={coverTexture} roughness={0.5} metalness={0.06} />
      </mesh>
      {/* Gold Spine Band */}
      <mesh position={[0, height * 0.28, depth * 0.503]}>
        <boxGeometry args={[width * 0.96, 0.013 * scale, 0.004]} />
        <meshStandardMaterial color={spineStyle.foilColor} roughness={0.28} metalness={0.82} />
      </mesh>
    </group>
  );
}

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _targetInspPos = new THREE.Vector3();
const _shelfNormal = new THREE.Vector3();

export function HeroBookInspection({
  book,
  shelf,
  startWorld,
}: {
  book: EnrichedBookRecord;
  shelf: BookshelfPosition;
  startWorld: [number, number, number];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const { invalidate } = useThree();

  const tf = BOOKCASE_TRANSFORMS[shelf];

  useEffect(() => {
    progressRef.current = 0;
    if (groupRef.current) {
      groupRef.current.position.set(startWorld[0], startWorld[1], startWorld[2]);
      groupRef.current.rotation.set(0, tf.rotationY, 0);
    }
    invalidate();
  }, [book.work.id, startWorld, tf.rotationY, invalidate]);

  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    if (!group) return;
    const dt = Math.min(0.05, rawDelta || 0.016);
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      progressRef.current = 1;
    } else if (progressRef.current < 1) {
      progressRef.current = Math.min(1, progressRef.current + dt * 3.4);
    }

    const t = 1 - Math.pow(1 - progressRef.current, 3);
    _shelfNormal.set(Math.sin(tf.rotationY), 0, Math.cos(tf.rotationY));
    // Shift slightly left in shelf frame on desktop so BookDetailModal sits cleanly beside the pulled-out volume
    const sideShift =
      typeof window !== 'undefined' && window.innerWidth >= 1024 ? -0.46 : 0;
    _targetInspPos
      .set(tf.position[0], 1.24, tf.position[2])
      .addScaledVector(_shelfNormal, 0.92);
    _targetInspPos.x += Math.cos(tf.rotationY) * sideShift;
    _targetInspPos.z -= Math.sin(tf.rotationY) * sideShift;

    group.position.set(
      THREE.MathUtils.lerp(startWorld[0], _targetInspPos.x, t),
      THREE.MathUtils.lerp(startWorld[1], _targetInspPos.y, t),
      THREE.MathUtils.lerp(startWorld[2], _targetInspPos.z, t)
    );
    // Angle slightly so both detailed front cover and leather spine face the viewer cleanly
    group.rotation.set(
      THREE.MathUtils.lerp(0, -0.06, t),
      THREE.MathUtils.lerp(tf.rotationY, tf.rotationY - 0.85, t),
      0
    );

    if (progressRef.current < 1) {
      invalidate();
    }
  });

  return (
    <group ref={groupRef}>
      <DetailedHeroBook
        workId={book.work.id}
        title={book.work.title}
        author={book.work.authors[0] ?? 'Unknown Author'}
        edition={book.primaryEdition}
        scale={1.35}
      />
    </group>
  );
}

export function BookPlacementFlight({
  workId,
  title,
  author,
  edition,
  targetShelf,
  targetSlotIndex,
  onComplete,
}: {
  workId: string;
  title: string;
  author: string;
  edition: Edition;
  targetShelf: BookshelfPosition;
  targetSlotIndex: number;
  onComplete: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const completedRef = useRef(false);
  const { invalidate } = useThree();

  const tf = BOOKCASE_TRANSFORMS[targetShelf];
  const targetWorld = useMemo(() => {
    const local = computeLocalBookSlot({
      slotIndex: Math.max(0, targetSlotIndex),
      spineThickness: 0.032,
      bookHeight: 0.23,
      bookDepth: 0.21,
    });
    return localBookSlotToWorld(targetShelf, local);
  }, [targetShelf, targetSlotIndex]);

  useEffect(() => {
    elapsedRef.current = 0;
    completedRef.current = false;
    invalidate();
  }, [workId, targetShelf, targetSlotIndex, invalidate]);

  useFrame((_, rawDelta) => {
    const group = groupRef.current;
    if (!group || completedRef.current) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      group.position.copy(targetWorld);
      group.rotation.set(0, tf.rotationY, 0);
      completedRef.current = true;
      onComplete();
      return;
    }

    const dt = Math.min(0.05, rawDelta || 0.016);
    elapsedRef.current += dt;

    const holdDur = 0.35;
    const flyDur = 1.18;
    const totalDur = holdDur + flyDur + 0.35;

    if (elapsedRef.current <= holdDur) {
      const rise = elapsedRef.current / holdDur;
      group.position.set(0, 1.08 + rise * 0.14, 0.78);
      group.rotation.set(-0.18, -0.55, 0);
      invalidate();
      return;
    }

    const flyT = Math.min(1, (elapsedRef.current - holdDur) / flyDur);
    const eased = 1 - Math.pow(1 - flyT, 3);

    _p0.set(0, 1.22, 0.78);
    _p2.copy(targetWorld);
    _p1.set(
      (_p0.x + _p2.x) * 0.5,
      Math.max(_p0.y, _p2.y) + 0.65,
      (_p0.z + _p2.z) * 0.5 + 0.25
    );

    const inv = 1 - eased;
    _tmp
      .set(0, 0, 0)
      .addScaledVector(_p0, inv * inv)
      .addScaledVector(_p1, 2 * inv * eased)
      .addScaledVector(_p2, eased * eased);

    group.position.copy(_tmp);
    group.rotation.set(
      THREE.MathUtils.lerp(-0.18, 0, eased),
      THREE.MathUtils.lerp(-0.55, tf.rotationY, eased),
      0
    );

    if (elapsedRef.current >= totalDur) {
      completedRef.current = true;
      onComplete();
    } else {
      invalidate();
    }
  });

  return (
    <group ref={groupRef} position={[0, 1.08, 0.78]}>
      <DetailedHeroBook
        workId={workId}
        title={title}
        author={author}
        edition={edition}
        scale={1.08}
      />
    </group>
  );
}
