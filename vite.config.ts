import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/web', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    fs: { strict: true, allow: [fileURLToPath(new URL('./src/web', import.meta.url)), fileURLToPath(new URL('./src/core/dates.ts', import.meta.url)), fileURLToPath(new URL('./src/core/contracts.ts', import.meta.url)), fileURLToPath(new URL('./node_modules', import.meta.url))] },
  },
  build: { outDir: fileURLToPath(new URL('./dist/web', import.meta.url)), emptyOutDir: true },
});
