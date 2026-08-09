// Full-fidelity JSON export, per SPEC §6.6. This is the app's only backup mechanism.
import { db } from '../db/schema';
import { updateSettings } from '../db/queries';
import type { BiblioCatalogExport, ExportedCover } from './types';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function buildExport(includeCovers: boolean): Promise<BiblioCatalogExport> {
  const [books, shelves, loans] = await Promise.all([db.books.toArray(), db.shelves.toArray(), db.loans.toArray()]);

  let covers: ExportedCover[] | undefined;
  if (includeCovers) {
    const coverIds = new Set(books.map((b) => b.coverBlobId).filter((v): v is string => !!v));
    const all = await db.covers.bulkGet([...coverIds]);
    covers = [];
    for (const cover of all) {
      if (!cover) continue;
      covers.push({ id: cover.id, dataUrl: await blobToDataUrl(cover.blob) });
    }
  }

  return {
    format: 'bibliocatalog',
    version: 1,
    exportedAt: new Date().toISOString(),
    books,
    shelves,
    loans,
    covers,
  };
}

export async function exportToFile(includeCovers: boolean): Promise<void> {
  const data = await buildExport(includeCovers);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `bibliocatalog-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await updateSettings({ lastExportAt: new Date().toISOString() });
}
