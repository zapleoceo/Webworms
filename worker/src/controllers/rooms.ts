export async function createRoom(request: Request, env: any, logEvent: (event: string, data: Record<string, unknown>) => void): Promise<Response> {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let roomId = '';
  for (let i = 0; i < 4; i++) {
    roomId += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  let hostId: string | null = null;
  try {
    const body = await request.json() as any;
    hostId = body?.hostId || null;
  } catch {}

  await env.ROOMS.put(roomId, JSON.stringify({
    status: 'waiting',
    hostId,
    clientId: null,
    reservedAt: null,
    activeAt: null
  }), { expirationTtl: 3600 });

  logEvent('room.create', { roomId, hostId });

  return new Response(JSON.stringify({ roomId }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function joinRandomRoom(request: Request, env: any, corsHeaders: Record<string, string>, logEvent: (event: string, data: Record<string, unknown>) => void, maskId: (id: string | null | undefined) => string | null): Promise<Response> {
  let playerId: string | null = null;
  try {
    const body = await request.json() as any;
    playerId = body?.playerId || null;
  } catch {}
  if (!playerId) return new Response(JSON.stringify({ error: 'playerId required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  logEvent('mm.join.request', { playerId: maskId(playerId) });

  const cleanupRes = await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE host_id = ? OR datetime(created_at, '+1 day') < CURRENT_TIMESTAMP`).bind(playerId).run();
  if (cleanupRes?.meta?.changes) {
    logEvent('mm.queue.cleanup', { playerId: maskId(playerId), removed: cleanupRes.meta.changes });
  }

  const candidates = await env.DB.prepare(
    `SELECT room_id, host_id FROM MatchmakingQueue WHERE host_id != ? ORDER BY created_at ASC LIMIT 5`
  ).bind(playerId).all<{ room_id: string, host_id: string }>();

  logEvent('mm.queue.candidates', { playerId: maskId(playerId), count: (candidates.results || []).length });

  for (const row of candidates.results || []) {
    const roomId = row.room_id;

    const roomStr = await env.ROOMS.get(roomId);
    if (!roomStr) {
      await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE room_id = ?`).bind(roomId).run();
      logEvent('mm.queue.drop', { roomId, reason: 'kv_missing' });
      continue;
    }

    let roomState: any;
    try {
      roomState = JSON.parse(roomStr);
    } catch {
      await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE room_id = ?`).bind(roomId).run();
      logEvent('mm.queue.drop', { roomId, reason: 'kv_bad_json' });
      continue;
    }

    if (roomState?.status !== 'waiting' || roomState?.hostId !== row.host_id) {
      await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE room_id = ?`).bind(roomId).run();
      logEvent('mm.queue.drop', { roomId, reason: 'state_mismatch', status: roomState?.status ?? null, hostId: maskId(roomState?.hostId ?? null), expectedHostId: maskId(row.host_id) });
      continue;
    }

    const reservedRoom = {
      status: 'reserved',
      hostId: row.host_id,
      clientId: playerId,
      reservedAt: Date.now(),
      activeAt: null
    };
    await env.ROOMS.put(roomId, JSON.stringify(reservedRoom), { expirationTtl: 3600 });
    await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE room_id = ? AND host_id = ?`).bind(roomId, row.host_id).run();

    logEvent('mm.match.found', { roomId, hostId: maskId(row.host_id), clientId: maskId(playerId) });

    return new Response(JSON.stringify({ roomId, isHost: false }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let roomId = '';
  for (let i = 0; i < 4; i++) {
    roomId += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  await env.ROOMS.put(roomId, JSON.stringify({
    status: 'waiting',
    hostId: playerId,
    clientId: null,
    reservedAt: null,
    activeAt: null
  }), { expirationTtl: 3600 });

  await env.DB.prepare(`INSERT INTO MatchmakingQueue (room_id, host_id) VALUES (?, ?)`).bind(roomId, playerId).run();

  logEvent('mm.match.created', { roomId, hostId: maskId(playerId) });

  return new Response(JSON.stringify({ roomId, isHost: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

export async function heartbeatRoom(request: Request, env: any, corsHeaders: Record<string, string>, logEvent: (event: string, data: Record<string, unknown>) => void, maskId: (id: string | null | undefined) => string | null): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];

  let hostId: string | null = null;
  try {
    const body = await request.json() as any;
    hostId = body?.hostId || null;
  } catch {}

  if (!roomId || !hostId) {
    return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  await env.DB.prepare(`UPDATE MatchmakingQueue SET created_at = CURRENT_TIMESTAMP WHERE room_id = ? AND host_id = ?`).bind(roomId, hostId).run();
  await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE datetime(created_at, '+1 day') < CURRENT_TIMESTAMP`).run();

  const exists = await env.DB.prepare(`SELECT 1 as one FROM MatchmakingQueue WHERE room_id = ? AND host_id = ?`)
    .bind(roomId, hostId).first<{ one: number }>();

  if (!exists) {
    const roomStr = await env.ROOMS.get(roomId);
    if (roomStr) {
      try {
        const room = JSON.parse(roomStr);
        const isHost = room?.hostId === hostId;
        const matched = (room?.status === 'reserved' || room?.status === 'active') && !!room?.clientId && isHost;
        if (matched) {
          logEvent('mm.heartbeat.matched', { roomId, hostId: maskId(hostId), clientId: maskId(room?.clientId ?? null) });
          return new Response(JSON.stringify({ success: true, inQueue: false, expired: false, matched: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        if (isHost) {
          logEvent('mm.heartbeat.maybe_matched', { roomId, hostId: maskId(hostId), status: room?.status ?? null });
          return new Response(JSON.stringify({ success: true, inQueue: false, expired: false, matched: false }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
      } catch {}
    }

    logEvent('mm.heartbeat.expired', { roomId, hostId: maskId(hostId) });
    return new Response(JSON.stringify({ success: true, inQueue: false, expired: true, matched: false }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  return new Response(JSON.stringify({ success: true, inQueue: true, expired: false, matched: false }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export async function leaveRoom(request: Request, env: any, corsHeaders: Record<string, string>, logEvent: (event: string, data: Record<string, unknown>) => void, maskId: (id: string | null | undefined) => string | null): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];
  let playerId: string | null = null;
  try {
    const body = await request.json() as any;
    playerId = body?.playerId || null;
  } catch {}

  if (!roomId || !playerId) {
    return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const roomStr = await env.ROOMS.get(roomId);
  if (!roomStr) {
    return new Response(JSON.stringify({ success: true, noop: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  let room: any;
  try {
    room = JSON.parse(roomStr);
  } catch {
    await env.ROOMS.delete(roomId);
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const isHost = room?.hostId === playerId;
  const isClient = room?.clientId === playerId;

  if (!isHost && !isClient) {
    return new Response(JSON.stringify({ success: true, noop: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  if (isHost) {
    await env.DB.prepare(`DELETE FROM MatchmakingQueue WHERE host_id = ? OR room_id = ?`).bind(playerId, roomId).run();
    await env.ROOMS.delete(roomId);
    logEvent('room.leave.host', { roomId, hostId: maskId(playerId), status: room?.status ?? null });
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  if (room?.status === 'reserved' && room?.hostId) {
    room.clientId = null;
    room.status = 'waiting';
    room.reservedAt = null;
    room.activeAt = null;
    await env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });
    await env.DB.prepare(`INSERT OR REPLACE INTO MatchmakingQueue (room_id, host_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)`).bind(roomId, room.hostId).run();
    logEvent('room.leave.client.requeue', { roomId, hostId: maskId(room.hostId), clientId: maskId(playerId) });
    return new Response(JSON.stringify({ success: true, requeued: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  logEvent('room.leave.client', { roomId, hostId: maskId(room?.hostId ?? null), clientId: maskId(playerId), status: room?.status ?? null });
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export async function joinRoomState(request: Request, env: any, corsHeaders: Record<string, string>, logEvent: (event: string, data: Record<string, unknown>) => void, maskId: (id: string | null | undefined) => string | null): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];

  if (!roomId) return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  let playerId: string | null = null;
  try {
    const body = await request.json() as any;
    playerId = body?.playerId || null;
  } catch {}
  if (!playerId) return new Response(JSON.stringify({ error: 'playerId required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  const roomStr = await env.ROOMS.get(roomId);
  if (!roomStr) {
    logEvent('room.join.fail', { roomId, playerId: maskId(playerId), reason: 'not_found' });
    return new Response(JSON.stringify({ error: 'Room not found or expired' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const room = JSON.parse(roomStr);
  if (room.hostId && room.hostId === playerId) {
    logEvent('room.join.fail', { roomId, playerId: maskId(playerId), reason: 'host_cannot_join' });
    return new Response(JSON.stringify({ error: 'Host cannot join own room link' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  if (room.clientId && room.clientId === playerId) {
    logEvent('room.join.reconnect', { roomId, playerId: maskId(playerId) });
    return new Response(JSON.stringify({ success: true, reconnect: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  if (room.clientId && room.clientId !== playerId) {
    const now = Date.now();
    const reservedAt = typeof room.reservedAt === 'number' ? room.reservedAt : 0;
    if (room.status === 'reserved' && reservedAt > 0 && now - reservedAt > 90_000) {
      room.clientId = playerId;
      room.status = 'reserved';
      room.reservedAt = now;
      await env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });
      logEvent('room.join.takeover', { roomId, playerId: maskId(playerId) });
      return new Response(JSON.stringify({ success: true, takeover: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    logEvent('room.join.fail', { roomId, playerId: maskId(playerId), reason: 'full' });
    return new Response(JSON.stringify({ error: 'Room is already full' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  room.clientId = playerId;
  room.status = 'reserved';
  room.reservedAt = Date.now();
  await env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });

  logEvent('room.join.ok', { roomId, playerId: maskId(playerId), hostId: maskId(room.hostId ?? null) });

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export async function getRoomState(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];

  if (!roomId) return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  const roomStr = await env.ROOMS.get(roomId);
  if (!roomStr) {
    return new Response(JSON.stringify({ error: 'Room not found or expired' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  return new Response(roomStr, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders } });
}
