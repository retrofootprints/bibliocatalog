import { BookDetailView } from './features/library/BookDetailView';
import { LibraryView } from './features/library/LibraryView';
import { ScanView } from './features/scan/ScanView';
import { SettingsView } from './features/settings/SettingsView';
import { ManualEntryForm } from './intake/manual/ManualEntryForm';
import { NavBar } from './ui/NavBar';
import { ToastHost } from './ui/ToastHost';
import { currentRoute } from './ui/router';

export function App() {
  const route = currentRoute.value;

  return (
    <div class="app-shell">
      <main class="app-main">
        {route.name === 'library' && <LibraryView />}
        {(route.name === 'book' || route.name === 'book-edit') && <BookDetailView id={route.id} />}
        {route.name === 'add' && <ManualEntryForm />}
        {route.name === 'scan' && <ScanView />}
        {route.name === 'settings' && <SettingsView />}
      </main>
      <NavBar />
      <ToastHost />
    </div>
  );
}
