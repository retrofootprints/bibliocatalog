import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// SPEC §13.2: served from GitHub Pages at a subpath, not the origin root.
// `base` here, `start_url`/`scope` in public/manifest.webmanifest, and the
// service-worker registration scope (none yet — Phase 4) must all agree.
export default defineConfig({
  base: '/bibliocatalog/',
  plugins: [preact()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
  },
});
