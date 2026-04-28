import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('paypal', () => {
  it('requires authorization', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request('http://example.com/api/payment/paypal/capture', { method: 'POST', body: JSON.stringify({ orderID: 'x' }) }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(401);
  });
});

