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
//
// Note on orientation: tesseract's own OSD (`worker.detect`, the OSD page-seg
// modes) needs the legacy engine, which the LSTM-only core does not carry. That
// is why ../ocr/orientation.ts reads each spine both ways and compares, rather
// than asking tesseract which way up it is.

import { createWorker, PSM, type Worker } from 'tesseract.js';

const BASE = import.meta.env.BASE_URL;

const CORE_PATH = `${BASE}tesseract-core`;
const WORKER_PATH = `${BASE}tesseract-core/worker.min.js`;

/** Portuguese first, English second: the library this is built for is mostly pt-PT. */
const LANGS = 'por+eng';

/** OEM.LSTM_ONLY — matches the LSTM-only core variants copied by the Vite plugin. */
const OEM_LSTM_ONLY = 1;

/** "A single uniform block of text": a spine is usually title over author. */
export const SPINE_PAGE_SEG_MODE = PSM.SINGLE_BLOCK;

/** Retry mode for spines whose text runs as one long line down the board. */
export const SINGLE_LINE_PAGE_SEG_MODE = PSM.SINGLE_LINE;

export async function createSpineWorker(): Promise<Worker> {
  const worker = await createWorker(LANGS, OEM_LSTM_ONLY, {
    corePath: CORE_PATH,
    workerPath: WORKER_PATH,
  });
  await worker.setParameters({
    tessedit_pageseg_mode: SPINE_PAGE_SEG_MODE,
    // Crops carry no DPI metadata, so tesseract estimates one and warns. Stating
    // it removes that guess and steadies behaviour on small images.
    user_defined_dpi: '300',
  });
  return worker;
}

export interface Reading {
  text: string;
  /** 0-1. Tesseract reports 0-100 as mean text confidence. */
  confidence: number;
}

type RecognizeOptions = NonNullable<Parameters<Worker['recognize']>[1]>;

export async function recognizeCanvas(worker: Worker, canvas: OffscreenCanvas, pageSegMode?: PSM): Promise<Reading> {
  // Page-seg mode is passed per call: the worker forwards any option it does not
  // recognise straight to SetVariable, so this needs no setParameters round-trip.
  // `RecognizeOptions` only types tesseract.js's own keys, hence the cast.
  const options = pageSegMode
    ? ({ tessedit_pageseg_mode: pageSegMode } as unknown as RecognizeOptions)
    : ({} as RecognizeOptions);
  const { data } = await worker.recognize(canvas, options);
  return { text: data.text ?? '', confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)) };
}
