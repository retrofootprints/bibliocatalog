// OpenLibrary metadata provider. Keyless, CORS-enabled. Primary source per SPEC §5.1.
import type { MetadataProvider, ResolvedMetadata } from './types';

interface OpenLibraryBookData {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  identifiers?: { isbn_10?: string[]; isbn_13?: string[] };
  cover?: { small?: string; medium?: string; large?: string };
}

function extractYear(publishDate?: string): number | undefined {
  if (!publishDate) return undefined;
  const match = publishDate.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

export const openLibraryProvider: MetadataProvider = {
  name: 'openlibrary',

  async lookupByIsbn(isbn13: string): Promise<ResolvedMetadata | undefined> {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const json = (await res.json()) as Record<string, OpenLibraryBookData>;
    const data = json[`ISBN:${isbn13}`];
    if (!data || !data.title) return undefined;

    return {
      isbn13,
      isbn10: data.identifiers?.isbn_10?.[0],
      title: data.title,
      subtitle: data.subtitle,
      authors: data.authors?.map((a) => a.name) ?? [],
      publisher: data.publishers?.[0]?.name,
      publishedYear: extractYear(data.publish_date),
      pageCount: data.number_of_pages,
      coverUrl: data.cover?.large ?? data.cover?.medium ?? `https://covers.openlibrary.org/b/isbn/${isbn13}-M.jpg`,
      source: 'openlibrary',
    };
  },

  async searchByText(query: string): Promise<ResolvedMetadata[]> {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      docs?: {
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        publisher?: string[];
        isbn?: string[];
        cover_i?: number;
        language?: string[];
      }[];
    };
    return (json.docs ?? [])
      .filter((d) => d.title)
      .slice(0, 8)
      .map((d) => ({
        isbn13: d.isbn?.find((i) => i.length === 13) ?? d.isbn?.[0] ?? '',
        title: d.title!,
        authors: d.author_name ?? [],
        publisher: d.publisher?.[0],
        publishedYear: d.first_publish_year,
        language: d.language?.[0],
        coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
        source: 'openlibrary' as const,
      }));
  },
};
