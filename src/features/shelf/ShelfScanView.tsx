import { useEffect, useRef, useState } from 'preact/hooks';
import { createBook, getSettings, recordScan, updateBook, updateSettings } from '../../db/queries';
import type { Book } from '../../db/types';
import type { BookFormValues } from '../../intake/manual/BookForm';
import { normalizeToIsbn13 } from '../../intake/barcode/isbn';
import type { OcrProgress, SpineCandidate } from '../../intake/ocr/types';
import { t } from '../../locales';
import { downloadAndStoreCover } from '../../metadata/cover';
import { searchByText } from '../../metadata/resolve';
import { navigate } from '../../ui/router';
import { showToast } from '../../ui/toast';
import { books, refreshBooks } from '../library/store';
import { refreshShelves, shelves } from '../shelves/store';
import { findExistingMatch, reconcileShelf, type ReconcileResult } from './reconcile';
import { SpineCandidateCard, type ReviewItem } from './SpineCandidateCard';

/**
 * Measured one-off download, declared before a single byte is fetched (SPEC §1.5, §9):
 * tesseract-core-simd-lstm.wasm.js (3.7 MB, self-hosted) plus the language data
 * pulled from tesseract.js's CDN on first run — por 1.3 MB + eng 2.8 MB. Re-measure
 * if the tesseract.js major version or the language set changes.
 */
const MODULE_DOWNLOAD_SIZE = '8 MB';

// 'loading' only covers the settings read that decides gate vs. idle — without it
// every visit would flash the beta warning at users who already accepted it.
type Phase = 'loading' | 'gate' | 'idle' | 'running' | 'review' | 'reconcile';

/**
 * Tier 2 shelf digitising (SPEC §4.2 + §6.5).
 *
 * The whole flow lives in this one component because the captured photo and the
 * spine crops are never persisted (SPEC §12.2) — routing away is what discards a
 * session, and that has to be the only way it happens.
 */
export function ShelfScanView() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [shelfId, setShelfId] = useState('');
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [loadingModule, setLoadingModule] = useState(false);
  const [moduleError, setModuleError] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    refreshShelves();
    refreshBooks();
    getSettings().then((settings) => setPhase(settings.ocrEnabled ? 'idle' : 'gate'));
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!shelfId && shelves.value.length > 0) setShelfId(shelves.value[0].id);
  }, [shelves.value.length]);

  function updateItem(id: string, patch: Partial<ReviewItem>) {
    setItems((list) => list.map((item) => (item.candidate.id === id ? { ...item, ...patch } : item)));
  }

  async function acceptGate() {
    await updateSettings({ ocrEnabled: true });
    setPhase('idle');
  }

  async function handlePhoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !shelfId) return;

    setPhase('running');
    setModuleError(false);
    setLoadingModule(true);
    setProgress(null);
    setItems([]);

    const controller = new AbortController();
    abortRef.current = controller;

    let candidates: SpineCandidate[];
    try {
      // Lazy, and only ever reached past the gate above (SPEC §1.5).
      const { runShelfOcr } = await import('../../intake/ocr');
      setLoadingModule(false);
      candidates = await runShelfOcr(file, { onProgress: setProgress, signal: controller.signal });
    } catch {
      setLoadingModule(false);
      setModuleError(true);
      setPhase('idle');
      return;
    }

    setItems(candidates.map((candidate) => ({ candidate, status: 'searching' })));
    setPhase('review');
    void resolveCandidates(candidates);
  }

  /** Per-candidate metadata lookup. `searchByText` is already rate-limited to ~5/s
   *  by the shared queue in metadata/resolve.ts, so this can just await in order. */
  async function resolveCandidates(candidates: SpineCandidate[]) {
    for (const candidate of candidates) {
      let results: Awaited<ReturnType<typeof searchByText>> = [];
      try {
        results = await searchByText(candidate.rawText, 'openlibrary');
      } catch {
        // Provider failure is not fatal — the candidate simply has no proposal.
      }
      const match = results[0];
      if (!match) {
        updateItem(candidate.id, { status: 'nomatch' });
        continue;
      }
      const existing = findExistingMatch(books.value, match);
      updateItem(candidate.id, existing ? { status: 'existing', match, existing } : { status: 'match', match });
    }
  }

  async function persistFromMatch(item: ReviewItem): Promise<Book | undefined> {
    const match = item.match;
    if (!match) return undefined;
    const book = await createBook({
      isbn13: match.isbn13 || undefined,
      isbn10: match.isbn10,
      title: match.title,
      subtitle: match.subtitle,
      authors: match.authors,
      publisher: match.publisher,
      publishedYear: match.publishedYear,
      language: match.language,
      pageCount: match.pageCount,
      coverUrl: match.coverUrl,
      shelfId,
      source: 'spine-ocr',
      metadataSource: match.source,
      confidence: item.candidate.confidence,
      // SPEC §4.2: spine-OCR records stay unverified until the user says otherwise.
      verifiedByUser: false,
    });
    if (match.coverUrl) {
      const coverBlobId = await downloadAndStoreCover(match.coverUrl);
      if (coverBlobId) await updateBook(book.id, { coverBlobId });
    }
    await refreshBooks();
    return book;
  }

  async function accept(item: ReviewItem) {
    if (item.status === 'existing' && item.existing) {
      updateItem(item.candidate.id, { status: 'accepted', resultBook: item.existing });
      return;
    }
    const book = await persistFromMatch(item);
    if (book) updateItem(item.candidate.id, { status: 'accepted', resultBook: book });
  }

  async function submitEdit(item: ReviewItem, values: BookFormValues) {
    const isbn13 = values.isbn13.trim() ? normalizeToIsbn13(values.isbn13.trim()) : undefined;
    const book = await createBook({
      isbn13,
      title: values.title.trim(),
      subtitle: values.subtitle.trim() || undefined,
      authors: values.authors.split(',').map((a) => a.trim()).filter(Boolean),
      publisher: values.publisher.trim() || undefined,
      publishedYear: values.publishedYear ? Number(values.publishedYear) : undefined,
      language: values.language.trim() || undefined,
      pageCount: values.pageCount ? Number(values.pageCount) : undefined,
      edition: values.edition.trim() || undefined,
      notes: values.notes.trim() || undefined,
      tags: values.tags.split(',').map((tg) => tg.trim()).filter(Boolean),
      readStatus: values.readStatus,
      copyLabel: values.copyLabel.trim() || undefined,
      acquiredAt: values.acquiredAt ? new Date(values.acquiredAt).toISOString() : undefined,
      shelfId: values.shelfId || shelfId || undefined,
      coverBlobId: values.coverBlobId,
      source: 'spine-ocr',
      confidence: item.candidate.confidence,
      // The user typed these fields themselves, so this one *is* verified.
      verifiedByUser: true,
    });
    await refreshBooks();
    updateItem(item.candidate.id, { status: 'accepted', editing: false, resultBook: book });
  }

  async function finish() {
    const detected: Book[] = [];
    const added: Book[] = [];
    for (const item of items) {
      if (item.status !== 'accepted' || !item.resultBook) continue;
      if (item.existing) detected.push(item.resultBook);
      else added.push(item.resultBook);
    }

    const reconciled = await reconcileShelf({ shelfId, detected, added });
    setResult(reconciled);

    // Derived results only — the photo and crops are already gone (SPEC §12.2).
    await recordScan({
      shelfId,
      detectedBookIds: [...detected, ...added].map((b) => b.id),
      unresolvedCandidates: items
        .filter((item) => item.status !== 'accepted')
        .map((item) => ({ rawText: item.candidate.rawText, confidence: item.candidate.confidence })),
    });
    await refreshShelves();
    setPhase('reconcile');
  }

  async function reassign(book: Book) {
    await updateBook(book.id, { shelfId });
    await refreshBooks();
    setResult((r) => (r ? { ...r, unexpected: r.unexpected.filter((b) => b.id !== book.id) } : r));
    showToast(t('reconcile.reassigned'));
  }

  function reset() {
    setItems([]);
    setResult(null);
    setProgress(null);
    setPhase('idle');
  }

  // ---- render ----

  if (phase === 'loading') return <p class="page">{t('common.loading')}</p>;

  if (phase === 'gate') {
    return (
      <div class="page">
        <h1 class="page__title">{t('spines.gate.title')}</h1>
        <p>{t('spines.gate.body')}</p>
        <p class="spine-gate__warning">{t('spines.gate.accuracy')}</p>
        <p class="book-form__hint">{t('spines.gate.size', { size: MODULE_DOWNLOAD_SIZE })}</p>
        <button type="button" class="btn btn--primary" onClick={acceptGate}>
          {t('spines.gate.accept')}
        </button>
      </div>
    );
  }

  if (shelves.value.length === 0) {
    return (
      <div class="page">
        <h1 class="page__title">{t('spines.title')}</h1>
        <div class="library-view__empty">
          <p class="library-view__empty-title">{t('spines.noShelves.title')}</p>
          <p class="library-view__empty-body">{t('spines.noShelves.body')}</p>
        </div>
        <button type="button" class="btn btn--primary" onClick={() => navigate('/shelves')}>
          {t('spines.noShelves.create')}
        </button>
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <div class="page">
        <h1 class="page__title">{t('spines.title')}</h1>
        <p>{loadingModule ? t('spines.loadingModule') : t('spines.running', { done: progress?.done ?? 0, total: progress?.total ?? 0 })}</p>
        <p class="book-form__hint">{t('spines.notRetained')}</p>
      </div>
    );
  }

  if (phase === 'reconcile' && result) {
    const clean = result.missing.length === 0 && result.unexpected.length === 0 && result.added.length === 0;
    return (
      <div class="page">
        <h1 class="page__title">{t('reconcile.title')}</h1>
        <p class="spine-gate__warning">{t('reconcile.intro')}</p>

        {clean && <p>{t('reconcile.clean')}</p>}

        {result.missing.length > 0 && (
          <section class="settings-section">
            <h2>{t('reconcile.missing')}</h2>
            <p class="settings-section__meta">{t('reconcile.missingHint')}</p>
            <ul class="shelf-list">
              {result.missing.map((book) => (
                <li key={book.id} class="shelf-list__item">
                  <a class="shelf-list__main" href={`#/book/${book.id}`}>
                    <span class="shelf-list__name">{book.title}</span>
                    <span class="shelf-list__meta">{book.authors.join(', ')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.unexpected.length > 0 && (
          <section class="settings-section">
            <h2>{t('reconcile.unexpected')}</h2>
            <p class="settings-section__meta">{t('reconcile.unexpectedHint')}</p>
            <ul class="shelf-list">
              {result.unexpected.map((book) => (
                <li key={book.id} class="shelf-list__item">
                  <div class="shelf-list__main">
                    <span class="shelf-list__name">{book.title}</span>
                    <span class="shelf-list__meta">{book.authors.join(', ')}</span>
                  </div>
                  <button type="button" class="btn btn--small" onClick={() => reassign(book)}>
                    {t('reconcile.reassign')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result.added.length > 0 && (
          <section class="settings-section">
            <h2>{t('reconcile.new')}</h2>
            <ul class="shelf-list">
              {result.added.map((book) => (
                <li key={book.id} class="shelf-list__item">
                  <a class="shelf-list__main" href={`#/book/${book.id}`}>
                    <span class="shelf-list__name">{book.title}</span>
                    <span class="shelf-list__meta">{book.authors.join(', ')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div class="book-detail__actions">
          <button type="button" class="btn btn--primary" onClick={reset}>
            {t('reconcile.done')}
          </button>
        </div>
      </div>
    );
  }

  const pending = items.some((item) => item.status === 'searching');

  return (
    <div class="page">
      <h1 class="page__title">{t('spines.title')}</h1>

      <label class="field">
        <span>{t('spines.chooseShelf')}</span>
        <select class="input" value={shelfId} onChange={(e) => setShelfId((e.target as HTMLSelectElement).value)}>
          {shelves.value.map((shelf) => (
            <option key={shelf.id} value={shelf.id}>
              {shelf.room ? `${shelf.room} — ${shelf.name}` : shelf.name}
            </option>
          ))}
        </select>
      </label>

      {moduleError && <p class="scanner__error">{t('spines.moduleError')}</p>}

      <div class="scanner__upload">
        <label class="btn btn--primary">
          {phase === 'review' ? t('spines.recapture') : t('spines.capture')}
          <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} hidden />
        </label>
      </div>
      <p class="book-form__hint">{t('spines.notRetained')}</p>

      {phase === 'review' && items.length === 0 && (
        <div class="library-view__empty">
          <p class="library-view__empty-title">{t('spines.none.title')}</p>
          <p class="library-view__empty-body">{t('spines.none.body')}</p>
          <button type="button" class="btn" onClick={() => navigate('/add')}>
            {t('spines.manualInstead')}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <>
          <p class="library-view__count">{t('spines.candidates', { count: items.length })}</p>
          <ul class="spine-list">
            {items.map((item) => (
              <SpineCandidateCard
                key={item.candidate.id}
                item={item}
                onAccept={() => accept(item)}
                onReject={() => updateItem(item.candidate.id, { status: 'rejected' })}
                onStartEdit={() => updateItem(item.candidate.id, { editing: true })}
                onCancelEdit={() => updateItem(item.candidate.id, { editing: false })}
                onSubmitEdit={(values) => submitEdit(item, values)}
              />
            ))}
          </ul>
          <div class="book-detail__actions">
            <button type="button" class="btn btn--primary" onClick={finish} disabled={pending}>
              {t('spines.finish')}
            </button>
            <button type="button" class="btn btn--text" onClick={reset}>
              {t('spines.startOver')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
