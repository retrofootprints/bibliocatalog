// Rotate-and-detect (SPEC §4.2): spine text is usually printed rotated 90°, but
// which way round depends on the publisher's country and how the book was shelved.
// Read each region at 0° and ±90° and keep the best-scoring orientation.

import { recognizeCanvas, type Reading } from './engine';
import { cropRegion } from './segment';
import type { SpineRegion } from './types';
import type { Worker } from 'tesseract.js';

/** Read spines top-to-bottom first: that is the common case, and every extra
 *  orientation costs a full recognition pass. Above this score, stop early. */
const GOOD_ENOUGH = 0.75;

const ORIENTATIONS: (0 | 90 | -90)[] = [90, -90, 0];

export interface OrientedReading extends Reading {
  rotation: 0 | 90 | -90;
}

/** Score a reading: confidence alone rewards a confident single letter, so weight
 *  it by how much usable text came back. */
function score(reading: Reading): number {
  const letters = reading.text.replace(/[^\p{L}]/gu, '').length;
  if (letters < 3) return 0;
  return reading.confidence * Math.min(1, letters / 12);
}

export async function readBestOrientation(
  worker: Worker,
  source: OffscreenCanvas,
  region: SpineRegion,
): Promise<OrientedReading> {
  let best: OrientedReading = { text: '', confidence: 0, rotation: 90 };
  let bestScore = -1;

  for (const rotation of ORIENTATIONS) {
    const reading = await recognizeCanvas(worker, cropRegion(source, region, rotation));
    const value = score(reading);
    if (value > bestScore) {
      bestScore = value;
      best = { ...reading, rotation };
    }
    if (value >= GOOD_ENOUGH) break;
  }

  return best;
}
