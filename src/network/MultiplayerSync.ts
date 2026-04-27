// Stub for Multiplayer Sync
// This class will handle WebRTC connections and game state syncing.
// We are scaffolding it to ensure structure separation as requested.

import { APIClient } from './APIClient';

export class MultiplayerSync {
  private roomId: string | null = null;
  private isHost: boolean = false;
  public peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  
  // Polling intervals
  private pollInterval: number | null = null;

  public onStateReceived?: (stateData: any) => void;
  public onPlayerAction?: (action: string, active: boolean, payload?: any) => void;
  public onPeerDisconnected?: () => void;
  public onReady?: () => void;

  constructor() {}

  public async createOrJoinRoom(roomId: string | undefined, playerId: string, forceHost: boolean = false): Promise<string> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
        const type = this.isHost ? 'ice-host' : 'ice-client';
        APIClient.sendSignal(this.roomId, type, event.candidate);
      }
    };

    if (roomId && forceHost) {
      this.roomId = roomId;
      this.isHost = true;
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
      await this.joinRoom();
    } else {
      this.isHost = true;
      const res = await APIClient.createRoom(playerId);
      this.roomId = res.roomId;
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
    
    // Post offer to KV
    await APIClient.sendSignal(this.roomId, 'offer', offer);
    
    // Poll for answer
    this.pollInterval = window.setInterval(async () => {
      const answer = await APIClient.getSignal(this.roomId!, 'answer');
      if (answer && this.peerConnection!.signalingState === 'have-local-offer') {
        try {
          await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(answer));
          if (this.pollInterval) clearInterval(this.pollInterval);
          this.pollForIceCandidates('ice-client');
        } catch (e) {
          console.error("Failed to set remote description", e);
        }
      }
    }, 2000);
  }

  private async joinRoom(): Promise<void> {
    if (!this.peerConnection || !this.roomId) return;

    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };

    // Poll for offer
    this.pollInterval = window.setInterval(async () => {
      const offer = await APIClient.getSignal(this.roomId!, 'offer');
      if (offer && this.peerConnection!.signalingState === 'stable') {
        if (this.pollInterval) clearInterval(this.pollInterval);
        
        try {
          await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await this.peerConnection!.createAnswer();
          await this.peerConnection!.setLocalDescription(answer);
          
          await APIClient.sendSignal(this.roomId!, 'answer', answer);
          this.pollForIceCandidates('ice-host');
        } catch (e) {
          console.error("Failed to handle offer", e);
        }
      }
    }, 2000);
  }

  private pollForIceCandidates(targetType: string) {
    let lastProcessedIndex = 0;
    const iceInterval = window.setInterval(async () => {
      if (this.peerConnection!.connectionState === 'connected') {
        clearInterval(iceInterval);
        return;
      }
      const candidates = await APIClient.getSignal(this.roomId!, targetType);
      if (Array.isArray(candidates)) {
        for (let i = lastProcessedIndex; i < candidates.length; i++) {
          try {
            if (candidates[i]) {
              await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidates[i]));
            }
          } catch (e) {
            console.error('Failed to add ICE candidate', e);
          }
        }
        lastProcessedIndex = candidates.length;
      }
    }, 2000);
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      console.log('WebRTC Data Channel Opened!');
      if (this.onReady) this.onReady();
    };

    this.dataChannel.onclose = () => {
      if (this.onPeerDisconnected) this.onPeerDisconnected();
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'action' && this.onPlayerAction) {
          this.onPlayerAction(msg.action, msg.active, msg.payload);
        } else if (msg.type === 'sync' && this.onStateReceived) {
          this.onStateReceived(msg.state);
        }
      } catch (e) {}
    };
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
        }))
      };
      this.dataChannel.send(JSON.stringify({ type: 'sync', state: statePayload }));
    }
  }
}
