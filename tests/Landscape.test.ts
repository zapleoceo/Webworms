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
    
    // Border is solid (top edge might not be bordered if we changed it, but let's check deep underground)
    expect(landscape.isSolid(50, 99)).toBe(true); // bottom is solid
    
    // Middle of the sky might have floating islands now, so let's check a very specific empty spot 
    // or just assume there's SOME empty space in the sky
    let foundEmpty = false;
    for (let y = 0; y < 50; y++) {
      if (!landscape.isSolid(50, y)) foundEmpty = true;
    }
    expect(foundEmpty).toBe(true);
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
