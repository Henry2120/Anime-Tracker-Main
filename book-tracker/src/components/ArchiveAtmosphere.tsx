const DUST_MOTES = [
  { left: '12%', top: '18%', size: 3, delay: '0s', duration: '9s', tint: '#B49A67' },
  { left: '24%', top: '64%', size: 2, delay: '1.8s', duration: '11s', tint: '#7797C9' },
  { left: '38%', top: '32%', size: 3, delay: '3.1s', duration: '10s', tint: '#D8C9A7' },
  { left: '54%', top: '16%', size: 2, delay: '0.9s', duration: '12s', tint: '#7797C9' },
  { left: '68%', top: '48%', size: 3, delay: '2.4s', duration: '9.5s', tint: '#B49A67' },
  { left: '81%', top: '26%', size: 2, delay: '4.2s', duration: '11.5s', tint: '#776B9C' },
  { left: '90%', top: '70%', size: 3, delay: '1.2s', duration: '10.5s', tint: '#B49A67' },
];

/**
 * Pure CSS + inline SVG gothic architectural ambiance layer.
 * Never renders a <canvas> element so AniVerse's root AtmosphericCanvas stays singular.
 */
export function ArchiveAtmosphere() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Distant Moonlight Shafts & Gothic Lancet Window Silhouettes */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMin slice"
        className="h-full w-full opacity-[0.22]"
      >
        <defs>
          <linearGradient id="archiveMoonBeam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7797C9" stopOpacity="0.45" />
            <stop offset="65%" stopColor="#776B9C" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#0B1120" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="archiveArchRim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B49A67" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#392A24" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Left & Right Tall Gothic Window Arches */}
        <path
          d="M170 520 L170 210 Q170 95 255 55 Q340 95 340 210 L340 520 Z"
          fill="url(#archiveMoonBeam)"
          stroke="url(#archiveArchRim)"
          strokeWidth="2"
        />
        <path
          d="M1100 520 L1100 210 Q1100 95 1185 55 Q1270 95 1270 210 L1270 520 Z"
          fill="url(#archiveMoonBeam)"
          stroke="url(#archiveArchRim)"
          strokeWidth="2"
        />

        {/* Central Grand Rose & Colonnade Arch */}
        <path
          d="M520 460 L520 185 Q720 20 920 185 L920 460"
          fill="none"
          stroke="url(#archiveArchRim)"
          strokeWidth="1.5"
        />
        <circle
          cx="720"
          cy="148"
          r="56"
          fill="url(#archiveMoonBeam)"
          stroke="url(#archiveArchRim)"
          strokeWidth="1.5"
        />
        <circle
          cx="720"
          cy="148"
          r="34"
          fill="none"
          stroke="#B49A67"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
      </svg>

      {/* Subtle Ambient Dust Motes */}
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
  );
}
