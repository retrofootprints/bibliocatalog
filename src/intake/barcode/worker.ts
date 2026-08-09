/// <reference lib="webworker" />
// Barcode decode worker: frames are handed off here so the main thread never blocks.
// Uses zxing-wasm (works on iOS Safari, where BarcodeDetector does not). SPEC §4.1.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
// Bundle the wasm binary with the app (respects the Vite `base` path) instead of
// relying on zxing-wasm's default jsDelivr CDN fetch, so decoding works fully
// from this origin (and from cache once installed).
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path),
  },
});

export interface DecodeRequest {
  id: number;
  kind: 'bitmap' | 'blob';
  payload: ImageBitmap | Blob;
}

export interface DecodedBarcode {
  text: string;
  format: string;
}

export interface DecodeResponse {
  id: number;
  results?: DecodedBarcode[];
  error?: string;
}

let canvas: OffscreenCanvas | undefined;
let ctx: OffscreenCanvasRenderingContext2D | undefined;

async function decode(req: DecodeRequest): Promise<DecodedBarcode[]> {
  const readerOptions = { formats: ['EAN-13' as const], tryHarder: true };

  if (req.kind === 'blob') {
    const results = await readBarcodes(req.payload as Blob, readerOptions);
    return results.filter((r) => r.isValid).map((r) => ({ text: r.text, format: r.format }));
  }

  const bitmap = req.payload as ImageBitmap;
  if (!canvas || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    ctx = canvas.getContext('2d') ?? undefined;
  }
  if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();

  const results = await readBarcodes(imageData, readerOptions);
  return results.filter((r) => r.isValid).map((r) => ({ text: r.text, format: r.format }));
}

self.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const req = event.data;
  try {
    const results = await decode(req);
    const response: DecodeResponse = { id: req.id, results };
    self.postMessage(response);
  } catch (err) {
    const response: DecodeResponse = { id: req.id, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(response);
  }
};
