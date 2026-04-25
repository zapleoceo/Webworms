export class Explosion {
  public x: number;
  public y: number;
  public radius: number = 0;
  public maxRadius: number;
  public life: number;
  public maxLife: number;

  constructor(x: number, y: number, maxRadius: number) {
    this.x = x;
    this.y = y;
    this.maxRadius = maxRadius;
    this.maxLife = 0.5; // Half a second explosion
    this.life = this.maxLife;
  }

  public update(dt: number): void {
    this.life -= dt;
    if (this.life < 0) this.life = 0;
    
    // Quick expansion, slow fade
    const progress = 1 - (this.life / this.maxLife);
    this.radius = this.maxRadius * Math.pow(progress, 0.3);
  }
}
