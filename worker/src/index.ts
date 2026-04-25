export interface Env {
  DB: D1Database;
  ROOMS: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Healthcheck / Ping
    if (url.pathname === '/api/ping') {
      return new Response(JSON.stringify({ status: 'ok', time: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Auth Routes
    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      return handleRegister(request, env);
    }

    if (url.pathname === '/api/auth/daily-reset' && request.method === 'POST') {
      return handleDailyReset(request, env);
    }

    // 3. Multiplayer Rooms (KV)
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      return createRoom(request, env);
    }
    
    // Signaling endpoints
    if (url.pathname.startsWith('/api/rooms/') && request.method === 'POST') {
      return handleSignaling(request, env);
    }
    
    if (url.pathname.startsWith('/api/rooms/') && request.method === 'GET') {
      return handleSignalingGet(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

// --------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------

async function handleRegister(request: Request, env: Env): Promise<Response> {
  try {
    const { email, username, referred_by } = await request.json() as { email: string, username: string, referred_by?: string };
    
    if (!email || !username) {
      return new Response('Missing required fields', { status: 400 });
    }

    // Generate simple ID (In production, use UUID or similar)
    const id = 'user_' + Math.random().toString(36).substring(2, 10);
    const initialBalance = 3600; // 1 hour

    // If no referral, just insert user
    if (!referred_by) {
      await env.DB.prepare(
        `INSERT INTO Users (id, email, username, play_time_balance) VALUES (?, ?, ?, ?)`
      ).bind(id, email, username, initialBalance).run();
      
      return new Response(JSON.stringify({ success: true, user: { id, username } }), { status: 201 });
    }

    // OPTIMIZED REFERRAL PYRAMID (Batch Transaction)
    // 1. Insert new user
    // 2. Give +3600s to Parent (Level 1)
    // 3. Give +900s to Grandparent (Level 2)
    
    // Find parent and grandparent
    const parentRow = await env.DB.prepare(
      `SELECT id, referred_by FROM Users WHERE id = ? OR username = ?`
    ).bind(referred_by, referred_by).first<{id: string, referred_by: string | null}>();

    const stmts: D1PreparedStatement[] = [];

    // Insert user
    stmts.push(env.DB.prepare(
      `INSERT INTO Users (id, email, username, referred_by, play_time_balance) VALUES (?, ?, ?, ?, ?)`
    ).bind(id, email, username, parentRow?.id || null, initialBalance));

    if (parentRow) {
      // Add 1 hour to parent
      stmts.push(env.DB.prepare(
        `UPDATE Users SET play_time_balance = play_time_balance + 3600 WHERE id = ?`
      ).bind(parentRow.id));

      if (parentRow.referred_by) {
        // Add 15 mins (900s) to grandparent
        stmts.push(env.DB.prepare(
          `UPDATE Users SET play_time_balance = play_time_balance + 900 WHERE id = ?`
        ).bind(parentRow.referred_by));
      }
    }

    // Execute all in one transaction
    await env.DB.batch(stmts);

    return new Response(JSON.stringify({ success: true, user: { id, username }, referral_applied: !!parentRow }), { status: 201 });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleDailyReset(request: Request, env: Env): Promise<Response> {
  try {
    const { userId } = await request.json() as { userId: string };
    
    // Check if a day has passed and reset balance to 3600 if it's lower
    const result = await env.DB.prepare(`
      UPDATE Users 
      SET 
        play_time_balance = CASE WHEN play_time_balance < 3600 THEN 3600 ELSE play_time_balance END,
        last_daily_reset = CURRENT_TIMESTAMP
      WHERE id = ? 
        AND (julianday(CURRENT_TIMESTAMP) - julianday(last_daily_reset)) >= 1.0
    `).bind(userId).run();

    return new Response(JSON.stringify({ success: true, updated: result.meta.changes > 0 }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const roomId = 'room_' + Math.random().toString(36).substring(2, 8).toUpperCase();
  
  // Create a room with 5 minute TTL
  await env.ROOMS.put(roomId, JSON.stringify({ status: 'waiting' }), { expirationTtl: 300 });

  return new Response(JSON.stringify({ roomId }), { 
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleSignaling(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3]; // /api/rooms/{id}/{type}
  const type = parts[4]; // offer, answer, ice-host, ice-client
  
  if (!roomId || !type) return new Response('Bad Request', { status: 400 });

  const data = await request.text();
  // Store the signaling data in KV with a short TTL (60 seconds)
  await env.ROOMS.put(`${roomId}_${type}`, data, { expirationTtl: 60 });
  
  return new Response(JSON.stringify({ success: true }));
}

async function handleSignalingGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];
  const type = parts[4];

  if (!roomId || !type) return new Response('Bad Request', { status: 400 });

  const data = await env.ROOMS.get(`${roomId}_${type}`);
  if (data) {
    // Optionally delete after reading to ensure one-time delivery
    // await env.ROOMS.delete(`${roomId}_${type}`);
    return new Response(data, { headers: { 'Content-Type': 'application/json' } });
  }
  
  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
}
