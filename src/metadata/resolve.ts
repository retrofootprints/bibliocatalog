// Metadata resolution order per SPEC §5.1: cache -> OpenLibrary -> Google Books -> unresolved.
import { db } from '../db/schema';
import type { MetadataCacheEntry } from '../db/types';
import { googleBooksProvider } from './googlebooks';
import { openLibraryProvider } from './openlibrary';
import type { ResolvedMetadata } from './types';

const providers = [openLibraryProvider, googleBooksProvider];

/** Simple ~5/s rate-limited queue so a fast continuous-scan session doesn't hammer either API. */
class RateLimitedQueue {
  private lastRun = 0;
  private readonly minGapMs: number;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(perSecond: number) {
    this.minGapMs = 1000 / perSecond;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const wait = Math.max(0, this.lastRun + this.minGapMs - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRun = Date.now();
      return fn();
    });
    // Keep the chain alive even if this call rejects.
    this.queue = result.catch(() => undefined);
    return result;
  }
}

const queue = new RateLimitedQueue(5);

/**
 * Resolve metadata for an ISBN-13: cache first, then OpenLibrary, then Google Books.
 * Every outcome (including "not found") is cached so a resolved ISBN is never re-fetched.
 */
export async function resolveByIsbn(isbn13: string): Promise<ResolvedMetadata | undefined> {
  const cached = await db.metadataCache.get(isbn13);
  if (cached) {
    return cached.resolved && cached.data ? cacheEntryToResolved(cached) : undefined;
  }

  for (const provider of providers) {
    try {
      const result = await queue.run(() => provider.lookupByIsbn(isbn13));
      if (result) {
        await cacheResult(isbn13, result);
        return result;
      }
    } catch {
      // Network failure: fall through to next provider; don't break a scan session.
    }
  }

  await cacheMiss(isbn13);
  return undefined;
}

export async function searchByText(query: string, preferred: 'openlibrary' | 'googlebooks'): Promise<ResolvedMetadata[]> {
  const ordered = preferred === 'googlebooks' ? [googleBooksProvider, openLibraryProvider] : [openLibraryProvider, googleBooksProvider];
  for (const provider of ordered) {
    try {
      const results = await queue.run(() => provider.searchByText(query));
      if (results.length > 0) return results;
    } catch {
      // try next provider
    }
  }
  return [];
}

async function cacheResult(isbn13: string, result: ResolvedMetadata): Promise<void> {
  const entry: MetadataCacheEntry = {
    isbn13,
    source: result.source,
    resolved: true,
    data: {
      title: result.title,
      subtitle: result.subtitle,
      authors: result.authors,
      publisher: result.publisher,
      publishedYear: result.publishedYear,
      language: result.language,
      pageCount: result.pageCount,
      coverUrl: result.coverUrl,
      isbn10: result.isbn10,
    },
    fetchedAt: new Date().toISOString(),
  };
  await db.metadataCache.put(entry);
}

async function cacheMiss(isbn13: string): Promise<void> {
  await db.metadataCache.put({
    isbn13,
    source: 'none',
    resolved: false,
    fetchedAt: new Date().toISOString(),
  });
}

function cacheEntryToResolved(entry: MetadataCacheEntry): ResolvedMetadata | undefined {
  if (!entry.data) return undefined;
  return {
    isbn13: entry.isbn13,
    isbn10: entry.data.isbn10,
    title: entry.data.title ?? '',
    subtitle: entry.data.subtitle,
    authors: entry.data.authors ?? [],
    publisher: entry.data.publisher,
    publishedYear: entry.data.publishedYear,
    language: entry.data.language,
    pageCount: entry.data.pageCount,
    coverUrl: entry.data.coverUrl,
    source: entry.source,
  };
}
