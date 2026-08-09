import type { MetadataSource } from '../db/types';

export interface ResolvedMetadata {
  isbn13: string;
  isbn10?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedYear?: number;
  language?: string;
  pageCount?: number;
  coverUrl?: string;
  source: MetadataSource;
}

export interface MetadataProvider {
  name: MetadataSource;
  lookupByIsbn(isbn13: string): Promise<ResolvedMetadata | undefined>;
  searchByText(query: string): Promise<ResolvedMetadata[]>;
}
