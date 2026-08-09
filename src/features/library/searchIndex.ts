// In-memory full-text search index, rebuilt on boot. SPEC §6.1.
import MiniSearch from 'minisearch';
import type { Book } from '../../db/types';

interface IndexedDoc {
  id: string;
  title: string;
  subtitle: string;
  authors: string;
  publisher: string;
  tags: string;
  notes: string;
}

function toDoc(book: Book): IndexedDoc {
  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors.join(' '),
    publisher: book.publisher ?? '',
    tags: book.tags.join(' '),
    notes: book.notes ?? '',
  };
}

let index = createIndex();

function createIndex(): MiniSearch<IndexedDoc> {
  return new MiniSearch<IndexedDoc>({
    idField: 'id',
    fields: ['title', 'subtitle', 'authors', 'publisher', 'tags', 'notes'],
    storeFields: [],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, authors: 2 } },
  });
}

export function buildIndex(books: Book[]): void {
  index = createIndex();
  index.addAll(books.map(toDoc));
}

/** Returns matching book ids for a non-empty query. Callers should skip filtering entirely for an empty query. */
export function searchLibrary(query: string): Set<string> {
  const results = index.search(query);
  return new Set(results.map((r) => String(r.id)));
}
