// Shelf reconciliation (SPEC §6.5).
//
// Compares what a scan detected against what the library expects to be on that
// shelf. Given Tier 2 accuracy, the output is framed to the user as a checklist
// of questions — this module deliberately does not act on anything itself.

import { booksOnShelf, lentOutBookIds } from '../../db/queries';
import type { Book } from '../../db/types';

export interface ReconcileResult {
  /** Expected on this shelf, not detected, not lent out. Possible loss, misfile or OCR miss. */
  missing: Book[];
  /** Detected here but assigned to a different shelf. */
  unexpected: Book[];
  /** Records created during this session. */
  added: Book[];
}

export interface ReconcileInput {
  shelfId: string;
  /** Books the scan matched to existing library records. */
  detected: Book[];
  /** Books created from this scan's candidates. */
  added: Book[];
}

export async function reconcileShelf({ shelfId, detected, added }: ReconcileInput): Promise<ReconcileResult> {
  const [expected, lentOut] = await Promise.all([booksOnShelf(shelfId), lentOutBookIds()]);
  const detectedIds = new Set([...detected, ...added].map((b) => b.id));

  return {
    // Lent-out books are excluded automatically: they are absent for a known
    // reason, and listing them would train the user to ignore this section.
    missing: expected.filter((b) => !detectedIds.has(b.id) && !lentOut.has(b.id)),
    unexpected: detected.filter((b) => b.shelfId !== shelfId),
    added,
  };
}

function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Does this candidate correspond to a book already in the library?
 *
 * Prevents a re-scan of an already-catalogued shelf from proposing a duplicate
 * record for every book on it. ISBN is authoritative; the title fallback is
 * deliberately strict, because a false match silently merges two books.
 */
export function findExistingMatch(library: Book[], match: { isbn13?: string; title?: string; authors?: string[] }): Book | undefined {
  if (match.isbn13) {
    const byIsbn = library.find((b) => b.isbn13 === match.isbn13);
    if (byIsbn) return byIsbn;
  }
  if (!match.title) return undefined;

  const title = normalizeTitle(match.title);
  if (title.length < 6) return undefined;

  const author = match.authors?.[0] ? normalizeTitle(match.authors[0]) : undefined;
  return library.find((b) => {
    if (normalizeTitle(b.title) !== title) return false;
    if (!author) return true;
    return b.authors.some((a) => normalizeTitle(a) === author);
  });
}
