import { db } from './schema';
import type { Book, Cover, Loan, Scan, Settings, Shelf } from './types';

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export type NewBookInput = Omit<
  Book,
  'id' | 'createdAt' | 'updatedAt' | 'tags' | 'authors' | 'verifiedByUser' | 'readStatus'
> &
  Partial<Pick<Book, 'tags' | 'authors' | 'verifiedByUser' | 'readStatus'>>;

/** Insert a new book. Returns the created record. */
export async function createBook(input: NewBookInput): Promise<Book> {
  const now = nowIso();
  const book: Book = {
    id: uuid(),
    authors: input.authors ?? [],
    tags: input.tags ?? [],
    verifiedByUser: input.verifiedByUser ?? false,
    readStatus: input.readStatus ?? 'unread',
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  await db.books.put(book);
  return book;
}

export async function updateBook(id: string, patch: Partial<Book>): Promise<void> {
  await db.books.update(id, { ...patch, updatedAt: nowIso() });
}

/** Soft delete: sets deletedAt, keeps the row for import reconciliation. */
export async function softDeleteBook(id: string): Promise<void> {
  await db.books.update(id, { deletedAt: nowIso(), updatedAt: nowIso() });
}

export async function restoreBook(id: string): Promise<void> {
  await db.books.update(id, { deletedAt: undefined, updatedAt: nowIso() });
}

export async function getBook(id: string): Promise<Book | undefined> {
  return db.books.get(id);
}

/** All non-deleted books, newest first. */
export async function listBooks(): Promise<Book[]> {
  const all = await db.books.toArray();
  return all
    .filter((b) => !b.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findByIsbn13(isbn13: string): Promise<Book[]> {
  const matches = await db.books.where('isbn13').equals(isbn13).toArray();
  return matches.filter((b) => !b.deletedAt);
}

/** All shelves, ordered by explicit `position` then name (SPEC §6.3). */
export async function listShelves(): Promise<Shelf[]> {
  const all = await db.shelves.toArray();
  return all.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
}

export async function createShelf(input: { name: string; room?: string; position?: number }): Promise<Shelf> {
  const shelf: Shelf = {
    id: uuid(),
    name: input.name,
    room: input.room,
    position: input.position,
    createdAt: nowIso(),
  };
  await db.shelves.put(shelf);
  return shelf;
}

export async function updateShelf(id: string, patch: Partial<Shelf>): Promise<void> {
  await db.shelves.update(id, patch);
}

/** Delete a shelf, unassigning (not deleting) the books that sat on it. */
export async function deleteShelf(id: string): Promise<void> {
  await db.transaction('rw', db.books, db.shelves, async () => {
    const assigned = await db.books.where('shelfId').equals(id).toArray();
    const now = nowIso();
    for (const book of assigned) {
      await db.books.update(book.id, { shelfId: undefined, updatedAt: now });
    }
    await db.shelves.delete(id);
  });
}

/** Non-deleted books assigned to a shelf. */
export async function booksOnShelf(shelfId: string): Promise<Book[]> {
  const assigned = await db.books.where('shelfId').equals(shelfId).toArray();
  return assigned.filter((b) => !b.deletedAt);
}

/** Book ids with an open loan (no `returnedAt`) — excluded from "missing" in reconciliation, SPEC §6.5. */
export async function lentOutBookIds(): Promise<Set<string>> {
  const open = await db.loans.filter((loan: Loan) => !loan.returnedAt).toArray();
  return new Set(open.map((loan) => loan.bookId));
}

/** Record one completed shelf scan. Frames are never stored — only derived results (SPEC §12.2). */
export async function recordScan(input: Omit<Scan, 'id' | 'scannedAt'>): Promise<Scan> {
  const scan: Scan = { id: uuid(), scannedAt: nowIso(), ...input };
  await db.scans.put(scan);
  await db.shelves.update(scan.shelfId, { lastScanAt: scan.scannedAt });
  return scan;
}

export async function saveCover(blob: Blob): Promise<string> {
  const id = uuid();
  const cover: Cover = { id, blob, bytes: blob.size };
  await db.covers.put(cover);
  return id;
}

export async function getCover(id: string): Promise<Cover | undefined> {
  return db.covers.get(id);
}

export async function deleteCover(id: string): Promise<void> {
  await db.covers.delete(id);
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('app');
  if (!s) throw new Error('Settings not initialized; call ensureSettings() at boot');
  return s;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  await db.settings.update('app', patch);
  return getSettings();
}
