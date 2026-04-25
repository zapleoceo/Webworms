import { describe, it, expect, beforeEach } from 'vitest';
import { Landscape } from '../src/models/Landscape';

describe('Landscape', () => {
  let landscape: Landscape;

  beforeEach(() => {
    landscape = new Landscape(100, 100);
  });

  it('initializes with all false', () => {
    expect(landscape.isSolid(50, 50)).toBe(false);
  });

  it('sets and gets solid values correctly', () => {
    landscape.setSolid(10, 10, true);
    expect(landscape.isSolid(10, 10)).toBe(true);
    expect(landscape.isSolid(11, 10)).toBe(false);
  });

  it('handles out of bounds safely', () => {
    expect(landscape.isSolid(-1, -1)).toBe(false);
    expect(() => landscape.setSolid(-1, -1, true)).not.toThrow();
  });

  it('generates terrain', () => {
    landscape.generateTerrain();
    // At x=50, sin is predictable, but mostly just check bottom is solid, top is not
    expect(landscape.isSolid(50, 99)).toBe(true); // bottom is solid
    expect(landscape.isSolid(50, 0)).toBe(false); // top is empty
  });

  it('creates craters correctly', () => {
    landscape.setSolid(50, 50, true);
    landscape.setSolid(50, 51, true);
    
    landscape.createCrater(50, 50, 5);
    
    expect(landscape.isSolid(50, 50)).toBe(false);
    expect(landscape.isSolid(50, 51)).toBe(false);
    
    // Outside crater should still be true if it was
    landscape.setSolid(60, 60, true);
    landscape.createCrater(50, 50, 5);
    expect(landscape.isSolid(60, 60)).toBe(true);
  });
});
