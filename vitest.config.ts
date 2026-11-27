import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'engine', include: ['test/**/*.test.ts'], pool: 'forks', environment: 'node' } },
      {
        plugins: [react()],
        test: { name: 'ui', include: ['ui/test/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['ui/test/setup.ts'] },
      },
    ],
  },
});
