import type { AppMode } from '../components/WorldSwitcher';

export const ACTIVE_WORLD_STORAGE_KEY = 'aniverse_active_world';

const VALID_MODES: readonly AppMode[] = ['anime', 'music', 'books'];

export function isValidAppMode(value: unknown): value is AppMode {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

/**
 * Resolves the initial AniVerse world mode on startup:
 * 1. Explicit URL handoff (`?world=books|anime|music`) or legacy `/book-tracker` path
 *    (persists the mode and cleans the URL back to `/` so the main app stays on `/`).
 * 2. Persisted `localStorage` value under `aniverse_active_world`.
 * 3. Default `'anime'`.
 */
export function resolveInitialAppMode(options?: {
  location?: Pick<Location, 'pathname' | 'search' | 'hash'>;
  history?: Pick<History, 'replaceState'>;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}): AppMode {
  const loc = options?.location ?? (typeof window !== 'undefined' ? window.location : undefined);
  const hist = options?.history ?? (typeof window !== 'undefined' ? window.history : undefined);
  const store = options?.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);

  if (loc) {
    const params = new URLSearchParams(loc.search);
    const requestedWorld = params.get('world');
    const isLegacyBookTrackerPath =
      loc.pathname === '/book-tracker' || loc.pathname.startsWith('/book-tracker/');

    const handoffMode: AppMode | null = isValidAppMode(requestedWorld)
      ? requestedWorld
      : isLegacyBookTrackerPath
        ? 'books'
        : null;

    if (handoffMode) {
      try {
        store?.setItem(ACTIVE_WORLD_STORAGE_KEY, handoffMode);
      } catch {
        // Ignore storage restrictions
      }

      if (hist && typeof hist.replaceState === 'function') {
        params.delete('world');
        const remainingQuery = params.toString();
        const targetPath = isLegacyBookTrackerPath ? '/' : loc.pathname || '/';
        const cleanUrl = `${targetPath}${remainingQuery ? `?${remainingQuery}` : ''}${loc.hash || ''}`;
        try {
          hist.replaceState(null, '', cleanUrl);
        } catch {
          // Ignore history errors in restricted frames
        }
      }

      return handoffMode;
    }
  }

  try {
    const saved = store?.getItem(ACTIVE_WORLD_STORAGE_KEY);
    if (isValidAppMode(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage restrictions
  }

  return 'anime';
}

export function persistAppMode(
  mode: AppMode,
  storage?: Pick<Storage, 'setItem'>
): void {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return;
  try {
    store.setItem(ACTIVE_WORLD_STORAGE_KEY, mode);
  } catch {
    // Ignore storage restrictions
  }
}

const LEGACY_BOOK_TRACKER_CACHE_PATTERN = /^(workbox-|book-tracker|aniverse-book-tracker)/i;

/**
 * Safely retires obsolete standalone `/book-tracker/` service worker registrations
 * and deletes ONLY their associated Workbox/Book Tracker SW caches.
 * Never unregisters unrelated service workers and never touches IndexedDB or localStorage.
 */
export async function retireLegacyBookTrackerServiceWorker(): Promise<{
  unregisteredScopes: string[];
  deletedCaches: string[];
}> {
  const unregisteredScopes: string[] = [];
  const deletedCaches: string[] = [];

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { unregisteredScopes, deletedCaches };
  }

  try {
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        try {
          const scopePath = new URL(reg.scope, window.location.origin).pathname;
          if (scopePath === '/book-tracker' || scopePath.startsWith('/book-tracker/')) {
            const ok = await reg.unregister();
            if (ok) {
              unregisteredScopes.push(reg.scope);
            }
          }
        } catch {
          // Ignore malformed registration scopes
        }
      }
    }
  } catch {
    // Ignore service worker lookup errors in restricted contexts
  }

  try {
    if ('caches' in window && typeof window.caches?.keys === 'function') {
      const keys = await window.caches.keys();
      for (const key of keys) {
        if (LEGACY_BOOK_TRACKER_CACHE_PATTERN.test(key)) {
          const deleted = await window.caches.delete(key);
          if (deleted) {
            deletedCaches.push(key);
          }
        }
      }
    }
  } catch {
    // Ignore Cache Storage errors in restricted contexts
  }

  return { unregisteredScopes, deletedCaches };
}
