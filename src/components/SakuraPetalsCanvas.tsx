import React, { useEffect, useRef } from 'react';

interface Petal {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  oscillationSpeed: number;
  oscillationDistance: number;
  angle: number;
  rotationSpeed: number;
  flip: number;
  flipSpeed: number;
  opacity: number;
  color: string;
}

const SAKURA_COLORS = [
  '#FFB7C5', // classic sakura pink
  '#FFC2CD', // light pastel pink
  '#FCAEBB', // soft rose blossom
  '#FFD1DC', // delicate pale pink
  '#F79FA4', // warm blossom
];

export const SakuraPetalsCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Respect user's prefers-reduced-motion setting
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      return;
    }

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Responsive petal count: ~24 on desktop, ~14 on mobile to ensure 60fps
    const isMobile = width < 768;
    const petalCount = isMobile ? 14 : 24;

    const createPetal = (initialSpawn: boolean = false): Petal => {
      return {
        x: Math.random() * (width + 100) - 50,
        // If initial spawn, distribute across viewport so petals are already visible
        y: initialSpawn ? Math.random() * height : -30 - Math.random() * 50,
        size: 10 + Math.random() * 12, // 10px to 22px
        speedY: 0.8 + Math.random() * 1.2, // graceful gentle descent
        speedX: -0.3 + Math.random() * 0.9, // subtle horizontal drift
        oscillationSpeed: 0.01 + Math.random() * 0.02,
        oscillationDistance: 0.5 + Math.random() * 1.2,
        angle: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.03,
        flip: Math.random() * Math.PI,
        flipSpeed: 0.015 + Math.random() * 0.025,
        opacity: 0.45 + Math.random() * 0.35, // 0.45 to 0.8 opacity
        color: SAKURA_COLORS[Math.floor(Math.random() * SAKURA_COLORS.length)],
      };
    };

    const petals: Petal[] = Array.from({ length: petalCount }, () => createPetal(true));

    const drawPetal = (p: Petal) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // Simulate 3D petal tumbling by scaling X with cosine of flip angle
      const scaleX = Math.cos(p.flip);
      ctx.scale(scaleX, 1);

      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;

      // Authentic curved sakura petal shape with gentle notch/tip
      const r = p.size;
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.8, -r * 0.8, r * 0.9, r * 0.3, 0, r);
      ctx.bezierCurveTo(-r * 0.9, r * 0.3, -r * 0.8, -r * 0.8, 0, -r);

      ctx.fill();

      // Delicate subtle inner vein/shading for depth
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 0.6;
      ctx.moveTo(0, -r * 0.6);
      ctx.lineTo(0, r * 0.6);
      ctx.stroke();

      ctx.restore();
    };

    let tick = 0;
    const render = () => {
      tick++;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];

        // Update physics
        p.y += p.speedY;
        p.x += p.speedX + Math.sin(tick * p.oscillationSpeed) * p.oscillationDistance;
        p.angle += p.rotationSpeed;
        p.flip += p.flipSpeed;

        // Wrap around when falling past bottom or drifting off sides
        if (p.y > height + 40 || p.x > width + 60 || p.x < -60) {
          petals[i] = createPetal(false);
        }

        drawPetal(p);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
    />
  );
};
