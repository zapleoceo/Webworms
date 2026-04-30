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

  it('random matchmaking does not expire host when matched', async () => {
    const ctx1 = createExecutionContext();
    const hostRes = await worker.fetch(
      new Request('http://example.com/api/rooms/random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'host-1' })
      }),
      env as any,
      ctx1 as any
    );
    await waitOnExecutionContext(ctx1);
    expect(hostRes.status).toBe(200);
    const hostData = await hostRes.json<any>();
    expect(hostData.isHost).toBe(true);
    const roomId = hostData.roomId as string;

    const ctxHb1 = createExecutionContext();
    const hb1 = await worker.fetch(
      new Request(`http://example.com/api/rooms/${roomId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'host-1' })
      }),
      env as any,
      ctxHb1 as any
    );
    await waitOnExecutionContext(ctxHb1);
    expect(hb1.status).toBe(200);
    const hb1Data = await hb1.json<any>();
    expect(hb1Data.expired).toBe(false);

    const ctx2 = createExecutionContext();
    const clientRes = await worker.fetch(
      new Request('http://example.com/api/rooms/random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'client-1' })
      }),
      env as any,
      ctx2 as any
    );
    await waitOnExecutionContext(ctx2);
    expect(clientRes.status).toBe(200);
    const clientData = await clientRes.json<any>();
    expect(clientData.roomId).toBe(roomId);
    expect(clientData.isHost).toBe(false);

    const ctxHb2 = createExecutionContext();
    const hb2 = await worker.fetch(
      new Request(`http://example.com/api/rooms/${roomId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'host-1' })
      }),
      env as any,
      ctxHb2 as any
    );
    await waitOnExecutionContext(ctxHb2);
    expect(hb2.status).toBe(200);
    const hb2Data = await hb2.json<any>();
    expect(hb2Data.expired).toBe(false);
    expect(hb2Data.matched).toBe(true);
  });

  it('heartbeat treats active room as matched', async () => {
    const ctx1 = createExecutionContext();
    const hostRes = await worker.fetch(
      new Request('http://example.com/api/rooms/random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'host-1' })
      }),
      env as any,
      ctx1 as any
    );
    await waitOnExecutionContext(ctx1);
    const { roomId } = await hostRes.json<any>();

    const ctx2 = createExecutionContext();
    await worker.fetch(
      new Request('http://example.com/api/rooms/random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'client-1' })
      }),
      env as any,
      ctx2 as any
    );
    await waitOnExecutionContext(ctx2);

    const ctxState = createExecutionContext();
    const stateRes = await worker.fetch(new Request(`http://example.com/api/rooms/${roomId}/state`, { method: 'GET' }), env as any, ctxState as any);
    await waitOnExecutionContext(ctxState);
    const roomState = await stateRes.json<any>();
    roomState.status = 'active';
    roomState.activeAt = Date.now();
    await env.ROOMS.put(roomId, JSON.stringify(roomState), { expirationTtl: 3600 });

    const ctxHb = createExecutionContext();
    const hb = await worker.fetch(
      new Request(`http://example.com/api/rooms/${roomId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'host-1' })
      }),
      env as any,
      ctxHb as any
    );
    await waitOnExecutionContext(ctxHb);
    const hbData = await hb.json<any>();
    expect(hbData.expired).toBe(false);
    expect(hbData.matched).toBe(true);
  });

  it('heartbeat does not expire when room exists but queue row is missing', async () => {
    const ctx1 = createExecutionContext();
    const hostRes = await worker.fetch(
      new Request('http://example.com/api/rooms/random', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: 'host-1' })
      }),
      env as any,
      ctx1 as any
    );
    await waitOnExecutionContext(ctx1);
    const { roomId } = await hostRes.json<any>();

    await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE room_id = ? AND host_id = ?`).bind(roomId, 'host-1').run();

    const ctxHb = createExecutionContext();
    const hb = await worker.fetch(
      new Request(`http://example.com/api/rooms/${roomId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: 'host-1' })
      }),
      env as any,
      ctxHb as any
    );
    await waitOnExecutionContext(ctxHb);
    const hbData = await hb.json<any>();
    expect(hbData.expired).toBe(false);
  });
});
