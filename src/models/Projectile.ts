export class Projectile {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number = 3;
  public active: boolean = true;
  public explosionRadius: number = 30;
  public damage: number = 25;

  constructor(x: number, y: number, vx: number, vy: number) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  public updatePosition(dt: number): void {
    if (!this.active) return;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
