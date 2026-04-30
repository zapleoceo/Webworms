import type { Weapon } from '../../models/Weapon';
import { GrenadeProjectile } from '../../models/GrenadeProjectile';

export class GrenadeWeapon {
  public static createProjectile(x: number, y: number, vx: number, vy: number, weapon: Weapon): GrenadeProjectile {
    const fuse = typeof (weapon as any).fuseSeconds === 'number' ? (weapon as any).fuseSeconds : 3;
    return new GrenadeProjectile(x, y, vx, vy, weapon, fuse);
  }
}
