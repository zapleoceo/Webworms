export async function uploadAIVaiLog(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  try {
    const origin = request.headers.get('Origin') || '';
    const allowed = origin === 'https://webworms.pages.dev' || origin.startsWith('http://localhost');
    if (!allowed) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    if (!env.AIVAI_LOGS) {
      return new Response(JSON.stringify({ success: false, error: 'R2 not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const bodyText = await request.text();
    if (!bodyText || bodyText.length < 2) {
      return new Response(JSON.stringify({ success: false, error: 'Empty body' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    if (bodyText.length > 5_000_000) {
      return new Response(JSON.stringify({ success: false, error: 'Log too large' }), { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const now = Date.now();
    const ts = Number.isFinite(Number(parsed?.createdAt)) ? Number(parsed.createdAt) : now;
    const matchId = typeof parsed?.matchId === 'string' && parsed.matchId.trim() ? parsed.matchId.trim() : `aivai_${ts}`;

    const d = new Date(ts);
    const yyyy = String(d.getUTCFullYear());
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const key = `aivai/${yyyy}/${mm}/${dd}/${matchId}.json`;

    await env.AIVAI_LOGS.put(key, bodyText, { httpMetadata: { contentType: 'application/json' } });
    return new Response(JSON.stringify({ success: true, key }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
}
