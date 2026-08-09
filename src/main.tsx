import { render } from 'preact';
import { App } from './app';
import { ensureSettings } from './db/schema';
import { locale } from './locales';
import './index.css';

async function boot() {
  const settings = await ensureSettings();
  locale.value = settings.locale;

  render(<App />, document.getElementById('app')!);

  // Best-effort persistent storage request — reduces risk of iOS evicting
  // IndexedDB data (SPEC §7, §11). Non-blocking, no UI dependency on the result.
  if (navigator.storage?.persist) {
    navigator.storage.persisted().then((already) => {
      if (!already) navigator.storage.persist();
    });
  }
}

void boot();
