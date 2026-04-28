import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('signaling', () => {
  it('exposes only websocket endpoint', async () => {
    const ctx = createExecutionContext();
    const roomId = 'TEST';

    const offerRes = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/offer`, { method: 'GET' }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(offerRes.status).toBe(404);

    const ctx2 = createExecutionContext();
    const wsRes: any = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/ws`, { method: 'GET' }), env as any, ctx2 as any);
    await waitOnExecutionContext(ctx2);
    expect(wsRes.status).toBe(400);
  });
});
