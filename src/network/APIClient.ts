export class APIClient {
  static BASE_URL = '/api';

  private static async fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const headers: any = (res as any)?.headers;
      const contentType =
        (typeof headers?.get === 'function' ? headers.get('content-type') : (headers?.['content-type'] || headers?.['Content-Type'])) || '';

      const hasJson = typeof (res as any)?.json === 'function';
      const hasText = typeof (res as any)?.text === 'function';
      if (contentType.includes('application/json') || (hasJson && !hasText)) {
        return await (res as any).json();
      }
      const text = hasText ? await (res as any).text() : '';
      return {
        success: false,
        error: `Unexpected response (${(res as any).status})`,
        status: (res as any).status,
        body: text
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private static async fetchJsonWithRetry(url: string, init: RequestInit, timeoutMs: number, retries: number): Promise<any> {
    let last: any = null;
    for (let i = 0; i <= retries; i++) {
      try {
        return await this.fetchJsonWithTimeout(url, { ...init, cache: 'no-store' as any }, timeoutMs);
      } catch (e: any) {
        last = e;
      }
    }
    return { success: false, error: last?.name === 'AbortError' ? 'Request timed out' : (last?.message || 'Network error') };
  }

  static async fetchForMultiplayer(path: string, init: RequestInit, timeoutMs: number, retries: number): Promise<any> {
    return await this.fetchJsonWithRetry(`${this.BASE_URL}${path}`, init, timeoutMs, retries);
  }

  static isDebugEnabled(): boolean {
    try {
      return localStorage.getItem('ww_debug') === '1';
    } catch {
      return false;
    }
  }

  static maskId(id: string | null | undefined): string | null {
    if (!id) return null;
    if (id.length <= 10) return id;
    return `${id.slice(0, 4)}…${id.slice(-4)}`;
  }

  static async register(email: string, username: string, password?: string, refCode?: string) {
    try {
      console.log(`[APIClient] Registering ${email}... at ${this.BASE_URL}/auth/register`);
      const data = await this.fetchJsonWithTimeout(`${this.BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, referred_by: refCode })
      }, 30000);
      console.log('[APIClient] Register Response:', data);
      return data;
    } catch (e: any) {
      console.error('[APIClient] Backend connection error during register:', e);
      const reason = e?.name === 'AbortError' ? 'Request timed out' : 'Network connection failed';
      return { success: false, error: `${reason}. Backend might be unreachable.` };
    }
  }

  static async login(email: string, password?: string) {
    try {
      console.log(`[APIClient] Logging in ${email}... at ${this.BASE_URL}/auth/login`);
      const data = await this.fetchJsonWithTimeout(`${this.BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }, 30000);
      console.log('[APIClient] Login Response:', data);
      return data;
    } catch (e: any) {
      console.error('[APIClient] Backend connection error during login:', e);
      const reason = e?.name === 'AbortError' ? 'Request timed out' : 'Network connection failed';
      return { success: false, error: `${reason}. Backend might be unreachable.` };
    }
  }

  static async getProfile(sessionId: string) {
    try {
      return await this.fetchJsonWithRetry(`${this.BASE_URL}/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionId}`
        }
      }, 12000, 2);
    } catch (e: any) {
      return { error: e.message };
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

  public static async getWeapons(): Promise<any[]> {
    try {
      const data = await this.fetchJsonWithRetry(`${this.BASE_URL}/weapons`, { method: 'GET' }, 12000, 2);
      return Array.isArray(data) ? data : [];
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

  public static async getAirdropPhysics(): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/settings/airdrop_physics`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  public static async getGameSettings(): Promise<{ turn_time: number; airdrop_physics: any; bot_settings?: any } | null> {
    try {
      const res = await fetch(`${this.BASE_URL}/settings/game`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
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

  public static async reportMatchEnd(sessionId: string, winnerId: string, matchToken: string, isTechnical?: boolean): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/match/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionId}`
        },
        body: JSON.stringify({ winnerId, matchToken, isTechnical })
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

  static async createPayPalOrder(sessionId: string, planId: string): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/payment/paypal/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionId}`
        },
        body: JSON.stringify({ planId })
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }

  static async capturePayPalOrder(sessionId: string, orderID: string, planId: string): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/payment/paypal/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionId}`
        },
        body: JSON.stringify({ orderID, planId })
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }

  static async uploadAIVaiLog(payload: any): Promise<any> {
    try {
      const res = await fetch(`${this.BASE_URL}/aivai/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }

  static async createRoom(hostId: string) {
    try {
      return await this.fetchJsonWithRetry(`${this.BASE_URL}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId })
      }, 12000, 2);
    } catch (e) {
      console.warn('Backend not running locally, returning mock room');
      return { roomId: 'ROOM_LOCAL' };
    }
  }

  static async joinRoomState(roomId: string, playerId: string) {
    try {
      if (this.isDebugEnabled()) {
        console.log('[APIClient] joinRoomState', { roomId, playerId: this.maskId(playerId) });
      }
      const data = await this.fetchJsonWithRetry(`${this.BASE_URL}/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }, 12000, 2);
      if (data?.success === false && data?.error) {
        console.error('[APIClient] joinRoomState error', { roomId, error: data?.error });
      }
      return data;
    } catch (e) {
      console.error('[APIClient] joinRoomState exception', { roomId, e });
      return { success: false, error: 'Network error joining room' };
    }
  }

  static async joinRandomRoom(playerId: string) {
    try {
      console.log('[APIClient] joinRandomRoom', { playerId: this.maskId(playerId) });
      const data = await this.fetchJsonWithRetry(`${this.BASE_URL}/rooms/random`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }, 12000, 2);
      if (data?.success === false && data?.error) {
        console.error('[APIClient] joinRandomRoom error', { error: data?.error });
        return data;
      }
      console.log('[APIClient] joinRandomRoom ok', { roomId: data?.roomId, isHost: data?.isHost });
      return data;
    } catch (e) {
      console.error('[APIClient] joinRandomRoom exception', e);
      return { success: false, error: 'Network error joining random room' };
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

  static async heartbeatRoom(roomId: string, hostId: string) {
    try {
      const data = await this.fetchJsonWithRetry(`${this.BASE_URL}/rooms/${roomId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId })
      }, 12000, 1);
      if (data?.expired) {
        console.warn('[APIClient] heartbeat expired', { roomId, hostId: this.maskId(hostId) });
      } else if (data?.matched) {
        if (this.isDebugEnabled()) console.log('[APIClient] heartbeat matched', { roomId, hostId: this.maskId(hostId) });
      } else if (this.isDebugEnabled()) {
        console.log('[APIClient] heartbeat ok', { roomId, hostId: this.maskId(hostId), inQueue: data?.inQueue });
      }
      return data;
    } catch {}
    return null;
  }

  static leaveRoom(roomId: string, playerId: string): void {
    try {
      const url = `${this.BASE_URL}/rooms/${roomId}/leave`;
      const payload = JSON.stringify({ playerId });
      const blob = new Blob([payload], { type: 'application/json' });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(url, blob);
        return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    } catch {}
  }

  static async getTurnIceServers(ttlSeconds: number = 3600): Promise<any[] | null> {
    try {
      const data = await this.fetchJsonWithRetry(`${this.BASE_URL}/turn/ice-servers?ttl=${ttlSeconds}&t=${Date.now()}`, { method: 'GET' }, 12000, 1);
      const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : null;
      if (this.isDebugEnabled()) console.log('[APIClient] getTurnIceServers ok', { count: iceServers?.length ?? 0 });
      return iceServers;
    } catch (e) {
      if (this.isDebugEnabled()) console.warn('[APIClient] getTurnIceServers exception', e);
      return null;
    }
  }

  // Maps endpoints
  static async getMaps() {
    try {
      const data = await this.fetchJsonWithRetry(`${this.BASE_URL}/maps`, { method: 'GET' }, 12000, 2);
      if (Array.isArray(data)) return data;
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

  static async sendContactMessage(message: string, token: string | null) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${this.BASE_URL}/contact`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message })
    });
    return res.json();
  }
}
