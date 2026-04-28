export async function handleSignalingWS(request: Request, env: any, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const roomId = parts[3];
  const type = parts[4];
  if (!roomId || type !== 'ws') return new Response('Bad Request', { status: 400, headers: corsHeaders });
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 400, headers: corsHeaders });

  const id = env.SIGNALING.idFromName(roomId);
  const stub = env.SIGNALING.get(id);
  return stub.fetch(new Request(`https://signaling/${roomId}/ws`, request));
}

