// JSON import: own format, merge-by-id or full replace. SPEC §6.6.
import { db } from '../db/schema';
import type { BiblioCatalogExport } from './types';

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  bookCount: number;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = /data:(.*);base64/.exec(header);
  const mime = mimeMatch?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function parseExportFile(text: string): BiblioCatalogExport {
  const data = JSON.parse(text);
  if (data?.format !== 'bibliocatalog' || !Array.isArray(data?.books)) {
    throw new Error('Not a valid BiblioCatalog export file');
  }
  return data as BiblioCatalogExport;
}

export async function importData(data: BiblioCatalogExport, mode: ImportMode): Promise<ImportResult> {
  await db.transaction('rw', db.books, db.shelves, db.loans, db.covers, async () => {
    if (mode === 'replace') {
      await Promise.all([db.books.clear(), db.shelves.clear(), db.loans.clear(), db.covers.clear()]);
    }

    if (data.covers) {
      for (const cover of data.covers) {
        const blob = dataUrlToBlob(cover.dataUrl);
        await db.covers.put({ id: cover.id, blob, bytes: blob.size });
      }
    }

    await db.books.bulkPut(data.books);
    if (data.shelves?.length) await db.shelves.bulkPut(data.shelves);
    if (data.loans?.length) await db.loans.bulkPut(data.loans);
  });

  return { bookCount: data.books.length };
}
