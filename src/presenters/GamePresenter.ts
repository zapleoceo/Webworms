import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { Worm } from '../models/Worm';
import { Projectile } from '../models/Projectile';
import { SoundManager } from '../utils/SoundManager';

export class GamePresenter {
  public state: GameState;
  public physics: PhysicsEngine;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private activeInputs: Set<string> = new Set(); // Track held keys/buttons
  private soundManager: SoundManager;

  constructor(width: number, height: number) {
    this.state = new GameState(width, height);
    this.physics = new PhysicsEngine();
    this.soundManager = new SoundManager();
    
    // Connect physics explosion event to sound manager
    this.physics.onExplode = () => {
      this.soundManager.playExplosion();
    };
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
    this.processActiveInputs(dt);
    this.physics.update(this.state, dt);
  }

  private processActiveInputs(dt: number): void {
    const player = this.state.getCurrentPlayer();
    if (!player) return;

    const aimSpeed = 90; // degrees per second
    const chargeSpeed = 100; // max power per second
    const moveSpeed = 100;

    if (this.activeInputs.has('up')) {
      player.updateAim(aimSpeed * dt);
    }
    if (this.activeInputs.has('down')) {
      player.updateAim(-aimSpeed * dt);
    }
    if (this.activeInputs.has('fire')) {
      player.changePower(chargeSpeed * dt);
    }
    
    // Apply movement continuously to overcome friction
    if (this.activeInputs.has('left')) {
      player.vx = -moveSpeed;
      player.facingRight = false;
    } else if (this.activeInputs.has('right')) {
      player.vx = moveSpeed;
      player.facingRight = true;
    }
  }

  public render(): void {
    // This will be overridden by the View layer in main.ts
  }

  public handleInput(action: string, isActive: boolean): void {
    // Unlock Web Audio API on first user interaction
    if (isActive) {
      this.soundManager.init();
    }

    const player = this.state.getCurrentPlayer();
    if (!player) return;

    if (isActive) {
      this.activeInputs.add(action);
    } else {
      this.activeInputs.delete(action);
    }

    const jumpForce = -250;

    switch (action) {
      case 'jump':
        if (isActive && !player.isJumping) {
          player.vy = jumpForce;
          player.isJumping = true;
        }
        break;
      case 'fire':
        if (isActive) {
          // Start charging - if aimPower is 0, give it a tiny bit so it registers as a shot
          if (player.aimPower === 0) {
            player.aimPower = 1;
          }
        } else {
          // If releasing fire, shoot the weapon
          this.fireWeapon(player);
        }
        break;
    }
  }

  private fireWeapon(player: Worm): void {
    if (player.aimPower <= 0) return;
    
    const power = Math.max(player.aimPower, 15); // Minimum power for a quick tap
    
    // Calculate vector based on angle and power
    const rad = player.aimAngle * (Math.PI / 180);
    const speed = power * 6; // Adjust scalar for better arcs
    const direction = player.facingRight ? 1 : -1;
    
    const vx = Math.cos(rad) * speed * direction;
    const vy = -Math.sin(rad) * speed; // Negative is up
    
    // Spawn completely outside the worm's collision radius
    const startX = player.x + (player.width / 2 + 5) * direction;
    const startY = player.y - player.height / 2 - 5;

    const proj = new Projectile(startX, startY, vx, vy);
    this.state.addProjectile(proj);
    
    player.aimPower = 0; // Reset power
  }
}
