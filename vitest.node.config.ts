import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.node.test.ts'],
    pool: 'threads'
  }
});
