import { db } from './schema';
import type { Book, Cover, Settings } from './types';

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
