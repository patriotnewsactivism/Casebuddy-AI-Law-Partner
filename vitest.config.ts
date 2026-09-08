import path from 'path';
import { defineConfig } from 'vitest/config';

/**
 * Test runner configuration for the realtime voice intake suite.
 * Node environment — no browser APIs; fetch/WebSocket surfaces are mocked.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
