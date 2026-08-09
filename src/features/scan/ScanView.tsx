import { useState } from 'preact/hooks';
import { createBook, findByIsbn13, updateBook } from '../../db/queries';
import type { Book } from '../../db/types';
import { Scanner } from '../../intake/barcode/Scanner';
import { t } from '../../locales';
import { downloadAndStoreCover } from '../../metadata/cover';
import { resolveByIsbn } from '../../metadata/resolve';
import { navigate } from '../../ui/router';
import { refreshBooks } from '../library/store';
import { pendingManualIsbn } from './pendingIsbn';

type EntryStatus = 'resolving' | 'resolved' | 'unresolved' | 'duplicate' | 'invalid' | 'added-copy';

interface ScanEntry {
  id: string;
  isbn13: string;
  status: EntryStatus;
  title?: string;
  bookId?: string;
  existingBook?: Book;
}

let entrySeq = 0;

export function ScanView() {
  const [entries, setEntries] = useState<ScanEntry[]>([]);

  function updateEntry(id: string, patch: Partial<ScanEntry>) {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function handleDecoded(isbn13: string) {
    const id = `s${entrySeq++}`;
    const entry: ScanEntry = { id, isbn13, status: 'resolving' };
    setEntries((list) => [entry, ...list].slice(0, 25));

    const existing = await findByIsbn13(isbn13);
    if (existing.length > 0) {
      updateEntry(id, { status: 'duplicate', existingBook: existing[0], title: existing[0].title });
      return;
    }

    const metadata = await resolveByIsbn(isbn13);
    if (!metadata) {
      updateEntry(id, { status: 'unresolved' });
      return;
    }

    const book = await createBook({
      isbn13,
      isbn10: metadata.isbn10,
      title: metadata.title,
      subtitle: metadata.subtitle,
      authors: metadata.authors,
      publisher: metadata.publisher,
      publishedYear: metadata.publishedYear,
      language: metadata.language,
      pageCount: metadata.pageCount,
      coverUrl: metadata.coverUrl,
      source: 'barcode',
      metadataSource: metadata.source,
      verifiedByUser: false,
    });
    await refreshBooks();
    updateEntry(id, { status: 'resolved', title: metadata.title, bookId: book.id });

    if (metadata.coverUrl) {
      const coverBlobId = await downloadAndStoreCover(metadata.coverUrl);
      if (coverBlobId) {
        await updateBook(book.id, { coverBlobId });
        await refreshBooks();
      }
    }
  }

  async function addCopy(entry: ScanEntry) {
    if (!entry.existingBook) return;
    const src = entry.existingBook;
    const book = await createBook({
      isbn13: src.isbn13,
      isbn10: src.isbn10,
      title: src.title,
      subtitle: src.subtitle,
      authors: src.authors,
      publisher: src.publisher,
      publishedYear: src.publishedYear,
      language: src.language,
      pageCount: src.pageCount,
      edition: src.edition,
      coverUrl: src.coverUrl,
      coverBlobId: src.coverBlobId,
      source: 'barcode',
      metadataSource: src.metadataSource,
      verifiedByUser: src.verifiedByUser,
    });
    await refreshBooks();
    updateEntry(entry.id, { status: 'added-copy', bookId: book.id });
  }

  function goManual(isbn13: string) {
    pendingManualIsbn.value = isbn13;
    navigate('/add');
  }

  function handleInvalid(raw: string) {
    const id = `s${entrySeq++}`;
    const entry: ScanEntry = { id, isbn13: raw, status: 'invalid' };
    setEntries((list) => [entry, ...list].slice(0, 25));
  }

  return (
    <div class="page scan-view">
      <h1 class="page__title">{t('scan.title')}</h1>
      <Scanner onDecoded={handleDecoded} onInvalid={handleInvalid} />

      {entries.length > 0 && (
        <ul class="scan-log">
          {entries.map((entry) => (
            <li key={entry.id} class={`scan-log__entry scan-log__entry--${entry.status}`}>
              <div class="scan-log__main">
                <span class="scan-log__isbn">{entry.isbn13 || t('scan.invalidBarcode')}</span>
                {entry.status === 'resolving' && <span class="scan-log__status">{t('scan.resolving')}</span>}
                {entry.status === 'resolved' && <span class="scan-log__status">{entry.title}</span>}
                {entry.status === 'unresolved' && <span class="scan-log__status">{t('scan.unresolved')}</span>}
                {entry.status === 'invalid' && <span class="scan-log__status">{t('scan.notBookBarcode')}</span>}
                {entry.status === 'duplicate' && <span class="scan-log__status">{t('scan.duplicateBody', { title: entry.title ?? '' })}</span>}
                {entry.status === 'added-copy' && <span class="scan-log__status">{t('scan.addedToLibrary')}</span>}
              </div>
              <div class="scan-log__actions">
                {entry.status === 'unresolved' && (
                  <button type="button" class="btn btn--small" onClick={() => goManual(entry.isbn13)}>
                    {t('nav.add')}
                  </button>
                )}
                {entry.status === 'duplicate' && (
                  <>
                    <button type="button" class="btn btn--small" onClick={() => addCopy(entry)}>
                      {t('scan.addCopy')}
                    </button>
                    <button type="button" class="btn btn--small btn--text" onClick={() => updateEntry(entry.id, { status: 'unresolved' })}>
                      {t('scan.skip')}
                    </button>
                  </>
                )}
                {(entry.status === 'resolved' || entry.status === 'added-copy') && entry.bookId && (
                  <a class="btn btn--small" href={`#/book/${entry.bookId}`}>
                    {t('scan.viewBook')}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
