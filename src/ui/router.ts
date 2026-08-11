import { computed, signal } from '@preact/signals';

// Hash-based routing: GitHub Pages has no SPA rewrite rules (SPEC §13.2),
// so every route lives under the `#/...` fragment and never hits the server.

export type Route =
  | { name: 'library' }
  | { name: 'book'; id: string }
  | { name: 'book-edit'; id: string }
  | { name: 'add' }
  | { name: 'scan' }
  // The whole spine-OCR flow (capture -> OCR -> review -> reconcile) lives under
  // this one route on purpose: an in-flight session holds image data that is never
  // persisted (SPEC §12.2), so sub-routes would silently destroy work.
  | { name: 'spines' }
  | { name: 'shelves' }
  | { name: 'settings' };

function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) return { name: 'library' };
  if (segments[0] === 'add') return { name: 'add' };
  if (segments[0] === 'scan') return { name: 'scan' };
  if (segments[0] === 'spines') return { name: 'spines' };
  if (segments[0] === 'shelves') return { name: 'shelves' };
  if (segments[0] === 'settings') return { name: 'settings' };
  if (segments[0] === 'book' && segments[1]) {
    if (segments[2] === 'edit') return { name: 'book-edit', id: segments[1] };
    return { name: 'book', id: segments[1] };
  }
  return { name: 'library' };
}

export const currentRoute = signal<Route>(parseHash(typeof location !== 'undefined' ? location.hash : ''));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    currentRoute.value = parseHash(location.hash);
  });
}

export function navigate(path: string): void {
  location.hash = path.startsWith('/') ? path : `/${path}`;
}

export const routeName = computed(() => currentRoute.value.name);
