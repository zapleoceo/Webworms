import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  resolve: {
    conditions: [],
    mainFields: []
  },
  test: {
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html']
    },
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './worker/wrangler.toml'
        }
      }
    }
  }
});
