import { useEffect, useRef } from 'react';

const DUST_MOTES = [
  { left: '11%', top: '20%', size: 3, delay: '0s', duration: '9.5s', tint: '#B49A67' },
  { left: '23%', top: '62%', size: 2, delay: '1.8s', duration: '11s', tint: '#7797C9' },
  { left: '37%', top: '30%', size: 3, delay: '3.1s', duration: '10s', tint: '#D8C9A7' },
  { left: '53%', top: '18%', size: 2, delay: '0.9s', duration: '12s', tint: '#7797C9' },
  { left: '69%', top: '46%', size: 3, delay: '2.4s', duration: '9.5s', tint: '#B49A67' },
  { left: '82%', top: '28%', size: 2, delay: '4.2s', duration: '11.5s', tint: '#776B9C' },
  { left: '91%', top: '68%', size: 3, delay: '1.2s', duration: '10.5s', tint: '#B49A67' },
  { left: '46%', top: '76%', size: 2, delay: '2.9s', duration: '11.5s', tint: '#D6BD8A' },
];

interface ArchiveAtmosphereProps {
  lanternWarmth?: boolean;
}

/**
 * Pure CSS + inline SVG 2.5D gothic architectural ambiance layer with subtle
 * pointer parallax on desktop and zero <canvas> nodes so AniVerse stays singular.
 */
export function ArchiveAtmosphere({ lanternWarmth = true }: ArchiveAtmosphereProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let rafId = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 14;
      const ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 10;
      targetX = nx;
      targetY = ny;
      if (!rafId) {
        rafId = window.requestAnimationFrame(() => {
          rafId = 0;
          rootRef.current?.style.setProperty('--archive-px', `${targetX.toFixed(1)}px`);
          rootRef.current?.style.setProperty('--archive-py', `${targetY.toFixed(1)}px`);
        });
      }
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 overflow-hidden select-none ${
        lanternWarmth ? 'archive-lantern-warm' : ''
      }`}
    >
      {/* Distant Vaulted Nave, Gothic Lancet Windows & Upper Mezzanine */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMin slice"
        className="archive-parallax-far h-full w-full opacity-[0.26]"
      >
        <defs>
          <linearGradient id="archiveMoonBeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7797C9" stopOpacity="0.52" />
            <stop offset="65%" stopColor="#776B9C" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#0B1120" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="archiveArchRim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B49A67" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#392A24" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="archiveMoonRay" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#94B5E8" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#0B1120" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Diagonal Moonlight Shafts */}
        <polygon points="160,120 350,120 620,900 220,900" fill="url(#archiveMoonRay)" />
        <polygon points="1090,120 1280,120 1320,900 900,900" fill="url(#archiveMoonRay)" />

        {/* Vaulted Stone Ribs */}
        <path d="M0 320 Q360 40 720 320" fill="none" stroke="url(#archiveArchRim)" strokeWidth="1.2" strokeOpacity="0.45" />
        <path d="M720 320 Q1080 40 1440 320" fill="none" stroke="url(#archiveArchRim)" strokeWidth="1.2" strokeOpacity="0.45" />

        {/* Upper Mezzanine Balustrade */}
        <line x1="80" y1="430" x2="1360" y2="430" stroke="#B49A67" strokeOpacity="0.24" strokeWidth="2" />
        <line x1="80" y1="452" x2="1360" y2="452" stroke="#392A24" strokeOpacity="0.5" strokeWidth="3" />

        {/* Left & Right Tall Gothic Window Arches */}
        <path
          d="M155 560 L155 205 Q155 85 250 42 Q345 85 345 205 L345 560 Z"
          fill="url(#archiveMoonBeam)"
          stroke="url(#archiveArchRim)"
          strokeWidth="2"
        />
        <path
          d="M1095 560 L1095 205 Q1095 85 1190 42 Q1285 85 1285 205 L1285 560 Z"
          fill="url(#archiveMoonBeam)"
          stroke="url(#archiveArchRim)"
          strokeWidth="2"
        />

        {/* Central Rose Window */}
        <path
          d="M495 490 L495 190 Q720 10 945 190 L945 490"
          fill="none"
          stroke="url(#archiveArchRim)"
          strokeWidth="1.5"
        />
        <circle
          cx="720"
          cy="148"
          r="62"
          fill="url(#archiveMoonBeam)"
          stroke="url(#archiveArchRim)"
          strokeWidth="1.6"
        />
        <circle cx="720" cy="148" r="36" fill="none" stroke="#B49A67" strokeOpacity="0.38" strokeWidth="1" />
      </svg>

      {/* Warm Candlelight Glow Layer */}
      <div className="archive-warm-veil absolute inset-0" />

      {/* Midground Dust Motes */}
      <div className="archive-parallax-mid absolute inset-0">
        {DUST_MOTES.map((m, idx) => (
          <span
            key={idx}
            className="animate-archive-mote absolute rounded-full"
            style={{
              left: m.left,
              top: m.top,
              width: `${m.size}px`,
              height: `${m.size}px`,
              backgroundColor: m.tint,
              boxShadow: `0 0 8px ${m.tint}`,
              animationDelay: m.delay,
              animationDuration: m.duration,
            }}
          />
        ))}
      </div>
    </div>
  );
}
