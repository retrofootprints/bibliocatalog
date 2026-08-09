import { useState } from 'preact/hooks';
import { createBook, findByIsbn13 } from '../../db/queries';
import { normalizeToIsbn13 } from '../barcode/isbn';
import { t } from '../../locales';
import { refreshBooks } from '../../features/library/store';
import { pendingManualIsbn } from '../../features/scan/pendingIsbn';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { navigate } from '../../ui/router';
import { showToast } from '../../ui/toast';
import { BookForm, type BookFormValues } from './BookForm';

/** Tier 3 manual entry (SPEC §4.3): the path for pre-ISBN and inherited books,
 *  and the guaranteed fallback from every failure state in Tiers 1/2. */
export function ManualEntryForm() {
  const [pendingDuplicate, setPendingDuplicate] = useState<{ values: BookFormValues; existingTitle: string } | null>(null);
  const [prefillIsbn] = useState(() => {
    const isbn = pendingManualIsbn.value;
    pendingManualIsbn.value = undefined;
    return isbn;
  });

  async function persist(values: BookFormValues) {
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
      coverBlobId: values.coverBlobId,
      source: 'manual',
      verifiedByUser: true,
    });
    await refreshBooks();
    showToast(t('book.saved'));
    navigate(`/book/${book.id}`);
  }

  async function handleSubmit(values: BookFormValues) {
    const isbn13 = values.isbn13.trim() ? normalizeToIsbn13(values.isbn13.trim()) : undefined;
    if (isbn13) {
      const existing = await findByIsbn13(isbn13);
      if (existing.length > 0) {
        setPendingDuplicate({ values, existingTitle: existing[0].title });
        return;
      }
    }
    await persist(values);
  }

  return (
    <div class="page">
      <h1 class="page__title">{t('entry.title')}</h1>
      {prefillIsbn && <p class="book-form__hint">{t('entry.manualEntryFrom', { isbn: prefillIsbn })}</p>}
      <BookForm
        initial={prefillIsbn ? { isbn13: prefillIsbn } : undefined}
        submitLabel={t('common.save')}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/')}
        showAssist
      />

      {pendingDuplicate && (
        <ConfirmDialog
          title={t('scan.duplicateTitle')}
          body={t('scan.duplicateBody', { title: pendingDuplicate.existingTitle })}
          confirmLabel={t('scan.addCopy')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            const values = pendingDuplicate.values;
            setPendingDuplicate(null);
            persist(values);
          }}
          onCancel={() => setPendingDuplicate(null)}
        />
      )}
    </div>
  );
}
