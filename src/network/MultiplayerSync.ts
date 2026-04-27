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

  public async createOrJoinRoom(roomId?: string): Promise<string> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.roomId) {
        const type = this.isHost ? 'ice-host' : 'ice-client';
        APIClient.sendSignal(this.roomId, type, event.candidate);
      }
    };

    if (roomId) {
      // First, try to claim the join slot on the server
      const joinRes = await APIClient.joinRoomState(roomId);
      if (joinRes && joinRes.error) {
        throw new Error(joinRes.error); // Will be caught in main.ts
      }

      this.roomId = roomId;
      this.isHost = false;
      await this.joinRoom();
    } else {
      this.isHost = true;
      const res = await APIClient.createRoom();
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
      if (answer && this.peerConnection!.signalingState !== 'stable') {
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(answer));
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollForIceCandidates('ice-client');
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
        
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        
        await APIClient.sendSignal(this.roomId!, 'answer', answer);
        this.pollForIceCandidates('ice-host');
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
            await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidates[i]));
          } catch (e) {}
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

  public sendStateSync(state: any): void {
    if (!this.isHost) return; // Only host dictates absolute state
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'sync', state }));
    }
  }
}
