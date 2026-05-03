const enc = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return base64ToBase64Url(bytesToBase64(bytes));
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSessionToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return bytesToBase64Url(b);
}

export async function createSession(env: any, userId: string, ttlMs: number): Promise<string> {
  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + Math.max(60_000, ttlMs);
  await env.DB.prepare(
    `INSERT INTO Sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, userId, expiresAt, now)
    .run();
  return token;
}

export async function getSessionUserId(env: any, token: string): Promise<string | null> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT user_id, expires_at FROM Sessions WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<any>();
  if (!row?.user_id) return null;
  const expiresAt = Number(row.expires_at) || 0;
  if (expiresAt > 0 && expiresAt < Date.now()) {
    try {
      await env.DB.prepare(`DELETE FROM Sessions WHERE token_hash = ?`).bind(tokenHash).run();
    } catch {}
    return null;
  }
  return String(row.user_id);
}

