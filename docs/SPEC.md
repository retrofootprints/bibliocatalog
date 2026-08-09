# BiblioCatalog — Technical Specification

**Repository:** https://github.com/retrofootprints/bibliocatalog
**Version:** 0.1 (draft)
**Target:** Static PWA, mobile-first, iOS Safari + Chrome Android
**Scope:** Single-user personal library (hundreds to low thousands of books)
**Non-goals:** Multi-user, dealer/ERP workflows, valuation, social features, server-side anything

---

## 1. Architectural Principles

1. **Zero backend.** The deliverable is a folder of static files. No origin server logic, no auth, no database, no operational cost. Consequence: no cross-device sync beyond file export/import.
2. **Local-first.** IndexedDB is the system of record. Network is used only to *enrich* records. The app must be fully functional offline for browsing, search, lending, and manual entry.
3. **Graceful degradation.** Each capability has a defined fallback: WebGPU → WASM → manual. No feature is load-bearing except barcode scanning.
4. **User data is portable and owned.** Export/import is a v1 feature, not a v2 nicety.
5. **Small first load.** Core app under ~300 KB gzipped. Heavy optional modules (OCR, ML weights) are lazy-loaded on first use, behind an explicit user action and a size warning.

---

## 2. Stack

| Concern | Choice | Rationale |
|---|---|---|
| Build | Vite | Static output, good PWA plugins, fast |
| Language | TypeScript | Data model correctness matters here |
| UI | Preact + Signals (or React) | Small bundle; swap freely, no lock-in |
| Styling | Tailwind or plain CSS modules | Preference |
| Storage | Dexie.js over IndexedDB | Ergonomic queries, migrations, blob support |
| Barcode | `zxing-wasm` (or ZBar/Emscripten) | Works on iOS where `BarcodeDetector` does not |
| Search | FlexSearch or MiniSearch (in-memory index) | No server; rebuild index on boot |
| PWA | `vite-plugin-pwa` (Workbox) | Precache shell, runtime-cache covers |
| OCR (optional) | Tesseract.js (WASM) or transformers.js (WebGPU) | Tier 2 only, lazy-loaded |
| Locale | pt-PT (default) + en, typed string modules, `Intl` | Two locales; no i18n framework needed |
| Hosting | Static host from `retrofootprints/bibliocatalog` | HTTPS required for camera; see §13 on base path |

---

## 3. Data Model

Stored in IndexedDB via Dexie. All IDs are UUIDv4 generated client-side.

### 3.1 `books`

```ts
interface Book {
  id: string;                    // uuid
  // Identity
  isbn13?: string;               // normalized, no hyphens
  isbn10?: string;
  title: string;                 // required
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publishedYear?: number;
  language?: string;             // ISO 639-1
  pageCount?: number;
  edition?: string;
  // Provenance of the record
  source: 'barcode' | 'spine-ocr' | 'manual' | 'import';
  metadataSource?: 'openlibrary' | 'googlebooks' | 'none';
  confidence?: number;           // 0-1, for OCR-derived records
  verifiedByUser: boolean;       // user confirmed the match
  // User data
  shelfId?: string;
  tags: string[];
  readStatus: 'unread' | 'reading' | 'read' | 'abandoned';
  rating?: number;               // 1-5
  notes?: string;
  acquiredAt?: string;           // ISO date
  copyLabel?: string;            // optional user label to tell copies apart
                                 // ("hardback", "Ana's old one")
  // Media
  coverBlobId?: string;          // → covers table
  coverUrl?: string;             // remote fallback
  // Housekeeping
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;            // soft delete, for import reconciliation
}
```

**Indexes:** `isbn13`, `title`, `shelfId`, `readStatus`, `*authors`, `*tags`, `updatedAt`

### 3.2 `shelves`

```ts
interface Shelf {
  id: string;
  name: string;                  // "Living room, top shelf"
  room?: string;
  position?: number;             // ordering
  lastScanAt?: string;
  createdAt: string;
}
```

### 3.3 `loans`

```ts
interface Loan {
  id: string;
  bookId: string;
  borrowerName: string;
  borrowerContact?: string;
  lentAt: string;
  dueAt?: string;
  returnedAt?: string;           // null = currently out
  notes?: string;
}
```

**Index:** `bookId`, `returnedAt`

### 3.4 `covers`

```ts
interface Cover {
  id: string;
  blob: Blob;                    // JPEG/WebP, resized to max 400px wide
  bytes: number;
}
```

### 3.5 `scans` (shelf scan history, Tier 2)

```ts
interface Scan {
  id: string;
  shelfId: string;
  // No image is retained. The captured frame is processed in memory
  // and discarded; only the derived results below are persisted.
  detectedBookIds: string[];
  unresolvedCandidates: { rawText: string; confidence: number }[];
  scannedAt: string;
}
```

### 3.6 `settings`

Single-row key/value: UI locale (`pt-PT` | `en`), preferred metadata source, language preference, OCR module enabled, storage persisted flag, last export timestamp.

---

## 4. Intake Pipelines

### 4.1 Tier 1 — Barcode (primary)

**Flow:** camera permission → `getUserMedia({ video: { facingMode: 'environment' } })` → frames drawn to `OffscreenCanvas` → decoded in a Web Worker by `zxing-wasm` → EAN-13/UPC-A result.

Requirements:
- Continuous scan mode: keep the stream open, debounce duplicate detections (same code within 3s = ignore), audible/haptic confirmation, running session counter. The user must be able to work through a stack without touching the screen.
- Validate ISBN-13 checksum before lookup. Reject non-book EANs (prefix not 978/979) with a clear message.
- Decode runs in a worker; main thread never blocks.
- Torch toggle where `MediaStreamTrack.applyConstraints({ torch: true })` is supported (Chrome Android; absent on iOS — hide the control).
- Frame throttle to ~10 fps to control battery/heat.

Fallback: if `getUserMedia` fails or is denied, offer file-input photo upload (`<input type="file" accept="image/*" capture="environment">`) and decode the still image.

### 4.2 Tier 2 — Shelf photo OCR (optional module)

**Flow:** capture still photo → lazy-load OCR module (show download size, require confirmation, cache thereafter) → text detection → group text regions into per-spine candidates → per-candidate metadata search by title/author string → present confirmation list.

Requirements:
- **Never auto-commits.** Output is always a review queue: each candidate shows the cropped spine region, the proposed match with cover, and Accept / Edit / Reject. Confidence below threshold is pre-marked as needing attention.
- Segmentation approach: rotate-and-detect (spine text is usually rotated 90°); run OCR at 0° and ±90° and take best-scoring orientation per region.
- Results are written with `source: 'spine-ocr'`, `verifiedByUser: false` until confirmed.
- Module is code-split; the app must build and run with the module absent.

**Expected accuracy is the risk here:** stylized typography, glare, thin/blank spines, and non-English titles will underperform. Spec target is "useful assist," not "automatic." Do not build UX that assumes high recall.

### 4.3 Tier 3 — Manual entry

Form with title (required), authors, publisher, year, language, edition, notes, shelf, tags. Optional camera capture of cover/title page stored as the cover blob. This is the path for pre-ISBN and inherited books, and must be reachable in one tap from every failure state in Tiers 1 and 2.

Assist: title/author free-text search against metadata providers, with results offered as one-tap fill. Always skippable.

---

## 5. Metadata Resolution

### 5.1 Providers

**Primary — OpenLibrary**
- `https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data`
- Covers: `https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg`
- Keyless, CORS-enabled, open data. Coverage weaker for Portuguese/French titles.

**Fallback — Google Books**
- `https://www.googleapis.com/books/v1/volumes?q=isbn:{isbn}`
- CORS-enabled. Better non-English coverage. Note quota limits on keyless use; a key is domain-restrictable but is exposed in a static app — accept the limit or make the key a user-supplied setting.

**Resolution order:** cache → OpenLibrary → Google Books → unresolved (offer manual entry prefilled with the ISBN).

### 5.2 Rules

- Normalize ISBN-10 → ISBN-13 before lookup; store both.
- Cache every response in IndexedDB keyed by ISBN; never re-fetch a resolved ISBN.
- Download cover once, resize client-side (canvas, max 400px, WebP if supported), store as blob. Keep `coverUrl` as a fallback only.
- Duplicate detection on add: exact ISBN match → prompt "you already have this; add a second copy?" Fuzzy title+author match → soft warning.
- **The local record is authoritative.** User edits are never overwritten by a later fetch.
- Rate-limit lookups (queue, ~5/s) and handle failure silently into the unresolved queue so a bad network doesn't break a scanning session.

---

## 6. Core Features

### 6.1 Library browse & search
- List/grid toggle; virtualized list for 1000+ items.
- Full-text search over title, subtitle, authors, publisher, tags, notes via in-memory index rebuilt on boot (fast enough well past 10k records).
- Filters: shelf, read status, tags, language, lent-out, unverified.
- Sort: recently added, title, author, year.

### 6.2 Book detail
View/edit all fields, cover, loan history, shelf assignment, delete (soft).

### 6.3 Shelves
CRUD; assign books; per-shelf counts; a shelf view is just a filtered library view.

### 6.4 Lending
- Mark lent: borrower name (optional contact), lent date, optional due date.
- Currently-out view; overdue highlighting.
- Mark returned → sets `returnedAt`, book returns to shelf.
- Optional reminder: generate an `.ics` file or a Notification API local reminder if permission granted. **No push** (no server) — this is a local-only reminder and its limits should be stated plainly in the UI.

### 6.5 Shelf reconciliation
Re-scan a shelf → compare detected set against expected set for that `shelfId`:
- **Missing:** expected, not detected → possible loss, misfile, or OCR miss. Present as *questions*, never as assertions.
- **Unexpected:** detected but assigned elsewhere → offer to reassign shelf.
- **New:** detected, not in library → offer to add.
Given Tier 2 accuracy, reconciliation output is explicitly framed as a checklist to verify by eye, and lent-out books are excluded from "missing" automatically.

### 6.6 Export / Import
- **Export:** JSON (full fidelity, including loans and shelves) and CSV (Goodreads/LibraryThing-compatible column set). Covers optionally bundled — ZIP via `client-zip`, or excluded for a small file.
- **Import:** own JSON (merge by id, or replace), plus Goodreads/LibraryThing CSV.
- Prompt for export if none in 30 days, or before any destructive action.

---

## 7. Storage & Offline

- **Quota:** request `navigator.storage.persist()` at first successful add, with an honest explanation. Show `navigator.storage.estimate()` usage in settings.
- **Budget:** ~2 KB/record metadata + ~30 KB/cover ⇒ ~1000 books ≈ 35 MB. Comfortable, and effectively the ceiling: shelf scan frames are never persisted (§3.5), so storage grows only with the library itself.
- **Storage hierarchy (what to protect):** manually-entered records and user edits are irreplaceable — they exist nowhere else. Everything else is re-derivable: covers can be re-fetched from ISBN, API metadata can be re-resolved. If quota pressure ever forces a purge, covers go first, then cached API responses; user-authored data is never evicted by the app. Export always includes user data in full.
- **Eviction is the top data-loss risk.** Mitigations: persistent storage request, export nagging, and a settings-visible "last backup" timestamp.
- **Service worker:** precache app shell; runtime cache (stale-while-revalidate) for cover images; API responses cached in IndexedDB rather than the SW cache so they participate in the data model.
- **Offline behavior:** all read/write local operations available; lookups queued and retried when back online; unresolved queue surfaced in the UI.

---

## 8. PWA & Platform

- Manifest: standalone display, portrait, maskable icons, `theme_color`.
- HTTPS mandatory (camera + service worker).
- Install prompt: custom, shown after first successful scan, not on load.
- iOS notes: camera requires a user gesture; no `torch` support; PWA storage may be cleared if the app is unused for extended periods (further argument for export nagging); no push notifications for non-installed web apps.
- Feature detection at boot: `getUserMedia`, WASM, WebGPU (`navigator.gpu`), storage persistence, Notification API. Degrade silently and record capabilities in settings for support purposes.

---

## 9. Performance Targets

| Metric | Target |
|---|---|
| First load (core, gzipped) | < 300 KB |
| Time to interactive (4G, mid phone) | < 2 s |
| Barcode decode latency | < 500 ms from frame |
| Continuous scan throughput | ≥ 6 books/min sustained |
| Search response (1000 books) | < 50 ms |
| Library list scroll | 60 fps virtualized |
| OCR module (lazy) | declared before download |

---

## 10. Build Order

**Phase 1 — Skeleton (usable end-to-end)**
Manual entry → IndexedDB → list/search → detail/edit → JSON export/import. No camera at all. Proves the data model.

**Phase 2 — Barcode**
zxing-wasm in a worker, continuous scan, OpenLibrary + Google Books resolution, cover caching, duplicate detection. *This is the point at which the app is worth giving to someone.*

**Phase 3 — Management**
Shelves, lending, tags, read status, filters, CSV export.

**Phase 4 — PWA hardening**
Service worker, offline, install, persistent storage, backup nagging.

**Phase 5 — Tier 2 OCR (optional, exploratory)**
Shelf photo → OCR → confirmation queue → reconciliation. Treat as an experiment; ship behind a toggle labelled as beta.

---

## 11. Risks & Open Questions

| Risk | Severity | Mitigation |
|---|---|---|
| IndexedDB eviction on iOS | High | Persistent storage, export nagging, visible backup status |
| Spine OCR accuracy on PT/FR/old books | High | Tier 2 is optional and confirmation-gated by design |
| Thin OpenLibrary metadata for Portuguese titles | Medium | Google Books fallback; strong manual entry path |
| Google Books quota without a key | Medium | User-supplied key in settings; OpenLibrary first |
| iOS camera focus/exposure on close barcodes | Medium | Photo-upload fallback; tap-to-focus; guidance overlay |
| No cross-device sync | Medium (accepted) | File export/import; optional future: user's own cloud file |
| WASM bundle size on slow connections | Low | Lazy-load scanner on first camera use |

---

## 12. Resolved Decisions

1. **Copies are separate records.** Each physical copy is its own `Book` row with its own `id`, loan history, condition, shelf and `copyLabel`. Duplicate-ISBN detection on add therefore prompts "you already own this — add another copy?" rather than blocking. Search and library views may optionally group identical ISBNs visually, but the underlying rows stay distinct.

2. **Shelf scan images are never retained.** Captured frames are processed in memory and discarded immediately; only derived results (`detectedBookIds`, `unresolvedCandidates`) persist. Consequence: OCR cannot be re-run later against a stored frame — a re-scan means re-photographing the shelf. Accepted, in exchange for a bounded storage footprint and no eviction pressure on data that matters. Cover images remain the only stored imagery, and are re-fetchable from ISBN.

3. **UI ships in European Portuguese (pt-PT) and English (en), with pt-PT as the default.** Two locales, so strings are structured properly from the start: one module per locale (`locales/pt-PT.ts`, `locales/en.ts`) exporting the same key set, with a shared `TranslationKeys` type so TypeScript fails the build on any missing or misspelled key. A minimal `t(key, params?)` helper and a language setting persisted in `settings` — still no i18n framework; two static locales don't warrant one. Initial locale is detected from `navigator.language` (any `pt*` → pt-PT, otherwise en) and thereafter user-overridable in settings. All formatting via `Intl` bound to the active locale: pt-PT gives `dd/mm/aaaa` and decimal comma, en gives its own conventions — no hardcoded date or number formatting anywhere. Portuguese copy uses European vocabulary and orthography throughout — *ecrã*, *ficheiro*, *utilizador*, *guardar*, *estante*, *emprestado* — not Brazilian equivalents. Note: book metadata returned by the APIs stays in its own language and is displayed as-is, independent of UI locale.

4. **No wishlist.** `readStatus` is `unread | reading | read | abandoned`. The app catalogues books that physically exist on your shelves; want-to-read tracking is out of scope and better served by Goodreads/StoryGraph.

---

## 13. Repository & Deployment

**Repository:** `https://github.com/retrofootprints/bibliocatalog`
**Package name:** `bibliocatalog`

### 13.1 Layout

```
bibliocatalog/
├── index.html
├── vite.config.ts
├── public/
│   ├── manifest.webmanifest
│   └── icons/                  # 192, 512, maskable
├── src/
│   ├── main.tsx
│   ├── app.tsx
│   ├── db/                     # Dexie schema + migrations
│   │   ├── schema.ts
│   │   └── queries.ts
│   ├── intake/
│   │   ├── barcode/            # zxing-wasm + worker
│   │   ├── ocr/                # lazy-loaded Tier 2 module
│   │   └── manual/
│   ├── metadata/               # OpenLibrary + Google Books resolvers
│   ├── features/               # library, shelves, loans, settings
│   ├── locales/
│   │   ├── keys.ts             # TranslationKeys type
│   │   ├── pt-PT.ts
│   │   └── en.ts
│   ├── backup/                 # export / import
│   └── ui/
└── docs/
    └── SPEC.md                 # this document
```

### 13.2 Base path — the one deployment trap

If served from GitHub Pages at `retrofootprints.github.io/bibliocatalog/`, the app lives under a **subpath**, not the origin root. Three things must agree or the PWA breaks in ways that are easy to misdiagnose:

- `vite.config.ts` → `base: '/bibliocatalog/'`
- `manifest.webmanifest` → `"start_url": "/bibliocatalog/"`, `"scope": "/bibliocatalog/"`
- Service worker registration scope → `/bibliocatalog/`

Symptoms of a mismatch: assets 404 after deploy, the install prompt never appears, or the SW registers but controls nothing so offline silently fails. A custom domain or Netlify/Cloudflare Pages deploy puts the app at the origin root, where `base: '/'` applies instead — so pick the target before wiring this up rather than after.

Routing: use hash routing, or provide a `404.html` fallback, since GitHub Pages has no SPA rewrite rules.

### 13.3 Conventions

- **Branches:** `main` is deployable at all times; work in short-lived branches per phase (§10).
- **CI:** GitHub Actions — typecheck, build, deploy to Pages on push to `main`.
- **Tags:** `v0.1`, `v0.2`… aligned to the build phases.
- **Licence:** MIT (permissive; nothing here is commercially sensitive).
- **README:** must state plainly that data lives only in the browser and that export is the only backup — the single most important thing a new user needs to know.
