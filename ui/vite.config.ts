import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'ui',
  plugins: [react()],
  build: { outDir: '../dist/ui', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4747',
      '/events': { target: 'http://127.0.0.1:4747', ws: false },
    },
  },
});
