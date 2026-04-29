import { describe, expect, it } from 'vitest';
import { getAIDifficulty, setAIDifficulty } from './AIStorage';

describe('AIStorage', () => {
  it('defaults to medium', () => {
    expect(getAIDifficulty()).toBe('medium');
  });

  it('persists difficulty in storage', () => {
    setAIDifficulty('hard');
    expect(getAIDifficulty()).toBe('hard');
    setAIDifficulty('easy');
    expect(getAIDifficulty()).toBe('easy');
  });
});

