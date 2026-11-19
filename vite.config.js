import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  cacheDir: '.cache/vite',
  // Discover the lazy worker's CommonJS dependency before a user selects a file.
  optimizeDeps: { include: ['@soulehshaikh99/qpdf-wasm'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
