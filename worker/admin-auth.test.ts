import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('admin auth', () => {
  it('requires admin headers for admin weapons', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://example.com/api/admin/weapons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});

