import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ReadStatus } from '../../db/types';
import { t } from '../../locales';
import { BookCard } from './BookCard';
import { searchLibrary } from './searchIndex';
import { books, booksLoading, refreshBooks } from './store';

type SortKey = 'recent' | 'title' | 'author' | 'year';
type ViewMode = 'list' | 'grid';

const PAGE_SIZE = 60;

export function LibraryView() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem('bc.view') as ViewMode) || 'list');
  const [sort, setSort] = useState<SortKey>('recent');
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReadStatus | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refreshBooks();
  }, []);

  useEffect(() => {
    localStorage.setItem('bc.view', view);
  }, [view]);

  useEffect(() => setVisibleCount(PAGE_SIZE), [query, sort, unverifiedOnly, statusFilter]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const filtered = useMemo(() => {
    let list = books.value;
    if (query.trim()) {
      const matchIds = searchLibrary(query);
      list = list.filter((b) => matchIds.has(b.id));
    }
    if (unverifiedOnly) list = list.filter((b) => !b.verifiedByUser);
    if (statusFilter !== 'all') list = list.filter((b) => b.readStatus === statusFilter);

    const sorted = [...list];
    switch (sort) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'author':
        sorted.sort((a, b) => (a.authors[0] ?? '').localeCompare(b.authors[0] ?? ''));
        break;
      case 'year':
        sorted.sort((a, b) => (b.publishedYear ?? 0) - (a.publishedYear ?? 0));
        break;
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [query, sort, unverifiedOnly, statusFilter]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <div class="library-view">
      <div class="library-view__toolbar">
        <input
          type="search"
          class="input library-view__search"
          placeholder={t('library.searchPlaceholder')}
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
        <div class="library-view__view-toggle" role="group" aria-label="View">
          <button
            type="button"
            class={`btn btn--icon ${view === 'list' ? 'btn--active' : ''}`}
            onClick={() => setView('list')}
            aria-label={t('library.viewList')}
            title={t('library.viewList')}
          >
            ☰
          </button>
          <button
            type="button"
            class={`btn btn--icon ${view === 'grid' ? 'btn--active' : ''}`}
            onClick={() => setView('grid')}
            aria-label={t('library.viewGrid')}
            title={t('library.viewGrid')}
          >
            ▦
          </button>
        </div>
      </div>

      <div class="library-view__filters">
        <label class="library-view__filter">
          {t('library.sort.label')}
          <select class="input" value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as SortKey)}>
            <option value="recent">{t('library.sort.recentlyAdded')}</option>
            <option value="title">{t('library.sort.title')}</option>
            <option value="author">{t('library.sort.author')}</option>
            <option value="year">{t('library.sort.year')}</option>
          </select>
        </label>

        <label class="library-view__filter">
          {t('library.filter.readStatus')}
          <select
            class="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target as HTMLSelectElement).value as ReadStatus | 'all')}
          >
            <option value="all">{t('library.filter.all')}</option>
            <option value="unread">{t('readStatus.unread')}</option>
            <option value="reading">{t('readStatus.reading')}</option>
            <option value="read">{t('readStatus.read')}</option>
            <option value="abandoned">{t('readStatus.abandoned')}</option>
          </select>
        </label>

        <label class="library-view__filter library-view__filter--checkbox">
          <input type="checkbox" checked={unverifiedOnly} onChange={(e) => setUnverifiedOnly((e.target as HTMLInputElement).checked)} />
          {t('library.filter.unverifiedOnly')}
        </label>
      </div>

      {!booksLoading.value && <p class="library-view__count">{t('library.count', { count: filtered.length })}</p>}

      {booksLoading.value ? (
        <p class="library-view__loading">{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <div class="library-view__empty">
          <p class="library-view__empty-title">{t('library.empty.title')}</p>
          <p class="library-view__empty-body">{t('library.empty.body')}</p>
        </div>
      ) : (
        <>
          <div class={`library-view__list library-view__list--${view}`}>
            {visible.map((book) => (
              <BookCard key={book.id} book={book} view={view} />
            ))}
          </div>
          {visibleCount < filtered.length && <div ref={sentinelRef} class="library-view__sentinel" />}
        </>
      )}
    </div>
  );
}
