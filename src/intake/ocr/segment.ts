// Spine segmentation: split a shelf photo into per-spine vertical strips.
//
// Books on a shelf stand side by side, so the boundaries between them are strong
// *vertical* edges running the full height of the image. Two profiles are summed
// to find them: luma gradient down each column, and the colour step between the
// windows either side of each column. Luma alone misses two books of similar
// lightness but different hue — a real failure seen in testing.
//
// Segmentation runs on a downscaled proxy because the profiles do not need
// detail. Cropping does — see `cropRegion`, which reads from the full-resolution
// source. Getting that wrong (cropping from the proxy) was the main cause of
// garbled OCR in the first version.
//
// This is deliberately a heuristic, not a detector. SPEC §4.2 targets "useful
// assist", and the review queue catches what this gets wrong.

import type { SpineRegion } from './types';

/** Long edge of the segmentation proxy. Only the profiles are computed here. */
const WORK_MAX_EDGE = 2000;

/** A spine narrower than this fraction of image width is noise; wider is probably two books. */
const MIN_SPINE_FRACTION = 0.02;
const MAX_SPINE_FRACTION = 0.25;

/** Half-width of the box blur applied to the edge profile, in columns. */
const SMOOTH_RADIUS = 4;

/** Window either side of a column when measuring the colour step across it. */
const COLOUR_WINDOW = 6;

/**
 * Text line height we aim for after rotation, in pixels. Tesseract's LSTM wants
 * roughly 30-50px of x-height; a spine crop holds title and author stacked, so
 * budget several lines' worth.
 */
const TARGET_LINE_PX = 260;

/** Never magnify more than this — upscaling a genuinely tiny region just makes mush. */
const MAX_UPSCALE = 3;

/** iOS Safari refuses very large canvases; keep every crop comfortably inside. */
const MAX_CROP_EDGE = 4000;

export interface SegmentedShelf {
  /** Downscaled copy the regions were found in. */
  proxy: OffscreenCanvas;
  /** Regions in *proxy* coordinates. */
  regions: SpineRegion[];
  /** Multiply proxy coordinates by this to address the full-resolution source. */
  scale: number;
}

function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

/** Rec. 601 luma. Cheaper than a colour-space conversion and good enough here. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Mean absolute horizontal gradient per column — high where one spine meets the next. */
function columnEdgeProfile(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const profile = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    let prev = -1;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      const value = luma(data[i], data[i + 1], data[i + 2]);
      if (prev >= 0) profile[x] += Math.abs(value - prev);
      prev = value;
    }
  }
  for (let x = 0; x < width; x++) profile[x] /= height;
  return profile;
}

/** Mean colour of each column, as three planes. */
function columnMeanRgb(data: Uint8ClampedArray, width: number, height: number): [Float32Array, Float32Array, Float32Array] {
  const r = new Float32Array(width);
  const g = new Float32Array(width);
  const b = new Float32Array(width);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = row + x * 4;
      r[x] += data[i];
      g[x] += data[i + 1];
      b[x] += data[i + 2];
    }
  }
  for (let x = 0; x < width; x++) {
    r[x] /= height;
    g[x] /= height;
    b[x] /= height;
  }
  return [r, g, b];
}

/**
 * Colour distance between the `COLOUR_WINDOW` columns left and right of each
 * column. Catches the boundary between two books of equal lightness but
 * different hue, which the luma gradient cannot see.
 */
function colourStepProfile(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const [r, g, b] = columnMeanRgb(data, width, height);
  const profile = new Float32Array(width);

  for (let x = 0; x < width; x++) {
    let lr = 0;
    let lg = 0;
    let lb = 0;
    let ln = 0;
    let rr = 0;
    let rg = 0;
    let rb = 0;
    let rn = 0;
    for (let k = 1; k <= COLOUR_WINDOW; k++) {
      const left = x - k;
      if (left >= 0) {
        lr += r[left];
        lg += g[left];
        lb += b[left];
        ln++;
      }
      const right = x + k;
      if (right < width) {
        rr += r[right];
        rg += g[right];
        rb += b[right];
        rn++;
      }
    }
    if (ln === 0 || rn === 0) continue;
    const dr = lr / ln - rr / rn;
    const dg = lg / ln - rg / rn;
    const db = lb / ln - rb / rn;
    profile[x] = Math.sqrt(dr * dr + dg * dg + db * db);
  }
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

/** Scale a profile to 0-1 so two differently-scaled measures can be summed. */
function normalize(profile: Float32Array): Float32Array {
  let max = 0;
  for (let x = 0; x < profile.length; x++) if (profile[x] > max) max = profile[x];
  if (max <= 0) return profile;
  const out = new Float32Array(profile.length);
  for (let x = 0; x < profile.length; x++) out[x] = profile[x] / max;
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
      const value = luma(data[i], data[i + 1], data[i + 2]);
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return max - min > 24;
}

export function segmentShelf(source: ImageBitmap): SegmentedShelf {
  const factor = Math.min(1, WORK_MAX_EDGE / Math.max(source.width, source.height));
  const proxy = createCanvas(source.width * factor, source.height * factor);
  context(proxy).drawImage(source, 0, 0, proxy.width, proxy.height);

  const { width, height } = proxy;
  const { data } = context(proxy).getImageData(0, 0, width, height);

  const minWidth = Math.max(8, Math.round(width * MIN_SPINE_FRACTION));
  const maxWidth = Math.round(width * MAX_SPINE_FRACTION);

  const edges = normalize(smooth(columnEdgeProfile(data, width, height), SMOOTH_RADIUS));
  const colours = normalize(smooth(colourStepProfile(data, width, height), SMOOTH_RADIUS));
  const combined = new Float32Array(width);
  for (let x = 0; x < width; x++) combined[x] = edges[x] + colours[x];

  const cuts = findCuts(combined, minWidth);
  const bounds = [0, ...cuts, width];
  const regions: SpineRegion[] = [];

  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i];
    const to = bounds[i + 1];
    const span = to - from;
    if (span < minWidth) continue;
    if (!hasContrast(data, width, height, from, to)) continue;

    // An over-wide span is usually several spines the profiles failed to
    // separate. Splitting evenly beats handing OCR a strip with three titles in it.
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

  return { proxy, regions, scale: source.width / width };
}

/**
 * Crop one region out of the **full-resolution** source, rotated and upscaled so
 * the text lands in the size range tesseract reads best.
 *
 * `region` is in proxy coordinates; `scale` maps it back to the source.
 */
export function cropRegion(
  source: ImageBitmap,
  region: SpineRegion,
  scale: number,
  rotationDeg: 0 | 90 | -90,
): OffscreenCanvas {
  const sx = region.x * scale;
  const sy = region.y * scale;
  const sw = region.width * scale;
  const sh = region.height * scale;

  // After a ±90 turn the spine's width becomes the height of the text line, so
  // that is the dimension worth magnifying.
  // The region spans the full image height, so `sh` is the long edge whichever
  // way the crop is turned.
  let k = Math.min(MAX_UPSCALE, Math.max(1, TARGET_LINE_PX / sw));
  if (sh * k > MAX_CROP_EDGE) k = Math.max(0.1, MAX_CROP_EDGE / sh);

  const dw = sw * k;
  const dh = sh * k;
  const rotated = rotationDeg !== 0;
  const target = createCanvas(rotated ? dh : dw, rotated ? dw : dh);
  const ctx = context(target);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  if (rotationDeg === 90) {
    ctx.translate(target.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (rotationDeg === -90) {
    ctx.translate(0, target.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  ctx.restore();
  return target;
}
