const appendCors = (res: Response, corsHeaders: Record<string, string>): Response => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  const ws = (res as any).webSocket;
  if (ws) {
    return new Response(null, { status: 101, webSocket: ws, headers });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

const getStub = (env: any, roomId: string) => {
  const id = env.SIGNALING.idFromName(roomId);
  return env.SIGNALING.get(id);
};

export async function handleSignalingWS(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];
  const type = parts[4];
  if (!roomId || type !== 'ws') return new Response('Bad Request', { status: 400, headers: corsHeaders });
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 400, headers: corsHeaders });
  const stub = getStub(env, roomId);
  const res = await stub.fetch(`https://do/${roomId}/ws`, request);
  return appendCors(res, corsHeaders);
}

export async function handleSignalingSnapshot(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];
  const type = parts[4];
  if (!roomId || type !== 'snapshot') return new Response('Bad Request', { status: 400, headers: corsHeaders });
  const offer = await env.ROOMS.get(`sig_${roomId}_offer`, 'json');
  const answer = await env.ROOMS.get(`sig_${roomId}_answer`, 'json');
  const iceHost = (await env.ROOMS.get(`sig_${roomId}_ice-host`, 'json')) || [];
  const iceClient = (await env.ROOMS.get(`sig_${roomId}_ice-client`, 'json')) || [];
  return new Response(JSON.stringify({ offer, answer, iceHost, iceClient }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

export async function handleSignalingSignal(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];
  const type = parts[4];
  if (!roomId || type !== 'signal') return new Response('Bad Request', { status: 400, headers: corsHeaders });
  let msg: any = null;
  try {
    msg = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  const msgType = typeof msg?.type === 'string' ? msg.type : null;
  const payload = msg?.payload;
  if (msgType !== 'offer' && msgType !== 'answer' && msgType !== 'ice-host' && msgType !== 'ice-client') {
    return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const ttl = 3600;
  if (msgType === 'ice-host' || msgType === 'ice-client') {
    const key = `sig_${roomId}_${msgType}`;
    const existing = (await env.ROOMS.get(key, 'json')) || [];
    const next = Array.isArray(existing) ? existing : [];
    if (Array.isArray(payload)) {
      payload.forEach((c) => next.push(c));
    } else if (payload) {
      next.push(payload);
    }
    await env.ROOMS.put(key, JSON.stringify(next), { expirationTtl: ttl });
  } else {
    await env.ROOMS.put(`sig_${roomId}_${msgType}`, JSON.stringify(payload), { expirationTtl: ttl });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}
