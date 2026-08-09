import type { Book } from '../../db/types';
import { t } from '../../locales';
import { CoverImage } from '../../ui/CoverImage';

export interface BookCardProps {
  book: Book;
  view: 'list' | 'grid';
}

export function BookCard({ book, view }: BookCardProps) {
  return (
    <a href={`#/book/${book.id}`} class={`book-card book-card--${view}`}>
      <CoverImage coverBlobId={book.coverBlobId} coverUrl={book.coverUrl} alt={book.title} class="book-card__cover" />
      <div class="book-card__info">
        <div class="book-card__title-row">
          <span class="book-card__title">{book.title}</span>
          {!book.verifiedByUser && <span class="badge badge--warn">{t('library.unverifiedBadge')}</span>}
        </div>
        {book.authors.length > 0 && <div class="book-card__authors">{book.authors.join(', ')}</div>}
        {view === 'list' && (book.publisher || book.publishedYear) && (
          <div class="book-card__meta">
            {[book.publisher, book.publishedYear].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </a>
  );
}
