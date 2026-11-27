import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getBookcaseCameraPose } from './bookcaseLayout';
import type { ArchiveQualitySettings } from './qualityConfig';

export type SceneCameraViewpoint =
  | 'room'
  | 'computer'
  | 'shelf_left'
  | 'shelf_middle'
  | 'shelf_right'
  | 'inspect_book';

interface LibraryCameraRigProps {
  viewpoint: SceneCameraViewpoint;
  inspectShelf: 'left' | 'middle' | 'right';
  quality: ArchiveQualitySettings;
}

const _desiredPos = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _currentTarget = new THREE.Vector3(0, 1.06, -1.25);

export function LibraryCameraRig({
  viewpoint,
  inspectShelf,
  quality,
}: LibraryCameraRigProps) {
  const { camera, size, invalidate } = useThree();
  const initializedRef = useRef(false);
  const pointerParallaxRef = useRef({ x: 0, y: 0 });
  const settledRef = useRef(false);

  const isPortrait = size.width / Math.max(1, size.height) < 0.85;
  const isMobile = quality.isMobileViewport || isPortrait;

  // Subtle seated head/eye look parallax on desktop only when in room viewpoint
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !quality.enablePointerParallax ||
      viewpoint !== 'room'
    ) {
      pointerParallaxRef.current.x = 0;
      pointerParallaxRef.current.y = 0;
      settledRef.current = false;
      invalidate();
      return;
    }

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      pointerParallaxRef.current.x = THREE.MathUtils.clamp(nx, -1, 1);
      pointerParallaxRef.current.y = THREE.MathUtils.clamp(ny, -1, 1);
      settledRef.current = false;
      invalidate();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [quality.enablePointerParallax, viewpoint, invalidate]);

  // Wake demand loop whenever viewpoint or viewport aspect changes
  useEffect(() => {
    settledRef.current = false;
    invalidate();
  }, [viewpoint, inspectShelf, isMobile, size.width, size.height, invalidate]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(0.05, rawDelta || 0.016);
    const persp = camera as THREE.PerspectiveCamera;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let desiredFov = isMobile ? 56 : 48;

    if (viewpoint === 'room') {
      const px = pointerParallaxRef.current.x * 0.09;
      const py = pointerParallaxRef.current.y * 0.05;
      _desiredPos.set(
        px,
        (isMobile ? 1.44 : 1.34) - py * 0.5,
        isMobile ? 2.68 : 2.02
      );
      _desiredTarget.set(px * 0.6, 1.06 - py * 0.4, -1.25);
      desiredFov = isMobile ? 56 : 48;
    } else if (viewpoint === 'computer') {
      _desiredPos.set(0, 1.08, isMobile ? 1.38 : 1.15);
      _desiredTarget.set(0, 1.06, 0.68);
      desiredFov = isMobile ? 52 : 43;
    } else if (
      viewpoint === 'shelf_left' ||
      viewpoint === 'shelf_middle' ||
      viewpoint === 'shelf_right' ||
      viewpoint === 'inspect_book'
    ) {
      const shelf =
        viewpoint === 'shelf_left'
          ? 'left'
          : viewpoint === 'shelf_right'
            ? 'right'
            : viewpoint === 'shelf_middle'
              ? 'middle'
              : inspectShelf;
      const pose = getBookcaseCameraPose(shelf, isMobile);
      _desiredPos.set(pose.position[0], pose.position[1], pose.position[2]);
      _desiredTarget.set(pose.target[0], pose.target[1], pose.target[2]);
      desiredFov = viewpoint === 'inspect_book' ? (isMobile ? 48 : 40) : isMobile ? 52 : 46;
    }

    if (!initializedRef.current || reducedMotion) {
      camera.position.copy(_desiredPos);
      _currentTarget.copy(_desiredTarget);
      if (Math.abs(persp.fov - desiredFov) > 0.01) {
        persp.fov = desiredFov;
        persp.updateProjectionMatrix();
      }
      camera.lookAt(_currentTarget);
      initializedRef.current = true;
      settledRef.current = true;
      return;
    }

    const lambda = 7.5;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredPos.x, lambda, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredPos.y, lambda, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredPos.z, lambda, dt);

    _currentTarget.x = THREE.MathUtils.damp(_currentTarget.x, _desiredTarget.x, lambda, dt);
    _currentTarget.y = THREE.MathUtils.damp(_currentTarget.y, _desiredTarget.y, lambda, dt);
    _currentTarget.z = THREE.MathUtils.damp(_currentTarget.z, _desiredTarget.z, lambda, dt);

    if (Math.abs(persp.fov - desiredFov) > 0.02) {
      persp.fov = THREE.MathUtils.damp(persp.fov, desiredFov, lambda, dt);
      persp.updateProjectionMatrix();
    }

    camera.lookAt(_currentTarget);

    const posErr = camera.position.distanceToSquared(_desiredPos);
    const tgtErr = _currentTarget.distanceToSquared(_desiredTarget);
    const fovErr = Math.abs(persp.fov - desiredFov);

    if (posErr > 0.000008 || tgtErr > 0.000008 || fovErr > 0.03) {
      invalidate();
    } else if (!settledRef.current) {
      camera.position.copy(_desiredPos);
      _currentTarget.copy(_desiredTarget);
      camera.lookAt(_currentTarget);
      settledRef.current = true;
    }
  });

  return null;
}
