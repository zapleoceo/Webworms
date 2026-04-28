import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('matches', () => {
  it('start requires auth', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://example.com/api/match/start', { method: 'POST' }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});

