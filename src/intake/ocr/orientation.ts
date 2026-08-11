// Rotate-and-detect (SPEC §4.2): spine text is usually printed rotated 90°, but
// which way round depends on the publisher and on how the book was shelved — one
// shelf routinely holds both. Tesseract cannot tell us (its OSD needs the legacy
// engine, see ./engine.ts), so we read each spine both ways and compare.
//
// Comparing is the hard part. Tesseract reports high confidence on confident
// nonsense, so an upside-down read can outscore the right one on confidence
// alone. `scoreReading` therefore also asks whether the output *looks like
// words*: garbled OCR produces tokens like "IIll", "XwQ" or "|~`", which almost
// never contain a vowel.

import { recognizeCanvas, SINGLE_LINE_PAGE_SEG_MODE, type Reading } from './engine';
import { preprocess } from './preprocess';
import { cropRegion } from './segment';
import type { SpineRegion } from './types';
import type { Worker } from 'tesseract.js';

/** Below this, a spine gets the second round of attempts. */
const RETRY_THRESHOLD = 0.5;

const VOWELS = /[aeiouáàâãéèêíìóòôõúùü]/i;

export interface OrientedReading extends Reading {
  rotation: 0 | 90 | -90;
  /** Composite quality, 0-1. What candidates are ranked and filtered by. */
  score: number;
}

/**
 * Combine tesseract's confidence with two shape measures. Exported for testing:
 * the whole orientation decision rests on this separating real text from noise.
 */
export function scoreReading(reading: Reading): number {
  const text = reading.text;
  const letters = text.replace(/[^\p{L}]/gu, '').length;
  if (letters < 3) return 0;

  const visible = text.replace(/\s/g, '').length;
  const alphaRatio = visible === 0 ? 0 : letters / visible;

  const tokens = text.split(/\s+/).filter((token) => token.replace(/[^\p{L}]/gu, '').length >= 2);
  if (tokens.length === 0) return 0;
  const vowelRatio = tokens.filter((token) => VOWELS.test(token)).length / tokens.length;

  return reading.confidence * alphaRatio * vowelRatio * Math.min(1, letters / 10);
}

interface Attempt {
  rotation: 0 | 90 | -90;
  mode: 'binary' | 'grey';
  pageSegMode?: typeof SINGLE_LINE_PAGE_SEG_MODE;
}

export async function readBestOrientation(
  worker: Worker,
  source: ImageBitmap,
  region: SpineRegion,
  scale: number,
): Promise<OrientedReading> {
  let best: OrientedReading = { text: '', confidence: 0, rotation: 90, score: -1 };

  async function attempt({ rotation, mode, pageSegMode }: Attempt): Promise<void> {
    const crop = preprocess(cropRegion(source, region, scale, rotation), mode);
    const reading = await recognizeCanvas(worker, crop, pageSegMode);
    const score = scoreReading(reading);
    if (score > best.score) best = { ...reading, rotation, score };
  }

  // Round one: both turns, always. Skipping one because the other looked good is
  // exactly how the first version locked in garbled reads.
  await attempt({ rotation: 90, mode: 'binary' });
  await attempt({ rotation: -90, mode: 'binary' });

  if (best.score < RETRY_THRESHOLD) {
    const better = best.rotation;
    // Binarisation can eat thin or decorative type; plain greyscale sometimes wins.
    await attempt({ rotation: better, mode: 'grey' });
    // A spine printed the short way round, or one long line rather than a block.
    await attempt({ rotation: 0, mode: 'binary' });
    await attempt({ rotation: better, mode: 'binary', pageSegMode: SINGLE_LINE_PAGE_SEG_MODE });
  }

  return { ...best, score: Math.max(0, best.score) };
}
