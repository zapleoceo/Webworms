import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('turn', () => {
  it('returns 503 when not configured', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://example.com/api/turn/ice-servers', { method: 'GET' }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(503);
  });
});

