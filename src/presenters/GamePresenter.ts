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
  private cameraFreeMode: boolean = false;

  private matchTime: number = 0;
  private nextAirdropTime: number = 60;
  private brandAssets = ['/assets/brand_apple.png', '/assets/brand_windows.png', '/assets/brand_android.png'];

  public onGameOver?: (winner: Worm | null, stats: {p1Dmg: number, p2Dmg: number}) => void;
  public onLocalAction?: (action: string, isActive: boolean) => void;

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
    this.soundManager.init();
    this.soundManager.loadSounds().catch(() => {}); // Load external files asynchronously
    
    // Connect physics events to sound manager
    this.physics.onExplode = () => this.soundManager.playExplosion();
    this.physics.onJump = () => this.soundManager.playJump();
    this.physics.onHurt = () => this.soundManager.playHurt();
    this.physics.onFallStart = () => this.soundManager.startFalling();
    this.physics.onFallUpdate = (vy) => this.soundManager.updateFalling(vy);
    this.physics.onFallStop = () => this.soundManager.stopFalling();
    this.physics.onLand = () => this.soundManager.playLand();
    this.physics.onHeavyImpact = () => this.soundManager.playHeavyImpact();
  }

  public reset(selectedWeapons: string[] = ['bazooka', 'blaster'], unitClass: 'soldier' | 'heavy' | 'scout' = 'soldier'): void {
    const worldWidth = this.initialWidth * 1.5;
    const worldHeight = this.initialHeight * 1.2;
    this.state = new GameState(worldWidth, worldHeight);
    this.state.cameraX = (worldWidth - this.initialWidth) / 2;
    this.state.cameraY = (worldHeight - this.initialHeight) / 2;
    this.activeInputs.clear();
    this.matchTime = 0;
    this.nextAirdropTime = 60;
    this.init(selectedWeapons, unitClass);
  }

  public init(selectedWeapons: string[] = ['bazooka', 'blaster'], unitClass: 'soldier' | 'heavy' | 'scout' = 'soldier'): void {
    this.state.landscape.generateTerrain();
    
    // Add two worms for Phase 1 with Safe Spawn
    const spawnPoints: {x: number, y: number}[] = [];
    
    const s1 = this.state.landscape.getSafeSpawn(spawnPoints, 300);
    spawnPoints.push(s1);
    const p1 = new Worm(s1.x, s1.y, false, 'Player 1', unitClass, selectedWeapons);
    
    const s2 = this.state.landscape.getSafeSpawn(spawnPoints, 300);
    spawnPoints.push(s2);
    const p2 = new Worm(s2.x, s2.y, true, 'Player 2', 'heavy', selectedWeapons); // Dummy
    
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
    if (this.isRunning) {
      this.matchTime += dt;
      if (this.matchTime >= this.nextAirdropTime) {
        this.spawnAirdrop();
        this.nextAirdropTime += 60;
      }
    }

    this.processActiveInputs(dt);
    this.physics.update(this.state, dt);
    this.updateCamera(dt);
    this.checkGameOver();
  }

  private spawnAirdrop(): void {
    // Drop a brand from the sky at a random X coordinate
    const x = 50 + Math.random() * (this.state.width - 100);
    const brandImage = this.brandAssets[Math.floor(Math.random() * this.brandAssets.length)];
    const brandProp = new PhysicsProp(x, 0, 'brand', brandImage);
    this.state.props.push(brandProp);
  }

  private updateCamera(dt: number): void {
    // Determine the target to follow
    let targetX = this.state.cameraX;
    let targetY = this.state.cameraY;
    let hasTarget = false;

    // 1. Follow active projectile if any exists
    if (this.state.projectiles.length > 0) {
      const proj = this.state.projectiles[0]; // Follow the first active projectile
      targetX = proj.x;
      targetY = proj.y;
      hasTarget = true;
      this.cameraFreeMode = false; // Auto-follow projectiles always
    } 
    // 2. Otherwise follow the current player if not in free mode
    else if (!this.cameraFreeMode) {
      const player = this.state.getCurrentPlayer();
      if (player) {
        targetX = player.x;
        targetY = player.y;
        hasTarget = true;
      }
    }

    if (hasTarget) {
      // Calculate the desired camera top-left position to center the target
      // We use the initial canvas dimensions (800x600) scaled by zoom
      const viewportWidth = this.initialWidth / this.state.zoom;
      const viewportHeight = this.initialHeight / this.state.zoom;
      
      const desiredCamX = targetX - viewportWidth / 2;
      const desiredCamY = targetY - viewportHeight / 2;

      // Smooth interpolation (Lerp)
      const lerpFactor = 5 * dt; // Adjust speed of camera tracking
      this.state.cameraX += (desiredCamX - this.state.cameraX) * lerpFactor;
      this.state.cameraY += (desiredCamY - this.state.cameraY) * lerpFactor;

      // Clamp camera to world bounds
      this.clampCamera(this.initialWidth, this.initialHeight);
    }
  }

  private checkGameOver(): void {
    const alivePlayers = this.state.players.filter(p => p.health > 0);
    // If we started with more than 1 player and now only 1 or 0 remain
    if (this.state.players.length > 1 && alivePlayers.length <= 1) {
      this.stop();
      const p1Dmg = Math.round(this.state.players[0]?.damageDealt || 0);
      const p2Dmg = Math.round(this.state.players[1]?.damageDealt || 0);
      if (this.onGameOver) {
        this.onGameOver(alivePlayers[0] || null, {p1Dmg, p2Dmg});
      }
    }
  }

  private processActiveInputs(dt: number): void {
    const player = this.state.getCurrentPlayer();
    if (!player) return;

    const aimSpeed = 90; // degrees per second
    const chargeSpeed = 100; // max power per second
    const moveForce = 800 * player.speedMultiplier; // pixels per second squared (acceleration)
    const maxSpeed = 100 * player.speedMultiplier; // pixels per second
    const airControl = 0.5; // 50% control while in the air

    if (this.activeInputs.has('up')) {
      player.updateAim(aimSpeed * dt); // Rotate counter-clockwise (up)
    }
    if (this.activeInputs.has('down')) {
      player.updateAim(-aimSpeed * dt); // Rotate clockwise (down)
    }
    if (this.activeInputs.has('fire')) {
      const weapon = player.getCurrentWeapon();
      if (weapon && player.weaponCooldowns[weapon.id] <= 0) {
        player.changePower(chargeSpeed * dt);
        // Auto-fire at max power if holding the button
        if (player.aimPower >= 100) {
          this.fireWeapon(player);
        }
      } else {
        // Prevent charging while reloading
        player.aimPower = 0;
      }
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

  public handleInput(action: string, isActive: boolean, isRemote: boolean = false): void {
    // Only process remote inputs if they are marked remote, or local if marked local
    // In a real game, you would check if the current turn belongs to the local player
    
    if (!isRemote && this.onLocalAction) {
      this.onLocalAction(action, isActive);
    }

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

    switch (action) {
      case 'jump':
        if (isActive && !player.isJumping) {
          player.vy = player.jumpForce;
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
      case 'switch':
        if (isActive) {
          player.switchWeapon();
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
    this.cameraFreeMode = true; // User took control
    this.state.cameraX -= dx / this.state.zoom;
    this.state.cameraY -= dy / this.state.zoom;
    this.clampCamera(canvasWidth, canvasHeight);
  }

  private clampCamera(canvasWidth: number, canvasHeight: number): void {
    const maxCamX = this.state.width - canvasWidth / this.state.zoom;
    const maxCamY = this.state.height - canvasHeight / this.state.zoom;
    
    // Add padding to prevent viewing the absolute 30px hard edge
    const margin = 30;
    
    if (this.state.cameraX < margin) this.state.cameraX = margin;
    if (this.state.cameraX > maxCamX - margin) this.state.cameraX = Math.max(margin, maxCamX - margin);
    
    if (this.state.cameraY < margin) this.state.cameraY = margin;
    if (this.state.cameraY > maxCamY - margin) this.state.cameraY = Math.max(margin, maxCamY - margin);
  }

  private fireWeapon(player: Worm): void {
    if (player.aimPower <= 0) return;
    
    const power = Math.max(player.aimPower, 15); // Minimum power for a quick tap
    player.aimPower = 0; // Reset power

    const weapon = player.getCurrentWeapon();
    if (!weapon) return;
    
    // Check cooldown
    if (player.weaponCooldowns[weapon.id] > 0) {
      // Cooldown active, cannot shoot
      return;
    }
    
    // Apply cooldown (Dynamic: based on shot power, min 20% of base cooldown)
    const powerRatio = Math.max(0.2, power / 100);
    const actualCooldown = weapon.cooldown * powerRatio;
    player.weaponCooldowns[weapon.id] = actualCooldown;
    player.maxWeaponCooldowns[weapon.id] = actualCooldown;

    // Calculate vector based on angle and power
    const baseRad = player.aimAngle * (Math.PI / 180);
    let speed = power * 6; // Adjust scalar for better arcs
    if (weapon.id === 'laser') {
      speed = 1500; // Laser goes super fast and straight
    }
    
    // Spawn completely outside the worm's collision radius
    const startX = player.x + Math.cos(baseRad) * (player.width / 2 + 5);
    const startY = player.y - Math.sin(baseRad) * (player.height / 2 + 5);

    // Fire multiple projectiles if weapon supports it (e.g. shotgun)
    for (let i = 0; i < weapon.projectilesPerShot; i++) {
      // Calculate spread
      let rad = baseRad;
      if (weapon.spread > 0) {
        const spreadRad = weapon.spread * (Math.PI / 180);
        rad += (Math.random() - 0.5) * spreadRad;
      }

      const vx = Math.cos(rad) * speed;
      const vy = -Math.sin(rad) * speed; // Negative is up

      const proj = new Projectile(startX, startY, vx, vy, weapon);
      (proj as any).owner = player; // Attach owner for stats tracking
      this.state.projectiles.push(proj);
    }
  }
}
