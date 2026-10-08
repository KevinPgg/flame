import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['**/__tests__/integration/**/*.test.ts'],
    setupFiles: ['./__tests__/integration/setup.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});

