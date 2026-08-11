// Spine segmentation: split a shelf photo into per-spine vertical strips.
//
// Books on a shelf stand side by side, so the boundaries between them are strong
// *vertical* edges running the full height of the image. Summing horizontal
// intensity change down each column gives a 1-D profile whose peaks are those
// boundaries; cutting at the peaks yields one region per spine.
//
// This is deliberately a heuristic, not a detector. SPEC §4.2 targets "useful
// assist", and the review queue catches what this gets wrong.

import type { SpineRegion } from './types';

/** Long edge the photo is downscaled to before any work. Full-resolution phone
 *  photos will exhaust memory on iOS Safari. */
const WORK_MAX_EDGE = 2000;

/** A spine narrower than this fraction of image width is noise; wider is probably two books. */
const MIN_SPINE_FRACTION = 0.02;
const MAX_SPINE_FRACTION = 0.25;

/** Half-width of the box blur applied to the edge profile, in columns. */
const SMOOTH_RADIUS = 4;

export interface SegmentedShelf {
  canvas: OffscreenCanvas;
  regions: SpineRegion[];
}

function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(width, height);
}

/** Draw the source at a bounded size so downstream work is predictable. */
export function toWorkingCanvas(bitmap: ImageBitmap): OffscreenCanvas {
  const scale = Math.min(1, WORK_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/** Mean absolute horizontal gradient per column — high where one spine meets the next. */
function columnEdgeProfile(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const profile = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    let prev = -1;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      // Rec. 601 luma; good enough and cheaper than a colour-space conversion.
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (prev >= 0) profile[x] += Math.abs(luma - prev);
      prev = luma;
    }
  }
  for (let x = 0; x < width; x++) profile[x] /= height;
  return profile;
}

function smooth(profile: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(profile.length);
  for (let x = 0; x < profile.length; x++) {
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = x + k;
      if (j < 0 || j >= profile.length) continue;
      sum += profile[j];
      count++;
    }
    out[x] = sum / count;
  }
  return out;
}

/** Peaks above mean + k·stddev, thinned so no two sit closer than `minGap`. */
function findCuts(profile: Float32Array, minGap: number): number[] {
  const n = profile.length;
  let mean = 0;
  for (let x = 0; x < n; x++) mean += profile[x];
  mean /= n;

  let variance = 0;
  for (let x = 0; x < n; x++) variance += (profile[x] - mean) ** 2;
  const stddev = Math.sqrt(variance / n);
  const threshold = mean + stddev;

  const candidates: number[] = [];
  for (let x = 1; x < n - 1; x++) {
    if (profile[x] < threshold) continue;
    if (profile[x] < profile[x - 1] || profile[x] < profile[x + 1]) continue;
    candidates.push(x);
  }

  // Keep the strongest peak within each `minGap` window.
  const cuts: number[] = [];
  for (const x of candidates) {
    const last = cuts[cuts.length - 1];
    if (last !== undefined && x - last < minGap) {
      if (profile[x] > profile[last]) cuts[cuts.length - 1] = x;
      continue;
    }
    cuts.push(x);
  }
  return cuts;
}

/** A near-uniform strip is wall, shelf board or shadow — not a spine. */
function hasContrast(data: Uint8ClampedArray, width: number, height: number, from: number, to: number): boolean {
  let min = 255;
  let max = 0;
  const step = Math.max(1, Math.floor(height / 64));
  for (let y = 0; y < height; y += step) {
    for (let x = from; x < to; x++) {
      const i = (y * width + x) * 4;
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luma < min) min = luma;
      if (luma > max) max = luma;
    }
  }
  return max - min > 24;
}

export function segmentShelf(bitmap: ImageBitmap): SegmentedShelf {
  const canvas = toWorkingCanvas(bitmap);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  const minWidth = Math.max(8, Math.round(width * MIN_SPINE_FRACTION));
  const maxWidth = Math.round(width * MAX_SPINE_FRACTION);

  const profile = smooth(columnEdgeProfile(data, width, height), SMOOTH_RADIUS);
  const cuts = findCuts(profile, minWidth);

  const bounds = [0, ...cuts, width];
  const regions: SpineRegion[] = [];

  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i];
    const to = bounds[i + 1];
    const span = to - from;
    if (span < minWidth) continue;
    if (!hasContrast(data, width, height, from, to)) continue;

    // An over-wide span is usually several spines the profile failed to separate.
    // Splitting evenly beats handing OCR a strip with three titles in it.
    const parts = span > maxWidth ? Math.ceil(span / maxWidth) : 1;
    const partWidth = Math.floor(span / parts);
    for (let p = 0; p < parts; p++) {
      regions.push({
        x: from + p * partWidth,
        y: 0,
        width: p === parts - 1 ? to - (from + p * partWidth) : partWidth,
        height,
      });
    }
  }

  return { canvas, regions };
}

/** Crop one region, optionally rotated, into its own canvas. */
export function cropRegion(source: OffscreenCanvas, region: SpineRegion, rotationDeg: 0 | 90 | -90): OffscreenCanvas {
  const rotated = rotationDeg !== 0;
  const target = createCanvas(rotated ? region.height : region.width, rotated ? region.width : region.height);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.save();
  if (rotationDeg === 90) {
    ctx.translate(target.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (rotationDeg === -90) {
    ctx.translate(0, target.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
  ctx.restore();
  return target;
}
