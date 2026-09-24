/**
 * High-performance deferred task scheduler for AniVerse.
 * Allows the browser main thread to complete painting and rendering
 * before executing non-urgent background enrichment tasks.
 */
export function scheduleDeferredTask(task: () => void, timeoutMs = 60): () => void {
  let cancelled = false;
  let rafId: number | null = null;
  let ricId: number | null = null;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    if (cancelled) return;
    task();
  };

  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      ricId = (window as any).requestIdleCallback(
        () => {
          run();
        },
        { timeout: timeoutMs }
      );
    } else if (typeof requestAnimationFrame !== 'undefined') {
      rafId = requestAnimationFrame(() => {
        timerId = setTimeout(run, 0);
      });
    } else {
      timerId = setTimeout(run, 0);
    }
  } else {
    task();
  }

  return () => {
    cancelled = true;
    if (ricId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      (window as any).cancelIdleCallback(ricId);
    }
    if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(rafId);
    }
    if (timerId !== null) {
      clearTimeout(timerId);
    }
  };
}
