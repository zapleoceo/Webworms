export class SignalingDO {
  private sockets = new Set<WebSocket>();
  constructor(private state: DurableObjectState, private env: any) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const segments = url.pathname.replace(/^\//, '').split('/');
    const roomId = segments.length >= 2 ? segments[0] : null;
    const type = segments.length >= 2 ? segments[1] : segments[0];

    if (!type) return new Response('Bad Request', { status: 400 });

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
      this.state.waitUntil(this.handleWsSignal(server, roomId, msgType, payload));
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleWsSignal(sender: WebSocket, roomId: string | null, msgType: string, payload: any) {
    if (msgType !== 'offer' && msgType !== 'answer' && msgType !== 'ice-host' && msgType !== 'ice-client') return;

    if (msgType === 'ice-host' || msgType === 'ice-client') {
      if (!Array.isArray(payload) && payload && typeof payload === 'object') {
        const existing = await this.state.storage.get<string>(msgType);
        let arr: any[] = [];
        if (typeof existing === 'string') {
          try {
            const parsed = JSON.parse(existing);
            if (Array.isArray(parsed)) arr = parsed;
          } catch {}
        }
        arr.push(payload);
        await this.state.storage.put(msgType, JSON.stringify(arr));
      } else {
        await this.state.storage.put(msgType, JSON.stringify(payload ?? []));
      }
    } else {
      await this.state.storage.put(msgType, JSON.stringify(payload ?? null));
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
      if (ws === sender) continue;
      try {
        ws.send(out);
      } catch {}
    }

    try {
      sender.send(JSON.stringify({ type: 'ack', payload: { type: msgType } }));
    } catch {}
  }

  private async sendSnapshot(ws: WebSocket) {
    const offer = await this.getJson('offer');
    const answer = await this.getJson('answer');
    const iceHost = await this.getJson('ice-host');
    const iceClient = await this.getJson('ice-client');
    try {
      ws.send(JSON.stringify({ type: 'snapshot', payload: { offer, answer, iceHost, iceClient } }));
    } catch {}
  }

  private async getJson(key: string): Promise<any> {
    const data = await this.state.storage.get<string>(key);
    if (typeof data !== 'string') return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}

