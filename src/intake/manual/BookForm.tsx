import { useEffect, useState } from 'preact/hooks';
import type { Book, ReadStatus } from '../../db/types';
import { refreshShelves, shelves } from '../../features/shelves/store';
import { t } from '../../locales';
import { storeCoverFromBlob } from '../../metadata/cover';
import { searchByText } from '../../metadata/resolve';
import type { ResolvedMetadata } from '../../metadata/types';
import { CoverImage } from '../../ui/CoverImage';

export interface BookFormValues {
  title: string;
  subtitle: string;
  authors: string;
  publisher: string;
  publishedYear: string;
  language: string;
  pageCount: string;
  edition: string;
  isbn13: string;
  notes: string;
  tags: string;
  readStatus: ReadStatus;
  copyLabel: string;
  acquiredAt: string;
  shelfId: string;
  coverBlobId?: string;
}

export interface BookFormProps {
  initial?: Partial<Book>;
  submitLabel: string;
  onSubmit: (values: BookFormValues) => void | Promise<void>;
  onCancel: () => void;
  /** Show the "search metadata providers" assist (Tier 3 assist, SPEC §4.3). Off by default when editing. */
  showAssist?: boolean;
}

function toFormValues(book?: Partial<Book>): BookFormValues {
  return {
    title: book?.title ?? '',
    subtitle: book?.subtitle ?? '',
    authors: book?.authors?.join(', ') ?? '',
    publisher: book?.publisher ?? '',
    publishedYear: book?.publishedYear ? String(book.publishedYear) : '',
    language: book?.language ?? '',
    pageCount: book?.pageCount ? String(book.pageCount) : '',
    edition: book?.edition ?? '',
    isbn13: book?.isbn13 ?? '',
    notes: book?.notes ?? '',
    tags: book?.tags?.join(', ') ?? '',
    readStatus: book?.readStatus ?? 'unread',
    copyLabel: book?.copyLabel ?? '',
    acquiredAt: book?.acquiredAt?.slice(0, 10) ?? '',
    shelfId: book?.shelfId ?? '',
    coverBlobId: book?.coverBlobId,
  };
}

export function BookForm({ initial, submitLabel, onSubmit, onCancel, showAssist }: BookFormProps) {
  const [values, setValues] = useState<BookFormValues>(() => toFormValues(initial));
  const [titleError, setTitleError] = useState(false);
  const [assistQuery, setAssistQuery] = useState('');
  const [assistResults, setAssistResults] = useState<ResolvedMetadata[] | null>(null);
  const [assistLoading, setAssistLoading] = useState(false);
  const [assistError, setAssistError] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshShelves();
  }, []);

  function set<K extends keyof BookFormValues>(key: K, value: BookFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function runAssistSearch() {
    if (!assistQuery.trim()) return;
    setAssistLoading(true);
    setAssistError(false);
    try {
      const results = await searchByText(assistQuery, 'openlibrary');
      setAssistResults(results);
    } catch {
      setAssistError(true);
    } finally {
      setAssistLoading(false);
    }
  }

  function applyAssistResult(result: ResolvedMetadata) {
    setValues((v) => ({
      ...v,
      title: result.title,
      subtitle: result.subtitle ?? v.subtitle,
      authors: result.authors.length ? result.authors.join(', ') : v.authors,
      publisher: result.publisher ?? v.publisher,
      publishedYear: result.publishedYear ? String(result.publishedYear) : v.publishedYear,
      language: result.language ?? v.language,
      isbn13: result.isbn13 || v.isbn13,
    }));
    setAssistResults(null);
  }

  async function handleCoverCapture(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const id = await storeCoverFromBlob(file);
      set('coverBlobId', id);
    } finally {
      setCoverUploading(false);
      input.value = '';
    }
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!values.title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form class="book-form" onSubmit={handleSubmit}>
      {showAssist && (
        <fieldset class="book-form__assist">
          <legend>{t('entry.assistSearch')}</legend>
          <div class="book-form__assist-row">
            <input
              type="text"
              class="input"
              placeholder={t('entry.assistPlaceholder')}
              value={assistQuery}
              onInput={(e) => setAssistQuery((e.target as HTMLInputElement).value)}
            />
            <button type="button" class="btn" onClick={runAssistSearch} disabled={assistLoading}>
              {assistLoading ? t('common.loading') : t('entry.assistButton')}
            </button>
          </div>
          {assistError && <p class="book-form__hint book-form__hint--error">{t('entry.assistError')}</p>}
          {assistResults && assistResults.length === 0 && <p class="book-form__hint">{t('entry.assistNoResults')}</p>}
          {assistResults && assistResults.length > 0 && (
            <ul class="book-form__assist-results">
              {assistResults.map((r, i) => (
                <li key={i} class="book-form__assist-result">
                  <span>
                    <strong>{r.title}</strong>
                    {r.authors.length > 0 ? ` — ${r.authors.join(', ')}` : ''}
                    {r.publishedYear ? ` (${r.publishedYear})` : ''}
                  </span>
                  <button type="button" class="btn btn--small" onClick={() => applyAssistResult(r)}>
                    {t('entry.assistUseResult')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}

      <label class="field">
        <span>{t('book.title')} *</span>
        <input
          type="text"
          class={`input ${titleError ? 'input--error' : ''}`}
          value={values.title}
          onInput={(e) => {
            set('title', (e.target as HTMLInputElement).value);
            setTitleError(false);
          }}
          required
        />
        {titleError && <span class="field__error">{t('book.titleRequired')}</span>}
      </label>

      <label class="field">
        <span>{t('book.subtitle')}</span>
        <input type="text" class="input" value={values.subtitle} onInput={(e) => set('subtitle', (e.target as HTMLInputElement).value)} />
      </label>

      <label class="field">
        <span>{t('book.authors')}</span>
        <input type="text" class="input" value={values.authors} onInput={(e) => set('authors', (e.target as HTMLInputElement).value)} />
        <span class="field__hint">{t('book.authorsHint')}</span>
      </label>

      <div class="field-row">
        <label class="field">
          <span>{t('book.publisher')}</span>
          <input type="text" class="input" value={values.publisher} onInput={(e) => set('publisher', (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field field--narrow">
          <span>{t('book.publishedYear')}</span>
          <input
            type="number"
            class="input"
            value={values.publishedYear}
            onInput={(e) => set('publishedYear', (e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="field-row">
        <label class="field field--narrow">
          <span>{t('book.language')}</span>
          <input type="text" class="input" placeholder="pt / en" value={values.language} onInput={(e) => set('language', (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field field--narrow">
          <span>{t('book.pageCount')}</span>
          <input type="number" class="input" value={values.pageCount} onInput={(e) => set('pageCount', (e.target as HTMLInputElement).value)} />
        </label>
        <label class="field">
          <span>{t('book.edition')}</span>
          <input type="text" class="input" value={values.edition} onInput={(e) => set('edition', (e.target as HTMLInputElement).value)} />
        </label>
      </div>

      <label class="field">
        <span>{t('book.isbn13')} ({t('common.optional')})</span>
        <input type="text" class="input" value={values.isbn13} onInput={(e) => set('isbn13', (e.target as HTMLInputElement).value)} />
      </label>

      <div class="field-row">
        <label class="field">
          <span>{t('book.readStatus')}</span>
          <select class="input" value={values.readStatus} onChange={(e) => set('readStatus', (e.target as HTMLSelectElement).value as ReadStatus)}>
            <option value="unread">{t('readStatus.unread')}</option>
            <option value="reading">{t('readStatus.reading')}</option>
            <option value="read">{t('readStatus.read')}</option>
            <option value="abandoned">{t('readStatus.abandoned')}</option>
          </select>
        </label>
        <label class="field">
          <span>{t('book.acquiredAt')}</span>
          <input type="date" class="input" value={values.acquiredAt} onInput={(e) => set('acquiredAt', (e.target as HTMLInputElement).value)} />
        </label>
      </div>

      <label class="field">
        <span>{t('shelf.label')}</span>
        <select class="input" value={values.shelfId} onChange={(e) => set('shelfId', (e.target as HTMLSelectElement).value)}>
          <option value="">{t('shelf.none')}</option>
          {shelves.value.map((shelf) => (
            <option key={shelf.id} value={shelf.id}>
              {shelf.room ? `${shelf.room} — ${shelf.name}` : shelf.name}
            </option>
          ))}
        </select>
      </label>

      <label class="field">
        <span>{t('book.tags')}</span>
        <input type="text" class="input" value={values.tags} onInput={(e) => set('tags', (e.target as HTMLInputElement).value)} />
      </label>

      <label class="field">
        <span>{t('book.copyLabel')}</span>
        <input type="text" class="input" value={values.copyLabel} onInput={(e) => set('copyLabel', (e.target as HTMLInputElement).value)} />
        <span class="field__hint">{t('book.copyLabelHint')}</span>
      </label>

      <label class="field">
        <span>{t('book.notes')}</span>
        <textarea class="input" rows={3} value={values.notes} onInput={(e) => set('notes', (e.target as HTMLTextAreaElement).value)} />
      </label>

      <div class="field">
        <span>{t('book.cover')}</span>
        <div class="book-form__cover-row">
          {values.coverBlobId && <CoverImage coverBlobId={values.coverBlobId} alt={values.title || 'cover'} class="book-form__cover-preview" />}
          <label class="btn btn--secondary">
            {coverUploading ? t('common.loading') : t('book.coverCapture')}
            <input type="file" accept="image/*" capture="environment" onChange={handleCoverCapture} hidden />
          </label>
          {values.coverBlobId && (
            <button type="button" class="btn btn--text" onClick={() => set('coverBlobId', undefined)}>
              {t('book.coverRemove')}
            </button>
          )}
        </div>
      </div>

      <div class="book-form__actions">
        <button type="button" class="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" class="btn btn--primary" disabled={saving}>
          {saving ? t('common.loading') : submitLabel}
        </button>
      </div>
    </form>
  );
}
