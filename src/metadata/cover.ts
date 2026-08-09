// Cover image download + client-side resize + blob storage, per SPEC §5.2.
import { saveCover } from '../db/queries';

const MAX_WIDTH = 400;

/** Fetch a remote cover URL, resize to max 400px wide, store as a blob. Returns the covers-table id. */
export async function downloadAndStoreCover(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return undefined;
    const resized = await resizeImageBlob(blob, MAX_WIDTH);
    return saveCover(resized);
  } catch {
    // Network failure downloading a cover should never break the add flow.
    return undefined;
  }
}

/** Resize an arbitrary image blob (e.g. from a file input) and store it. */
export async function storeCoverFromBlob(blob: Blob): Promise<string> {
  const resized = await resizeImageBlob(blob, MAX_WIDTH);
  return saveCover(resized);
}

async function resizeImageBlob(blob: Blob, maxWidth: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return blob;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const type = (await supportsWebp()) ? 'image/webp' : 'image/jpeg';
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  return out ?? blob;
}

let webpSupport: Promise<boolean> | undefined;
function supportsWebp(): Promise<boolean> {
  if (!webpSupport) {
    webpSupport = new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvas.toBlob((blob) => resolve(!!blob && blob.type === 'image/webp'), 'image/webp');
    });
  }
  return webpSupport;
}
