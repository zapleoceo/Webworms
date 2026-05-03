import { createPasswordHash } from './password';

export async function ensureBootstrapAdmin(env: any): Promise<void> {
  const email = (env?.BOOTSTRAP_ADMIN_EMAIL || '').toString().trim();
  const password = (env?.BOOTSTRAP_ADMIN_PASSWORD || '').toString();
  if (!email || !password) return;

  const admins = await env.DB.prepare('SELECT COUNT(1) AS cnt FROM Users WHERE is_admin = 1').first<any>();
  const cnt = Number(admins?.cnt) || 0;
  if (cnt > 0) return;

  const existing = await env.DB.prepare(
    'SELECT id, email, username FROM Users WHERE LOWER(email) = LOWER(?)'
  )
    .bind(email)
    .first<any>();

  const pw = await createPasswordHash(password);

  const now = Date.now();
  if (existing?.id) {
    await env.DB.prepare(
      'UPDATE Users SET is_admin = 1, is_active = 1, access_allowed = 1, password_algo = ?, password_salt = ?, password_iters = ?, password_hash = ?, last_login = NULL WHERE id = ?'
    )
      .bind(pw.algo, pw.salt, pw.iters, pw.hash, String(existing.id))
      .run();
    return;
  }

  let id = '';
  try {
    id = `user_${crypto.randomUUID().replace(/-/g, '')}`;
  } catch {
    id = `user_${Math.random().toString(36).slice(2)}${now.toString(36)}`;
  }
  const username = (email.split('@')[0] || 'admin').slice(0, 28);

  await env.DB.prepare(
    `INSERT INTO Users (
      id, email, username, password_algo, password_salt, password_iters, password_hash,
      is_active, is_admin, verification_token, play_time_balance, access_allowed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, '', 3600, 1)`
  )
    .bind(id, email, username, pw.algo, pw.salt, pw.iters, pw.hash)
    .run();
}

