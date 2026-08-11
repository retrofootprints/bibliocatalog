import { useEffect, useState } from 'preact/hooks';
import { getBook, restoreBook, softDeleteBook, updateBook } from '../../db/queries';
import type { Book } from '../../db/types';
import { formatDate, t } from '../../locales';
import { BookForm, type BookFormValues } from '../../intake/manual/BookForm';
import { normalizeToIsbn13 } from '../../intake/barcode/isbn';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CoverImage } from '../../ui/CoverImage';
import { navigate, currentRoute } from '../../ui/router';
import { showToast } from '../../ui/toast';
import { refreshShelves, shelfName } from '../shelves/store';
import { refreshBooks } from './store';

export interface BookDetailViewProps {
  id: string;
}

export function BookDetailView({ id }: BookDetailViewProps) {
  const [book, setBook] = useState<Book | undefined | null>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editing = currentRoute.value.name === 'book-edit';

  useEffect(() => {
    let cancelled = false;
    refreshShelves();
    getBook(id).then((b) => {
      if (!cancelled) setBook(b ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (book === undefined) return <p class="page">{t('common.loading')}</p>;
  if (book === null) return <p class="page">{t('book.notFound')}</p>;

  async function handleSave(values: BookFormValues) {
    const isbn13 = values.isbn13.trim() ? normalizeToIsbn13(values.isbn13.trim()) : undefined;
    await updateBook(id, {
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
      shelfId: values.shelfId || undefined,
      coverBlobId: values.coverBlobId,
    });
    await refreshBooks();
    showToast(t('book.saved'));
    navigate(`/book/${id}`);
  }

  async function handleDelete() {
    setConfirmingDelete(false);
    await softDeleteBook(id);
    await refreshBooks();
    navigate('/');
    showToast(t('book.deleted'), {
      actionLabel: t('book.deletedUndo'),
      onAction: async () => {
        await restoreBook(id);
        await refreshBooks();
      },
    });
  }

  async function markVerified() {
    await updateBook(id, { verifiedByUser: true });
    const refreshed = await getBook(id);
    setBook(refreshed ?? null);
    await refreshBooks();
  }

  if (editing) {
    return (
      <div class="page">
        <h1 class="page__title">{book.title}</h1>
        <BookForm initial={book} submitLabel={t('common.save')} onSubmit={handleSave} onCancel={() => navigate(`/book/${id}`)} />
      </div>
    );
  }

  return (
    <div class="page book-detail">
      <button type="button" class="btn btn--text" onClick={() => navigate('/')}>
        ← {t('common.back')}
      </button>

      <div class="book-detail__header">
        <CoverImage coverBlobId={book.coverBlobId} coverUrl={book.coverUrl} alt={book.title} class="book-detail__cover" />
        <div class="book-detail__heading">
          <h1 class="page__title">{book.title}</h1>
          {book.subtitle && <p class="book-detail__subtitle">{book.subtitle}</p>}
          {book.authors.length > 0 && <p class="book-detail__authors">{book.authors.join(', ')}</p>}
          <div class="book-detail__badges">
            <span class={`badge ${book.verifiedByUser ? 'badge--ok' : 'badge--warn'}`}>
              {book.verifiedByUser ? t('book.verified') : t('book.notVerified')}
            </span>
            <span class="badge">{t(`book.source.${book.source}`)}</span>
            <span class="badge">{t(`readStatus.${book.readStatus}`)}</span>
          </div>
          {!book.verifiedByUser && (
            <button type="button" class="btn btn--small" onClick={markVerified}>
              {t('book.markVerified')}
            </button>
          )}
        </div>
      </div>

      <dl class="book-detail__fields">
        {book.publisher && (
          <>
            <dt>{t('book.publisher')}</dt>
            <dd>{book.publisher}</dd>
          </>
        )}
        {book.publishedYear && (
          <>
            <dt>{t('book.publishedYear')}</dt>
            <dd>{book.publishedYear}</dd>
          </>
        )}
        {book.language && (
          <>
            <dt>{t('book.language')}</dt>
            <dd>{book.language}</dd>
          </>
        )}
        {book.pageCount && (
          <>
            <dt>{t('book.pageCount')}</dt>
            <dd>{book.pageCount}</dd>
          </>
        )}
        {book.edition && (
          <>
            <dt>{t('book.edition')}</dt>
            <dd>{book.edition}</dd>
          </>
        )}
        {book.isbn13 && (
          <>
            <dt>{t('book.isbn13')}</dt>
            <dd>{book.isbn13}</dd>
          </>
        )}
        {book.copyLabel && (
          <>
            <dt>{t('book.copyLabel')}</dt>
            <dd>{book.copyLabel}</dd>
          </>
        )}
        {shelfName(book.shelfId) && (
          <>
            <dt>{t('shelf.label')}</dt>
            <dd>{shelfName(book.shelfId)}</dd>
          </>
        )}
        {book.tags.length > 0 && (
          <>
            <dt>{t('book.tags')}</dt>
            <dd>{book.tags.join(', ')}</dd>
          </>
        )}
        {book.notes && (
          <>
            <dt>{t('book.notes')}</dt>
            <dd class="book-detail__notes">{book.notes}</dd>
          </>
        )}
      </dl>

      <p class="book-detail__timestamps">
        {t('book.addedOn', { date: formatDate(book.createdAt) })} · {t('book.updatedOn', { date: formatDate(book.updatedAt) })}
      </p>

      <div class="book-detail__actions">
        <button type="button" class="btn btn--primary" onClick={() => navigate(`/book/${id}/edit`)}>
          {t('common.edit')}
        </button>
        <button type="button" class="btn btn--danger" onClick={() => setConfirmingDelete(true)}>
          {t('common.delete')}
        </button>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={t('common.delete')}
          body={t('book.deleteConfirm')}
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
