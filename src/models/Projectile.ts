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
  public rangeRemaining: number;
  public age: number = 0;
  public crater: boolean = true;

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
    this.rangeRemaining = weapon.maxRange > 0 ? weapon.maxRange : Infinity;
    this.crater = weapon.crater !== false;
  }

  public updatePosition(dt: number): void {
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
