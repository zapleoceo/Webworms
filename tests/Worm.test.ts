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

  it('updates aim 360 degrees and changes facing', () => {
    worm.updateAim(100);
    expect(worm.aimAngle).toBe(100);
    expect(worm.facingRight).toBe(false); // Left because > 90 and < 270

    worm.updateAim(300); // 100 + 300 = 400 => 40
    expect(worm.aimAngle).toBe(40);
    expect(worm.facingRight).toBe(true);
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

  it('takes reduced damage if dummy', () => {
    const dummy = new Worm(10, 10, true);
    expect(dummy.health).toBeGreaterThan(1000);
    dummy.takeDamage(50);
    expect(dummy.health).toBeGreaterThan(1000);
  });
});
