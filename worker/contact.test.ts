import { describe, expect, it, vi } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('contact', () => {
  it('validates message', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://example.com/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(400);
  });

  it('sends via mailer path', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })) as any);

    try {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request('http://example.com/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) }), env as any, ctx as any);
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
    } finally {
      vi.stubGlobal('fetch', originalFetch as any);
    }
  });
});

