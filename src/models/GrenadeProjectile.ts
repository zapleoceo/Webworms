import type { Weapon } from './Weapon';
import { Projectile } from './Projectile';

export class GrenadeProjectile extends Projectile {
  public fuseRemaining: number;
  public bounce: number = 0.45;
  public friction: number = 0.85;

  constructor(x: number, y: number, vx: number, vy: number, weapon: Weapon, fuseSeconds: number = 3) {
    super(x, y, vx, vy, weapon);
    this.fuseRemaining = fuseSeconds;
    this.radius = 6;
  }
}

