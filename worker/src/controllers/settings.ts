import { checkAdminAuth } from '../services/adminAuth';

export async function getTurnTime(_request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const row = await env.DB.prepare(`SELECT value FROM Settings WHERE key = ?`).bind('turn_time').first<any>();
    return new Response(JSON.stringify({ turn_time: row ? Number(row.value) : 30 }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

export async function updateTurnTime(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  if (!(await checkAdminAuth(request, env))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  try {
    const body = await request.json() as any;
    const turn_time = Number(body.turn_time);

    if (isNaN(turn_time) || turn_time < 10 || turn_time > 120) {
      return new Response(JSON.stringify({ error: 'Invalid turn time' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    await env.DB.prepare(`INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)`).bind('turn_time', turn_time.toString()).run();

    return new Response(JSON.stringify({ success: true, turn_time }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}

