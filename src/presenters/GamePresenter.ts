import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { Worm } from '../models/Worm';
import { Projectile } from '../models/Projectile';
import { SoundManager } from '../utils/SoundManager';
import { PhysicsProp } from '../models/PhysicsProp';

export class GamePresenter {
  public state: GameState;
  public physics: PhysicsEngine;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private activeInputs: Set<string> = new Set(); // Track held keys/buttons
  private soundManager: SoundManager;
  private initialWidth: number;
  private initialHeight: number;

  public onGameOver?: (winner: Worm | null) => void;

  constructor(width: number, height: number) {
    this.initialWidth = width;
    this.initialHeight = height;
    
    // Make the world wider than the canvas
    const worldWidth = width * 1.5;
    const worldHeight = height * 1.2;
    this.state = new GameState(worldWidth, worldHeight);
    
    // Start camera centered
    this.state.cameraX = (worldWidth - width) / 2;
    this.state.cameraY = (worldHeight - height) / 2;

    this.physics = new PhysicsEngine();
    this.soundManager = new SoundManager();
    
    // Connect physics events to sound manager
    this.physics.onExplode = () => this.soundManager.playExplosion();
    this.physics.onJump = () => this.soundManager.playJump();
    this.physics.onHurt = () => this.soundManager.playHurt();
    this.physics.onFallStart = () => this.soundManager.startFalling();
    this.physics.onFallStop = () => this.soundManager.stopFalling();
    this.physics.onHeavyImpact = () => this.soundManager.playHeavyImpact();
  }

  public reset(): void {
    const worldWidth = this.initialWidth * 1.5;
    const worldHeight = this.initialHeight * 1.2;
    this.state = new GameState(worldWidth, worldHeight);
    this.state.cameraX = (worldWidth - this.initialWidth) / 2;
    this.state.cameraY = (worldHeight - this.initialHeight) / 2;
    this.activeInputs.clear();
    this.init();
  }

  public init(): void {
    this.state.landscape.generateTerrain();
    
    // Add two worms for Phase 1 with Safe Spawn
    const spawnPoints: {x: number, y: number}[] = [];
    
    const s1 = this.state.landscape.getSafeSpawn(spawnPoints, 300);
    spawnPoints.push(s1);
    const p1 = new Worm(s1.x, s1.y, false, 'Player 1', '#FF69B4');
    
    const s2 = this.state.landscape.getSafeSpawn(spawnPoints, 300);
    spawnPoints.push(s2);
    const p2 = new Worm(s2.x, s2.y, true, 'Player 2', '#4169E1'); // Dummy
    
    this.state.addPlayer(p1);
    this.state.addPlayer(p2);

    // Add some random dynamic props (Asteroids/Crates)
    for (let i = 0; i < 5; i++) {
      const s = this.state.landscape.getSafeSpawn(spawnPoints, 100);
      spawnPoints.push(s);
      const prop = new PhysicsProp(s.x, s.y - 50, i % 2 === 0 ? 'rock' : 'crate');
      this.state.props.push(prop);
    }
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
    this.checkGameOver();
  }

  private checkGameOver(): void {
    const alivePlayers = this.state.players.filter(p => p.health > 0);
    // If we started with more than 1 player and now only 1 or 0 remain
    if (this.state.players.length > 1 && alivePlayers.length <= 1) {
      this.stop();
      if (this.onGameOver) {
        this.onGameOver(alivePlayers[0] || null);
      }
    }
  }

  private processActiveInputs(dt: number): void {
    const player = this.state.getCurrentPlayer();
    if (!player) return;

    const aimSpeed = 90; // degrees per second
    const chargeSpeed = 100; // max power per second
    const moveForce = 800; // pixels per second squared (acceleration)
    const maxSpeed = 100; // pixels per second
    const airControl = 0.5; // 50% control while in the air

    if (this.activeInputs.has('up')) {
      player.updateAim(aimSpeed * dt);
    }
    if (this.activeInputs.has('down')) {
      player.updateAim(-aimSpeed * dt);
    }
    if (this.activeInputs.has('fire')) {
      player.changePower(chargeSpeed * dt);
    }
    
    // Apply movement continuously as a force to overcome friction/slopes
    if (this.activeInputs.has('left')) {
      player.facingRight = false;
      if (!player.isJumping) {
        player.vx = -maxSpeed; // Instant speed on ground
      } else {
        player.vx -= moveForce * airControl * dt; // Gradual acceleration in air
      }
    } else if (this.activeInputs.has('right')) {
      player.facingRight = true;
      if (!player.isJumping) {
        player.vx = maxSpeed; // Instant speed on ground
      } else {
        player.vx += moveForce * airControl * dt; // Gradual acceleration in air
      }
    }

    // Clamp air speed so they don't accelerate infinitely
    if (player.isJumping) {
      if (player.vx > maxSpeed * 1.5) player.vx = maxSpeed * 1.5;
      if (player.vx < -maxSpeed * 1.5) player.vx = -maxSpeed * 1.5;
    }
  }

  public render(): void {
    // This will be overridden by the View layer in main.ts
  }

  // Hook for the view to clear state after rendering
  public postRender(): void {
    this.state.landscape.newCraters = [];
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

    const jumpForce = -150;

    switch (action) {
      case 'jump':
        if (isActive && !player.isJumping) {
          player.vy = jumpForce;
          player.isJumping = true;
          // Play jump sound
          if (this.physics.onJump) this.physics.onJump();
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

  public changeZoom(multiplier: number, pointerX: number, pointerY: number, canvasWidth: number, canvasHeight: number): void {
    const newZoom = Math.max(0.5, Math.min(3.0, this.state.zoom * multiplier));
    this.setZoom(newZoom, pointerX, pointerY, canvasWidth, canvasHeight);
  }

  public setZoom(newZoom: number, pointerX: number, pointerY: number, canvasWidth: number, canvasHeight: number): void {
    // Calculate world coordinates of the pointer before zoom
    const worldX = this.state.cameraX + pointerX / this.state.zoom;
    const worldY = this.state.cameraY + pointerY / this.state.zoom;

    // Set new zoom (clamp between 0.5 and 3.0)
    this.state.zoom = Math.max(0.5, Math.min(3.0, newZoom));

    // Calculate new camera position to keep the world point under the pointer
    this.state.cameraX = worldX - pointerX / this.state.zoom;
    this.state.cameraY = worldY - pointerY / this.state.zoom;

    // Clamp camera
    this.clampCamera(canvasWidth, canvasHeight);
  }

  public moveCamera(dx: number, dy: number, canvasWidth: number, canvasHeight: number): void {
    this.state.cameraX -= dx / this.state.zoom;
    this.state.cameraY -= dy / this.state.zoom;
    this.clampCamera(canvasWidth, canvasHeight);
  }

  private clampCamera(canvasWidth: number, canvasHeight: number): void {
    const maxCamX = this.state.width - canvasWidth / this.state.zoom;
    const maxCamY = this.state.height - canvasHeight / this.state.zoom;
    
    if (this.state.cameraX < 0) this.state.cameraX = 0;
    if (this.state.cameraX > maxCamX) this.state.cameraX = Math.max(0, maxCamX);
    
    if (this.state.cameraY < 0) this.state.cameraY = 0;
    if (this.state.cameraY > maxCamY) this.state.cameraY = Math.max(0, maxCamY);
  }

  private fireWeapon(player: Worm): void {
    if (player.aimPower <= 0) return;
    
    const power = Math.max(player.aimPower, 15); // Minimum power for a quick tap
    
    // Calculate vector based on angle and power
    const rad = player.aimAngle * (Math.PI / 180);
    const speed = power * 6; // Adjust scalar for better arcs
    
    // No direction multiplier needed because angle is 0-360
    const vx = Math.cos(rad) * speed;
    const vy = -Math.sin(rad) * speed; // Negative is up
    
    // Spawn completely outside the worm's collision radius
    const startX = player.x + Math.cos(rad) * (player.width / 2 + 5);
    const startY = player.y - Math.sin(rad) * (player.height / 2 + 5);

    const proj = new Projectile(startX, startY, vx, vy);
    this.state.addProjectile(proj);
    
    player.aimPower = 0; // Reset power
  }
}
