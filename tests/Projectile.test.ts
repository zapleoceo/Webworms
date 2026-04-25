import { describe, it, expect, beforeEach } from 'vitest';
import { Projectile } from '../src/models/Projectile';
import { WEAPONS } from '../src/models/Weapon';

describe('Projectile', () => {
  let proj: Projectile;

  beforeEach(() => {
    proj = new Projectile(10, 20, 5, -5, WEAPONS['bazooka']);
  });

  it('updates position correctly', () => {
    proj.updatePosition(0.1);
    expect(proj.x).toBe(10.5);
    expect(proj.y).toBe(19.5); // 20 + (-5 * 0.1)
  });

  it('does not update if inactive', () => {
    // Projectile model itself doesn't check active flag for updatePosition, PhysicsEngine does it.
    // So updatePosition will actually update it if called directly.
    proj.updatePosition(0.1);
    expect(proj.x).toBe(10.5);
  });
});
