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

  static async updateProfile(userId: string, newUsername: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username: newUsername })
      });
      return await response.json();
    } catch (e: any) {
      console.error('[APIClient] Error updating profile:', e);
      return { success: false, error: 'Network error.' };
    }
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

  static async createRoom() {
    try {
      const response = await fetch(`${this.BASE_URL}/rooms`, { method: 'POST' });
      return await response.json();
    } catch (e) {
      console.warn('Backend not running locally, returning mock room');
      return { roomId: 'ROOM_LOCAL' };
    }
  }

  // WebRTC Signaling
  static async sendSignal(roomId: string, type: string, payload: any) {
    try {
      await fetch(`${this.BASE_URL}/rooms/${roomId}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {}
  }

  static async getSignal(roomId: string, type: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/rooms/${roomId}/${type}`);
      if (response.ok) return await response.json();
    } catch (e) {}
    return null;
  }
}
