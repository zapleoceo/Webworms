import { describe, expect, it, vi } from 'vitest';
import { APIClient } from './APIClient';

describe('APIClient', () => {
  it('joinRandomRoom uses POST /rooms/random', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ roomId: 'ABCD', isHost: true })
    })) as any;
    vi.stubGlobal('fetch', fetchMock);

    const res = await APIClient.joinRandomRoom('player-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/rooms/random');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body).playerId).toBe('player-1');
    expect(res).toEqual({ roomId: 'ABCD', isHost: true });
  });
});

