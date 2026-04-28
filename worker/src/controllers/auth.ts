import { hashPassword } from '../services/password';

async function sendResendEmail(env: any, to: string, token: string, host: string): Promise<string | null> {
  if (!env.RESEND_API_KEY) {
    return 'RESEND_API_KEY missing';
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
        from: 'WebWorms <noreply@zapleo.com>',
        to: [to],
        subject: 'Verify your WebWorms account',
        html: htmlContent
      })
    });

    if (!res.ok) {
      return await res.text();
    }
    return null;
  } catch (err: any) {
    return err.message;
  }
}

export async function handleRegister(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as any;
    const email = body.email?.trim();
    const username = body.username?.trim();
    const password = body.password;
    const referred_by = body.referred_by;

    if (!email || !username || !password) {
      return new Response(JSON.stringify({ error: 'Email, username, and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const existingUser = await env.DB.prepare('SELECT * FROM Users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)').bind(email, username).first<any>();

    if (existingUser) {
      return new Response(JSON.stringify({ error: 'User with this email or username already exists' }), { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const id = 'user_' + Math.random().toString(36).substring(2, 10);
    const initialBalance = 3600;

    const hashedPassword = await hashPassword(password);
    const token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

    const isAdmin = email.toLowerCase() === 'demoniwwwe@gmail.com' ? 1 : 0;

    if (!referred_by) {
      await env.DB.prepare(
        `INSERT INTO Users (id, email, username, password_hash, is_active, is_admin, verification_token, play_time_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, email, username, hashedPassword, 0, isAdmin, token, initialBalance).run();

      const verifyLink = `${new URL(request.url).origin}/api/auth/verify?token=${token}`;
      const emailError = await sendResendEmail(env, email, token, new URL(request.url).origin);

      return new Response(JSON.stringify({
        success: true,
        message: 'Registration successful. Please check your email to activate your account.',
        email_error: emailError,
        dev_token_link: verifyLink
      }), { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const parentRow = await env.DB.prepare(
      `SELECT id, referred_by FROM Users WHERE id = ? OR LOWER(username) = LOWER(?)`
    ).bind(referred_by, referred_by).first<{id: string, referred_by: string | null}>();

    const stmts: any[] = [];

    stmts.push(env.DB.prepare(
      `INSERT INTO Users (id, email, username, password_hash, is_active, is_admin, verification_token, referred_by, play_time_balance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, username, hashedPassword, 0, isAdmin, token, parentRow?.id || null, initialBalance));

    if (parentRow) {
      stmts.push(env.DB.prepare(
        `UPDATE Users SET play_time_balance = play_time_balance + 3600 WHERE id = ?`
      ).bind(parentRow.id));

      if (parentRow.referred_by) {
        stmts.push(env.DB.prepare(
          `UPDATE Users SET play_time_balance = play_time_balance + 900 WHERE id = ?`
        ).bind(parentRow.referred_by));
      }
    }

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
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function handleLogin(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const body = await request.json() as any;
    const email = body.email?.trim();
    const password = body.password;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const user = await env.DB.prepare('SELECT * FROM Users WHERE LOWER(email) = LOWER(?)').bind(email).first<any>();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (user.access_allowed === 0 || user.access_allowed === false) {
      return new Response(JSON.stringify({ error: 'Account suspended' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (user.is_active === 0 || user.is_active === false) {
      return new Response(JSON.stringify({ error: 'Account not activated. Please check your email.' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const hashedPassword = await hashPassword(password);
    if (user.password_hash !== hashedPassword) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    await env.DB.prepare('UPDATE Users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id).run();

    delete user.password_hash;
    delete user.verification_token;

    const token = user.id;

    return new Response(JSON.stringify({ success: true, user, token, message: 'Logged in' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function handleVerify(request: Request, env: any): Promise<Response> {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get('token')?.trim();

    if (!token) {
      return new Response('Invalid verification token', { status: 400, headers: { 'Content-Type': 'text/html' } });
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

    return new Response(`
      <html><body>
        <h3>Account successfully activated!</h3>
        <p>Redirecting to the game...</p>
        <script>setTimeout(() => window.location.href = '/', 2000);</script>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  } catch (e: any) {
    return new Response(`Error: ${e.message}`, { status: 500, headers: { 'Content-Type': 'text/html' } });
  }
}

export async function handleSession(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const sessionId = authHeader.split(' ')[1];
    const user = await env.DB.prepare(`SELECT id, email, username, is_active, play_time_balance, premium_until FROM Users WHERE id = ?`).bind(sessionId).first<any>();

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

export async function getProfile(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const sessionId = authHeader.replace('Bearer ', '');
    const user = await env.DB.prepare('SELECT id, email, username, play_time_balance, is_admin, premium_until FROM Users WHERE id = ?').bind(sessionId).first<any>();

    if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    return new Response(JSON.stringify({ success: true, user }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function handleUpdateProfile(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const { username } = await request.json() as { username: string };
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const sessionId = authHeader.split(' ')[1];
    const user = await env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(sessionId).first<any>();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (!username) {
      return new Response(JSON.stringify({ error: 'Username is required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    await env.DB.prepare('UPDATE Users SET username = ? WHERE id = ?').bind(username, user.id).run();

    return new Response(JSON.stringify({ success: true, username }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function handleUpdatePassword(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const { password } = await request.json() as { password: string };
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const sessionId = authHeader.split(' ')[1];

    const user = await env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(sessionId).first<any>();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (!password) {
      return new Response(JSON.stringify({ error: 'Password is required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const hashedPassword = await hashPassword(password);
    await env.DB.prepare('UPDATE Users SET password_hash = ? WHERE id = ?').bind(hashedPassword, user.id).run();

    return new Response(JSON.stringify({ success: true, message: 'Password updated successfully' }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function handleDailyReset(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const { userId } = await request.json() as { userId: string };

    const result = await env.DB.prepare(`
      UPDATE Users 
      SET 
        play_time_balance = CASE WHEN play_time_balance < 3600 THEN 3600 ELSE play_time_balance END,
        last_daily_reset = CURRENT_TIMESTAMP
      WHERE id = ? 
        AND (julianday(CURRENT_TIMESTAMP) - julianday(last_daily_reset)) >= 1.0
    `).bind(userId).run();

    return new Response(JSON.stringify({ success: true, updated: result.meta.changes > 0 }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

