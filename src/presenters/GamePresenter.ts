import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { Worm } from '../models/Worm';
import { Projectile } from '../models/Projectile';

export class GamePresenter {
  public state: GameState;
  public physics: PhysicsEngine;
  private lastTime: number = 0;
  private isRunning: boolean = false;

  constructor(width: number, height: number) {
    this.state = new GameState(width, height);
    this.physics = new PhysicsEngine();
  }

  public init(): void {
    this.state.landscape.generateTerrain();
    
    // Add two worms for Phase 1
    const p1 = new Worm(100, 100);
    const p2 = new Worm(700, 100, true); // Dummy
    
    this.state.addPlayer(p1);
    this.state.addPlayer(p2);
  }

  public start(): void {
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));
  }

  public stop(): void {
    this.isRunning = false;
  }

  public loop(time: number): void {
    if (!this.isRunning) return;
    
    const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    this.update(Math.min(dt, 0.1)); // cap dt
    this.render();

    requestAnimationFrame(this.loop.bind(this));
  }

  public update(dt: number): void {
    this.physics.update(this.state, dt);
  }

  public render(): void {
    // This will be overridden by the View layer in main.ts
  }

  public handleInput(action: string, isActive: boolean): void {
    const player = this.state.getCurrentPlayer();
    if (!player) return;

    const moveSpeed = 100;
    const aimSpeed = 90;
    const jumpForce = -250;

    switch (action) {
      case 'left':
        player.vx = isActive ? -moveSpeed : 0;
        if (isActive) player.facingRight = false;
        break;
      case 'right':
        player.vx = isActive ? moveSpeed : 0;
        if (isActive) player.facingRight = true;
        break;
      case 'up':
        if (isActive) player.updateAim(aimSpeed * 0.1);
        break;
      case 'down':
        if (isActive) player.updateAim(-aimSpeed * 0.1);
        break;
      case 'jump':
        if (isActive && !player.isJumping) {
          player.vy = jumpForce;
          player.isJumping = true;
        }
        break;
      case 'fire':
        if (isActive) {
          player.changePower(2); // Charging
        } else {
          this.fireWeapon(player); // Release to fire
        }
        break;
    }
  }

  private fireWeapon(player: Worm): void {
    if (player.aimPower <= 0) return;
    
    // Calculate vector based on angle and power
    const rad = player.aimAngle * (Math.PI / 180);
    const speed = player.aimPower * 5; // Adjust scalar
    const direction = player.facingRight ? 1 : -1;
    
    const vx = Math.cos(rad) * speed * direction;
    const vy = -Math.sin(rad) * speed; // Negative is up
    
    const startX = player.x + (player.width / 2) * direction;
    const startY = player.y - player.height;

    const proj = new Projectile(startX, startY, vx, vy);
    this.state.addProjectile(proj);
    
    player.aimPower = 0; // Reset power
  }
}
