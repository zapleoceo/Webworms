const enc = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(password));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type PasswordHashV1 = {
  algo: 'pbkdf2_sha256_v1';
  hash: string;
  salt: string;
  iters: number;
};

async function pbkdf2Sha256Base64(password: string, saltB64: string, iters: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = base64ToBytes(saltB64);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Math.max(1, iters) },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

export async function createPasswordHash(password: string): Promise<PasswordHashV1> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltB64 = bytesToBase64(salt);
  const iters = 60_000;
  const hash = await pbkdf2Sha256Base64(password, saltB64, iters);
  return { algo: 'pbkdf2_sha256_v1', hash, salt: saltB64, iters };
}

export async function verifyUserPassword(
  env: any,
  user: any,
  password: string
): Promise<{ ok: boolean; upgraded?: PasswordHashV1 }> {
  const algo = typeof user?.password_algo === 'string' ? user.password_algo : '';
  const hash = typeof user?.password_hash === 'string' ? user.password_hash : '';
  const salt = typeof user?.password_salt === 'string' ? user.password_salt : '';
  const iters = Number(user?.password_iters) || 0;

  if (algo === 'pbkdf2_sha256_v1' && hash && salt && iters > 0) {
    const computed = await pbkdf2Sha256Base64(password, salt, iters);
    return { ok: computed === hash };
  }

  if (hash) {
    const legacy = await hashPassword(password);
    if (legacy === hash) {
      const upgraded = await createPasswordHash(password);
      const userId = typeof user?.id === 'string' ? user.id : null;
      if (userId) {
        try {
          await env.DB.prepare(
            `UPDATE Users SET password_algo = ?, password_salt = ?, password_iters = ?, password_hash = ? WHERE id = ?`
          )
            .bind(upgraded.algo, upgraded.salt, upgraded.iters, upgraded.hash, userId)
            .run();
        } catch {}
      }
      return { ok: true, upgraded };
    }
  }

  return { ok: false };
}
