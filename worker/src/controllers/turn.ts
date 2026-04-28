export async function getTurnIceServers(request: Request, env: any, corsHeaders: Record<string, string>, logEvent?: (event: string, data: any) => void): Promise<Response> {
  const keyId = env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) {
    return new Response(JSON.stringify({ error: 'TURN not configured' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const url = new URL(request.url);
  const ttlRaw = url.searchParams.get('ttl');
  const ttl = Math.max(60, Math.min(86400, ttlRaw ? Number(ttlRaw) : 3600));

  const resp = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ttl })
  });

  const body = await resp.text();
  if (!resp.ok) {
    if (logEvent) logEvent('turn.error', { status: resp.status, bodyLen: body.length });
    return new Response(JSON.stringify({ error: 'TURN provider error' }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: 'TURN provider bad response' }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const iceServers = Array.isArray(parsed?.iceServers) ? parsed.iceServers : [];
  const cleaned = iceServers.map((s: any) => {
    const urls = Array.isArray(s?.urls) ? s.urls : (typeof s?.urls === 'string' ? [s.urls] : []);
    const filteredUrls = urls.filter((u: string) => typeof u === 'string' && !u.includes(':53'));
    return { ...s, urls: filteredUrls };
  });

  return new Response(JSON.stringify({ iceServers: cleaned }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders } });
}

