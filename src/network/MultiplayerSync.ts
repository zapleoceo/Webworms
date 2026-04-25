// Stub for Multiplayer Sync
// This class will handle WebRTC connections and game state syncing.
// We are scaffolding it to ensure structure separation as requested.

export class MultiplayerSync {
  private roomId: string | null = null;
  private isHost: boolean = false;
  // private peerConnection: RTCPeerConnection | null = null; // Unused for now
  private dataChannel: RTCDataChannel | null = null;

  public onStateReceived?: (stateData: any) => void;
  public onPlayerAction?: (action: string, active: boolean) => void;
  public onPeerDisconnected?: () => void;

  constructor() {}

  public async createOrJoinRoom(roomId?: string): Promise<string> {
    if (roomId) {
      this.roomId = roomId;
      this.isHost = false;
      await this.joinRoom();
    } else {
      this.isHost = true;
      this.roomId = await this.createRoom();
    }
    return this.roomId!;
  }

  private async createRoom(): Promise<string> {
    // Stub: Will call APIClient.createRoom()
    // For now, return a local mock
    return "LOCAL_MOCK_ROOM_" + Math.floor(Math.random() * 1000);
  }

  private async joinRoom(): Promise<void> {
    // Stub: Fetch offer from KV, create answer
  }

  public sendAction(action: string, active: boolean): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'action', action, active }));
    }
  }

  public sendStateSync(state: any): void {
    if (!this.isHost) return; // Only host dictates absolute state
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'sync', state }));
    }
  }
}
