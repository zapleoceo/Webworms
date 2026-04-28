import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('signaling', () => {
  it('supports websocket and http snapshot', async () => {
    const ctx = createExecutionContext();
    const roomId = 'TEST';

    const snapRes = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/snapshot`, { method: 'GET' }), env as any, ctx as any);
    await snapRes.text();
    await waitOnExecutionContext(ctx);
    expect(snapRes.status).toBe(200);

    const ctx2 = createExecutionContext();
    const wsRes: any = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/ws`, { method: 'GET' }), env as any, ctx2 as any);
    await waitOnExecutionContext(ctx2);
    expect(wsRes.status).toBe(400);
  });
});
