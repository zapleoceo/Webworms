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

  constructor(x: number, y: number, type: 'rock' | 'crate' = 'rock') {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = type === 'rock' ? 8 + Math.random() * 5 : 12;
  }
}
