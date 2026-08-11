import type { Book, Cover, Loan, Scan, Shelf } from '../db/types';

/** Full-fidelity export format. Covers are embedded as base64 data URIs when requested. */
export interface ExportedCover {
  id: string;
  dataUrl: string;
}

export interface BiblioCatalogExport {
  format: 'bibliocatalog';
  version: 1;
  exportedAt: string;
  books: Book[];
  shelves: Shelf[];
  loans: Loan[];
  /** Shelf scan history (SPEC §3.5). Derived results only — never image data. */
  scans?: Scan[];
  covers?: ExportedCover[];
}

export type { Cover };
