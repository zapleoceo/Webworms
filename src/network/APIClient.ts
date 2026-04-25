export class APIClient {
  static BASE_URL = '/api'; // Can be changed in production

  static async register(email: string, username: string, refCode?: string) {
    try {
      const response = await fetch(`${this.BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, referred_by: refCode })
      });
      return await response.json();
    } catch (e) {
      console.warn('Backend not running locally, returning mock auth');
      // Mock for local dev without backend
      return { success: true, user: { id: 'mock_' + Date.now(), username } };
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
}
