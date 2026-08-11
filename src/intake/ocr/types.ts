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
  /** Mean OCR confidence, 0-1. Below `LOW_CONFIDENCE` the UI pre-flags it for attention. */
  confidence: number;
  region: SpineRegion;
  /** Cropped spine image, for display in the review queue only. Never persisted (SPEC §12.2). */
  crop: Blob;
}

export interface OcrProgress {
  done: number;
  total: number;
}

export interface RunShelfOcrOptions {
  onProgress?: (progress: OcrProgress) => void;
  signal?: AbortSignal;
}

/** Candidates at or below this confidence are pre-marked as needing attention (SPEC §4.2). */
export const LOW_CONFIDENCE = 0.6;
