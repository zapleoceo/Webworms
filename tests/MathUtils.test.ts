import { describe, it, expect } from 'vitest';
import { MathUtils } from '../src/utils/MathUtils';

describe('MathUtils', () => {
  it('calculates distance correctly', () => {
    expect(MathUtils.distance(0, 0, 3, 4)).toBe(5);
    expect(MathUtils.distance(1, 1, 1, 1)).toBe(0);
  });

  it('converts degrees to radians', () => {
    expect(MathUtils.degToRad(180)).toBe(Math.PI);
    expect(MathUtils.degToRad(90)).toBe(Math.PI / 2);
  });

  it('clamps values correctly', () => {
    expect(MathUtils.clamp(5, 0, 10)).toBe(5);
    expect(MathUtils.clamp(-5, 0, 10)).toBe(0);
    expect(MathUtils.clamp(15, 0, 10)).toBe(10);
  });
});
