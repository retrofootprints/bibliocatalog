// Tier 2 — Shelf photo OCR (SPEC §4.2, Phase 5).
//
// The only entry point into the OCR module. Everything below it is code-split:
// this file is reached exclusively through a dynamic `import()` from
// features/shelf/ShelfScanView.tsx, after the user has accepted the download
// (SPEC §1.5). The app builds and runs with none of it loaded.
//
// Never auto-commits. `runShelfOcr` returns candidates; writing books is the
// review queue's job.

import { cleanSpineText, isUsable } from './candidates';
import { createSpineWorker } from './engine';
import { readBestOrientation } from './orientation';
import { preprocess } from './preprocess';
import { cropRegion, segmentShelf } from './segment';
import type { RunShelfOcrOptions, SpineCandidate } from './types';

export type { OcrProgress, RunShelfOcrOptions, SpineCandidate, SpineRegion } from './types';
export { LOW_CONFIDENCE } from './types';

/**
 * Ceiling on the bitmap kept in memory for cropping. Crops are taken from the
 * original rather than the segmentation proxy — reading them off the 2000px
 * proxy is what garbled the first version — but a 48 MP phone photo still has to
 * be reined in before iOS Safari runs out of room.
 */
const CROP_MAX_EDGE = 4000;

class Aborted extends Error {}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Aborted('Shelf OCR aborted');
}

async function decodeBounded(photo: Blob): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(photo);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (longEdge <= CROP_MAX_EDGE) return bitmap;

  const factor = CROP_MAX_EDGE / longEdge;
  const bounded = await createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * factor),
    resizeHeight: Math.round(bitmap.height * factor),
    resizeQuality: 'high',
  });
  bitmap.close();
  return bounded;
}

/**
 * Read a shelf photo and return one candidate per detected spine, best first.
 *
 * The photo is processed in memory and discarded when this resolves; only the
 * per-spine crops survive, and only for as long as the review queue displays
 * them (SPEC §12.2).
 */
export async function runShelfOcr(photo: Blob, options: RunShelfOcrOptions = {}): Promise<SpineCandidate[]> {
  const { onProgress, signal } = options;

  const source = await decodeBounded(photo);
  const candidates: SpineCandidate[] = [];

  try {
    const { regions, scale } = segmentShelf(source);
    onProgress?.({ done: 0, total: regions.length });
    if (regions.length === 0) return [];

    const worker = await createSpineWorker();
    try {
      for (const [index, region] of regions.entries()) {
        throwIfAborted(signal);

        const reading = await readBestOrientation(worker, source, region, scale);
        const rawText = cleanSpineText(reading.text);
        onProgress?.({ done: index + 1, total: regions.length });
        if (!isUsable(rawText)) continue;

        // Re-cut at the winning rotation: the card shows the spine the way up OCR
        // read it, so a wrong turn is obvious at a glance and the text is legible
        // without tilting your head.
        const display = cropRegion(source, region, scale, reading.rotation);

        candidates.push({
          id: `spine-${index}`,
          rawText,
          confidence: reading.score,
          rotation: reading.rotation,
          region,
          crop: await display.convertToBlob({ type: 'image/png' }),
          debugCrop: await preprocess(display, 'binary').convertToBlob({ type: 'image/png' }),
        });
      }
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    if (!(err instanceof Aborted)) throw err;
  } finally {
    source.close();
  }

  // Best reads first, as requested. This gives up left-to-right shelf order —
  // the trade was made knowingly.
  return candidates.sort((a, b) => b.confidence - a.confidence);
}
