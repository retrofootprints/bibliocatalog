# BiblioCatalog

A zero-backend, local-first Progressive Web App for cataloging a personal book
library: scan barcodes, fetch metadata, browse and search your shelves — all
from a static site with no server behind it.

## Your data lives only in this browser

**This is the single most important thing to know before you use this app.**

BiblioCatalog stores everything — every book, cover photo, and note — in
IndexedDB, inside this browser, on this device. There is no account, no
server, and no automatic sync between devices.

- Clearing your browser's site data for this app **deletes your library**.
- On iOS in particular, Safari may evict site storage for apps you haven't
  opened in a while.
- **Exporting to JSON (Settings → Export library) is your only backup.**
  Export regularly, and after any significant round of adding books, and
  keep the file somewhere safe (cloud drive, email to yourself, etc.). If
  this browser's storage is ever cleared, the JSON export is the only way
  to get your library back.

There is no other safety net. If you take away one thing from this README,
make it: **export your library, and do it often.**

## What it does

- Catalog books by scanning barcodes (camera or photo upload), or by typing
  them in manually.
- Looks up metadata from OpenLibrary and Google Books, caches it locally, and
  downloads/resizes cover art into IndexedDB.
- Full-text search and a list/grid library view.
- Detects when you scan an ISBN you already own and asks whether you're
  adding a second physical copy.
- Full-fidelity JSON export/import — your only backup mechanism.
- Ships in European Portuguese (default) and English.

See [`docs/SPEC.md`](docs/SPEC.md) for the full technical specification. This
build implements **Phase 1 (Skeleton)** and **Phase 2 (Barcode)** from the
spec's build order (§10); shelves, lending, tags, CSV export, offline/service
worker hardening, and spine OCR are not yet built — see "Current status"
below.

## Current status

Implemented (Phases 1–2):

- Manual entry, library browse/search, book detail/edit, JSON export/import.
- Barcode scanning (`zxing-wasm` in a Web Worker), continuous scan mode,
  ISBN-13 checksum validation, photo-upload fallback.
- OpenLibrary → Google Books metadata resolution with IndexedDB caching,
  cover download/resize/storage.
- Duplicate-copy detection on add.
- pt-PT / en locales.

Deliberately not built yet (see `docs/SPEC.md` §10 Phases 3–5):

- Shelves, lending/loans, tags, read-status filtering UI, CSV export.
- Service worker / offline caching / install prompt / persistent-storage UX
  beyond a best-effort `navigator.storage.persist()` call at boot.
- Tier 2 shelf-photo OCR.

## Development

Requirements: Node 20.19+ or 22.12+, npm.

```bash
npm install
npm run dev        # local dev server
npm run typecheck   # tsc, no emit
npm run build        # typecheck + production build to dist/
npm run preview      # serve the production build locally
```

## Deployment

The app is built as a static site and deployed to GitHub Pages from
`.github/workflows/deploy.yml` on every push to `main` (typecheck → build →
deploy). Because GitHub Pages serves this repo from a subpath
(`https://retrofootprints.github.io/bibliocatalog/`), the Vite `base` and the
web manifest's `start_url`/`scope` are all pinned to `/bibliocatalog/` — see
`docs/SPEC.md` §13.2 if you fork this and deploy somewhere else (e.g. a
custom domain or Netlify/Cloudflare Pages puts the app at the origin root,
where `base: '/'` is correct instead).

Live app: https://retrofootprints.github.io/bibliocatalog/

## License

MIT — see [`LICENSE`](LICENSE).
