import { addPlayTime } from '../services/playTime';

export async function startMatch(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const sessionId = authHeader.replace('Bearer ', '');
    const sessionData = await env.DB.prepare(`SELECT id FROM Users WHERE id = ?`).bind(sessionId).first<any>();
    if (!sessionData) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const matchToken = crypto.randomUUID();
    const timestamp = Date.now();
    
    await env.ROOMS.put(`match_${matchToken}`, JSON.stringify({
      userId: sessionData.id,
      startedAt: timestamp,
      status: 'active'
    }), { expirationTtl: 3600 });

    return new Response(JSON.stringify({ success: true, matchToken }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function reportMatchEnd(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const sessionId = authHeader.replace('Bearer ', '');
    const sessionData = await env.DB.prepare(`SELECT id FROM Users WHERE id = ?`).bind(sessionId).first<any>();
    if (!sessionData) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const { winnerId, matchToken, isTechnical } = await request.json() as { winnerId: string, matchToken: string, isTechnical?: boolean };
    if (!winnerId || !matchToken) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

    const matchDataStr = await env.ROOMS.get(`match_${matchToken}`);
    if (!matchDataStr) return new Response(JSON.stringify({ error: 'Invalid or expired match token' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    
    const matchData = JSON.parse(matchDataStr);
    if (matchData.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Match already reported' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    
    const timeElapsed = Date.now() - matchData.startedAt;
    if (timeElapsed < 30000 && !isTechnical) {
      return new Response(JSON.stringify({ error: 'Match ended too quickly. No rewards.' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    matchData.status = 'finished';
    await env.ROOMS.put(`match_${matchToken}`, JSON.stringify(matchData), { expirationTtl: 3600 });

    let rewardSeconds = 600;
    if (isTechnical) {
      rewardSeconds = Math.floor(timeElapsed / 1000);
    }

    const success = await addPlayTime(env, winnerId, rewardSeconds);
    if (!success) {
      return new Response(JSON.stringify({ error: 'Failed to award time' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    return new Response(JSON.stringify({ success: true, message: 'Time awarded to winner' }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

