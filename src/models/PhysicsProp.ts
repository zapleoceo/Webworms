export class PhysicsProp {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  
  public radius: number;
  public rotation: number = 0; // in radians
  public angularVelocity: number = 0; // rads per second
  
  public type: 'rock' | 'crate';
  public bounce: number = 0.4;
  public friction: number = 0.8;
  public isSettled: boolean = false;

  public health: number;
  public maxHealth: number;
  public defense: number; // damage reduction
  public mass: number; // resistance to push

  constructor(x: number, y: number, type: 'rock' | 'crate' = 'rock') {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = type === 'rock' ? 8 + Math.random() * 5 : 12;
    
    // Assign properties based on type
    if (type === 'rock') {
      this.maxHealth = 80;
      this.defense = 0.4; // 40% reduction
      this.mass = 2.0;
    } else {
      this.maxHealth = 40;
      this.defense = 0.0; // 0% reduction
      this.mass = 0.8;
    }
    this.health = this.maxHealth;
  }

  public takeDamage(amount: number): void {
    const actualDamage = amount * (1 - this.defense);
    this.health -= actualDamage;
    if (this.health < 0) this.health = 0;
  }
}
