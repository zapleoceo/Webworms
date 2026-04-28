import { hashPassword } from './password';
import { d1Retry } from './d1';

export async function checkAdminAuth(request: Request, env: any): Promise<boolean> {
  if (request.method === 'OPTIONS') return true;

  const email = request.headers.get('X-Admin-Email')?.trim();
  const passwordEncoded = request.headers.get('X-Admin-Password');

  if (!email || !passwordEncoded) return false;

  let password = passwordEncoded;
  try {
    password = decodeURIComponent(passwordEncoded);
  } catch {}

  const hashedPassword = await hashPassword(password);
  const adminUser = await d1Retry(() =>
    env.DB.prepare('SELECT id FROM Users WHERE LOWER(email) = LOWER(?) AND password_hash = ? AND is_admin = 1')
      .bind(email, hashedPassword)
      .first<any>()
  );
  if (adminUser) return true;

  const adminsCountRow = await d1Retry(() =>
    env.DB.prepare('SELECT COUNT(1) as cnt FROM Users WHERE is_admin = 1').first<any>()
  );
  const adminsCount = (adminsCountRow?.cnt as number) || 0;
  if (adminsCount > 0) return false;

  const bootstrapUser = await d1Retry(() =>
    env.DB.prepare('SELECT id FROM Users WHERE LOWER(email) = LOWER(?) AND password_hash = ? AND is_active = 1 AND access_allowed = 1')
      .bind(email, hashedPassword)
      .first<any>()
  );
  if (!bootstrapUser?.id) return false;

  await d1Retry(() => env.DB.prepare('UPDATE Users SET is_admin = 1 WHERE id = ?').bind(bootstrapUser.id).run());
  return true;
}
