export interface Env {
  DB: D1Database;
  ROOMS: KVNamespace;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      let response: Response;

      // 1. Healthcheck / Ping
      if (url.pathname === '/api/ping') {
        response = new Response(JSON.stringify({ status: 'ok', time: Date.now() }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 2. Auth Routes
      else if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        response = await handleRegister(request, env);
      }
      
      else if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        response = await handleLogin(request, env);
      }
      
      else if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
        response = await handleVerify(request, env);
      }

      else if (url.pathname === '/api/auth/daily-reset' && request.method === 'POST') {
        response = await handleDailyReset(request, env);
      }

      // 4. Admin Endpoints
      else if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        response = await getAdminUsers(request, env);
      }
      
      else if (url.pathname === '/api/admin/users' && request.method === 'POST') {
        response = await updateAdminUser(request, env);
      }
      else if (url.pathname === '/api/rooms' && request.method === 'POST') {
        response = await createRoom(request, env);
      }
      
      // Signaling endpoints
      else if (url.pathname.startsWith('/api/rooms/') && request.method === 'POST') {
        response = await handleSignaling(request, env);
      }
      
      else if (url.pathname.startsWith('/api/rooms/') && request.method === 'GET') {
        response = await handleSignalingGet(request, env);
      } else {
        response = new Response('Not Found', { status: 404 });
      }

      // Append CORS headers to whatever response was generated
      const newHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
      }
      
      console.log(`[API] ${request.method} ${url.pathname} - Status: ${response.status}`);
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

    } catch (e: any) {
      console.error(`[API ERROR] ${request.method} ${url.pathname}:`, e.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error', details: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  },
};

// --------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  try {
    const { email, username, password, referred_by } = await request.json() as { email: string, username: string, password?: string, referred_by?: string };
    
    if (!email || !username || !password) {
      return new Response(JSON.stringify({ error: 'Email, username, and password are required' }), { status: 400 });
    }

    // Check if user exists
    const existingUser = await env.DB.prepare('SELECT * FROM Users WHERE email = ? OR username = ?').bind(email, username).first<any>();

    if (existingUser) {
      return new Response(JSON.stringify({ error: 'User with this email or username already exists' }), { status: 409 });
    }

    // Generate simple ID
    const id = 'user_' + Math.random().toString(36).substring(2, 10);
    const initialBalance = 3600; // 1 hour
    
    const hashedPassword = await hashPassword(password);
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    
    const isAdmin = email.toLowerCase() === 'demoniwwwe@gmail.com' ? 1 : 0;

    // If no referral, just insert user
    if (!referred_by) {
      await env.DB.prepare(
        `INSERT INTO Users (id, email, username, password_hash, is_active, is_admin, verification_token, play_time_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, email, username, hashedPassword, 0, isAdmin, token, initialBalance).run();
      
      const verifyLink = `${new URL(request.url).origin}/api/auth/verify?token=${token}`;
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Registration successful. Please check your email to activate your account.',
        dev_token_link: verifyLink // Sending it in response for dev testing
      }), { status: 201 });
    }

    // OPTIMIZED REFERRAL PYRAMID (Batch Transaction)
    // Find parent and grandparent
    const parentRow = await env.DB.prepare(
      `SELECT id, referred_by FROM Users WHERE id = ? OR username = ?`
    ).bind(referred_by, referred_by).first<{id: string, referred_by: string | null}>();

    const stmts: D1PreparedStatement[] = [];

    // Insert user
    stmts.push(env.DB.prepare(
      `INSERT INTO Users (id, email, username, password_hash, is_active, is_admin, verification_token, referred_by, play_time_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, username, hashedPassword, 0, isAdmin, token, parentRow?.id || null, initialBalance));

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

    const verifyLink = `${new URL(request.url).origin}/api/auth/verify?token=${token}`;
    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Registration successful. Please check your email to activate your account.',
      referral_applied: !!parentRow,
      dev_token_link: verifyLink
    }), { status: 201 });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const { email, password } = await request.json() as { email?: string, password?: string };
    
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400 });
    }

    const user = await env.DB.prepare('SELECT * FROM Users WHERE email = ?').bind(email).first<any>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    if (user.access_allowed === 0 || user.access_allowed === false) {
      return new Response(JSON.stringify({ error: 'Account suspended' }), { status: 403 });
    }

    if (user.is_active === 0 || user.is_active === false) {
      return new Response(JSON.stringify({ error: 'Account not activated. Please check your email.' }), { status: 403 });
    }

    const hashedPassword = await hashPassword(password);
    if (user.password_hash !== hashedPassword) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    // Update last login
    await env.DB.prepare('UPDATE Users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run();

    // Remove sensitive data
    delete user.password_hash;
    delete user.verification_token;

    return new Response(JSON.stringify({ success: true, user, message: 'Logged in' }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response('Invalid verification token', { status: 400 });
    }

    const user = await env.DB.prepare('SELECT id FROM Users WHERE verification_token = ?').bind(token).first<{id: string}>();

    if (!user) {
      return new Response(`
        <html><body>
          <h3 style="color:red;">Error</h3>
          <p>Token invalid or already used.</p>
          <a href="/">Back to game</a>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html' }, status: 400 });
    }

    await env.DB.prepare(
      `UPDATE Users SET is_active = 1, verification_token = NULL WHERE id = ?`
    ).bind(user.id).run();

    // Redirect to main page after success
    const frontendUrl = url.origin; // If worker is hosted separately, this might be different. Let's just return a script to redirect.
    return new Response(`
      <html><body>
        <h3>Account successfully activated!</h3>
        <p>Redirecting to the game...</p>
        <script>setTimeout(() => window.location.href = '/', 2000);</script>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });

  } catch (e: any) {
    return new Response(`Error: ${e.message}`, { status: 500 });
  }
}

async function checkAdminAuth(request: Request, env: Env): Promise<boolean> {
  const email = request.headers.get('X-Admin-Email');
  const password = request.headers.get('X-Admin-Password');
  
  if (!email || !password) return false;
  
  const hashedPassword = await hashPassword(password);
  const user = await env.DB.prepare('SELECT id FROM Users WHERE email = ? AND password_hash = ? AND is_admin = 1').bind(email, hashedPassword).first();
  
  return !!user;
}

async function getAdminUsers(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Admin access required.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  
  try {
    const { results } = await env.DB.prepare('SELECT id, email, username, play_time_balance, is_active, is_admin, access_allowed, created_at, last_login FROM Users ORDER BY created_at DESC').all();
    return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function updateAdminUser(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Admin access required.' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const body = await request.json() as { id: string, access_allowed: boolean, is_admin: boolean };
  try {
    await env.DB.prepare('UPDATE Users SET access_allowed = ?, is_admin = ? WHERE id = ?')
      .bind(body.access_allowed ? 1 : 0, body.is_admin ? 1 : 0, body.id)
      .run();
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
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
