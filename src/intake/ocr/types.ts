// Types for Tier 2 spine OCR (SPEC §4.2).
//
// Kept in their own module so views can `import type` them without pulling the
// lazy-loaded OCR chunk into the main bundle (SPEC §1.5).

export interface SpineRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpineCandidate {
  id: string;
  /** Best-scoring text read off this spine, already cleaned for use as a search query. */
  rawText: string;
  /**
   * Composite quality of the winning read, 0-1 — tesseract's confidence weighted
   * by how word-like the output is (see `scoreReading` in orientation.ts), not
   * raw confidence, which is high even on nonsense. Candidates are ranked by it,
   * and below `LOW_CONFIDENCE` the UI pre-flags them for attention.
   */
  confidence: number;
  /** Rotation OCR settled on. The display crop is already turned this way. */
  rotation: 0 | 90 | -90;
  region: SpineRegion;
  /** Cropped spine, rotated to reading orientation. Display only, never persisted (SPEC §12.2). */
  crop: Blob;
  /** The preprocessed image OCR actually consumed, for the review queue's debug toggle. */
  debugCrop: Blob;
}

export interface OcrProgress {
  done: number;
  total: number;
}

export interface RunShelfOcrOptions {
  onProgress?: (progress: OcrProgress) => void;
  signal?: AbortSignal;
}

/**
 * Candidates at or below this score are pre-marked as needing attention (SPEC §4.2).
 * Tuned against the composite score, which runs lower than raw tesseract
 * confidence — revisit once there is data from real shelves.
 */
export const LOW_CONFIDENCE = 0.45;
