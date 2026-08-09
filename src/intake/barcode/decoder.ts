// Main-thread wrapper around the decode worker: promise-based request/response.
import type { DecodedBarcode, DecodeRequest, DecodeResponse } from './worker';

export class BarcodeDecoder {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: DecodedBarcode[]) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
      const { id, results, error } = event.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (error) entry.reject(new Error(error));
      else entry.resolve(results ?? []);
    };
    this.worker.onerror = (event) => {
      // Fail all in-flight requests so callers don't hang forever.
      const err = new Error(event.message || 'Barcode worker error');
      for (const [, entry] of this.pending) entry.reject(err);
      this.pending.clear();
    };
  }

  private send(kind: DecodeRequest['kind'], payload: ImageBitmap | Blob, transfer: Transferable[]): Promise<DecodedBarcode[]> {
    const id = this.nextId++;
    const request: DecodeRequest = { id, kind, payload };
    const promise = new Promise<DecodedBarcode[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.worker.postMessage(request, transfer);
    return promise;
  }

  decodeBitmap(bitmap: ImageBitmap): Promise<DecodedBarcode[]> {
    return this.send('bitmap', bitmap, [bitmap]);
  }

  decodeBlob(blob: Blob): Promise<DecodedBarcode[]> {
    return this.send('blob', blob, []);
  }

  terminate(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
