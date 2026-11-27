import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { ArchiveQualitySettings } from './qualityConfig';

export interface Archive3DMetrics {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  qualityTier: string;
  isSoftwareGl: boolean;
  lastFrameMs: number;
  maxFrameMs: number;
  framesMeasured: number;
}

declare global {
  interface Window {
    __BOOK_TRACKER_3D_METRICS__?: Archive3DMetrics;
  }
}

export function ScenePerformanceBridge({
  quality,
}: {
  quality: ArchiveQualitySettings;
}) {
  const { gl } = useThree();
  const statsRef = useRef({ lastMs: 0, maxMs: 0, count: 0 });

  useEffect(() => {
    const updateMetrics = () => {
      if (typeof window === 'undefined') return;
      window.__BOOK_TRACKER_3D_METRICS__ = {
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        qualityTier: quality.tier,
        isSoftwareGl: quality.isSoftwareGl,
        lastFrameMs: Number(statsRef.current.lastMs.toFixed(2)),
        maxFrameMs: Number(statsRef.current.maxMs.toFixed(2)),
        framesMeasured: statsRef.current.count,
      };
    };

    updateMetrics();
    const timer = window.setInterval(updateMetrics, 750);
    return () => window.clearInterval(timer);
  }, [gl, quality.tier, quality.isSoftwareGl]);

  useFrame((_, delta) => {
    const ms = delta * 1000;
    if (ms > 0 && ms < 250) {
      statsRef.current.lastMs = ms;
      statsRef.current.maxMs = Math.max(statsRef.current.maxMs, ms);
      statsRef.current.count += 1;
    }
  });

  return null;
}
