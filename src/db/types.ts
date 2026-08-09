// Data model per docs/SPEC.md §3. All IDs are UUIDv4 generated client-side.

export type BookSource = 'barcode' | 'spine-ocr' | 'manual' | 'import';
export type MetadataSource = 'openlibrary' | 'googlebooks' | 'none';
export type ReadStatus = 'unread' | 'reading' | 'read' | 'abandoned';

export interface Book {
  id: string; // uuid
  // Identity
  isbn13?: string; // normalized, no hyphens
  isbn10?: string;
  title: string; // required
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedYear?: number;
  language?: string; // ISO 639-1
  pageCount?: number;
  edition?: string;
  // Provenance of the record
  source: BookSource;
  metadataSource?: MetadataSource;
  confidence?: number; // 0-1, for OCR-derived records
  verifiedByUser: boolean; // user confirmed the match
  // User data
  shelfId?: string;
  tags: string[];
  readStatus: ReadStatus;
  rating?: number; // 1-5
  notes?: string;
  acquiredAt?: string; // ISO date
  copyLabel?: string; // optional user label to tell copies apart
  // Media
  coverBlobId?: string; // -> covers table
  coverUrl?: string; // remote fallback
  // Housekeeping
  createdAt: string;
  updatedAt: string;
  deletedAt?: string; // soft delete, for import reconciliation
}

export interface Shelf {
  id: string;
  name: string;
  room?: string;
  position?: number;
  lastScanAt?: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  bookId: string;
  borrowerName: string;
  borrowerContact?: string;
  lentAt: string;
  dueAt?: string;
  returnedAt?: string; // undefined = currently out
  notes?: string;
}

export interface Cover {
  id: string;
  blob: Blob; // JPEG/WebP, resized to max 400px wide
  bytes: number;
}

export interface Scan {
  id: string;
  shelfId: string;
  detectedBookIds: string[];
  unresolvedCandidates: { rawText: string; confidence: number }[];
  scannedAt: string;
}

export type UiLocale = 'pt-PT' | 'en';

export interface Settings {
  id: 'app'; // single-row key/value
  locale: UiLocale;
  preferredMetadataSource: 'openlibrary' | 'googlebooks';
  ocrEnabled: boolean;
  storagePersisted: boolean;
  lastExportAt?: string;
}

/** Cached response for a resolved ISBN lookup, per SPEC §5.2. */
export interface MetadataCacheEntry {
  isbn13: string;
  source: MetadataSource;
  resolved: boolean;
  data?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedYear?: number;
    language?: string;
    pageCount?: number;
    coverUrl?: string;
    isbn10?: string;
  };
  fetchedAt: string;
}
