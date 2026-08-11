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
import { cropRegion, segmentShelf } from './segment';
import type { RunShelfOcrOptions, SpineCandidate } from './types';

export type { OcrProgress, RunShelfOcrOptions, SpineCandidate, SpineRegion } from './types';
export { LOW_CONFIDENCE } from './types';

class Aborted extends Error {}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Aborted('Shelf OCR aborted');
}

/**
 * Read a shelf photo and return one candidate per detected spine.
 *
 * The photo is processed in memory and discarded when this resolves; only the
 * per-spine crops survive, and only for as long as the review queue displays
 * them (SPEC §12.2).
 */
export async function runShelfOcr(photo: Blob, options: RunShelfOcrOptions = {}): Promise<SpineCandidate[]> {
  const { onProgress, signal } = options;

  const bitmap = await createImageBitmap(photo);
  let source: ReturnType<typeof segmentShelf>['canvas'];
  let regions: ReturnType<typeof segmentShelf>['regions'];
  try {
    ({ canvas: source, regions } = segmentShelf(bitmap));
  } finally {
    bitmap.close();
  }

  onProgress?.({ done: 0, total: regions.length });
  if (regions.length === 0) return [];

  const worker = await createSpineWorker();

  const candidates: SpineCandidate[] = [];
  try {
    for (const [index, region] of regions.entries()) {
      throwIfAborted(signal);

      const reading = await readBestOrientation(worker, source, region);
      const rawText = cleanSpineText(reading.text);
      onProgress?.({ done: index + 1, total: regions.length });
      if (!isUsable(rawText)) continue;

      candidates.push({
        id: `spine-${index}`,
        rawText,
        confidence: reading.confidence,
        region,
        crop: await cropRegion(source, region, 0).convertToBlob({ type: 'image/png' }),
      });
    }
  } catch (err) {
    if (!(err instanceof Aborted)) throw err;
  } finally {
    await worker.terminate();
  }

  return candidates;
}
