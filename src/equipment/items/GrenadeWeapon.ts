import type { Weapon } from '../../models/Weapon';
import { GrenadeProjectile } from '../../models/GrenadeProjectile';

export class GrenadeWeapon {
  public static createProjectile(x: number, y: number, vx: number, vy: number, weapon: Weapon): GrenadeProjectile {
    return new GrenadeProjectile(x, y, vx, vy, weapon, 3);
  }
}

