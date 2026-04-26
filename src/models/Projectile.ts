import type { Weapon } from './Weapon';

export class Projectile {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number = 3;
  public active: boolean = true;
  
  public damage: number;
  public explosionRadius: number;
  public knockback: number;
  public windMultiplier: number;
  public color: string;
  public weaponId: string;

  constructor(x: number, y: number, vx: number, vy: number, weapon: Weapon) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.damage = weapon.damage;
    this.explosionRadius = weapon.explosionRadius;
    this.knockback = weapon.knockback;
    this.windMultiplier = weapon.windMultiplier;
    this.color = weapon.color;
    this.weaponId = weapon.id;
  }

  public updatePosition(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
