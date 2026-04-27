import { getSpriteSets, createSpriteSet, updateSpriteSet, deleteSpriteSet } from './controllers/spritesets';
import { getWeapons, createWeapon, updateWeapon, deleteWeapon } from './controllers/weapons';

export interface Env {
  DB: D1Database;
  ROOMS: KVNamespace;
  RESEND_API_KEY?: string;
  waitUntil(promise: Promise<any>): void;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Run daily balance reset
    console.log(`Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);
    try {
      // Set all players with < 3600 seconds to exactly 3600 seconds (60 mins)
      // Players with premium or > 3600 seconds keep their balance
      const result = await env.DB.prepare(`
        UPDATE Users 
        SET play_time_balance = 3600 
        WHERE play_time_balance < 3600
      `).run();
      console.log(`Reset balance for ${result.meta.changes} users`);
    } catch (e) {
      console.error('Failed to run scheduled balance reset:', e);
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS Settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `).run();
      
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS Logos (
          id TEXT PRIMARY KEY,
          image_data TEXT,
          width INTEGER,
          height INTEGER,
          hardness INTEGER
        )
      `).run();
      
      // Insert default turn time if not exists
      await env.DB.prepare(`
        INSERT OR IGNORE INTO Settings (key, value) VALUES ('turn_time', '30')
      `).run();

      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS Maps (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          image_data TEXT NOT NULL,
          width INTEGER NOT NULL DEFAULT 1500,
          height INTEGER NOT NULL DEFAULT 800,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      try {
        await env.DB.exec(`ALTER TABLE Users ADD COLUMN premium_until INTEGER DEFAULT 0;`);
      } catch (e) {
        // Column probably already exists, ignore
      }

      let response: Response;

      // 1. Healthcheck / Ping
      if (url.pathname === '/api/ping') {
        response = new Response(JSON.stringify({ status: 'ok', time: Date.now() }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 2. Auth Routes
      else if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        response = await handleRegister(request, env, ctx);
      }
      
      else if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        response = await handleLogin(request, env);
      }
      
      else if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
        response = await handleVerify(request, env);
      }

      else if (url.pathname === '/api/auth/session' && request.method === 'GET') {
        response = await handleSession(request, env);
      }

      else if (url.pathname === '/api/auth/daily-reset' && request.method === 'POST') {
        response = await handleDailyReset(request, env);
      }
      
      else if (url.pathname === '/api/auth/profile' && request.method === 'PUT') {
        response = await handleUpdateProfile(request, env);
      }

      else if (url.pathname === '/api/auth/password' && request.method === 'PUT') {
        response = await handleUpdatePassword(request, env);
      }

      else if (url.pathname === '/api/settings/turn_time' && request.method === 'GET') {
        response = await getTurnTime(env);
      }
      else if (url.pathname === '/api/settings/turn_time' && request.method === 'PUT') {
        response = await updateTurnTime(request, env);
      }
      else if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        response = await getAdminUsers(request, env);
      }
      
      else if (url.pathname === '/api/admin/users' && request.method === 'POST') {
        response = await updateAdminUser(request, env);
      }
      else if (url.pathname === '/api/admin/users' && request.method === 'DELETE') {
        response = await deleteAdminUser(request, env);
      }
      
      // 6. Match Endpoints
      else if (url.pathname === '/api/match/start' && request.method === 'POST') {
        response = await startMatch(request, env);
      }
      else if (url.pathname === '/api/match/end' && request.method === 'POST') {
        response = await reportMatchEnd(request, env);
      }
      else if (url.pathname === '/api/payment/paypal/capture' && request.method === 'POST') {
        response = await capturePayPalOrder(request, env);
      }
      else if (url.pathname === '/api/admin/users/time' && request.method === 'POST') {
        response = await addAdminUserTime(request, env);
      }
      else if (url.pathname === '/api/logos' && request.method === 'GET') {
        response = await getLogos(env);
      }
      else if (url.pathname === '/api/admin/logos' && request.method === 'POST') {
        response = await createLogo(request, env);
      }
      else if (url.pathname === '/api/admin/logos' && request.method === 'PUT') {
        response = await updateLogo(request, env);
      }
      else if (url.pathname === '/api/admin/logos' && request.method === 'DELETE') {
        response = await deleteLogo(request, env);
      }

      // Maps Endpoints
      else if (url.pathname === '/api/maps' && request.method === 'GET') {
        response = await getMaps(env);
      }
      else if (url.pathname.startsWith('/api/maps/') && url.pathname.endsWith('/image') && request.method === 'GET') {
        response = await getMapImage(request, env);
      }
      else if (url.pathname.startsWith('/api/maps/') && request.method === 'GET') {
        response = await getMapById(request, env);
      }
      else if (url.pathname === '/api/admin/maps' && request.method === 'POST') {
        response = await createMap(request, env);
      }
      else if (url.pathname.startsWith('/api/admin/maps/') && request.method === 'PUT') {
        response = await updateMap(request, env);
      }
      else if (url.pathname.startsWith('/api/admin/maps/') && request.method === 'DELETE') {
        response = await deleteMap(request, env);
      }

      // SpriteSets Endpoints
      else if (url.pathname === '/api/spritesets' && request.method === 'GET') {
        response = await getSpriteSets(env);
      }
      else if (url.pathname === '/api/admin/spritesets' && request.method === 'POST') {
        response = await createSpriteSet(request, env);
      }
      else if (url.pathname.startsWith('/api/admin/spritesets/') && request.method === 'PUT') {
        response = await updateSpriteSet(request, env);
      }
      else if (url.pathname.startsWith('/api/admin/spritesets/') && request.method === 'DELETE') {
        response = await deleteSpriteSet(request, env);
      }

      // Weapons Endpoints
      else if (url.pathname === '/api/weapons' && request.method === 'GET') {
        response = await getWeapons(env);
      }
      else if (url.pathname === '/api/admin/weapons' && request.method === 'POST') {
        response = await createWeapon(request, env);
      }
      else if (url.pathname.startsWith('/api/admin/weapons/') && request.method === 'PUT') {
        response = await updateWeapon(request, env);
      }
      else if (url.pathname.startsWith('/api/admin/weapons/') && request.method === 'DELETE') {
        response = await deleteWeapon(request, env);
      }
      
      else if (url.pathname === '/api/rooms' && request.method === 'POST') {
        response = await createRoom(request, env);
      }
      
      // Matchmaking
      else if (url.pathname === '/api/rooms/random' && request.method === 'POST') {
        response = await joinRandomRoom(request, env);
      }

      // Signaling endpoints
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/join') && request.method === 'POST') {
        response = await joinRoomState(request, env);
      }
      else if (url.pathname.startsWith('/api/rooms/') && request.method === 'POST') {
        response = await handleSignaling(request, env);
      }
      
      else if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/state') && request.method === 'GET') {
        response = await getRoomState(request, env);
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

// --- REUSABLE HELPERS ---

async function addPlayTime(env: Env, userId: string, deltaSeconds: number): Promise<boolean> {
  try {
    const res = await env.DB.prepare(
      `UPDATE Users SET play_time_balance = play_time_balance + ? WHERE id = ?`
    ).bind(deltaSeconds, userId).run();
    return res.success;
  } catch (e) {
    console.error("Failed to add playtime:", e);
    return false;
  }
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendResendEmail(env: Env, to: string, token: string, host: string): Promise<string | null> {
  if (!env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set. Skipping email sending.");
    return "RESEND_API_KEY missing";
  }

  const verifyLink = `${host}/api/auth/verify?token=${token}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #FF4500;">Welcome to WebWorms!</h2>
      <p>Thanks for signing up! Please confirm your email address to activate your account.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyLink}" style="background-color: #FF4500; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">Verify Email</a>
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #555;"><a href="${verifyLink}">${verifyLink}</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #888;">If you didn't request this, please ignore this email.</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'WebWorms <noreply@zapleo.com>', // Verified domain
        to: [to],
        subject: 'Verify your WebWorms account',
        html: htmlContent
      })
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend API error:", errText);
      return errText;
    }
    return null;
  } catch (err: any) {
    console.error("Failed to send email via Resend:", err);
    return err.message;
  }
}

async function handleRegister(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    const body = await request.json() as any;
    const email = body.email?.trim();
    const username = body.username?.trim();
    const password = body.password;
    const referred_by = body.referred_by;

    if (!email || !username || !password) {
      return new Response(JSON.stringify({ error: 'Email, username, and password are required' }), { status: 400 });
    }

    // Check if user exists
    const existingUser = await env.DB.prepare('SELECT * FROM Users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)').bind(email, username).first<any>();

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

      // Async fire and wait for email sending so we can see the error
      const emailError = await sendResendEmail(env, email, token, new URL(request.url).origin);

      return new Response(JSON.stringify({
        success: true,
        message: 'Registration successful. Please check your email to activate your account.',
        email_error: emailError, // Send the exact Resend error to the client for debugging
        dev_token_link: verifyLink // Sending it in response for dev testing
      }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // OPTIMIZED REFERRAL PYRAMID (Batch Transaction)
    // Find parent and grandparent
    const parentRow = await env.DB.prepare(
      `SELECT id, referred_by FROM Users WHERE id = ? OR LOWER(username) = LOWER(?)`
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
    
    const emailError = await sendResendEmail(env, email, token, new URL(request.url).origin);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Registration successful. Please check your email to activate your account.',
      referral_applied: !!parentRow,
      email_error: emailError,
      dev_token_link: verifyLink
    }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any;
    const email = body.email?.trim();
    const password = body.password;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400 });
    }

    const user = await env.DB.prepare('SELECT * FROM Users WHERE LOWER(email) = LOWER(?)').bind(email).first<any>();

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
    const token = url.searchParams.get('token')?.trim();

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

async function handleSession(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const sessionId = authHeader.split(' ')[1];
    const user = await env.DB.prepare(`SELECT id, email, username, is_active, play_time_balance, premium_until FROM Users WHERE session_id = ?`).bind(sessionId).first<any>();
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user: { 
        id: user.id, 
        email: user.email, 
        username: user.username, 
        play_time_balance: user.play_time_balance, 
        premium_until: user.premium_until || 0 
      } 
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  try {
    const { username } = await request.json() as { username: string };
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const sessionId = authHeader.split(' ')[1];

    if (!username) {
      return new Response(JSON.stringify({ error: 'Username is required' }), { status: 400 });
    }

    await env.DB.prepare('UPDATE Users SET username = ? WHERE id = ?').bind(username, sessionId).run();

    return new Response(JSON.stringify({ success: true, username }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function handleUpdatePassword(request: Request, env: Env): Promise<Response> {
  try {
    const { password } = await request.json() as { password: string };
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const sessionId = authHeader.split(' ')[1];

    if (!password) {
      return new Response(JSON.stringify({ error: 'Password is required' }), { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    await env.DB.prepare('UPDATE Users SET password_hash = ? WHERE id = ?').bind(hashedPassword, sessionId).run();

    return new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function getTurnTime(env: Env): Promise<Response> {
  try {
    const res = await env.DB.prepare("SELECT value FROM Settings WHERE key = 'turn_time'").first<{value: string}>();
    return new Response(JSON.stringify({ turn_time: parseInt(res?.value || '30') }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function updateTurnTime(request: Request, env: Env): Promise<Response> {
  if (!await checkAdminAuth(request, env)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  try {
    const { turn_time } = await request.json() as { turn_time: number };
    await env.DB.prepare("UPDATE Settings SET value = ? WHERE key = 'turn_time'").bind(turn_time.toString()).run();
    return new Response(JSON.stringify({ success: true, turn_time }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function getMaps(env: Env): Promise<Response> {
  try {
    const res = await env.DB.prepare('SELECT id, name, image_data, width, height, created_at FROM Maps ORDER BY created_at DESC').all();
    return new Response(JSON.stringify(res.results), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function getMapImage(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const parts = url.pathname.split('/');
      const id = parts[parts.length - 2]; // /api/maps/:id/image
      if (!id) return new Response('Missing ID', { status: 400, headers: corsHeaders });
  
      const data = await env.ROOMS.get('map_img_' + id);
      if (!data) return new Response('Not found', { status: 404, headers: corsHeaders });
  
      const b64 = data.split(',')[1];
      const mimeMatch = data.match(/^data:(image\/[a-zA-Z]+);base64,/);
      const contentType = mimeMatch ? mimeMatch[1] : 'image/png';

      if (!b64) {
        // Fallback if not a standard data url
        return new Response(data, { headers: { 'Content-Type': 'image/png', ...corsHeaders }});
      }

    const binaryStr = atob(b64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
        ...corsHeaders
      }
    });
  } catch (e: any) {
    return new Response(e.message, { status: 500, headers: corsHeaders });
  }
}

async function getMapById(request: Request, env: Env): Promise<Response> {
  try {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    const res = await env.DB.prepare('SELECT * FROM Maps WHERE id = ?').bind(id).first();
    if (!res) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    return new Response(JSON.stringify(res), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function createMap(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const { name, image_data, width, height } = await request.json() as any;
    
    if (!name || !image_data) {
      return new Response(JSON.stringify({ error: 'Missing name or image_data' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const id = crypto.randomUUID();
    const imageUrl = `/api/maps/${id}/image`;
    
    // Store actual base64 data in KV to avoid D1 limits
    await env.ROOMS.put('map_img_' + id, image_data);

    await env.DB.prepare('INSERT INTO Maps (id, name, image_data, width, height) VALUES (?, ?, ?, ?, ?)')
      .bind(id, name, imageUrl, width || 1500, height || 800).run();

    return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function updateMap(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { image_data, width, height } = await request.json() as any;
    
    if (!image_data) {
      return new Response(JSON.stringify({ error: 'Missing image_data' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const newWidth = Math.round(width || 3840);
    const newHeight = Math.round(height || 2160);

    // Get old map to check if it exists
    const existing = await env.DB.prepare('SELECT id FROM Maps WHERE id = ?').bind(id).first();
    if (!existing) {
       return new Response(JSON.stringify({ error: 'Map not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Check payload size
    if (image_data.length > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Image data too large (max 25MB)' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Update actual base64 data in KV
    await env.ROOMS.put('map_img_' + id, image_data);

    // Update dimensions in DB (ensure they are integers)
    await env.DB.prepare('UPDATE Maps SET width = ?, height = ? WHERE id = ?')
      .bind(newWidth, newHeight, id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function deleteMap(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const id = new URL(request.url).pathname.split('/').pop();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    // Clean up KV store
    await env.ROOMS.delete('map_img_' + id);

    await env.DB.prepare('DELETE FROM Maps WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function getLogos(env: Env): Promise<Response> {
  try {
    const res = await env.DB.prepare('SELECT * FROM Logos').all();
    return new Response(JSON.stringify(res.results), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function createLogo(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const { image_data, width, height, hardness } = await request.json() as any;
    
    if (!image_data || !width || !height || !hardness) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO Logos (id, image_data, width, height, hardness) VALUES (?, ?, ?, ?, ?)')
      .bind(id, image_data, width, height, hardness).run();

    return new Response(JSON.stringify({ success: true, id }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function updateLogo(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const body = await request.json() as any;
    const hasAnyField =
      body.image_data !== undefined ||
      body.width !== undefined ||
      body.height !== undefined ||
      body.hardness !== undefined;

    if (!hasAnyField) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const existing = await env.DB.prepare('SELECT * FROM Logos WHERE id = ?').bind(id).first<any>();
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Logo not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const image_data = body.image_data !== undefined ? body.image_data : existing.image_data;
    const width = body.width !== undefined ? body.width : existing.width;
    const height = body.height !== undefined ? body.height : existing.height;
    const hardness = body.hardness !== undefined ? body.hardness : existing.hardness;

    await env.DB.prepare('UPDATE Logos SET image_data = ?, width = ?, height = ?, hardness = ? WHERE id = ?')
      .bind(image_data, width, height, hardness, id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function deleteLogo(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    await env.DB.prepare('DELETE FROM Logos WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function checkAdminAuth(request: Request, env: Env): Promise<boolean> {
  if (request.method === 'OPTIONS') return true;

  const email = request.headers.get('X-Admin-Email')?.trim();
  const passwordEncoded = request.headers.get('X-Admin-Password');
  
  if (!email || !passwordEncoded) return false;

  let password = passwordEncoded;
  try {
    password = decodeURIComponent(passwordEncoded);
  } catch (e) {
    // If not properly encoded, fallback to raw
  }
  
  const hashedPassword = await hashPassword(password);
  const adminUser = await env.DB.prepare('SELECT id FROM Users WHERE LOWER(email) = LOWER(?) AND password_hash = ? AND is_admin = 1').bind(email, hashedPassword).first<any>();
  if (adminUser) return true;

  const adminsCountRow = await env.DB.prepare('SELECT COUNT(1) as cnt FROM Users WHERE is_admin = 1').first<any>();
  const adminsCount = (adminsCountRow?.cnt as number) || 0;
  if (adminsCount > 0) return false;

  const bootstrapUser = await env.DB.prepare('SELECT id FROM Users WHERE LOWER(email) = LOWER(?) AND password_hash = ? AND is_active = 1 AND access_allowed = 1')
    .bind(email, hashedPassword).first<any>();
  if (!bootstrapUser?.id) return false;

  await env.DB.prepare('UPDATE Users SET is_admin = 1 WHERE id = ?').bind(bootstrapUser.id).run();
  return true;
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

async function startMatch(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const sessionId = authHeader.replace('Bearer ', '');
    const sessionData = await env.DB.prepare(`SELECT id FROM Users WHERE session_id = ?`).bind(sessionId).first<any>();
    if (!sessionData) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });

    const matchToken = crypto.randomUUID();
    const timestamp = Date.now();
    
    // Store in KV with a 1 hour TTL (max match time)
    await env.ROOMS.put(`match_${matchToken}`, JSON.stringify({
      userId: sessionData.id,
      startedAt: timestamp,
      status: 'active'
    }), { expirationTtl: 3600 });

    return new Response(JSON.stringify({ success: true, matchToken }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

async function reportMatchEnd(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

    const sessionId = authHeader.replace('Bearer ', '');
    const sessionData = await env.DB.prepare(`SELECT id FROM Users WHERE session_id = ?`).bind(sessionId).first<any>();
    if (!sessionData) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });

    const { winnerId, matchToken, isTechnical } = await request.json() as { winnerId: string, matchToken: string, isTechnical?: boolean };
    if (!winnerId || !matchToken) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });

    // Prevent cheating: retrieve match token
    const matchDataStr = await env.ROOMS.get(`match_${matchToken}`);
    if (!matchDataStr) return new Response(JSON.stringify({ error: 'Invalid or expired match token' }), { status: 400 });
    
    const matchData = JSON.parse(matchDataStr);
    if (matchData.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Match already reported' }), { status: 400 });
    }
    
    const timeElapsed = Date.now() - matchData.startedAt;
    // Minimum match duration to prevent farming: 30 seconds (except technical victories)
    if (timeElapsed < 30000 && !isTechnical) {
      return new Response(JSON.stringify({ error: 'Match ended too quickly. No rewards.' }), { status: 400 });
    }

    // Mark as finished to prevent double claiming
    matchData.status = 'finished';
    await env.ROOMS.put(`match_${matchToken}`, JSON.stringify(matchData), { expirationTtl: 3600 });

    let rewardSeconds = 600; // Default 10 mins
    if (isTechnical) {
      rewardSeconds = Math.floor(timeElapsed / 1000); // Reward the exact time spent in the round
    }

    // Reward the winner
    const success = await addPlayTime(env, winnerId, rewardSeconds);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Failed to award time' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, message: 'Time awarded to winner' }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// --- PAYMENT HELPERS ---

async function capturePayPalOrder(request: Request, env: Env): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const sessionId = authHeader.replace('Bearer ', '');
    const sessionData = await env.DB.prepare(`SELECT id FROM Users WHERE session_id = ?`).bind(sessionId).first<any>();
    if (!sessionData) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const { orderID } = await request.json() as { orderID: string };
    if (!orderID) return new Response(JSON.stringify({ error: 'Missing orderID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    // IDEALLY: Call PayPal API here to capture the order and verify the payment status using PAYPAL_CLIENT_ID and PAYPAL_SECRET
    // Since this is a test environment and we only have the client-id from the script, we'll mock the verification.
    // In production, you MUST use `fetch('https://api-m.paypal.com/v2/checkout/orders/' + orderID + '/capture', ...)`

    // MOCK VERIFICATION: Grant 7 days premium
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const premiumUntil = Date.now() + sevenDaysInMs;

    await env.DB.prepare(`UPDATE Users SET premium_until = ? WHERE id = ?`).bind(premiumUntil, sessionData.id).run();

    return new Response(JSON.stringify({ success: true, premium_until: premiumUntil }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function addAdminUserTime(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const { id, delta_seconds } = await request.json() as any;
    if (!id || delta_seconds === undefined) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const success = await addPlayTime(env, id, delta_seconds);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Failed to update time' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function updateAdminUser(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const { id, is_active, is_admin, access_allowed, play_time_balance } = await request.json() as any;

    if (!id) return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    await env.DB.prepare(`
      UPDATE Users 
      SET is_active = ?, is_admin = ?, access_allowed = ?, play_time_balance = ?
      WHERE id = ?
    `).bind(is_active, is_admin, access_allowed, play_time_balance, id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

async function deleteAdminUser(request: Request, env: Env): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) return new Response(JSON.stringify({ error: 'Missing ID' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    await env.DB.prepare('DELETE FROM Users WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
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

  return new Response(JSON.stringify({ roomId }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function joinRandomRoom(request: Request, env: Env): Promise<Response> {
  let playerId: string | null = null;
  try {
    const body = await request.json() as any;
    playerId = body?.playerId || null;
  } catch {}
  if (!playerId) return new Response(JSON.stringify({ error: 'playerId required' }), { status: 400 });

  const queueKey = 'matchmaking_queue';
  const queueStr = await env.ROOMS.get(queueKey);
  let queue: string[] = queueStr ? JSON.parse(queueStr) : [];

  // Try to find a valid waiting room
  while (queue.length > 0) {
    const roomId = queue.shift()!;
    const roomStr = await env.ROOMS.get(roomId);
    if (roomStr) {
      const room = JSON.parse(roomStr);
      // Ensure the room is still waiting and the host isn't the same as the joining player
      if (room.status === 'waiting' && room.hostId !== playerId) {
        // We found a room! Join it.
        room.clientId = playerId;
        room.status = 'reserved';
        room.reservedAt = Date.now();
        await env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });
        await env.ROOMS.put(queueKey, JSON.stringify(queue), { expirationTtl: 3600 });
        return new Response(JSON.stringify({ roomId, isHost: false }));
      }
    }
  }

  // If no valid room found, create a new one and add it to the queue
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

  queue.push(roomId);
  await env.ROOMS.put(queueKey, JSON.stringify(queue), { expirationTtl: 3600 });

  return new Response(JSON.stringify({ roomId, isHost: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function joinRoomState(request: Request, env: Env): Promise<Response> {
  const parts = url.pathname.split('/');
  const roomId = parts[3]; // /api/rooms/{id}/join

  if (!roomId) return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400 });

  let playerId: string | null = null;
  try {
    const body = await request.json() as any;
    playerId = body?.playerId || null;
  } catch {}
  if (!playerId) return new Response(JSON.stringify({ error: 'playerId required' }), { status: 400 });

  const roomStr = await env.ROOMS.get(roomId);
  if (!roomStr) {
    return new Response(JSON.stringify({ error: 'Room not found or expired' }), { status: 404 });
  }

  const room = JSON.parse(roomStr);
  if (room.hostId && room.hostId === playerId) {
    return new Response(JSON.stringify({ error: 'Host cannot join own room link' }), { status: 403 });
  }

  if (room.clientId && room.clientId === playerId) {
    return new Response(JSON.stringify({ success: true, reconnect: true }));
  }

  if (room.clientId && room.clientId !== playerId) {
    const now = Date.now();
    const reservedAt = typeof room.reservedAt === 'number' ? room.reservedAt : 0;
    if (room.status === 'reserved' && reservedAt > 0 && now - reservedAt > 90_000) {
      room.clientId = playerId;
      room.status = 'reserved';
      room.reservedAt = now;
      await env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });
      return new Response(JSON.stringify({ success: true, takeover: true }));
    }

    return new Response(JSON.stringify({ error: 'Room is already full' }), { status: 403 });
  }

  room.clientId = playerId;
  room.status = 'reserved';
  room.reservedAt = Date.now();
  await env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });

  return new Response(JSON.stringify({ success: true }));
}

async function getRoomState(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3]; // /api/rooms/{id}/state

  if (!roomId) return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400 });

  const roomStr = await env.ROOMS.get(roomId);
  if (!roomStr) {
    return new Response(JSON.stringify({ error: 'Room not found or expired' }), { status: 404 });
  }

  return new Response(roomStr, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

async function handleSignaling(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3]; // /api/rooms/{id}/{type}
  const type = parts[4]; // offer, answer, ice-host, ice-client

  if (!roomId || !type) return new Response('Bad Request', { status: 400 });

  const data = await request.text();
  
  if (type === 'ice-host' || type === 'ice-client') {
    const existingRow = await env.DB.prepare('SELECT data FROM Signaling WHERE room_id = ? AND type = ?')
      .bind(roomId, type).first<any>();

    let candidates: any[] = [];
    if (existingRow?.data) {
      try { candidates = JSON.parse(existingRow.data); } catch (e) {}
    }

    let newCandidate;
    try { newCandidate = JSON.parse(data); } catch (e) { return new Response('Bad JSON', { status: 400 }); }

    // Deduplicate candidates
    const newStr = JSON.stringify(newCandidate);
    if (!candidates.some(c => JSON.stringify(c) === newStr)) {
      candidates.push(newCandidate);
      await env.DB.prepare(`
        INSERT INTO Signaling (room_id, type, data, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(room_id, type) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
      `).bind(roomId, type, JSON.stringify(candidates)).run();
    }
  } else {
    // Store offer or answer directly
    await env.DB.prepare(`
      INSERT INTO Signaling (room_id, type, data, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(room_id, type) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
    `).bind(roomId, type, data).run();
  }

  if (type === 'answer') {
    const roomStr = await env.ROOMS.get(roomId);
    if (roomStr) {
      const room = JSON.parse(roomStr);
      room.status = 'active';
      room.activeAt = Date.now();
      await env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });
    }
  }

  return new Response(JSON.stringify({ success: true }));
}

async function handleSignalingGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];
  const type = parts[4];

  if (!roomId || !type) return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400 });

  const row = await env.DB.prepare('SELECT data FROM Signaling WHERE room_id = ? AND type = ?')
    .bind(roomId, type).first<any>();
  if (row?.data) {
    return new Response(row.data, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  // To prevent 404 console spam during polling, return 200 OK with empty representation
  if (type === 'ice-host' || type === 'ice-client') {
    return new Response('[]', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  return new Response('null', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
