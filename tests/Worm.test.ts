import { describe, it, expect, beforeEach } from 'vitest';
import { Worm } from '../src/models/Worm';

describe('Worm', () => {
  let worm: Worm;

  beforeEach(() => {
    worm = new Worm(50, 50);
  });

  it('initializes correctly', () => {
    expect(worm.x).toBe(50);
    expect(worm.y).toBe(50);
    expect(worm.health).toBe(100);
  });

  it('updates aim correctly', () => {
    worm.updateAim(10);
    expect(worm.aimAngle).toBe(55);
    worm.updateAim(-100);
    expect(worm.aimAngle).toBe(0); // clamp
    worm.updateAim(200);
    expect(worm.aimAngle).toBe(180); // clamp
  });

  it('updates power correctly', () => {
    worm.changePower(10);
    expect(worm.aimPower).toBe(10);
    worm.changePower(-20);
    expect(worm.aimPower).toBe(0); // clamp
    worm.changePower(120);
    expect(worm.aimPower).toBe(100); // clamp
  });

  it('takes damage', () => {
    worm.takeDamage(20);
    expect(worm.health).toBe(80);
    worm.takeDamage(100);
    expect(worm.health).toBe(0); // clamp at 0
  });

  it('does not take damage if invulnerable', () => {
    const invulnerableWorm = new Worm(10, 10, true);
    invulnerableWorm.takeDamage(50);
    expect(invulnerableWorm.health).toBe(100);
  });
});
