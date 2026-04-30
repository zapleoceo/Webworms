// Stub for Multiplayer Sync
// This class will handle WebRTC connections and game state syncing.
// We are scaffolding it to ensure structure separation as requested.

import { APIClient } from './APIClient';

export class MultiplayerSync {
  public roomId: string | null = null;
  public isHost: boolean = false;
  public peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localPlayerId: string | null = null;
  private isRandomMatchmaking: boolean = false;
  private heartbeatInterval: number | null = null;
  private seenIceTypes = new Set<string>();
  private signalingSocket: WebSocket | null = null;
  private signalingReady: boolean = false;
  private usePollingSignaling: boolean = false;
  private pollingTimer: number | null = null;
  private lastSnapshot: string = '';
  private lastIceHostLen: number = 0;
  private lastIceClientLen: number = 0;
  private lastSentIceIndex = 0;
  private pendingRemoteIce: any[] = [];
  
  private localIceCandidates: any[] = [];
  private iceDebounce: number | null = null;
  private disconnectTimer: number | null = null;

  public onStateReceived?: (stateData: any) => void;
  public onInitReceived?: (initData: any) => void;
  public onPlayerAction?: (action: string, active: boolean, payload?: any) => void;
  public onPeerDisconnected?: () => void;
  public onReady?: () => void;
  public onMatchmakingExpired?: () => void;

  constructor() {}

  private debugEnabled(): boolean {
    return APIClient.isDebugEnabled();
  }

  private log(event: string, data?: any) {
    if (data !== undefined) console.log('[MP]', event, data);
    else console.log('[MP]', event);
  }

  private async initSignalingSocket(): Promise<void> {
    if (!this.roomId) return;
    if (this.signalingSocket || this.usePollingSignaling) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/api/rooms/${this.roomId}/ws`;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ok = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        try {
          this.signalingSocket?.close();
        } catch {}
        this.signalingSocket = null;
        this.signalingReady = false;
        reject(new Error('Signaling WS failed'));
      };
      try {
        const ws = new WebSocket(url);
        this.signalingSocket = ws;
        ws.onopen = () => {
          this.signalingReady = true;
          this.log('sig.ws.open', { roomId: this.roomId });
          this.flushLocalIce();
          ok();
        };
        ws.onerror = () => {
          this.log('sig.ws.error', { roomId: this.roomId });
          fail();
        };
        ws.onclose = () => {
          this.signalingReady = false;
          this.signalingSocket = null;
          this.log('sig.ws.close', { roomId: this.roomId });
        };
        ws.onmessage = (evt) => {
          let msg: any;
          try {
            msg = JSON.parse(evt.data);
          } catch {
            return;
          }
          const t = msg?.type;
          const payload = msg?.payload;
          if (!this.peerConnection || !this.roomId) return;

          if (t === 'snapshot' && payload && typeof payload === 'object') {
            this.applySignal('offer', (payload as any).offer);
            this.applySignal('answer', (payload as any).answer);
            this.applySignal('ice-host', (payload as any).iceHost);
            this.applySignal('ice-client', (payload as any).iceClient);
            return;
          }

          this.applySignal(t, payload);
        };

        window.setTimeout(fail, 3000);
      } catch {
        fail();
      }
    });
  }

  private async sendSignal(type: string, payload: any): Promise<void> {
    if (!this.roomId) throw new Error('Room is not set');

    if (this.usePollingSignaling) {
      const res = await fetch(`/api/rooms/${this.roomId}/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload })
      });
      if (!res.ok) throw new Error('Signaling HTTP failed');
      return;
    }
    if (!this.signalingReady || !this.signalingSocket || this.signalingSocket.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling socket is not ready');
    }
    this.signalingSocket.send(JSON.stringify({ type, payload }));
  }

  private applySignal(type: any, payload: any) {
    if (!this.peerConnection) return;
    if (type === 'offer' && !this.isHost && payload && this.peerConnection.signalingState === 'stable') {
      this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload)).then(async () => {
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        await this.sendSignal('answer', answer);
        this.log('sdp.answer.sent', { roomId: this.roomId });
        await this.flushPendingRemoteIce();
      }).catch((e) => console.error('Failed to handle offer', e));
      return;
    }

    if (type === 'answer' && this.isHost && payload && this.peerConnection.signalingState === 'have-local-offer') {
      this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload)).then(async () => {
        this.log('sdp.answer.applied', { roomId: this.roomId });
        await this.flushPendingRemoteIce();
      }).catch((e) => console.error('Failed to set remote description', e));
      return;
    }

    if (type === 'ice-host' || type === 'ice-client') {
      if (type === 'ice-host' && this.isHost) return;
      if (type === 'ice-client' && !this.isHost) return;
      const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
      if (!this.peerConnection.remoteDescription) {
        this.pendingRemoteIce.push(...list);
        return;
      }
      list.forEach((c: any) => {
        this.peerConnection!.addIceCandidate(new RTCIceCandidate(c)).catch((e) => console.error('Failed to add ICE candidate', e));
      });
    }
  }

  private async flushPendingRemoteIce() {
    if (!this.peerConnection?.remoteDescription) return;
    const pending = this.pendingRemoteIce;
    this.pendingRemoteIce = [];
    for (const c of pending) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.error('Failed to add ICE candidate', e);
      }
    }
  }

  private flushLocalIce() {
    if (!this.signalingReady || !this.roomId) return;
    const type = this.isHost ? 'ice-host' : 'ice-client';
    const batch = this.localIceCandidates.slice(this.lastSentIceIndex);
    this.lastSentIceIndex = this.localIceCandidates.length;
    if (batch.length === 0) return;
    this.sendSignal(type, batch);
  }

  private startPollingSignaling() {
    if (!this.roomId) return;
    if (this.pollingTimer) return;
    this.usePollingSignaling = true;
    const poll = async () => {
      if (!this.roomId || !this.peerConnection) return;
      try {
        const res = await fetch(`/api/rooms/${this.roomId}/snapshot`, { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        const str = JSON.stringify(data || {});
        if (str === this.lastSnapshot) return;
        this.lastSnapshot = str;
        this.applySignal('offer', data?.offer);
        this.applySignal('answer', data?.answer);
        const iceHost = Array.isArray(data?.iceHost) ? data.iceHost : [];
        const iceClient = Array.isArray(data?.iceClient) ? data.iceClient : [];
        const newHost = iceHost.slice(this.lastIceHostLen);
        const newClient = iceClient.slice(this.lastIceClientLen);
        this.lastIceHostLen = iceHost.length;
        this.lastIceClientLen = iceClient.length;
        if (this.isHost) {
          newClient.forEach((c: any) => this.applySignal('ice-client', c));
        } else {
          newHost.forEach((c: any) => this.applySignal('ice-host', c));
        }
      } catch {}
    };
    this.pollingTimer = window.setInterval(poll, 2000);
    poll();
    this.signalingReady = true;
    this.flushLocalIce();
  }

  public async createOrJoinRoom(roomId: string | undefined, playerId: string, forceHost: boolean = false, isRandom: boolean = false): Promise<string> {
    this.localPlayerId = playerId;
    this.isRandomMatchmaking = isRandom;
    const turnIce = await APIClient.getTurnIceServers(3600);
    const iceServers = (turnIce && turnIce.length > 0) ? turnIce : [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];
    this.peerConnection = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all'
    } as any);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const cand = event.candidate.candidate;
        const typMatch = / typ ([a-z0-9]+)/i.exec(cand);
        const typ = typMatch?.[1] ?? 'unknown';
        if (!this.seenIceTypes.has(typ)) {
          this.seenIceTypes.add(typ);
          this.log('ice.local.type', { roomId: this.roomId, isHost: this.isHost, typ });
        } else if (this.debugEnabled()) {
          this.log('ice.local', { roomId: this.roomId, isHost: this.isHost, typ });
        }
        this.localIceCandidates.push(event.candidate);
        if (this.iceDebounce) clearTimeout(this.iceDebounce);
        this.iceDebounce = window.setTimeout(() => {
          this.flushLocalIce();
        }, 200);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('PeerConnection state:', this.peerConnection!.connectionState);
      if (this.peerConnection!.connectionState === 'connected') {
        this.stopHeartbeat();
        if (this.disconnectTimer) {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = null;
        }
      }
      if (this.peerConnection!.connectionState === 'failed' || this.peerConnection!.connectionState === 'closed') {
        if (this.onPeerDisconnected) this.onPeerDisconnected();
      }
      if (this.peerConnection!.connectionState === 'disconnected') {
        if (this.disconnectTimer) return;
        this.disconnectTimer = window.setTimeout(() => {
          this.disconnectTimer = null;
          const s = this.peerConnection?.connectionState;
          if (s === 'disconnected' || s === 'failed' || s === 'closed') {
            if (this.onPeerDisconnected) this.onPeerDisconnected();
          }
        }, 8000);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      this.log('iceConnectionState', { roomId: this.roomId, state: this.peerConnection!.iceConnectionState });
    };
    this.peerConnection.onicegatheringstatechange = () => {
      if (this.debugEnabled()) this.log('iceGatheringState', { roomId: this.roomId, state: this.peerConnection!.iceGatheringState });
    };
    this.peerConnection.onsignalingstatechange = () => {
      if (this.debugEnabled()) this.log('signalingState', { roomId: this.roomId, state: this.peerConnection!.signalingState });
    };

    if (isRandom) {
      const res = await APIClient.joinRandomRoom(playerId);
      if (res.error) throw new Error(res.error);
      this.roomId = res.roomId;
      this.isHost = res.isHost;
      this.log('matchmaking.random.assigned', { roomId: this.roomId, isHost: this.isHost });
      try {
        await this.initSignalingSocket();
      } catch {
        this.startPollingSignaling();
      }
      if (this.isHost) {
        await this.hostRoom();
      }
      else {
        await this.joinRoom();
      }
      return this.roomId!;
    }

    if (roomId && forceHost) {
      this.roomId = roomId;
      this.isHost = true;
      this.log('matchmaking.friend.host', { roomId: this.roomId });
      try {
        await this.initSignalingSocket();
      } catch {
        this.startPollingSignaling();
      }
      await this.hostRoom();
      return this.roomId!;
    }

    if (roomId) {
      const joinRes = await APIClient.joinRoomState(roomId, playerId);
      if (joinRes && joinRes.error) {
        throw new Error(joinRes.error);
      }

      this.roomId = roomId;
      this.isHost = false;
      this.log('matchmaking.friend.join', { roomId: this.roomId });
      try {
        await this.initSignalingSocket();
      } catch {
        this.startPollingSignaling();
      }
      await this.joinRoom();
    } else {
      this.isHost = true;
      const res = await APIClient.createRoom(playerId);
      this.roomId = res.roomId;
      this.log('matchmaking.friend.created', { roomId: this.roomId });
      try {
        await this.initSignalingSocket();
      } catch {
        this.startPollingSignaling();
      }
      await this.hostRoom();
    }
    return this.roomId!;
  }

  private async hostRoom(): Promise<void> {
    if (!this.peerConnection || !this.roomId) return;
    
    this.dataChannel = this.peerConnection.createDataChannel('game-sync');
    this.setupDataChannel();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.log('sdp.offer.created', { roomId: this.roomId });
    
    // Post offer to KV
    await this.sendSignal('offer', offer);
    this.log('sdp.offer.sent', { roomId: this.roomId });

    if (this.isRandomMatchmaking) {
      this.startHeartbeat();
    }
  }

  private async joinRoom(): Promise<void> {
    if (!this.peerConnection || !this.roomId) return;

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;
    
    let heartbeatInterval: number;
    let lastHeartbeatReceived = Date.now();

    this.dataChannel.onopen = () => {
      console.log('WebRTC Data Channel Opened!');
      this.stopHeartbeat();
      this.initSent = false;
      this.syncSeq = 0;
      if (this.onReady) this.onReady();
      
      // Start heartbeat
      heartbeatInterval = window.setInterval(() => {
        if (this.dataChannel?.readyState === 'open') {
          this.dataChannel.send(JSON.stringify({ type: 'ping' }));
        }
        
        // If we haven't received a message in 15 seconds, assume disconnected
        if (Date.now() - lastHeartbeatReceived > 15000) {
          console.warn('Heartbeat timeout! Peer disconnected.');
          clearInterval(heartbeatInterval);
          if (this.onPeerDisconnected) this.onPeerDisconnected();
        }
      }, 1000);
    };

    this.dataChannel.onclose = () => {
      clearInterval(heartbeatInterval);
      if (this.onPeerDisconnected) this.onPeerDisconnected();
    };

    this.dataChannel.onmessage = (event) => {
      lastHeartbeatReceived = Date.now();
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'action' && this.onPlayerAction) {
          this.onPlayerAction(msg.action, msg.active, msg.payload);
        } else if (msg.type === 'init' && this.onInitReceived) {
          this.onInitReceived(msg.state);
        } else if (msg.type === 'sync' && this.onStateReceived) {
          this.onStateReceived(msg.state);
        } else if (msg.type === 'ping') {
          // Just update lastHeartbeatReceived
        }
      } catch (e) {}
    };
  }

  private startHeartbeat() {
    if (!this.isHost || !this.roomId || !this.localPlayerId) return;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    APIClient.heartbeatRoom(this.roomId, this.localPlayerId);
    this.heartbeatInterval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      APIClient.heartbeatRoom(this.roomId!, this.localPlayerId!).then((res: any) => {
        if (res && res.matched) {
          this.stopHeartbeat();
          return;
        }
        if (res && res.expired) {
          this.stopHeartbeat();
          if (this.onMatchmakingExpired) this.onMatchmakingExpired();
        }
      });
    }, 15000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public sendAction(action: string, active: boolean, payload?: any): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
    this.dataChannel.send(JSON.stringify({ type: 'action', action, active, payload }));
  }

  private lastSyncTime = 0;
  private syncSeq = 0;
  private initSent = false;
  private static readonly MAX_BUFFERED_BYTES = 256 * 1024;

  private sendInit(state: any): void {
    if (!this.isHost) return;
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;
    this.dataChannel.send(JSON.stringify({ type: 'init', state: { mapSeed: state.mapSeed, mapData: state.mapData } }));
    this.initSent = true;
  }

  public sendStateSync(state: any): void {
    if (!this.isHost) return; // Only host dictates absolute state
    
    // Throttle sync to ~20fps to prevent data channel congestion
    const now = performance.now();
    if (now - this.lastSyncTime < 50) return;
    this.lastSyncTime = now;

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const buffered = (this.dataChannel as any).bufferedAmount;
      if (typeof buffered === 'number' && buffered > MultiplayerSync.MAX_BUFFERED_BYTES) return;
      if (!this.initSent) this.sendInit(state);

      const statePayload = {
        seq: ++this.syncSeq,
        currentPlayerIndex: state.currentPlayerIndex,
        wind: state.wind,
        turnTimeLeft: state.turnTimeLeft,
        hasFiredThisTurn: state.hasFiredThisTurn,
        lastPlayedIndex: state.lastPlayedIndex,
        players: state.players.map((p: any) => ({
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          health: p.health,
          aimAngle: p.aimAngle,
          facingRight: p.facingRight,
          team: p.team,
          unitClass: p.unitClass,
          currentEquipmentIndex: p.currentEquipmentIndex,
          ropeActive: p.ropeActive,
          ropeAnchorX: p.ropeAnchorX,
          ropeAnchorY: p.ropeAnchorY,
          ropeLength: p.ropeLength
        })),
        projectiles: state.projectiles.map((p: any) => ({
          id: p.netId,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          weaponId: p.weaponId,
          fuseRemaining: p.fuseRemaining
        })),
        craters: state.landscape.syncCraters // Sync newly formed craters precisely
      };
      
      this.dataChannel.send(JSON.stringify({ type: 'sync', state: statePayload }));
      
      // Clear host's sync crater queue so we don't resend old ones to the client
      if (state.landscape.syncCraters.length > 0) {
        state.landscape.syncCraters = [];
      }
    }
  }
}
