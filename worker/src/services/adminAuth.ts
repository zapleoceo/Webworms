import { d1Retry } from './d1';
import { verifyUserPassword } from './password';

export async function checkAdminAuth(request: Request, env: any): Promise<boolean> {
  if (request.method === 'OPTIONS') return true;

  const email = request.headers.get('X-Admin-Email')?.trim();
  const passwordEncoded = request.headers.get('X-Admin-Password');

  if (!email || !passwordEncoded) return false;

  let password = passwordEncoded;
  try {
    password = decodeURIComponent(passwordEncoded);
  } catch {}

  const user = await d1Retry(() =>
    env.DB.prepare(
      'SELECT id, email, username, password_hash, password_algo, password_salt, password_iters, is_admin, is_active, access_allowed FROM Users WHERE LOWER(email) = LOWER(?)'
    )
      .bind(email)
      .first<any>()
  );
  if (user?.id) {
    const ok = await verifyUserPassword(env, user, password);
    if (ok.ok && (user.is_admin === 1 || user.is_admin === true)) return true;
  }

  const adminsCountRow = await d1Retry(() =>
    env.DB.prepare('SELECT COUNT(1) as cnt FROM Users WHERE is_admin = 1').first<any>()
  );
  const adminsCount = (adminsCountRow?.cnt as number) || 0;
  if (adminsCount > 0) return false;

  if (!user?.id) return false;
  const ok = await verifyUserPassword(env, user, password);
  if (!ok.ok) return false;
  if (user.is_active === 0 || user.is_active === false) return false;
  if (user.access_allowed === 0 || user.access_allowed === false) return false;

  await d1Retry(() => env.DB.prepare('UPDATE Users SET is_admin = 1 WHERE id = ?').bind(user.id).run());
  return true;
}
