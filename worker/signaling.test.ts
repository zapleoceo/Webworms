import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('signaling', () => {
  it('supports websocket and http snapshot', async () => {
    const ctx = createExecutionContext();
    const roomId = 'TEST';

    const snapRes = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/snapshot`, { method: 'GET' }), env as any, ctx as any);
    const snap = await snapRes.json<any>();
    await waitOnExecutionContext(ctx);
    expect(snapRes.status).toBe(200);
    expect(snap).toHaveProperty('offer');
    expect(snap).toHaveProperty('answer');
    expect(snap).toHaveProperty('iceHost');
    expect(snap).toHaveProperty('iceClient');

    const ctx1 = createExecutionContext();
    const postRes = await worker.fetch(
      new Request(`http://example.com/api/rooms/${roomId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'offer', payload: { type: 'offer', sdp: 'abc' } })
      }),
      env as any,
      ctx1 as any
    );
    await postRes.json();
    await waitOnExecutionContext(ctx1);
    expect(postRes.status).toBe(200);

    const ctx1b = createExecutionContext();
    const snapRes2 = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/snapshot`, { method: 'GET' }), env as any, ctx1b as any);
    const snap2 = await snapRes2.json<any>();
    await waitOnExecutionContext(ctx1b);
    expect(snap2.offer?.sdp).toBe('abc');

    const ctx2 = createExecutionContext();
    const wsRes: any = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/ws`, { method: 'GET' }), env as any, ctx2 as any);
    await waitOnExecutionContext(ctx2);
    expect(wsRes.status).toBe(400);
  });
});
