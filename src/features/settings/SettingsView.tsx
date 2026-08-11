import { useEffect, useRef, useState } from 'preact/hooks';
import { exportToFile } from '../../backup/export';
import { importData, parseExportFile } from '../../backup/import';
import { getSettings, updateSettings } from '../../db/queries';
import type { Settings, UiLocale } from '../../db/types';
import { formatBytes, formatDate, locale, t } from '../../locales';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { navigate } from '../../ui/router';
import { showToast } from '../../ui/toast';
import { refreshBooks } from '../library/store';

export function SettingsView() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [includeCovers, setIncludeCovers] = useState(true);
  const [pendingReplace, setPendingReplace] = useState<{ file: File } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  useEffect(() => {
    getSettings().then(setSettings);
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => {
        if (est.usage !== undefined && est.quota !== undefined) {
          setStorageEstimate({ usage: est.usage, quota: est.quota });
        }
      });
    }
  }, []);

  async function changeLocale(next: UiLocale) {
    locale.value = next;
    const updated = await updateSettings({ locale: next });
    setSettings(updated);
  }

  async function changeMetadataSource(source: 'openlibrary' | 'googlebooks') {
    const updated = await updateSettings({ preferredMetadataSource: source });
    setSettings(updated);
  }

  /** Turning this off re-arms the beta explainer and download gate on the Spines tab. */
  async function changeOcrEnabled(enabled: boolean) {
    const updated = await updateSettings({ ocrEnabled: enabled });
    setSettings(updated);
  }

  async function handleExport() {
    await exportToFile(includeCovers);
    const updated = await getSettings();
    setSettings(updated);
    showToast(t('common.confirm'));
  }

  async function runImport(file: File, mode: 'merge' | 'replace') {
    try {
      const text = await file.text();
      const data = parseExportFile(text);
      const result = await importData(data, mode);
      await refreshBooks();
      showToast(t('settings.import.success', { count: result.bookCount }));
    } catch {
      showToast(t('settings.import.error'));
    }
  }

  async function handleFileChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (importMode === 'replace') {
      setPendingReplace({ file });
    } else {
      await runImport(file, 'merge');
    }
  }

  if (!settings) return <p class="page">{t('common.loading')}</p>;

  return (
    <div class="page settings-view">
      <h1 class="page__title">{t('settings.title')}</h1>

      <section class="settings-section">
        <h2>{t('settings.language')}</h2>
        <div class="settings-section__row">
          <label>
            <input type="radio" name="locale" checked={settings.locale === 'pt-PT'} onChange={() => changeLocale('pt-PT')} />
            {t('settings.language.pt-PT')}
          </label>
          <label>
            <input type="radio" name="locale" checked={settings.locale === 'en'} onChange={() => changeLocale('en')} />
            {t('settings.language.en')}
          </label>
        </div>
      </section>

      <section class="settings-section">
        <h2>{t('settings.metadataSource')}</h2>
        <div class="settings-section__row">
          <label>
            <input
              type="radio"
              name="metadataSource"
              checked={settings.preferredMetadataSource === 'openlibrary'}
              onChange={() => changeMetadataSource('openlibrary')}
            />
            {t('settings.metadataSource.openlibrary')}
          </label>
          <label>
            <input
              type="radio"
              name="metadataSource"
              checked={settings.preferredMetadataSource === 'googlebooks'}
              onChange={() => changeMetadataSource('googlebooks')}
            />
            {t('settings.metadataSource.googlebooks')}
          </label>
        </div>
      </section>

      <section class="settings-section">
        <h2>{t('settings.ocr.title')}</h2>
        <p>{t('settings.ocr.body')}</p>
        <label class="settings-section__row">
          <input type="checkbox" checked={settings.ocrEnabled} onChange={(e) => changeOcrEnabled((e.target as HTMLInputElement).checked)} />
          {t('settings.ocr.toggle')}
        </label>
        <button type="button" class="btn" onClick={() => navigate('/shelves')}>
          {t('settings.ocr.shelves')}
        </button>
      </section>

      <section class="settings-section">
        <h2>{t('settings.export.title')}</h2>
        <p>{t('settings.export.body')}</p>
        <p class="settings-section__meta">
          {settings.lastExportAt ? t('settings.export.lastExport', { date: formatDate(settings.lastExportAt) }) : t('settings.export.never')}
        </p>
        <label class="settings-section__row">
          <input type="checkbox" checked={includeCovers} onChange={(e) => setIncludeCovers((e.target as HTMLInputElement).checked)} />
          {t('book.cover')}
        </label>
        <button type="button" class="btn btn--primary" onClick={handleExport}>
          {t('settings.export.button')}
        </button>
      </section>

      <section class="settings-section">
        <h2>{t('settings.import.title')}</h2>
        <p>{t('settings.import.body')}</p>
        <div class="settings-section__row">
          <label>
            <input type="radio" name="importMode" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />
            {t('settings.import.mode.merge')}
          </label>
          <label>
            <input type="radio" name="importMode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
            {t('settings.import.mode.replace')}
          </label>
        </div>
        <button type="button" class="btn" onClick={() => fileInputRef.current?.click()}>
          {t('settings.import.button')}
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={handleFileChosen} />
      </section>

      <section class="settings-section">
        <h2>{t('settings.storage')}</h2>
        {storageEstimate ? (
          <p>{t('settings.storage.usage', { used: formatBytes(storageEstimate.usage), quota: formatBytes(storageEstimate.quota) })}</p>
        ) : (
          <p>{t('settings.storage.unavailable')}</p>
        )}
      </section>

      <section class="settings-section">
        <h2>{t('settings.about')}</h2>
        <p>{t('settings.aboutBody')}</p>
      </section>

      {pendingReplace && (
        <ConfirmDialog
          title={t('settings.import.mode.replace')}
          body={t('settings.import.confirmReplace')}
          danger
          onConfirm={async () => {
            const file = pendingReplace.file;
            setPendingReplace(null);
            await runImport(file, 'replace');
          }}
          onCancel={() => setPendingReplace(null)}
        />
      )}
    </div>
  );
}
