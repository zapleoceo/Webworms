export class Worm {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 10;
  public height: number = 10;
  public isJumping: boolean = false;
  
  public health: number = 100;
  public maxHealth: number = 100;
  public defense: number = 0; // 0.0 to 1.0 (e.g. 0.2 = 20% damage reduction)
  
  public aimAngle: number = 0; // 0 to 360 degrees
  public aimPower: number = 0; // 0 to 100
  public facingRight: boolean = true;

  // Visual/team identifier
  public teamColor: string;
  public name: string;

  constructor(x: number, y: number, isDummy: boolean = false, name: string = 'Player', color: string = '#FF69B4') {
    this.x = x;
    this.y = y;
    this.name = name;
    this.teamColor = color;
    if (isDummy) {
      // Dummy has high health and doesn't die easily for testing
      this.health = 10000;
    }
  }

  public updateAim(delta: number): void {
    this.aimAngle += delta;
    
    // Normalize to 0-360
    while (this.aimAngle >= 360) this.aimAngle -= 360;
    while (this.aimAngle < 0) this.aimAngle += 360;

    // Automatically face the direction of the aim
    if (this.aimAngle > 90 && this.aimAngle < 270) {
      this.facingRight = false;
    } else {
      this.facingRight = true;
    }
  }

  public changePower(delta: number): void {
    this.aimPower += delta;
    if (this.aimPower > 100) this.aimPower = 100;
    if (this.aimPower < 0) this.aimPower = 0;
  }

  public takeDamage(amount: number): void {
    const actualDamage = amount * (1 - this.defense);
    this.health -= actualDamage;
    if (this.health < 0) this.health = 0;
  }
}
