// Tesseract lifecycle for spine OCR.
//
// tesseract.js already runs recognition in its own Web Worker with the wasm core
// loaded inside it, so — unlike the barcode path in ../barcode/decoder.ts — there
// is no second worker wrapper here. Adding one would only add a hop.
//
// The core wasm is served from this origin out of `tesseract-core/` (see the
// tesseractAssets plugin in vite.config.ts). Language data still comes from
// tesseract.js's own CDN on first use and is then cached in IndexedDB by the
// library, which is what SPEC §4.2's "cache thereafter" asks for.

import { createWorker, PSM, type Worker } from 'tesseract.js';

const BASE = import.meta.env.BASE_URL;

const CORE_PATH = `${BASE}tesseract-core`;
const WORKER_PATH = `${BASE}tesseract-core/worker.min.js`;

/** Portuguese first, English second: the library this is built for is mostly pt-PT. */
const LANGS = 'por+eng';

/** OEM.LSTM_ONLY — matches the LSTM-only core variants copied by the Vite plugin. */
const OEM_LSTM_ONLY = 1;

/** "A single uniform block of text": a spine is usually title over author. */
const SPINE_PAGE_SEG_MODE = PSM.SINGLE_BLOCK;

export async function createSpineWorker(): Promise<Worker> {
  const worker = await createWorker(LANGS, OEM_LSTM_ONLY, {
    corePath: CORE_PATH,
    workerPath: WORKER_PATH,
  });
  await worker.setParameters({ tessedit_pageseg_mode: SPINE_PAGE_SEG_MODE });
  return worker;
}

export interface Reading {
  text: string;
  /** 0-1. Tesseract reports 0-100. */
  confidence: number;
}

export async function recognizeCanvas(worker: Worker, canvas: OffscreenCanvas): Promise<Reading> {
  // tesseract.js's loader handles Blob but not OffscreenCanvas (see
  // tesseract.js/src/worker/browser/loadImage.js), so hand it a blob.
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const { data } = await worker.recognize(blob);
  return { text: data.text ?? '', confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)) };
}
