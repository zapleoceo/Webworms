export class PhysicsProp {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  
  public radius: number;
  public rotation: number = 0; // in radians
  public angularVelocity: number = 0; // rads per second
  
  public type: 'rock' | 'crate' | 'brand';
  public brandImage?: string; // Optional image for brand drops
  public bounce: number = 0.4;
  public friction: number = 0.8;
  public isSettled: boolean = false;

  public health: number;
  public maxHealth: number;
  public defense: number; // damage reduction
  public mass: number; // resistance to push

  constructor(x: number, y: number, type: 'rock' | 'crate' | 'brand' = 'rock', brandImage?: string) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.brandImage = brandImage;

    if (type === 'crate') {
      this.radius = 15;
      this.mass = 0.5; // very light, blows away easily
      this.bounce = 0.2;
      this.maxHealth = 30;
      this.defense = 0.0;
      this.health = 30;
    } else if (type === 'brand') {
      this.radius = 35; // Huge
      this.mass = 5.0; // Very heavy
      this.bounce = 0.1;
      this.maxHealth = 200;
      this.defense = 0.0;
      this.health = 200;
    } else {
      this.radius = 10 + Math.random() * 10;
      this.mass = 1.5; // heavy rock
      this.bounce = 0.5;
      this.maxHealth = 100;
      this.defense = 0.4;
      this.health = 100;
    }
  }

  public takeDamage(amount: number): void {
    const actualDamage = amount * (1 - this.defense);
    this.health -= actualDamage;
    if (this.health < 0) this.health = 0;
  }
}
