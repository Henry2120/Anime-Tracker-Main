import { createUuid, db } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type { CoverAsset } from '../types/domain';

export interface ResolvedCoverSource {
  src: string;
  isObjectUrl: boolean;
}

export function isSafeImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }
  if (/^blob:/i.test(normalized)) return true;
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,/i.test(normalized)) return true;
  return false;
}

export function sanitizeCoverUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  if (!isSafeImageUrl(normalized)) return undefined;
  return normalized;
}

export async function compressCoverImage(file: File | Blob, maxDimension = 900): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ?? file),
        'image/jpeg',
        0.84
      );
    });
  } catch {
    return file;
  }
}

export async function saveLocalCoverBlob(editionId: string, file: File | Blob): Promise<CoverAsset> {
  const compressed = await compressCoverImage(file);
  const id = createUuid();
  const asset: CoverAsset = {
    id,
    editionId,
    localBlob: compressed,
    mimeType: compressed.type || 'image/jpeg',
    byteSize: compressed.size,
    syncStatus: 'pending_upload',
    updatedAt: new Date().toISOString(),
  };

  // Replace previous local cover assets for this edition so orphan blobs do not accumulate
  await db.cover_assets.where('editionId').equals(editionId).delete();
  await db.cover_assets.put(asset);

  // Attach blob key onto edition so offline views render immediately
  const edition = await db.editions.get(editionId);
  if (edition) {
    await db.editions.put({
      ...edition,
      coverBlobKey: id,
      updatedAt: new Date().toISOString(),
      version: edition.version + 1,
    });
  }
  return asset;
}

export async function uploadPendingCoversToSupabase(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;

  const pending = await db.cover_assets
    .where('syncStatus')
    .equals('pending_upload')
    .toArray();

  let uploaded = 0;
  for (const asset of pending) {
    if (!asset.localBlob) continue;
    const storagePath = `${userId}/${asset.editionId}-${asset.id}.jpg`;
    const { error } = await supabase.storage
      .from('book-covers')
      .upload(storagePath, asset.localBlob, {
        contentType: asset.mimeType || 'image/jpeg',
        upsert: true,
      });

    if (!error) {
      await db.cover_assets.put({
        ...asset,
        storagePath,
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      });
      const edition = await db.editions.get(asset.editionId);
      if (edition) {
        await db.editions.put({
          ...edition,
          coverStoragePath: storagePath,
          updatedAt: new Date().toISOString(),
        });
      }
      uploaded++;
    }
  }
  return uploaded;
}

export async function resolveEditionCoverSources(
  edition: { coverBlobKey?: string; coverStoragePath?: string; coverUrl?: string }
): Promise<ResolvedCoverSource[]> {
  const sources: ResolvedCoverSource[] = [];
  const seen = new Set<string>();
  const push = (src: string | undefined | null, isObjectUrl = false) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    sources.push({ src, isObjectUrl });
  };

  if (edition.coverBlobKey) {
    const asset = await db.cover_assets.get(edition.coverBlobKey);
    if (asset?.localBlob) {
      push(URL.createObjectURL(asset.localBlob), true);
    }
  }

  if (edition.coverStoragePath) {
    const supabase = getSupabaseClient();
    if (supabase && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      try {
        const { data } = await supabase.storage
          .from('book-covers')
          .createSignedUrl(edition.coverStoragePath, 3600);
        if (data?.signedUrl && isSafeImageUrl(data.signedUrl)) {
          push(data.signedUrl, false);
        }
      } catch {
        // Fallback smoothly to coverUrl below
      }
    }
  }

  const safeExternal = sanitizeCoverUrl(edition.coverUrl);
  if (safeExternal) {
    push(safeExternal, false);
  }

  return sources;
}

export async function resolveEditionCoverObjectUrl(
  edition: { coverBlobKey?: string; coverStoragePath?: string; coverUrl?: string }
): Promise<string | null> {
  const sources = await resolveEditionCoverSources(edition);
  return sources[0]?.src ?? null;
}
