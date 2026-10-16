import React, { useEffect, useRef } from 'react';
import { AppTheme } from '../types/theme';

interface AtmosphericCanvasProps {
  theme: AppTheme;
}

export const AtmosphericCanvas: React.FC<AtmosphericCanvasProps> = ({ theme }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Only themes with particle/atmospheric motion need the canvas
    if (theme === 'light' || theme === 'dark') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Respect user's prefers-reduced-motion setting
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const isMobile = width < 768;

    let isVisible = !document.hidden;
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ==========================================
    // 1. SAKURA PETALS
    // ==========================================
    const SAKURA_COLORS = ['#FFB7C5', '#FFC2CD', '#FCAEBB', '#FFD1DC', '#F79FA4'];
    const sakuraCount = isMobile ? 12 : 22;
    const petals = Array.from({ length: sakuraCount }, () => ({
      x: Math.random() * (width + 100) - 50,
      y: Math.random() * height,
      size: 9 + Math.random() * 11,
      speedY: 0.7 + Math.random() * 1.0,
      speedX: -0.2 + Math.random() * 0.7,
      oscillationSpeed: 0.01 + Math.random() * 0.02,
      oscillationDistance: 0.5 + Math.random() * 1.0,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.025,
      flip: Math.random() * Math.PI,
      flipSpeed: 0.015 + Math.random() * 0.02,
      opacity: 0.4 + Math.random() * 0.35,
      color: SAKURA_COLORS[Math.floor(Math.random() * SAKURA_COLORS.length)],
    }));

    // ==========================================
    // 2. RAIN DROPS & STREAKS
    // ==========================================
    const rainCount = isMobile ? 35 : 65;
    const raindrops = Array.from({ length: rainCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      length: 14 + Math.random() * 20,
      speedY: 10 + Math.random() * 8,
      speedX: -1.2, // subtle wind slant
      opacity: 0.15 + Math.random() * 0.25,
      thickness: 0.8 + Math.random() * 0.7,
    }));

    // ==========================================
    // 3. STARLIGHT (COSMIC NIGHT)
    // ==========================================
    const starCount = isMobile ? 40 : 75;
    const stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.6 + Math.random() * 1.5,
      baseAlpha: 0.2 + Math.random() * 0.6,
      twinkleSpeed: 0.015 + Math.random() * 0.03,
      twinklePhase: Math.random() * Math.PI * 2,
      color: Math.random() > 0.4 ? '#E0E7FF' : Math.random() > 0.5 ? '#DDD6FE' : '#BAE6FD',
    }));

    // ==========================================
    // 4. AUTUMN MAPLE LEAVES
    // ==========================================
    const AUTUMN_COLORS = ['#EA580C', '#D97706', '#B45309', '#DC2626', '#9A3412'];
    const autumnCount = isMobile ? 12 : 20;
    const leaves = Array.from({ length: autumnCount }, () => ({
      x: Math.random() * (width + 80) - 40,
      y: Math.random() * height,
      size: 11 + Math.random() * 12,
      speedY: 0.8 + Math.random() * 0.9,
      speedX: -0.4 + Math.random() * 0.8,
      wobbleSpeed: 0.018 + Math.random() * 0.02,
      wobbleDistance: 0.8 + Math.random() * 1.2,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      flip: Math.random() * Math.PI,
      flipSpeed: 0.012 + Math.random() * 0.02,
      opacity: 0.45 + Math.random() * 0.35,
      color: AUTUMN_COLORS[Math.floor(Math.random() * AUTUMN_COLORS.length)],
    }));

    // ==========================================
    // 5. SNOWFLAKES (WINTER NIGHT)
    // ==========================================
    const snowCount = isMobile ? 30 : 55;
    const snowflakes = Array.from({ length: snowCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1.0 + Math.random() * 2.2,
      speedY: 0.6 + Math.random() * 1.1,
      speedX: -0.2 + Math.random() * 0.5,
      oscillationSpeed: 0.01 + Math.random() * 0.02,
      oscillationDistance: 0.4 + Math.random() * 0.8,
      angle: Math.random() * Math.PI * 2,
      opacity: 0.35 + Math.random() * 0.45,
    }));

    // ==========================================
    // 6. SUNNY (GENTLE CLOUDS)
    // ==========================================
    const cloudCount = isMobile ? 3 : 5;
    const clouds = Array.from({ length: cloudCount }, (_, i) => ({
      x: (width / cloudCount) * i + Math.random() * 100,
      y: 40 + Math.random() * (height * 0.35),
      scale: 0.8 + Math.random() * 0.6,
      speedX: 0.12 + Math.random() * 0.15,
      opacity: 0.12 + Math.random() * 0.14,
    }));

    // ==========================================
    // 7. CLOUDY (OVERCAST HAZE DRIFT)
    // ==========================================
    const mistCount = isMobile ? 3 : 4;
    const mists = Array.from({ length: mistCount }, (_, i) => ({
      x: (width / mistCount) * i,
      y: 60 + Math.random() * (height * 0.45),
      speedX: 0.08 + Math.random() * 0.1,
      radius: 120 + Math.random() * 100,
      opacity: 0.08 + Math.random() * 0.1,
    }));

    let step = 0;

    const render = () => {
      if (!isVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      step++;

      // ------------------------------------------
      // RENDER SAKURA
      // ------------------------------------------
      if (theme === 'sakura') {
        petals.forEach((p) => {
          p.y += p.speedY;
          p.x += p.speedX + Math.sin(p.y * p.oscillationSpeed) * p.oscillationDistance;
          p.angle += p.rotationSpeed;
          p.flip += p.flipSpeed;

          if (p.y > height + 40) {
            p.y = -30;
            p.x = Math.random() * (width + 60) - 30;
          }
          if (p.x < -50) p.x = width + 40;
          if (p.x > width + 50) p.x = -40;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.scale(1, Math.sin(p.flip));
          ctx.globalAlpha = p.opacity;

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(p.size * 0.4, -p.size * 0.6, p.size * 0.8, -p.size * 0.3, p.size * 0.7, p.size * 0.4);
          ctx.bezierCurveTo(p.size * 0.5, p.size * 0.8, p.size * 0.1, p.size * 0.9, 0, p.size);
          ctx.bezierCurveTo(-p.size * 0.1, p.size * 0.9, -p.size * 0.5, p.size * 0.8, -p.size * 0.7, p.size * 0.4);
          ctx.bezierCurveTo(-p.size * 0.8, -p.size * 0.3, -p.size * 0.4, -p.size * 0.6, 0, 0);

          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
        });
      }

      // ------------------------------------------
      // RENDER RAIN
      // ------------------------------------------
      else if (theme === 'rain') {
        ctx.strokeStyle = '#38BDF8';
        raindrops.forEach((r) => {
          r.y += r.speedY;
          r.x += r.speedX;

          if (r.y > height + 20) {
            r.y = -20 - Math.random() * 30;
            r.x = Math.random() * (width + 100);
          }
          if (r.x < -20) {
            r.x = width + 20;
          }

          ctx.save();
          ctx.globalAlpha = r.opacity;
          ctx.lineWidth = r.thickness;
          ctx.beginPath();
          ctx.moveTo(r.x, r.y);
          ctx.lineTo(r.x + r.speedX * 2, r.y + r.length);
          ctx.stroke();
          ctx.restore();
        });
      }

      // ------------------------------------------
      // RENDER STARLIGHT
      // ------------------------------------------
      else if (theme === 'starlight') {
        stars.forEach((s) => {
          s.twinklePhase += s.twinkleSpeed;
          const currentAlpha = s.baseAlpha * (0.6 + 0.4 * Math.sin(s.twinklePhase));

          ctx.save();
          ctx.globalAlpha = Math.max(0.1, Math.min(1, currentAlpha));
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      // ------------------------------------------
      // RENDER AUTUMN
      // ------------------------------------------
      else if (theme === 'autumn') {
        leaves.forEach((l) => {
          l.y += l.speedY;
          l.x += l.speedX + Math.sin(l.y * l.wobbleSpeed) * l.wobbleDistance;
          l.angle += l.rotationSpeed;
          l.flip += l.flipSpeed;

          if (l.y > height + 30) {
            l.y = -25;
            l.x = Math.random() * (width + 50) - 25;
          }
          if (l.x < -40) l.x = width + 30;
          if (l.x > width + 40) l.x = -30;

          ctx.save();
          ctx.translate(l.x, l.y);
          ctx.rotate(l.angle);
          ctx.scale(1, Math.cos(l.flip));
          ctx.globalAlpha = l.opacity;

          // Japanese maple (momiji) stylized leaf shape
          ctx.beginPath();
          ctx.moveTo(0, -l.size);
          ctx.lineTo(l.size * 0.4, -l.size * 0.4);
          ctx.lineTo(l.size * 0.9, -l.size * 0.3);
          ctx.lineTo(l.size * 0.4, 0);
          ctx.lineTo(l.size * 0.7, l.size * 0.5);
          ctx.lineTo(l.size * 0.1, l.size * 0.4);
          ctx.lineTo(0, l.size * 0.9);
          ctx.lineTo(-l.size * 0.1, l.size * 0.4);
          ctx.lineTo(-l.size * 0.7, l.size * 0.5);
          ctx.lineTo(-l.size * 0.4, 0);
          ctx.lineTo(-l.size * 0.9, -l.size * 0.3);
          ctx.lineTo(-l.size * 0.4, -l.size * 0.4);
          ctx.closePath();

          ctx.fillStyle = l.color;
          ctx.fill();
          ctx.restore();
        });
      }

      // ------------------------------------------
      // RENDER SNOW
      // ------------------------------------------
      else if (theme === 'snow') {
        ctx.fillStyle = '#E0F2FE';
        snowflakes.forEach((s) => {
          s.y += s.speedY;
          s.angle += s.oscillationSpeed;
          s.x += s.speedX + Math.sin(s.angle) * s.oscillationDistance;

          if (s.y > height + 10) {
            s.y = -10;
            s.x = Math.random() * width;
          }
          if (s.x < -10) s.x = width + 10;
          if (s.x > width + 10) s.x = -10;

          ctx.save();
          ctx.globalAlpha = s.opacity;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      // ------------------------------------------
      // RENDER SUNNY
      // ------------------------------------------
      else if (theme === 'sunny') {
        clouds.forEach((c) => {
          c.x += c.speedX;
          if (c.x > width + 250) {
            c.x = -250;
            c.y = 40 + Math.random() * (height * 0.35);
          }

          ctx.save();
          ctx.globalAlpha = c.opacity;
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(c.x, c.y, 45 * c.scale, 0, Math.PI * 2);
          ctx.arc(c.x + 35 * c.scale, c.y - 15 * c.scale, 40 * c.scale, 0, Math.PI * 2);
          ctx.arc(c.x + 75 * c.scale, c.y - 5 * c.scale, 35 * c.scale, 0, Math.PI * 2);
          ctx.arc(c.x + 100 * c.scale, c.y + 10 * c.scale, 30 * c.scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }

      // ------------------------------------------
      // RENDER CLOUDY
      // ------------------------------------------
      else if (theme === 'cloudy') {
        mists.forEach((m) => {
          m.x += m.speedX;
          if (m.x > width + m.radius * 2) {
            m.x = -m.radius * 2;
          }

          ctx.save();
          ctx.globalAlpha = m.opacity;
          const grad = ctx.createRadialGradient(m.x, m.y, 10, m.x, m.y, m.radius);
          grad.addColorStop(0, '#94A3B8');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [theme]);

  // If theme has no atmospheric canvas animation, don't render canvas element
  if (theme === 'light' || theme === 'dark') {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
    />
  );
};
