import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('maps', () => {
  it('lists maps', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://example.com/api/maps', { method: 'GET' }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('admin create map requires auth', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://example.com/api/admin/maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', image_data: 'data:image/png;base64,AA==' }) }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});

