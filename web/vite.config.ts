import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const dir = path.dirname(fileURLToPath(import.meta.url));

// The portal SPA. In dev it serves on 4101 and proxies /api to the Clawie
// host's portal server (4100, see src/cli/http-server.ts) so the browser is
// same-origin and no CORS is needed. In prod, `vite build` emits static
// assets to web/dist, which the host serves directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Mirror how sass resolves the `ui` workspace package: `ui` -> the
      // package entry, `ui/...` -> subpaths (e.g. `ui/lib/utils`).
      ui: path.resolve(dir, 'src/ui'),
    },
  },
  server: {
    port: 4101,
    proxy: {
      '/api': 'http://127.0.0.1:4100',
    },
  },
  build: {
    outDir: 'dist',
  },
});
