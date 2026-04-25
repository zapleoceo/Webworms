export class Worm {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 10;
  public height: number = 10;
  public aimAngle: number = 45; // Degrees
  public aimPower: number = 0;
  public health: number = 100;
  public isInvulnerable: boolean = false;
  public facingRight: boolean = true;
  public isJumping: boolean = false;

  constructor(x: number, y: number, isInvulnerable: boolean = false) {
    this.x = x;
    this.y = y;
    this.isInvulnerable = isInvulnerable;
  }

  public updateAim(deltaAngle: number): void {
    this.aimAngle += deltaAngle;
    if (this.aimAngle < 0) this.aimAngle = 0;
    if (this.aimAngle > 180) this.aimAngle = 180;
  }

  public changePower(deltaPower: number): void {
    this.aimPower += deltaPower;
    if (this.aimPower < 0) this.aimPower = 0;
    if (this.aimPower > 100) this.aimPower = 100;
  }

  public takeDamage(amount: number): void {
    if (this.isInvulnerable) return;
    this.health -= amount;
    if (this.health < 0) this.health = 0;
  }
}
