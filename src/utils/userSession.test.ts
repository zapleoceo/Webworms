import { describe, expect, it } from 'vitest';
import { getUserSessionId } from './userSession';

describe('getUserSessionId', () => {
  it('prefers userSessionId', () => {
    const storage: any = {
      getItem: (k: string) => (k === 'userSessionId' ? 'u' : 's')
    };
    expect(getUserSessionId(storage)).toBe('u');
  });

  it('falls back to sessionId', () => {
    const storage: any = {
      getItem: (k: string) => (k === 'sessionId' ? 's' : null)
    };
    expect(getUserSessionId(storage)).toBe('s');
  });

  it('returns null when empty', () => {
    const storage: any = {
      getItem: (_k: string) => '   '
    };
    expect(getUserSessionId(storage)).toBe(null);
  });
});
