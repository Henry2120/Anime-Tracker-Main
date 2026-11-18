import { createUuid, db } from '../db/dexie';
import { getSupabaseClient } from '../lib/supabase';
import type { CoverAsset } from '../types/domain';

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
  if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;

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

export async function resolveEditionCoverObjectUrl(
  edition: { coverBlobKey?: string; coverStoragePath?: string; coverUrl?: string }
): Promise<string | null> {
  if (edition.coverBlobKey) {
    const asset = await db.cover_assets.get(edition.coverBlobKey);
    if (asset?.localBlob) {
      return URL.createObjectURL(asset.localBlob);
    }
  }
  if (edition.coverStoragePath) {
    const supabase = getSupabaseClient();
    if (supabase && (typeof navigator === 'undefined' || navigator.onLine)) {
      const { data } = await supabase.storage
        .from('book-covers')
        .createSignedUrl(edition.coverStoragePath, 3600);
      if (data?.signedUrl) return data.signedUrl;
    }
  }
  return edition.coverUrl || null;
}
