// Make a spine crop legible to tesseract.
//
// Tesseract expects dark text on a light page and binarises internally with a
// single global threshold. Book spines break both assumptions: light lettering
// on dark board is extremely common, and a spine often carries a colour gradient
// or two-tone background that no single threshold can split. Handling those here
// is the difference between a clean read and confident nonsense.

export type PreprocessMode = 'binary' | 'grey';

/** Ignore the extreme tails when stretching, so one glare highlight cannot flatten the rest. */
const CLIP_PERCENTILE = 0.02;

/** Adaptive-threshold window as a fraction of the crop's short side. */
const WINDOW_FRACTION = 0.125;

/** Pixels this much below the local mean become ink. Guards against speckle in flat areas. */
const THRESHOLD_OFFSET = 8;

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

/** Greyscale plane, Rec. 601 — the same weighting segment.ts uses. */
function toGrey(data: Uint8ClampedArray, count: number): Uint8ClampedArray {
  const grey = new Uint8ClampedArray(count);
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return grey;
}

function histogram(grey: Uint8ClampedArray): Uint32Array {
  const bins = new Uint32Array(256);
  for (let p = 0; p < grey.length; p++) bins[grey[p]]++;
  return bins;
}

/**
 * Light-on-dark spines are inverted so everything downstream sees dark-on-light.
 * Mean luma is a crude test, but text is sparse relative to background, so the
 * mean tracks the background closely enough to decide.
 */
function shouldInvert(bins: Uint32Array, count: number): boolean {
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * bins[v];
  return sum / count < 128;
}

/** Percentile bounds, so contrast stretching ignores outliers at both ends. */
function percentileBounds(bins: Uint32Array, count: number): [number, number] {
  const cut = count * CLIP_PERCENTILE;
  let low = 0;
  let high = 255;

  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += bins[v];
    if (seen > cut) {
      low = v;
      break;
    }
  }
  seen = 0;
  for (let v = 255; v >= 0; v--) {
    seen += bins[v];
    if (seen > cut) {
      high = v;
      break;
    }
  }
  return low >= high ? [0, 255] : [low, high];
}

/**
 * Adaptive mean threshold over an integral image: each pixel is compared against
 * the mean of its neighbourhood rather than a global cut, which is what lets a
 * spine with a gradient background come out clean.
 */
function adaptiveThreshold(grey: Uint8ClampedArray, width: number, height: number): void {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += grey[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const radius = Math.max(4, Math.round(Math.min(width, height) * WINDOW_FRACTION));

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)] -
        integral[y0 * (width + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      const mean = sum / area;
      grey[y * width + x] = grey[y * width + x] < mean - THRESHOLD_OFFSET ? 0 : 255;
    }
  }
}

/**
 * Returns a new canvas holding the processed crop. The input is left untouched
 * so the colour version stays available for the review queue.
 */
export function preprocess(crop: OffscreenCanvas, mode: PreprocessMode): OffscreenCanvas {
  const { width, height } = crop;
  const image = context(crop).getImageData(0, 0, width, height);
  const count = width * height;

  const grey = toGrey(image.data, count);

  let bins = histogram(grey);
  if (shouldInvert(bins, count)) {
    for (let p = 0; p < count; p++) grey[p] = 255 - grey[p];
    bins = histogram(grey);
  }

  const [low, high] = percentileBounds(bins, count);
  const range = high - low;
  for (let p = 0; p < count; p++) {
    grey[p] = ((grey[p] - low) / range) * 255;
  }

  if (mode === 'binary') adaptiveThreshold(grey, width, height);

  for (let p = 0; p < count; p++) {
    const i = p * 4;
    image.data[i] = grey[p];
    image.data[i + 1] = grey[p];
    image.data[i + 2] = grey[p];
    image.data[i + 3] = 255;
  }

  const out = new OffscreenCanvas(width, height);
  context(out).putImageData(image, 0, 0);
  return out;
}
