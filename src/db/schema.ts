import Dexie, { type EntityTable } from 'dexie';
import type { Book, Cover, Loan, MetadataCacheEntry, Scan, Settings, Shelf } from './types';

/**
 * Dexie database for BiblioCatalog.
 *
 * Phase 1+2 actively use: books, covers, settings, metadataCache.
 * shelves / loans / scans are schema'd now (per SPEC §13.1 build order note)
 * but have no UI until Phase 3.
 */
export class BiblioDB extends Dexie {
  books!: EntityTable<Book, 'id'>;
  shelves!: EntityTable<Shelf, 'id'>;
  loans!: EntityTable<Loan, 'id'>;
  covers!: EntityTable<Cover, 'id'>;
  scans!: EntityTable<Scan, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  metadataCache!: EntityTable<MetadataCacheEntry, 'isbn13'>;

  constructor() {
    super('bibliocatalog');

    this.version(1).stores({
      books: 'id, isbn13, title, shelfId, readStatus, *authors, *tags, updatedAt, deletedAt',
      shelves: 'id, name, position',
      loans: 'id, bookId, returnedAt',
      covers: 'id',
      scans: 'id, shelfId',
      settings: 'id',
      metadataCache: 'isbn13',
    });
  }
}

export const db = new BiblioDB();

export async function ensureSettings(): Promise<Settings> {
  const existing = await db.settings.get('app');
  if (existing) return existing;

  const detected = detectLocale();
  const defaults: Settings = {
    id: 'app',
    locale: detected,
    preferredMetadataSource: 'openlibrary',
    ocrEnabled: false,
    storagePersisted: false,
  };
  await db.settings.put(defaults);
  return defaults;
}

function detectLocale(): 'pt-PT' | 'en' {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'pt-PT';
  return lang.toLowerCase().startsWith('pt') ? 'pt-PT' : 'en';
}
