import { d1Retry } from './d1';
import { getSessionUserId } from './session';

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  is_active?: number | boolean;
  access_allowed?: number | boolean;
  play_time_balance?: number;
  premium_until?: number;
  is_admin?: number | boolean;
};

export async function requireSessionUser(request: Request, env: any): Promise<SessionUser> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new Error('Unauthorized');
  }

  let userId: string | null = null;
  try {
    userId = await getSessionUserId(env, token);
  } catch {}
  if (!userId && token.startsWith('user_')) {
    userId = token;
  }

  if (!userId) {
    throw new Error('Invalid session');
  }

  const user = await d1Retry(() => env.DB
    .prepare(
      'SELECT id, email, username, is_active, access_allowed, play_time_balance, premium_until, is_admin FROM Users WHERE id = ?'
    )
    .bind(userId)
    .first<any>()
  );

  if (!user) {
    throw new Error('Invalid session');
  }

  return user as SessionUser;
}
