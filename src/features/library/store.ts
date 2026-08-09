// Shared in-memory reflection of the books table, kept in sync with Dexie writes.
// Views subscribe to `books` (a signal) instead of re-querying Dexie on every render.
import { signal } from '@preact/signals';
import { listBooks } from '../../db/queries';
import type { Book } from '../../db/types';
import { buildIndex } from './searchIndex';

export const books = signal<Book[]>([]);
export const booksLoading = signal(true);

export async function refreshBooks(): Promise<void> {
  const all = await listBooks();
  books.value = all;
  buildIndex(all);
  booksLoading.value = false;
}
