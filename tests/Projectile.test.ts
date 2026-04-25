import { describe, it, expect, beforeEach } from 'vitest';
import { Projectile } from '../src/models/Projectile';

describe('Projectile', () => {
  let proj: Projectile;

  beforeEach(() => {
    proj = new Projectile(10, 10, 5, -5);
  });

  it('updates position correctly', () => {
    proj.updatePosition(0.1);
    expect(proj.x).toBe(10.5);
    expect(proj.y).toBe(9.5);
  });

  it('does not update if inactive', () => {
    proj.active = false;
    proj.updatePosition(0.1);
    expect(proj.x).toBe(10);
    expect(proj.y).toBe(10);
  });
});
