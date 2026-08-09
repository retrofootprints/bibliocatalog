// Google Books metadata provider. CORS-enabled, keyless (subject to quota). Fallback per SPEC §5.1.
import type { MetadataProvider, ResolvedMetadata } from './types';

interface GoogleVolume {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    language?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
}

function extractYear(publishedDate?: string): number | undefined {
  if (!publishedDate) return undefined;
  const match = publishedDate.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

function toResolved(volume: GoogleVolume, fallbackIsbn13: string): ResolvedMetadata | undefined {
  const info = volume.volumeInfo;
  if (!info?.title) return undefined;
  const isbn13 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ?? fallbackIsbn13;
  const isbn10 = info.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier;
  const cover = info.imageLinks?.thumbnail?.replace(/^http:/, 'https:') ?? info.imageLinks?.smallThumbnail;

  return {
    isbn13,
    isbn10,
    title: info.title,
    subtitle: info.subtitle,
    authors: info.authors ?? [],
    publisher: info.publisher,
    publishedYear: extractYear(info.publishedDate),
    pageCount: info.pageCount,
    language: info.language,
    coverUrl: cover,
    source: 'googlebooks',
  };
}

export const googleBooksProvider: MetadataProvider = {
  name: 'googlebooks',

  async lookupByIsbn(isbn13: string): Promise<ResolvedMetadata | undefined> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const json = (await res.json()) as { items?: GoogleVolume[] };
    const item = json.items?.[0];
    if (!item) return undefined;
    return toResolved(item, isbn13);
  },

  async searchByText(query: string): Promise<ResolvedMetadata[]> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: GoogleVolume[] };
    return (json.items ?? [])
      .map((item) => toResolved(item, ''))
      .filter((r): r is ResolvedMetadata => !!r);
  },
};
