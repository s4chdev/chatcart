import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Builds into ../public/studio, which Express serves at /dashboard (index.html) and /studio/* (assets).
export default defineConfig({
  plugins: [react()],
  base: '/studio/',
  build: {
    outDir: fileURLToPath(new URL('../public/studio', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
  },
  server: {
    // `npm run dev` in studio/ proxies API calls to the Express app on :3000.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
