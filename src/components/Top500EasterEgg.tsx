import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, Delete, Trophy, Sparkles, Award, ArrowLeft, Volume2, ShieldCheck, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Temporary AI Riser Vietnam 2026 Top 500 celebration Easter egg.
// Set to false when the celebration period is over.
export const SHOW_TOP_500_EASTER_EGG = true;

// Keypad buttons layout matching requested specification:
// 1: ABC | 2: DEF | 3: GHI
// 4: JKL | 5: MNO | 6: PQR
// 7: STU | 8: VWX | 9: YZ
// *:     | 0: +   | #:
const KEYPAD_BUTTONS = [
  { digit: '1', letters: 'ABC' },
  { digit: '2', letters: 'DEF' },
  { digit: '3', letters: 'GHI' },
  { digit: '4', letters: 'JKL' },
  { digit: '5', letters: 'MNO' },
  { digit: '6', letters: 'PQR' },
  { digit: '7', letters: 'STU' },
  { digit: '8', letters: 'VWX' },
  { digit: '9', letters: 'YZ' },
  { digit: '*', letters: '' },
  { digit: '0', letters: '+' },
  { digit: '#', letters: '' },
];

const CERTIFICATE_CANDIDATE_PATHS = [
  '/certificates/top500-certificate.png',
  '/certificates/top500.png',
  '/certificates/certificate.png',
  '/certificates/top_500.png',
  '/certificates/airiser-top500.png',
  '/certificates/top500-certificate.jpg',
  '/certificates/top500.jpg',
  '/certificates/certificate.jpg',
];

export const Top500EasterEgg: React.FC = () => {
  const [isDialerOpen, setIsDialerOpen] = useState(false);
  const [dialedNumber, setDialedNumber] = useState('');
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connected' | 'rejected'>('idle');
  const [showCelebration, setShowCelebration] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [validCertImageSrc, setValidCertImageSrc] = useState<string | null>(null);

  const phoneModalRef = useRef<HTMLDivElement>(null);
  const celebrationRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Respect prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Update clock time for smartphone status bar
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  // Check if any local certificate image exists in static public folder
  useEffect(() => {
    let isMounted = true;
    const testImages = async () => {
      for (const path of CERTIFICATE_CANDIDATE_PATHS) {
        try {
          const img = new Image();
          const loaded = await new Promise<boolean>((resolve) => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = path;
          });
          if (loaded && isMounted) {
            setValidCertImageSrc(path);
            return;
          }
        } catch {
          // continue testing candidates
        }
      }
    };
    testImages();
    return () => {
      isMounted = false;
    };
  }, []);

  // Number input handlers
  const handleAddDigit = useCallback((char: string) => {
    if (callState !== 'idle') return;
    setDialedNumber((prev) => {
      if (prev.length >= 10) return prev;
      return prev + char;
    });
  }, [callState]);

  const handleDeleteDigit = useCallback(() => {
    if (callState !== 'idle') return;
    setDialedNumber((prev) => (prev.length > 0 ? prev.slice(0, -1) : ''));
  }, [callState]);

  const handleCloseDialer = useCallback(() => {
    setIsDialerOpen(false);
    setDialedNumber('');
    setCallState('idle');
  }, []);

  const handleCall = useCallback(() => {
    if (callState !== 'idle') return;
    if (!dialedNumber) return;

    if (dialedNumber === '500') {
      // Phase 1: Calling
      setCallState('calling');

      const timer1 = setTimeout(() => {
        // Phase 2: Connection
        setCallState('connected');

        const timer2 = setTimeout(() => {
          // Phase 3: AniVerse transforms into celebration
          setIsDialerOpen(false);
          setCallState('idle');
          setDialedNumber('');
          setShowCelebration(true);
        }, 1100);

        return () => clearTimeout(timer2);
      }, 1500);

      return () => clearTimeout(timer1);
    } else {
      // Phase: Incorrect number feedback
      setCallState('rejected');
      const timer = setTimeout(() => {
        setCallState('idle');
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [callState, dialedNumber]);

  // Physical keyboard support while dialer is open
  useEffect(() => {
    if (!isDialerOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showCelebration) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseDialer();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteDigit();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleCall();
      } else if (/^[0-9]$/.test(e.key) || e.key === '*' || e.key === '#') {
        e.preventDefault();
        handleAddDigit(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialerOpen, showCelebration, handleCloseDialer, handleDeleteDigit, handleCall, handleAddDigit]);

  // Celebration escape key listener
  useEffect(() => {
    if (!showCelebration) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCelebration(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCelebration]);

  // Celebration Falling Sakura Petals Animation
  useEffect(() => {
    if (!showCelebration || prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const isMobile = width < 768;
    const petalCount = isMobile ? 22 : 42;

    const colors = ['#FFB7C5', '#FFC2CD', '#FCAEBB', '#FFD1DC', '#FFE8D6', '#FFCCD5'];

    interface CelebrationPetal {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      flip: number;
      flipSpeed: number;
      angle: number;
      rotationSpeed: number;
      opacity: number;
      color: string;
    }

    const petals: CelebrationPetal[] = Array.from({ length: petalCount }, (_, i) => ({
      x: Math.random() * width,
      y: (i / petalCount) * height,
      size: 11 + Math.random() * 13,
      speedY: 0.8 + Math.random() * 1.4,
      speedX: -0.4 + Math.random() * 1.1,
      flip: Math.random() * Math.PI,
      flipSpeed: 0.018 + Math.random() * 0.028,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.03,
      opacity: 0.55 + Math.random() * 0.35,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      petals.forEach((p) => {
        p.y += p.speedY;
        p.x += p.speedX;
        p.flip += p.flipSpeed;
        p.angle += p.rotationSpeed;

        if (p.y > height + 35) {
          p.y = -25;
          p.x = Math.random() * width;
        }
        if (p.x > width + 35) p.x = -25;
        else if (p.x < -35) p.x = width + 25;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(Math.cos(p.flip), 1);

        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;

        const r = p.size;
        ctx.moveTo(0, -r);
        ctx.bezierCurveTo(r * 0.8, -r * 0.8, r * 0.9, r * 0.3, 0, r);
        ctx.bezierCurveTo(-r * 0.9, r * 0.3, -r * 0.8, -r * 0.8, 0, -r);
        ctx.fill();

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 0.6;
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(0, r * 0.5);
        ctx.stroke();

        ctx.restore();
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [showCelebration, prefersReducedMotion]);

  return (
    <>
      {/* 1. FLOATING PHONE ICON (Bottom-Right Corner) */}
      {!isDialerOpen && !showCelebration && (
        <div className="fixed bottom-6 right-6 z-40">
          <button
            id="aniverse-easter-egg-phone-btn"
            type="button"
            onClick={() => setIsDialerOpen(true)}
            aria-label="Direct Phone Line"
            title="Direct Line"
            className="group relative w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#1C1A24]/90 hover:bg-[#252332] active:bg-[#15141c] text-[#F4D9DF] hover:text-white border border-[#E78B90]/40 hover:border-[#E78B90] shadow-lg shadow-[#1C1A24]/40 hover:shadow-[#E78B90]/25 transition-all duration-200 hover:-translate-y-0.5 active:scale-95 flex items-center justify-center cursor-pointer backdrop-blur-md"
          >
            {/* Subtle Sakura Blossom Petal Badge Detail */}
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-[#E78B90] to-[#FFD1DC] border border-[#1C1A24] shadow-sm flex items-center justify-center opacity-90 group-hover:scale-110 transition-transform">
              <span className="w-1 h-1 rounded-full bg-white animate-ping" />
            </span>

            {/* Phone Icon */}
            <Phone className="w-5 h-5 text-[#E78B90] group-hover:text-white transition-colors" />

            {/* Soft subtle glow halo on hover */}
            <span className="absolute inset-0 rounded-full bg-[#E78B90]/10 opacity-0 group-hover:opacity-100 transition-opacity blur-sm pointer-events-none" />
          </button>
        </div>
      )}

      {/* 2. SMARTPHONE DIALER MODAL */}
      <AnimatePresence>
        {isDialerOpen && !showCelebration && (
          <div
            id="aniverse-dialer-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleCloseDialer();
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="AniVerse Smartphone Dialer"
          >
            <motion.div
              ref={phoneModalRef}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 15 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 15 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-[325px] max-w-[94vw] sm:w-[345px] bg-[#1A1924] rounded-[44px] p-3.5 shadow-2xl border-4 border-[#2B273D] relative select-none"
            >
              {/* Smartphone Chassis Details: Speaker slit & Camera punch-hole */}
              <div className="flex items-center justify-center gap-2 mb-2 pt-0.5">
                <div className="w-12 h-1 bg-white/20 rounded-full" />
                <div className="w-2.5 h-2.5 bg-black rounded-full border border-white/10" />
              </div>

              {/* Smartphone Screen Area */}
              <div className="bg-gradient-to-b from-[#14121D] via-[#100E17] to-[#0D0B13] rounded-[32px] p-4 text-white overflow-hidden border border-white/5 flex flex-col justify-between min-h-[490px]">
                {/* Status Bar */}
                <div className="flex items-center justify-between text-[11px] text-white/60 px-1 font-mono">
                  <span>{currentTime || '12:00'}</span>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    {/* Signal bars */}
                    <div className="flex items-end gap-0.5 h-2.5">
                      <span className="w-0.5 h-1 bg-white/80 rounded-xs" />
                      <span className="w-0.5 h-1.5 bg-white/80 rounded-xs" />
                      <span className="w-0.5 h-2 bg-white/80 rounded-xs" />
                      <span className="w-0.5 h-2.5 bg-white/80 rounded-xs" />
                    </div>
                    <span>5G</span>
                    {/* Battery */}
                    <div className="w-5 h-2.5 border border-white/60 rounded-xs p-0.5 flex items-center">
                      <div className="h-full w-3/4 bg-white/90 rounded-2xs" />
                    </div>
                  </div>
                </div>

                {/* Display Screen with Dialed Number */}
                <div className="my-auto py-1.5 flex flex-col items-center justify-center text-center">
                  <div className="min-h-[50px] flex items-center justify-center px-2">
                    {dialedNumber ? (
                      <span className="text-3xl sm:text-4xl font-mono font-bold tracking-widest text-white">
                        {dialedNumber}
                      </span>
                    ) : (
                      <span className="text-white/20 text-sm font-sans tracking-normal">
                        Enter number...
                      </span>
                    )}
                  </div>

                  {/* Call State Feedback */}
                  <div className="h-6 flex items-center justify-center mt-1">
                    {callState === 'calling' && (
                      <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold animate-pulse">
                        <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                        <span>Calling...</span>
                      </div>
                    )}
                    {callState === 'connected' && (
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold tracking-wide">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>CONNECTED</span>
                      </div>
                    )}
                    {callState === 'rejected' && (
                      <motion.div
                        initial={{ x: -5 }}
                        animate={{ x: [-5, 5, -3, 3, 0] }}
                        transition={{ duration: 0.3 }}
                        className="text-rose-400 text-[11px] font-semibold tracking-wide"
                      >
                        NUMBER NOT RECOGNIZED
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Keypad Grid (3 columns x 4 rows) */}
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3 place-items-center my-1.5">
                  {KEYPAD_BUTTONS.map(({ digit, letters }) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handleAddDigit(digit)}
                      disabled={callState !== 'idle'}
                      aria-label={`Digit ${digit} ${letters}`}
                      className="w-14 h-14 sm:w-15 sm:h-15 rounded-full bg-white/[0.08] hover:bg-white/[0.16] active:bg-white/[0.24] border border-white/10 active:scale-95 transition-all flex flex-col items-center justify-center cursor-pointer select-none text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="text-xl sm:text-2xl font-bold leading-none">{digit}</span>
                      {letters ? (
                        <span className="text-[8px] sm:text-[9px] text-white/50 font-semibold tracking-widest leading-none mt-0.5">
                          {letters}
                        </span>
                      ) : (
                        <span className="h-[9px]" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Bottom Controls: DELETE, CALL, CANCEL */}
                <div className="mt-3 flex flex-col items-center">
                  <div className="w-full flex items-center justify-center gap-5 px-3">
                    {/* DELETE button */}
                    <button
                      type="button"
                      onClick={handleDeleteDigit}
                      disabled={callState !== 'idle' || dialedNumber.length === 0}
                      aria-label="Delete last digit"
                      className="h-13 px-4 rounded-full flex items-center gap-1.5 text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
                    >
                      <Delete className="w-4 h-4" />
                      <span className="text-[10px] font-bold tracking-wider uppercase">Delete</span>
                    </button>

                    {/* ☎ CALL button */}
                    <button
                      type="button"
                      onClick={handleCall}
                      disabled={callState !== 'idle' || dialedNumber.length === 0}
                      aria-label="Call dialed number"
                      className="h-13 px-6 rounded-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white shadow-lg shadow-emerald-500/35 flex items-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Phone className="w-4 h-4" />
                      <span className="text-xs font-bold tracking-wider uppercase">Call</span>
                    </button>
                  </div>

                  {/* CANCEL button */}
                  <button
                    type="button"
                    onClick={handleCloseDialer}
                    className="mt-3.5 text-white/50 hover:text-white text-[11px] font-semibold py-1 px-4 tracking-widest uppercase transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. FULL-SCREEN CELEBRATION OVERLAY */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            ref={celebrationRef}
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            id="aniverse-top500-celebration"
            className="fixed inset-0 z-50 overflow-y-auto bg-[#0E0C16]/95 backdrop-blur-2xl flex flex-col items-center justify-start min-h-screen text-white py-8 sm:py-12 px-4 select-none"
            role="dialog"
            aria-modal="true"
            aria-label="AniVerse Top 500 Celebration"
          >
            {/* Background Subtle Radial Glow & Sparkles */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[600px] bg-gradient-to-b from-[#7567C7]/20 via-[#E78B90]/15 to-transparent rounded-full blur-3xl opacity-75" />
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-[#FFE29F]/10 rounded-full blur-3xl" />
            </div>

            {/* Falling Sakura Petals Canvas */}
            <canvas
              ref={canvasRef}
              className="fixed inset-0 pointer-events-none z-10 w-full h-full"
            />

            {/* Main Celebration Content Container */}
            <div className="relative z-20 w-full max-w-2xl flex flex-col items-center text-center my-auto space-y-6">
              {/* Sakura Emoji Blossom Header */}
              <div className="flex items-center gap-2 text-xl sm:text-2xl animate-bounce duration-1000">
                <span>🌸</span>
                <span className="text-xs sm:text-sm font-bold tracking-[0.25em] text-[#E78B90] uppercase">
                  A Special AniVerse Milestone
                </span>
                <span>🌸</span>
              </div>

              {/* Main Trophy & Title */}
              <div className="space-y-2">
                <div className="inline-flex items-center justify-center p-3.5 rounded-full bg-gradient-to-tr from-amber-500/20 to-rose-500/20 border border-amber-400/30 shadow-xl shadow-amber-500/15 mb-2">
                  <Trophy className="w-10 h-10 sm:w-14 sm:h-14 text-amber-400 animate-pulse" />
                </div>

                <h1 className="text-5xl sm:text-7xl font-black tracking-tight bg-gradient-to-r from-[#FFE29F] via-[#FFAE70] to-[#FF89A0] bg-clip-text text-transparent drop-shadow-md">
                  TOP 500
                </h1>

                <h2 className="text-xl sm:text-2xl font-bold tracking-wider text-[#F0EDFA] uppercase">
                  AI Riser Vietnam 2026
                </h2>

                <p className="text-base sm:text-lg text-white/90 max-w-md mx-auto font-medium leading-relaxed pt-1">
                  AniVerse has made it into the Top 500!
                </p>
              </div>

              {/* Secondary Achievement Card: Certificate */}
              <div className="w-full max-w-lg mt-2">
                <div className="relative group rounded-2xl p-1 bg-gradient-to-b from-[#FFE29F]/40 via-[#E78B90]/20 to-transparent shadow-2xl">
                  <div className="bg-[#151322] rounded-xl p-4 sm:p-5 border border-white/10 relative overflow-hidden text-center">
                    {/* Corner decorative accents */}
                    <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-amber-400/60" />
                    <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-amber-400/60" />
                    <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-amber-400/60" />
                    <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-amber-400/60" />

                    {validCertImageSrc ? (
                      /* Display Actual Supplied Certificate Image */
                      <div className="rounded-lg overflow-hidden border border-white/10 shadow-lg">
                        <img
                          src={validCertImageSrc}
                          alt="AI Riser Vietnam 2026 Top 500 Certificate"
                          className="w-full h-auto object-contain rounded-md"
                        />
                      </div>
                    ) : (
                      /* Elegant Framed Plaque Representation */
                      <div className="py-5 px-3 space-y-2.5">
                        <div className="flex items-center justify-center gap-1.5 text-amber-400 text-xs font-bold tracking-widest uppercase">
                          <Award className="w-4 h-4 text-amber-400" />
                          <span>Official Certificate of Achievement</span>
                          <Award className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-[#FFE29F] tracking-wide font-serif">
                          AI RISER VIETNAM 2026
                        </div>
                        <div className="text-xs text-white/70 tracking-wider uppercase font-medium">
                          Recognizing Excellence in AI Innovation
                        </div>
                        <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent mx-auto my-2" />
                        <div className="text-lg font-bold text-white tracking-tight">
                          Project: <span className="text-[#FFAE70]">AniVerse</span>
                        </div>
                        <div className="inline-block px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-wider mt-1">
                          Top 500 Honoree
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tagline & Sparkles */}
              <div className="space-y-2 pt-2">
                <p className="text-sm sm:text-base text-white/75 italic font-sans max-w-sm mx-auto">
                  Built with anime, AI, and a lot of debugging.
                </p>
                <div className="flex items-center justify-center gap-2 text-amber-300 text-sm">
                  <Sparkles className="w-4 h-4 animate-spin duration-3000" />
                  <Sparkles className="w-5 h-5 text-rose-300" />
                  <Sparkles className="w-4 h-4 animate-spin duration-3000" />
                </div>
              </div>

              {/* Return to AniVerse Button */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => setShowCelebration(false)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-sm font-semibold border border-white/20 shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Return to AniVerse</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
