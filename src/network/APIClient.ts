export class APIClient {
  static BASE_URL = '/api';

  static async register(email: string, username: string, password?: string, refCode?: string) {
    try {
      console.log(`[APIClient] Registering ${email}... at ${this.BASE_URL}/auth/register`);
      const response = await fetch(`${this.BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, referred_by: refCode })
      });
      const data = await response.json();
      console.log('[APIClient] Register Response:', data);
      return data;
    } catch (e: any) {
      console.error('[APIClient] Backend connection error during register:', e);
      return { success: false, error: 'Network connection failed. Backend might be unreachable.' };
    }
  }

  static async login(email: string, password?: string) {
    try {
      console.log(`[APIClient] Logging in ${email}... at ${this.BASE_URL}/auth/login`);
      const response = await fetch(`${this.BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();
      console.log('[APIClient] Login Response:', data);
      return data;
    } catch (e: any) {
      console.error('[APIClient] Backend connection error during login:', e);
      return { success: false, error: 'Network connection failed. Backend might be unreachable.' };
    }
  }

  public static async updateProfile(sessionId: string, username: string): Promise<any> {
    const res = await fetch(`${this.BASE_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionId}`
      },
      body: JSON.stringify({ username })
    });
    return res.json();
  }

  public static async getLogos(): Promise<any[]> {
    try {
      const res = await fetch(`${this.BASE_URL}/logos`);
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  public static async getTurnTime(): Promise<number> {
    try {
      const res = await fetch(`${this.BASE_URL}/settings/turn_time`);
      const data = await res.json();
      return data.turn_time || 30;
    } catch {
      return 30;
    }
  }

  public static async startMatch(sessionId: string): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/match/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionId}`
        }
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }

  public static async reportMatchEnd(sessionId: string, winnerId: string, matchToken: string): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/match/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionId}`
        },
        body: JSON.stringify({ winnerId, matchToken })
      });
      return await res.json();
    } catch {
      return { success: false, error: 'Network error' };
    }
  }
  public static async getSession(sessionId: string): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/auth/session`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${sessionId}` }
      });
      return await res.json();
    } catch {
      return { success: false };
    }
  }

  public static async updatePassword(sessionId: string, password: string): Promise<any> {
    const res = await fetch(`${this.BASE_URL}/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionId}`
      },
      body: JSON.stringify({ password })
    });
    return res.json();
  }

  static async dailyReset(userId: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/auth/daily-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      return await response.json();
    } catch (e) {
      return { success: true, updated: false };
    }
  }

  static async createRoom(hostId: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId })
      });
      return await response.json();
    } catch (e) {
      console.warn('Backend not running locally, returning mock room');
      return { roomId: 'ROOM_LOCAL' };
    }
  }

  static async joinRoomState(roomId: string, playerId: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.error };
      }
      return data;
    } catch (e) {
      return { success: false, error: 'Network error joining room' };
    }
  }

  static async getRoomState(roomId: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/rooms/${roomId}/state?t=${Date.now()}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  // WebRTC Signaling
  static async sendSignal(roomId: string, type: string, payload: any) {
    try {
      const res = await fetch(`${this.BASE_URL}/rooms/${roomId}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.error('sendSignal error:', res.status, await res.text());
      }
    } catch (e) {
      console.error('sendSignal exception:', e);
    }
  }

  static async getSignal(roomId: string, type: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/rooms/${roomId}/${type}?t=${Date.now()}`);
      if (response.ok) return await response.json();
      console.error('getSignal error:', response.status, await response.text());
    } catch (e) {
      console.error('getSignal exception:', e);
    }
    return null;
  }

  // Maps endpoints
  static async getMaps() {
    try {
      const response = await fetch(`${this.BASE_URL}/maps`);
      if (response.ok) return await response.json();
    } catch (e) {}
    return [];
  }

  static async getMapById(id: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/maps/${id}`);
      if (response.ok) return await response.json();
    } catch (e) {}
    return null;
  }
}
