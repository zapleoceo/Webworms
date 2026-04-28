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
  
  // Polling intervals
  private pollInterval: number | null = null;
  private localIceCandidates: any[] = [];
  private iceDebounce: number | null = null;

  public onStateReceived?: (stateData: any) => void;
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

  public async createOrJoinRoom(roomId: string | undefined, playerId: string, forceHost: boolean = false, isRandom: boolean = false): Promise<string> {
    this.localPlayerId = playerId;
    this.isRandomMatchmaking = isRandom;
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
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
          const type = this.isHost ? 'ice-host' : 'ice-client';
          APIClient.sendSignal(this.roomId!, type, this.localIceCandidates);
        }, 200);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('PeerConnection state:', this.peerConnection!.connectionState);
      if (this.peerConnection!.connectionState === 'connected') {
        this.stopHeartbeat();
      }
      if (this.peerConnection!.connectionState === 'disconnected' || this.peerConnection!.connectionState === 'failed') {
        if (this.onPeerDisconnected) this.onPeerDisconnected();
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
      await this.joinRoom();
    } else {
      this.isHost = true;
      const res = await APIClient.createRoom(playerId);
      this.roomId = res.roomId;
      this.log('matchmaking.friend.created', { roomId: this.roomId });
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
    await APIClient.sendSignal(this.roomId, 'offer', offer);
    this.log('sdp.offer.sent', { roomId: this.roomId });

    if (this.isRandomMatchmaking) {
      this.startHeartbeat();
    }
    
    // Poll for answer
    if (this.debugEnabled()) this.log('sdp.answer.poll.start', { roomId: this.roomId });
    this.pollInterval = window.setInterval(async () => {
      const answer = await APIClient.getSignal(this.roomId!, 'answer');
      if (answer && this.peerConnection!.signalingState === 'have-local-offer') {
        try {
          await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(answer));
          if (this.pollInterval) clearInterval(this.pollInterval);
          this.log('sdp.answer.applied', { roomId: this.roomId });
          this.pollForIceCandidates('ice-client');
        } catch (e) {
          console.error("Failed to set remote description", e);
        }
      }
    }, 1000);
  }

  private async joinRoom(): Promise<void> {
    if (!this.peerConnection || !this.roomId) return;

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };

    // Poll for offer
    if (this.debugEnabled()) this.log('sdp.offer.poll.start', { roomId: this.roomId });
    this.pollInterval = window.setInterval(async () => {
      const offer = await APIClient.getSignal(this.roomId!, 'offer');
      if (offer && this.peerConnection!.signalingState === 'stable') {
        if (this.pollInterval) clearInterval(this.pollInterval);
        
        try {
          await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await this.peerConnection!.createAnswer();
          await this.peerConnection!.setLocalDescription(answer);
          this.log('sdp.offer.applied', { roomId: this.roomId });
          
          await APIClient.sendSignal(this.roomId!, 'answer', answer);
          this.log('sdp.answer.sent', { roomId: this.roomId });
          this.pollForIceCandidates('ice-host');
        } catch (e) {
          console.error("Failed to handle offer", e);
        }
      }
    }, 1000);
  }

  private pollForIceCandidates(targetType: string) {
    let lastProcessedIndex = 0;
    let lastCount = 0;
    const iceInterval = window.setInterval(async () => {
      if (this.peerConnection!.connectionState === 'connected') {
        clearInterval(iceInterval);
        return;
      }
      const candidates = await APIClient.getSignal(this.roomId!, targetType);
      if (Array.isArray(candidates)) {
        if (this.debugEnabled() && candidates.length !== lastCount) {
          lastCount = candidates.length;
          this.log('ice.remote.count', { roomId: this.roomId, targetType, count: candidates.length });
        }
        for (let i = lastProcessedIndex; i < candidates.length; i++) {
          try {
            if (candidates[i] && this.peerConnection!.remoteDescription) {
              await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidates[i]));
            }
          } catch (e) {
            console.error('Failed to add ICE candidate', e);
          }
        }
        lastProcessedIndex = candidates.length;
      }
    }, 1000);
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;
    
    let heartbeatInterval: number;
    let lastHeartbeatReceived = Date.now();

    this.dataChannel.onopen = () => {
      console.log('WebRTC Data Channel Opened!');
      this.stopHeartbeat();
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
      APIClient.heartbeatRoom(this.roomId!, this.localPlayerId!).then((res: any) => {
        if (res && res.expired) {
          this.stopHeartbeat();
          if (this.onMatchmakingExpired) this.onMatchmakingExpired();
        }
      });
    }, 5000);
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

  public sendStateSync(state: any): void {
    if (!this.isHost) return; // Only host dictates absolute state
    
    // Throttle sync to ~20fps to prevent data channel congestion
    const now = performance.now();
    if (now - this.lastSyncTime < 50) return;
    this.lastSyncTime = now;

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const statePayload = {
        mapSeed: state.mapSeed,
        mapData: state.mapData, // Added for custom maps
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
          currentWeaponIndex: p.currentWeaponIndex
        })),
        projectiles: state.projectiles.map((p: any) => ({
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          weaponId: p.weaponId
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
