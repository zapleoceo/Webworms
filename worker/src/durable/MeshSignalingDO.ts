type Peer = {
  id: string;
  name: string;
  ws: WebSocket;
};

function safeJsonParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function send(ws: WebSocket, msg: unknown) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {}
}

export class MeshSignalingDO {
  private peers = new Map<string, Peer>();

  constructor(private state: DurableObjectState, private env: any) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    const peerId = crypto.randomUUID();
    let joined = false;
    let name = '';

    const cleanup = () => {
      if (this.peers.has(peerId)) {
        this.peers.delete(peerId);
        this.broadcast({ type: 'peer-left', id: peerId }, peerId);
      }
    };

    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    server.addEventListener('message', (evt: any) => {
      const raw = typeof evt.data === 'string' ? evt.data : '';
      const msg = safeJsonParse(raw);
      const type = msg?.type;

      if (type === 'join') {
        if (joined) return;
        name = typeof msg?.name === 'string' ? msg.name.trim().slice(0, 40) : '';
        if (!name) {
          send(server, { type: 'error', message: 'Name required' });
          try {
            server.close(1000, 'Name required');
          } catch {}
          return;
        }

        if (this.peers.size >= 10) {
          send(server, { type: 'error', message: 'Room full' });
          try {
            server.close(1000, 'Room full');
          } catch {}
          return;
        }

        const peers = Array.from(this.peers.values()).map((p) => ({ id: p.id, name: p.name }));
        this.peers.set(peerId, { id: peerId, name, ws: server });
        joined = true;

        send(server, { type: 'welcome', selfId: peerId, peers });
        this.broadcast({ type: 'peer-joined', peer: { id: peerId, name } }, peerId);
        return;
      }

      if (!joined) return;

      if (type === 'leave') {
        try {
          server.close(1000, 'leave');
        } catch {}
        return;
      }

      if (type === 'offer' || type === 'answer' || type === 'ice') {
        const to = typeof msg?.to === 'string' ? msg.to : '';
        if (!to) return;
        const target = this.peers.get(to);
        if (!target) return;
        const out: any = { type, from: peerId };
        if (type === 'offer' || type === 'answer') out.sdp = msg?.sdp;
        else out.candidate = msg?.candidate;
        send(target.ws, out);
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(msg: unknown, exceptId?: string) {
    const payload = JSON.stringify(msg);
    for (const p of this.peers.values()) {
      if (exceptId && p.id === exceptId) continue;
      try {
        p.ws.send(payload);
      } catch {}
    }
  }
}

