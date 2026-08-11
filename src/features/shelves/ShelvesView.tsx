import { useEffect, useState } from 'preact/hooks';
import { createShelf, deleteShelf, updateShelf } from '../../db/queries';
import type { Shelf } from '../../db/types';
import { formatDate, t } from '../../locales';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { navigate } from '../../ui/router';
import { showToast } from '../../ui/toast';
import { books, refreshBooks } from '../library/store';
import { refreshShelves, shelves, shelvesLoading } from './store';

/** Shelf CRUD with per-shelf counts (SPEC §6.3). A shelf *view* is just a filtered
 *  library view, so this screen only manages the shelves themselves. */
export function ShelvesView() {
  const [editing, setEditing] = useState<Shelf | 'new' | null>(null);
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [nameError, setNameError] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Shelf | null>(null);

  useEffect(() => {
    refreshShelves();
    refreshBooks();
  }, []);

  function startEdit(shelf: Shelf | 'new') {
    setEditing(shelf);
    setName(shelf === 'new' ? '' : shelf.name);
    setRoom(shelf === 'new' ? '' : (shelf.room ?? ''));
    setNameError(false);
  }

  async function save(e: Event) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    if (editing === 'new') {
      await createShelf({ name: name.trim(), room: room.trim() || undefined });
    } else if (editing) {
      await updateShelf(editing.id, { name: name.trim(), room: room.trim() || undefined });
    }
    await refreshShelves();
    setEditing(null);
    showToast(t('shelf.saved'));
  }

  async function confirmDelete(shelf: Shelf) {
    setPendingDelete(null);
    await deleteShelf(shelf.id);
    await Promise.all([refreshShelves(), refreshBooks()]);
    showToast(t('shelf.deleted'));
  }

  function countFor(shelfId: string): number {
    return books.value.filter((b) => b.shelfId === shelfId).length;
  }

  return (
    <div class="page">
      <button type="button" class="btn btn--text" onClick={() => navigate('/')}>
        ← {t('common.back')}
      </button>
      <h1 class="page__title">{t('shelf.title')}</h1>

      {editing ? (
        <form class="book-form" onSubmit={save}>
          <label class="field">
            <span>{t('shelf.name')} *</span>
            <input
              type="text"
              class={`input ${nameError ? 'input--error' : ''}`}
              value={name}
              onInput={(e) => {
                setName((e.target as HTMLInputElement).value);
                setNameError(false);
              }}
            />
            {nameError && <span class="field__error">{t('shelf.nameRequired')}</span>}
          </label>
          <label class="field">
            <span>{t('shelf.room')}</span>
            <input type="text" class="input" value={room} onInput={(e) => setRoom((e.target as HTMLInputElement).value)} />
          </label>
          <div class="book-form__actions">
            <button type="button" class="btn" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
            <button type="submit" class="btn btn--primary">
              {t('common.save')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" class="btn btn--primary" onClick={() => startEdit('new')}>
          {t('shelf.add')}
        </button>
      )}

      {shelvesLoading.value ? (
        <p class="library-view__loading">{t('common.loading')}</p>
      ) : shelves.value.length === 0 ? (
        <div class="library-view__empty">
          <p class="library-view__empty-title">{t('shelf.empty.title')}</p>
          <p class="library-view__empty-body">{t('shelf.empty.body')}</p>
        </div>
      ) : (
        <ul class="shelf-list">
          {shelves.value.map((shelf) => (
            <li key={shelf.id} class="shelf-list__item">
              <div class="shelf-list__main">
                <span class="shelf-list__name">{shelf.name}</span>
                <span class="shelf-list__meta">
                  {shelf.room ? `${shelf.room} · ` : ''}
                  {t('shelf.count', { count: countFor(shelf.id) })}
                  {' · '}
                  {shelf.lastScanAt ? t('shelf.lastScan', { date: formatDate(shelf.lastScanAt) }) : t('shelf.neverScanned')}
                </span>
              </div>
              <div class="shelf-list__actions">
                <button type="button" class="btn btn--small" onClick={() => startEdit(shelf)}>
                  {t('common.edit')}
                </button>
                <button type="button" class="btn btn--small btn--danger" onClick={() => setPendingDelete(shelf)}>
                  {t('common.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={t('common.delete')}
          body={t('shelf.deleteConfirm', { name: pendingDelete.name })}
          danger
          onConfirm={() => confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
