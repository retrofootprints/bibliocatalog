import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

const require = createRequire(import.meta.url);

// tesseract.js resolves its core wasm by appending a variant filename to `corePath`
// (see tesseract.js/src/worker-script/browser/getCore.js), so the files must sit
// together in a real directory with their original names — `?url` imports would
// hash them apart. Copy them out of node_modules instead of letting tesseract.js
// fall back to jsDelivr: SPEC §1.1 wants a self-contained folder of static files,
// and src/intake/barcode/worker.ts already does the same for zxing's wasm.
//
// Only the LSTM variants are copied; the app never requests the legacy engine, and
// the browser downloads exactly one of the three at runtime.
const TESSERACT_ASSETS: Record<string, string> = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
};

const OCR_ASSET_DIR = 'tesseract-core';

function tesseractAssets(): Plugin {
  const read = (spec: string) => readFileSync(require.resolve(spec));

  return {
    name: 'bibliocatalog-tesseract-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(new RegExp(`/${OCR_ASSET_DIR}/([^/?]+)$`));
        const spec = match ? TESSERACT_ASSETS[match[1]] : undefined;
        if (!spec) return next();
        res.setHeader('Content-Type', 'text/javascript');
        res.end(read(spec));
      });
    },
    generateBundle() {
      for (const [fileName, spec] of Object.entries(TESSERACT_ASSETS)) {
        this.emitFile({ type: 'asset', fileName: `${OCR_ASSET_DIR}/${fileName}`, source: read(spec) });
      }
    },
  };
}

// SPEC §13.2: served from GitHub Pages at a subpath, not the origin root.
// `base` here, `start_url`/`scope` in public/manifest.webmanifest, and the
// service-worker registration scope (none yet — Phase 4) must all agree.
export default defineConfig({
  base: '/bibliocatalog/',
  plugins: [preact(), tesseractAssets()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
  },
});
