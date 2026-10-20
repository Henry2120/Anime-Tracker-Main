import React, { useEffect, useRef } from 'react';
import { AppTheme, RainIntensityLevel, isDarkThemeFamily } from '../types/theme';

interface AtmosphericCanvasProps {
  theme: AppTheme;
  rainIntensity?: RainIntensityLevel;
  customPageBg?: string;
}

interface SakuraPetal {
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

interface AutumnLeaf {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  wobbleSpeed: number;
  wobbleDistance: number;
  angle: number;
  rotationSpeed: number;
  flip: number;
  flipSpeed: number;
  opacity: number;
  color: string;
}

interface Snowflake {
  x: number;
  y: number;
  radius: number;
  speedY: number;
  speedX: number;
  oscillationSpeed: number;
  oscillationDistance: number;
  angle: number;
  opacity: number;
  hasGlow: boolean;
}

interface Raindrop {
  x: number;
  y: number;
  length: number;
  speedY: number;
  speedX: number;
  opacity: number;
  thickness: number;
}

interface MistWisp {
  x: number;
  y: number;
  width: number;
  height: number;
  speedX: number;
  speedY: number;
  opacity: number;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speedX: number;
  opacity: number;
}

interface MistHaze {
  x: number;
  y: number;
  speedX: number;
  radius: number;
  opacity: number;
}

const SAKURA_COLORS = [
  '#FFB7C5', // classic sakura pink
  '#FFC2CD', // light pastel pink
  '#FCAEBB', // soft rose blossom
  '#FFD1DC', // delicate pale pink
  '#F79FA4', // warm blossom
];

const AUTUMN_COLORS = [
  '#C2410C', // deep rust orange
  '#EA580C', // vivid flame orange
  '#D97706', // golden amber
  '#B45309', // warm ochre brown
  '#DC2626', // crimson red
  '#9A3412', // burnt sienna
  '#7C2D12', // deep maple maroon
];

export const AtmosphericCanvas: React.FC<AtmosphericCanvasProps> = ({
  theme,
  rainIntensity = 0,
  customPageBg,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive viewport bounds
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const isMobile = width < 768;

    // Immediately clear any residual canvas pixels from previous theme/state
    ctx.clearRect(0, 0, width, height);

    // Rain is active if:
    // 1. Current theme is 'rain' AND rainIntensity > 0
    // 2. Current theme is 'custom' AND rainIntensity > 0
    // Note: If theme is 'rain' and user sets rainIntensity to 0, rain is turned off (level 0).
    // In all other preset themes (sakura, autumn, snow, starlight, sunny, cloudy, light, dark), rain is inactive.
    const isRainTheme = theme === 'rain';
    const isCustomWithRain = theme === 'custom' && rainIntensity > 0;

    let effectiveRainLevel: RainIntensityLevel = 0;
    if (isRainTheme) {
      effectiveRainLevel = rainIntensity;
    } else if (isCustomWithRain) {
      effectiveRainLevel = rainIntensity;
    }

    const hasRain = effectiveRainLevel > 0;
    const hasThemeParticles =
      theme === 'sakura' ||
      theme === 'starlight' ||
      theme === 'autumn' ||
      theme === 'snow' ||
      theme === 'sunny' ||
      theme === 'cloudy';

    // Event listener cleanup tracker
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    let isVisible = !document.hidden;
    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // If no rain and theme has no particles (e.g. Light, Dark, or Custom without rain),
    // keep canvas cleared and return cleanup function without starting an animation frame loop.
    if (!hasRain && !hasThemeParticles) {
      return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (canvasRef.current) {
          const c = canvasRef.current;
          const cx = c.getContext('2d');
          if (cx) cx.clearRect(0, 0, c.width, c.height);
        }
      };
    }

    // Respect user's prefers-reduced-motion setting
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => {
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    let animationFrameId: number;
    let tick = 0;
    const isDark = isDarkThemeFamily(theme, customPageBg);

    // ==========================================
    // 1. ORIGINAL SAKURA CHERRY BLOSSOM PETALS
    // (Restored authentic curved silhouette & delicate vein/tip)
    // ==========================================
    const sakuraCount = isMobile ? 14 : 24;
    const createSakuraPetal = (initialSpawn: boolean = false): SakuraPetal => ({
      x: Math.random() * (width + 100) - 50,
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
      opacity: 0.45 + Math.random() * 0.35,
      color: SAKURA_COLORS[Math.floor(Math.random() * SAKURA_COLORS.length)],
    });

    const sakuraPetals: SakuraPetal[] =
      theme === 'sakura'
        ? Array.from({ length: sakuraCount }, () => createSakuraPetal(true))
        : [];

    const drawSakuraPetal = (p: SakuraPetal) => {
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

    // ==========================================
    // 2. ORIGINAL AUTUMN JAPANESE MAPLE LEAVES (MOMIJI)
    // (Restored authentic 7-pointed silhouette, lobes, petiole, veins & 3D tumbling)
    // ==========================================
    const autumnCount = isMobile ? 12 : 20;
    const createAutumnLeaf = (initialSpawn: boolean = false): AutumnLeaf => ({
      x: Math.random() * (width + 100) - 50,
      y: initialSpawn ? Math.random() * height : -35 - Math.random() * 50,
      size: 13 + Math.random() * 11, // 13px to 24px
      speedY: 0.75 + Math.random() * 1.1, // gentle drifting fall
      speedX: -0.35 + Math.random() * 0.85,
      wobbleSpeed: 0.016 + Math.random() * 0.022,
      wobbleDistance: 0.9 + Math.random() * 1.4,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.024,
      flip: Math.random() * Math.PI,
      flipSpeed: 0.014 + Math.random() * 0.022,
      opacity: 0.48 + Math.random() * 0.38,
      color: AUTUMN_COLORS[Math.floor(Math.random() * AUTUMN_COLORS.length)],
    });

    const autumnLeaves: AutumnLeaf[] =
      theme === 'autumn'
        ? Array.from({ length: autumnCount }, () => createAutumnLeaf(true))
        : [];

    const drawMapleLeaf = (l: AutumnLeaf) => {
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(l.angle);
      // Realistic 3D leaf tumbling: scale X by cosine of flip angle
      const scaleX = Math.cos(l.flip);
      ctx.scale(scaleX, 1);
      ctx.globalAlpha = l.opacity;

      const s = l.size;

      // 1. Petiole stem at bottom
      ctx.beginPath();
      ctx.strokeStyle = l.color;
      ctx.lineWidth = Math.max(1, s * 0.09);
      ctx.lineCap = 'round';
      ctx.moveTo(0, s * 0.42);
      ctx.quadraticCurveTo(s * 0.05, s * 0.65, s * 0.02, s * 0.88);
      ctx.stroke();

      // 2. Authentic 7-pointed Japanese Momiji leaf blade with curved lobes
      ctx.beginPath();
      ctx.fillStyle = l.color;

      ctx.moveTo(0, s * 0.42);

      // Right basal lobe
      ctx.quadraticCurveTo(s * 0.25, s * 0.38, s * 0.52, s * 0.32);
      ctx.lineTo(s * 0.38, s * 0.18);

      // Right middle lobe
      ctx.quadraticCurveTo(s * 0.68, s * 0.12, s * 0.88, -0.05 * s);
      ctx.lineTo(s * 0.52, -s * 0.22);

      // Right upper lobe
      ctx.quadraticCurveTo(s * 0.72, -s * 0.45, s * 0.72, -s * 0.68);
      ctx.lineTo(s * 0.28, -s * 0.52);

      // Center apical lobe (tallest center point)
      ctx.quadraticCurveTo(s * 0.15, -s * 0.82, 0, -s * 1.05);
      ctx.quadraticCurveTo(-s * 0.15, -s * 0.82, -s * 0.28, -s * 0.52);

      // Left upper lobe
      ctx.lineTo(-s * 0.72, -s * 0.68);
      ctx.quadraticCurveTo(-s * 0.72, -s * 0.45, -s * 0.52, -s * 0.22);

      // Left middle lobe
      ctx.lineTo(-s * 0.88, -0.05 * s);
      ctx.quadraticCurveTo(-s * 0.68, s * 0.12, -s * 0.38, s * 0.18);

      // Left basal lobe
      ctx.lineTo(-s * 0.52, s * 0.32);
      ctx.quadraticCurveTo(-s * 0.25, s * 0.38, 0, s * 0.42);

      ctx.closePath();
      ctx.fill();

      // 3. Delicate radiating leaf veins
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.lineWidth = 0.65;
      // Main center vein
      ctx.moveTo(0, s * 0.42);
      ctx.lineTo(0, -s * 0.95);
      // Upper veins
      ctx.moveTo(0, s * 0.42);
      ctx.lineTo(s * 0.62, -s * 0.6);
      ctx.moveTo(0, s * 0.42);
      ctx.lineTo(-s * 0.62, -s * 0.6);
      // Middle veins
      ctx.moveTo(0, s * 0.42);
      ctx.lineTo(s * 0.76, -s * 0.04);
      ctx.moveTo(0, s * 0.42);
      ctx.lineTo(-s * 0.76, -s * 0.04);
      // Basal veins
      ctx.moveTo(0, s * 0.42);
      ctx.lineTo(s * 0.45, s * 0.28);
      ctx.moveTo(0, s * 0.42);
      ctx.lineTo(-s * 0.45, s * 0.28);
      ctx.stroke();

      ctx.restore();
    };

    // ==========================================
    // 3. ORIGINAL SNOWFLAKES (ICY-BLUE WINTER NIGHT)
    // (Restored authentic #E0F2FE icy-blue core & delicate frost glow)
    // ==========================================
    const snowCount = isMobile ? 28 : 52;
    const createSnowflake = (initialSpawn: boolean = false): Snowflake => {
      const radius = 1.0 + Math.random() * 2.2;
      return {
        x: Math.random() * width,
        y: initialSpawn ? Math.random() * height : -15 - Math.random() * 20,
        radius,
        speedY: 0.6 + Math.random() * 1.1, // gentle snowfall speed
        speedX: -0.2 + Math.random() * 0.5,
        oscillationSpeed: 0.01 + Math.random() * 0.02,
        oscillationDistance: 0.4 + Math.random() * 0.8,
        angle: Math.random() * Math.PI * 2,
        opacity: 0.35 + Math.random() * 0.45,
        hasGlow: radius > 1.8,
      };
    };

    const snowflakes: Snowflake[] =
      theme === 'snow'
        ? Array.from({ length: snowCount }, () => createSnowflake(true))
        : [];

    const drawSnowflake = (s: Snowflake) => {
      ctx.save();
      ctx.globalAlpha = s.opacity;

      // Authentic icy-blue appearance with delicate frost halo for larger flakes
      if (s.hasGlow) {
        const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius * 2.2);
        halo.addColorStop(0, 'rgba(224, 242, 254, 0.85)');
        halo.addColorStop(0.5, 'rgba(186, 230, 253, 0.35)');
        halo.addColorStop(1, 'rgba(186, 230, 253, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Crisp icy-blue core (#E0F2FE)
      ctx.fillStyle = '#E0F2FE';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    // ==========================================
    // 4. ADJUSTABLE RAIN SYSTEM WITH RAINSTORM WIND
    // ==========================================
    let rainCount = 0;
    let baseSpeedY = 10;
    let baseThickness = 1.0;
    let baseLength = 16;
    let baseOpacity = 0.25;

    if (effectiveRainLevel === 1) {
      // Light Rain
      rainCount = isMobile ? 24 : 40;
      baseSpeedY = 8.5;
      baseThickness = 0.8;
      baseLength = 13;
      baseOpacity = 0.2;
    } else if (effectiveRainLevel === 2) {
      // Moderate Rain
      rainCount = isMobile ? 45 : 78;
      baseSpeedY = 12.0;
      baseThickness = 1.1;
      baseLength = 18;
      baseOpacity = 0.28;
    } else if (effectiveRainLevel === 3) {
      // Heavy Rain
      rainCount = isMobile ? 85 : 140;
      baseSpeedY = 16.5;
      baseThickness = 1.3;
      baseLength = 24;
      baseOpacity = 0.34;
    } else if (effectiveRainLevel === 4) {
      // Rainstorm (Wind-blown)
      rainCount = isMobile ? 150 : 240;
      baseSpeedY = 21.0;
      baseThickness = 1.5;
      baseLength = 30;
      baseOpacity = 0.4;
    }

    const raindrops: Raindrop[] = hasRain
      ? Array.from({ length: rainCount }, () => ({
          x: Math.random() * (width + 300) - 150,
          y: Math.random() * height,
          length: baseLength + Math.random() * (baseLength * 0.7),
          speedY: baseSpeedY + Math.random() * (baseSpeedY * 0.4),
          speedX: 0,
          opacity: baseOpacity + Math.random() * 0.2,
          thickness: baseThickness + Math.random() * 0.5,
        }))
      : [];

    const mistWisps: MistWisp[] =
      effectiveRainLevel === 4
        ? Array.from({ length: 4 }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            width: 140 + Math.random() * 180,
            height: 25 + Math.random() * 35,
            speedX: -6.0 - Math.random() * 4.0,
            speedY: 2.0 + Math.random() * 2.0,
            opacity: 0.05 + Math.random() * 0.07,
          }))
        : [];

    // ==========================================
    // 5. STARLIGHT (COSMIC NIGHT)
    // ==========================================
    const starCount = isMobile ? 40 : 75;
    const stars: Star[] =
      theme === 'starlight'
        ? Array.from({ length: starCount }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: 0.6 + Math.random() * 1.5,
            baseAlpha: 0.2 + Math.random() * 0.6,
            twinkleSpeed: 0.015 + Math.random() * 0.03,
            twinklePhase: Math.random() * Math.PI * 2,
            color: Math.random() > 0.4 ? '#E0E7FF' : Math.random() > 0.5 ? '#DDD6FE' : '#BAE6FD',
          }))
        : [];

    // ==========================================
    // 6. SUNNY (GENTLE CLOUDS)
    // ==========================================
    const cloudCount = isMobile ? 3 : 5;
    const clouds: Cloud[] =
      theme === 'sunny'
        ? Array.from({ length: cloudCount }, (_, i) => ({
            x: (width / cloudCount) * i + Math.random() * 100,
            y: 40 + Math.random() * (height * 0.35),
            scale: 0.8 + Math.random() * 0.6,
            speedX: 0.12 + Math.random() * 0.15,
            opacity: 0.12 + Math.random() * 0.14,
          }))
        : [];

    // ==========================================
    // 7. CLOUDY (OVERCAST HAZE DRIFT)
    // ==========================================
    const mistCount = isMobile ? 3 : 4;
    const mists: MistHaze[] =
      theme === 'cloudy'
        ? Array.from({ length: mistCount }, (_, i) => ({
            x: (width / mistCount) * i,
            y: 60 + Math.random() * (height * 0.45),
            speedX: 0.08 + Math.random() * 0.1,
            radius: 120 + Math.random() * 100,
            opacity: 0.08 + Math.random() * 0.1,
          }))
        : [];

    // ==========================================
    // UNIFIED ANIMATION RENDER LOOP
    // ==========================================
    const render = () => {
      tick++;

      if (isVisible) {
        ctx.clearRect(0, 0, width, height);

        // 1. RENDER SAKURA
        if (theme === 'sakura') {
          for (let i = 0; i < sakuraPetals.length; i++) {
            const p = sakuraPetals[i];
            p.y += p.speedY;
            p.x += p.speedX + Math.sin(tick * p.oscillationSpeed) * p.oscillationDistance;
            p.angle += p.rotationSpeed;
            p.flip += p.flipSpeed;

            if (p.y > height + 40 || p.x > width + 60 || p.x < -60) {
              sakuraPetals[i] = createSakuraPetal(false);
            }

            drawSakuraPetal(p);
          }
        }

        // 2. RENDER AUTUMN
        if (theme === 'autumn') {
          for (let i = 0; i < autumnLeaves.length; i++) {
            const l = autumnLeaves[i];
            l.y += l.speedY;
            l.x += l.speedX + Math.sin(tick * l.wobbleSpeed) * l.wobbleDistance;
            l.angle += l.rotationSpeed;
            l.flip += l.flipSpeed;

            if (l.y > height + 40 || l.x > width + 60 || l.x < -60) {
              autumnLeaves[i] = createAutumnLeaf(false);
            }

            drawMapleLeaf(l);
          }
        }

        // 3. RENDER SNOW
        if (theme === 'snow') {
          for (let i = 0; i < snowflakes.length; i++) {
            const s = snowflakes[i];
            s.y += s.speedY;
            s.angle += s.oscillationSpeed;
            s.x += s.speedX + Math.sin(s.angle) * s.oscillationDistance;

            if (s.y > height + 20) {
              snowflakes[i] = createSnowflake(false);
            }
            if (s.x < -20) s.x = width + 20;
            if (s.x > width + 20) s.x = -20;

            drawSnowflake(s);
          }
        }

        // 4. RENDER RAIN
        if (hasRain) {
          ctx.strokeStyle = isDark ? '#38BDF8' : '#0284C7';

          // Dynamic wind slant
          let currentWindX = -1.2;
          if (effectiveRainLevel === 1) {
            currentWindX = -0.6;
          } else if (effectiveRainLevel === 2) {
            currentWindX = -1.4;
          } else if (effectiveRainLevel === 3) {
            currentWindX = -3.2;
          } else if (effectiveRainLevel === 4) {
            const gustWave =
              Math.sin(tick * 0.02) * 1.6 + Math.cos(tick * 0.04) * 0.9;
            currentWindX = -6.5 + gustWave;
          }

          raindrops.forEach((r) => {
            r.speedX = currentWindX;
            r.y += r.speedY;
            r.x += r.speedX;

            if (r.y > height + 30) {
              r.y = -30 - Math.random() * 40;
              r.x = Math.random() * (width + 300) - 50;
            }
            if (r.x < -100) {
              r.x = width + 50 + Math.random() * 100;
            }

            ctx.save();
            ctx.globalAlpha = isDark ? r.opacity : Math.min(0.7, r.opacity * 1.35);
            ctx.lineWidth = r.thickness;
            ctx.beginPath();
            ctx.moveTo(r.x, r.y);
            ctx.lineTo(r.x + r.speedX * 2.2, r.y + r.length);
            ctx.stroke();
            ctx.restore();
          });

          // Wind mist bands for Rainstorm (Level 4)
          if (effectiveRainLevel === 4) {
            mistWisps.forEach((m) => {
              m.x += m.speedX;
              m.y += m.speedY;

              if (m.x + m.width < -50) {
                m.x = width + 50;
                m.y = Math.random() * (height * 0.8);
              }
              if (m.y > height + 50) {
                m.y = -50;
              }

              ctx.save();
              ctx.globalAlpha = m.opacity;
              const grad = ctx.createLinearGradient(m.x, m.y, m.x + m.width, m.y + m.height);
              grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
              grad.addColorStop(0.5, isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.12)');
              grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
              ctx.fillStyle = grad;
              ctx.fillRect(m.x, m.y, m.width, m.height);
              ctx.restore();
            });
          }
        }

        // 5. RENDER STARLIGHT
        if (theme === 'starlight') {
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

        // 6. RENDER SUNNY
        if (theme === 'sunny') {
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

        // 7. RENDER CLOUDY
        if (theme === 'cloudy') {
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
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
      if (canvasRef.current) {
        const c = canvasRef.current;
        const cx = c.getContext('2d');
        if (cx) {
          cx.clearRect(0, 0, c.width, c.height);
        }
      }
    };
  }, [theme, rainIntensity, customPageBg]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-10 w-full h-full"
      aria-hidden="true"
    />
  );
};
