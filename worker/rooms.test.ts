import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from './src/index';

describe('rooms', () => {
  it('creates room and returns state', async () => {
    const ctx = createExecutionContext();
    const createRes = await worker.fetch(new Request('http://example.com/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostId: 'host-1' }) }), env as any, ctx as any);
    await waitOnExecutionContext(ctx);
    expect(createRes.status).toBe(200);
    const { roomId } = await createRes.json() as any;
    expect(typeof roomId).toBe('string');
    expect(roomId.length).toBe(4);

    const ctx2 = createExecutionContext();
    const stateRes = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/state`, { method: 'GET' }), env as any, ctx2 as any);
    await waitOnExecutionContext(ctx2);
    expect(stateRes.status).toBe(200);
    const state = await stateRes.json() as any;
    expect(state.status).toBe('waiting');
    expect(state.hostId).toBe('host-1');
  });
});

