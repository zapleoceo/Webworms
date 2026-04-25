export class APIClient {
  static BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

  static async register(email: string, username: string, password?: string, refCode?: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, referred_by: refCode })
      });
      return await response.json();
    } catch (e) {
      console.warn('Backend not running locally, returning mock auth');
      return { success: true, user: { id: 'mock_' + Date.now(), username } };
    }
  }

  static async login(email: string, password?: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return await response.json();
    } catch (e) {
      console.warn('Backend not running locally, returning mock auth');
      return { success: true, user: { id: 'mock_' + Date.now(), username: email } };
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
