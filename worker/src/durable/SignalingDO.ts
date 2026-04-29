export class SignalingDO {
  private sockets = new Set<WebSocket>();
  private offer: any = null;
  private answer: any = null;
  private iceHost: any[] = [];
  private iceClient: any[] = [];
  constructor(private state: DurableObjectState, private env: any) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.replace(/^\//, '').split('/');
    const roomId = segments.length >= 2 ? segments[0] : null;
    const type = segments.length >= 2 ? segments[1] : segments[0];

    if (!type) return new Response('Bad Request', { status: 400 });

    if (type === 'snapshot') {
      return new Response(
        JSON.stringify({ offer: this.offer, answer: this.answer, iceHost: this.iceHost, iceClient: this.iceClient }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (type === 'signal' && request.method === 'POST') {
      let msg: any = null;
      try {
        msg = await request.json();
      } catch {
        return new Response('Bad Request', { status: 400 });
      }
      const msgType = typeof msg?.type === 'string' ? msg.type : null;
      if (!msgType) return new Response('Bad Request', { status: 400 });
      const payload = msg?.payload;
      await this.handleSignal(roomId, msgType, payload);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (type !== 'ws') return new Response('Not Found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    this.sockets.add(server);

    const close = () => {
      this.sockets.delete(server);
    };
    server.addEventListener('close', close);
    server.addEventListener('error', close);

    this.state.waitUntil(this.sendSnapshot(server));

    server.addEventListener('message', (evt: any) => {
      let msg: any = null;
      try {
        msg = JSON.parse(typeof evt.data === 'string' ? evt.data : '');
      } catch {
        return;
      }
      const msgType = typeof msg?.type === 'string' ? msg.type : null;
      if (!msgType) return;
      const payload = msg?.payload;
      this.state.waitUntil(this.handleSignal(roomId, msgType, payload, server));
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleSignal(roomId: string | null, msgType: string, payload: any, sender?: WebSocket) {
    if (msgType !== 'offer' && msgType !== 'answer' && msgType !== 'ice-host' && msgType !== 'ice-client') return;

    if (msgType === 'ice-host' || msgType === 'ice-client') {
      const list = msgType === 'ice-host' ? this.iceHost : this.iceClient;
      if (Array.isArray(payload)) {
        for (const c of payload) list.push(c);
      } else if (payload) {
        list.push(payload);
      }
    } else {
      if (msgType === 'offer') this.offer = payload ?? null;
      else this.answer = payload ?? null;
    }

    if (msgType === 'answer' && roomId) {
      const roomStr = await this.env.ROOMS.get(roomId);
      if (roomStr) {
        try {
          const room = JSON.parse(roomStr);
          room.status = 'active';
          room.activeAt = Date.now();
          await this.env.ROOMS.put(roomId, JSON.stringify(room), { expirationTtl: 3600 });
        } catch {}
      }
    }

    const out = JSON.stringify({ type: msgType, payload });
    for (const ws of this.sockets) {
      if (sender && ws === sender) continue;
      try {
        ws.send(out);
      } catch {}
    }

    if (sender) {
      try {
        sender.send(JSON.stringify({ type: 'ack', payload: { type: msgType } }));
      } catch {}
    }
  }

  private async sendSnapshot(ws: WebSocket) {
    try {
      ws.send(JSON.stringify({ type: 'snapshot', payload: { offer: this.offer, answer: this.answer, iceHost: this.iceHost, iceClient: this.iceClient } }));
    } catch {}
  }
}
