import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { Worm } from '../models/Worm';
import { Projectile } from '../models/Projectile';
import { SoundManager } from '../utils/SoundManager';
import { PhysicsProp } from '../models/PhysicsProp';
import { AudioManager } from '../utils/AudioManager';

export class GamePresenter {
  public state: GameState;
  public physics: PhysicsEngine;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private activeInputs: Set<string> = new Set(); // Track held keys/buttons
  
  // Track analog joystick inputs (-1.0 to 1.0)
  private analogX: number = 0;
  private analogY: number = 0;

  public handleAnalogInput(x: number, y: number): void {
    this.analogX = x;
    this.analogY = y;
  }
  private soundManager: SoundManager;
  private initialWidth: number;
  private initialHeight: number;
  private cameraFreeMode: boolean = false;

  private matchTime: number = 0;
  private nextAirdropTime: number = 60;
  private currentAirdropBrand: string = '';
  private brandAssets = ['/brand_apple.svg?v=3', '/brand_windows.svg?v=3', '/brand_android.svg?v=3'];
  
  // Camera delay after explosion
  private cameraDelayTimer: number = 0;
  private lastExplosionX: number = 0;
  private lastExplosionY: number = 0;

  public onGameOver?: (winner: string | null, stats: {p1Dmg: number, p2Dmg: number}) => void;
  public onLocalAction?: (action: string, isActive: boolean, payload?: any) => void;
  public onStateUpdate: ((state: any) => void) | null = null;


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
    // Bind physics explosion event to trigger camera delay
    this.physics.onExplode = (x, y) => {
      this.soundManager.playExplosion();
      // Set a 2-second delay focusing on the explosion site
      this.cameraDelayTimer = 2.0;
      this.lastExplosionX = x;
      this.lastExplosionY = y;
    };
    this.physics.onJump = () => this.soundManager.playJump();
    this.physics.onHurt = () => this.soundManager.playHurt();
    this.physics.onFallStart = () => this.soundManager.startFalling();
    this.physics.onFallUpdate = (vy) => this.soundManager.updateFalling(vy);
    this.physics.onFallStop = () => this.soundManager.stopFalling();
    this.physics.onLand = () => this.soundManager.playLand();
    this.physics.onHeavyImpact = () => this.soundManager.playHeavyImpact();
  }

  public updateScreenSize(width: number, height: number): void {
    this.initialWidth = width;
    this.initialHeight = height;
  }

  public localTeam: string | null = null;

  public reset(
    selectedWeapons: string[] = ['bazooka', 'blaster'], 
    unitClass: 'soldier' | 'heavy' | 'scout' = 'soldier',
    mapSize: 'small' | 'medium' | 'large' = 'medium'
  ): void {
    let worldWidth = this.initialWidth * 1.5;
    let worldHeight = this.initialHeight * 1.2;

    if (mapSize === 'small') {
      worldWidth = this.initialWidth * 1.0; // Fit screen
      worldHeight = this.initialHeight * 1.0;
    } else if (mapSize === 'large') {
      worldWidth = this.initialWidth * 2.5;
      worldHeight = this.initialHeight * 1.5;
    }

    this.state = new GameState(worldWidth, worldHeight);
    this.state.cameraX = Math.max(0, (worldWidth - this.initialWidth) / 2);
    this.state.cameraY = Math.max(0, (worldHeight - this.initialHeight) / 2);
    this.activeInputs.clear();
    this.matchTime = 0;
    this.nextAirdropTime = 60;
    this.currentAirdropBrand = this.brandAssets[Math.floor(Math.random() * this.brandAssets.length)];
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
      prop.radius = 30; // 2x larger
      this.state.props.push(prop);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
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
    if ((this.state as any).gameEnded) {
      this.postRender();
      return;
    }

    if (this.isRunning) {
      this.matchTime += dt;
      const timeLeft = this.nextAirdropTime - this.matchTime;
      
      this.state.nextAirdrop = {
        timeRemaining: Math.max(0, timeLeft),
        brandImage: this.currentAirdropBrand
      };

      if (this.matchTime >= this.nextAirdropTime) {
        this.spawnAirdrop();
        this.nextAirdropTime += 60;
        this.currentAirdropBrand = this.brandAssets[Math.floor(Math.random() * this.brandAssets.length)];
      }
    }

    this.processActiveInputs(dt);
    this.physics.update(this.state, dt);
    this.updateCamera(dt);

    // Check if game over
    const winner = this.checkGameOver();
    if (winner !== undefined) {
      this.isRunning = false;
      const stats = {
        p1Dmg: Math.round(this.state.players[0]?.damageDealt || 0),
        p2Dmg: Math.round(this.state.players[1]?.damageDealt || 0)
      };
      if (this.onGameOver) this.onGameOver(winner === null ? 'draw' : winner, stats);
      return;
    }

    // Call onStateUpdate for HUD
    if (this.onStateUpdate) {
      this.onStateUpdate(this.state);
    }
  }

  private spawnAirdrop(): void {
    // Drop a brand from the sky at a random X coordinate
    const x = 50 + Math.random() * (this.state.width - 100);
    const brandProp = new PhysicsProp(x, 0, 'brand', this.currentAirdropBrand);
    brandProp.radius = 30; // Spawn logo/crate 2x larger
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
    // 2. Or, if there's a camera delay timer, keep looking at the explosion
    else if (this.cameraDelayTimer > 0) {
      targetX = this.lastExplosionX;
      targetY = this.lastExplosionY;
      hasTarget = true;
      this.cameraFreeMode = false;
      this.cameraDelayTimer -= dt;
    }
    // 3. Otherwise follow the current player if not in free mode
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

  private checkGameOver() {
    if (!this.isRunning || this.state.players.length === 0) return undefined;
    
    // Wait until we have at least 2 players in the state to check game over
    if (this.state.players.length < 2) return undefined;
    
    const alivePlayers = this.state.players.filter(p => p.health > 0);
    
    // We only trigger game over if we started with players, and now 1 or 0 remain
    // We also need to check if the game has actually properly initialized (e.g. players were added)
    if (this.state.players.length > 1 && alivePlayers.length <= 1) {
      this.stop();
      let result: string | null = 'draw';
      if (alivePlayers.length === 1) {
        result = alivePlayers[0] === this.state.players[0] ? 'team1' : 'team2';
      }
      return result;
    }
    return undefined;
  }

  private processActiveInputs(dt: number): void {
    const player = this.state.getCurrentPlayer();
    if (!player) return;

    const aimSpeed = 90; // degrees per second
    const chargeSpeed = 100; // max power per second
    // Halved speeds as per user request + floaty worms physics
    const moveForce = 200 * player.speedMultiplier; // pixels per second squared (acceleration)
    const maxSpeed = 35 * player.speedMultiplier; // pixels per second
    const airControl = 0.3; // 30% control while in the air

    // --- Handle Aiming (Keyboard + Analog Joystick) ---
    // Slower aim speed
    const actualAimSpeed = aimSpeed * 0.4;

    if (Math.abs(this.analogY) > 0.1) {
      // Map Y (-1 to 1) to angle (-90 to 90 degrees)
      // If Y is negative (stick pushed UP), angle should be negative (aiming UP)
      // If Y is positive (stick pushed DOWN), angle should be positive (aiming DOWN)
      const targetAngle = this.analogY * 90; 
      
      // Smoothly rotate towards target angle based on stick deflection, but slower
      player.aimAngle += (targetAngle - player.aimAngle) * dt * 2;
      
      // Clamp angle
      if (player.aimAngle < -90) player.aimAngle = -90;
      if (player.aimAngle > 90) player.aimAngle = 90;
    } else {
      // Keyboard fallback
      if (this.activeInputs.has('up')) {
        player.updateAim(-actualAimSpeed * dt); // Rotate UP (negative)
      }
      if (this.activeInputs.has('down')) {
        player.updateAim(actualAimSpeed * dt); // Rotate DOWN (positive)
      }
    }

    if (this.activeInputs.has('fire')) {
      const weapon = player.getCurrentWeapon();
      if (weapon && player.weaponCooldowns[weapon.id] <= 0) {
        player.changePower(chargeSpeed * dt);
        // Auto-fire at max power if holding the button
        if (player.aimPower >= 100) {
          this.fireWeapon(player);
        }
        // Only play charge sound occasionally so it's not a crazy mess of AudioContext calls
        if (Math.random() < 0.1) AudioManager.playCharge(player.aimPower);
      } else {
        // Prevent charging while reloading
        player.aimPower = 0;
      }
    }
    
    // Apply movement continuously as a force to overcome friction/slopes
    let isMovingLeft = this.activeInputs.has('left') || this.analogX < -0.1;
    let isMovingRight = this.activeInputs.has('right') || this.analogX > 0.1;

    // Determine analog speed modifier (0 to 1)
    let analogSpeedMod = 1.0;
    if (Math.abs(this.analogX) > 0) {
      analogSpeedMod = Math.abs(this.analogX); // The further you push, the faster you go
    }

    if (isMovingLeft) {
      player.facingRight = false;
      if (!player.isJumping) {
        player.vx = -maxSpeed * analogSpeedMod; // Instant speed on ground
      } else {
        player.vx -= moveForce * airControl * dt; // Gradual acceleration in air
      }
    } else if (isMovingRight) {
      player.facingRight = true;
      if (!player.isJumping) {
        player.vx = maxSpeed * analogSpeedMod; // Instant speed on ground
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
    // This is overridden by main.ts
  }

  // Hook for the view to clear state after rendering
  public postRender(): void {
    this.state.landscape.newCraters = [];
    if ((this.state as any).gameEnded) {
      if (!(this as any).gameOverLogged) {
        (this as any).gameOverLogged = true;
        const winner = this.state.players.find(p => p.health > 0);
        setTimeout(() => {
          alert(`Game Over! ${winner ? winner.name + ' wins!' : 'Draw!'}`);
          window.location.reload();
        }, 1000);
      }
    }
  }

  public handleInput(action: string, isActive: boolean, isRemote: boolean = false, payload?: any): void {
    if (!this.isRunning) return;
    
    if (!isRemote && this.localTeam !== null) {
      const activeTeam = this.state.currentPlayerIndex === 0 ? 'team1' : 'team2';
      if (activeTeam !== this.localTeam) {
        return; // Ignore local input if it's not our team's turn
      }
    }

    if (!isRemote && this.onLocalAction) {
      this.onLocalAction(action, isActive, payload);
    }

    // Cancel camera delay immediately if any action is pressed (move, fire, switch)
    if (isActive) {
      this.cameraDelayTimer = 0;
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
          player.isJumping = true;
          // Normal jump or Backflip (Slower, floatier)
          if (this.activeInputs.has('left') || this.activeInputs.has('right')) {
            player.vy = -120; // Lower forward jump (was -180)
          } else {
            // Backflip
            player.vy = -160; // Lower backflip (was -220)
            player.vx = player.facingRight ? -60 : 60; // Less horizontal push
            player.facingRight = !player.facingRight; // Flip mid-air
          }
          // Play jump sound
          if (this.physics.onJump) this.physics.onJump();
          AudioManager.playJump();
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
          if (payload !== undefined && typeof payload === 'number') {
            player.setWeaponIndex(payload);
          } else {
            player.switchWeapon();
          }
          
          this.updateMobileWeaponIcon(player);
        }
        break;
    }
  }

  public changeZoom(delta: number, canvasWidth: number, canvasHeight: number, mouseX?: number, mouseY?: number): void {
    const oldZoom = this.state.zoom;
    this.state.zoom *= (1 - delta * 0.1);

    // Calculate minimum zoom based on screen size so map is never smaller than window
    const minZoomX = canvasWidth / this.state.width;
    const minZoomY = canvasHeight / this.state.height;
    const minZoom = Math.max(minZoomX, minZoomY, 0.5); // Allow max zooming out up to the edge of the map

    if (this.state.zoom < minZoom) this.state.zoom = minZoom;
    if (this.state.zoom > 3.0) this.state.zoom = 3.0; // Max zoom in

    // Adjust camera to zoom towards center of screen (or mouse if provided)
    const targetX = mouseX !== undefined ? mouseX : canvasWidth / 2;
    const targetY = mouseY !== undefined ? mouseY : canvasHeight / 2;
    
    const worldTargetX = this.state.cameraX + targetX / oldZoom;
    const worldTargetY = this.state.cameraY + targetY / oldZoom;
    
    this.state.cameraX = worldTargetX - targetX / this.state.zoom;
    this.state.cameraY = worldTargetY - targetY / this.state.zoom;

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
    
    // Fallback if screen is larger than map
    if (canvasWidth / this.state.zoom > this.state.width) {
      this.state.cameraX = (this.state.width - canvasWidth / this.state.zoom) / 2;
    }
    if (canvasHeight / this.state.zoom > this.state.height) {
      this.state.cameraY = (this.state.height - canvasHeight / this.state.zoom) / 2;
    }
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
    
    AudioManager.playShoot();

    // Apply cooldown (Dynamic: based on shot power, min 20% of base cooldown)
    const powerRatio = Math.max(0.2, power / 100);
    const actualCooldown = weapon.cooldown * powerRatio;
    player.weaponCooldowns[weapon.id] = actualCooldown;
    player.maxWeaponCooldowns[weapon.id] = actualCooldown;

    // Calculate vector based on angle and power
    // Convert aimAngle (-90 to 90) into global angle for projectile math
    // 0 is right, 180 is left. 
    // If facing right: -90 is up (270 or -PI/2)
    // If facing left: angle needs to be mirrored.
    let globalAimAngle = player.aimAngle;
    if (!player.facingRight) {
      // Mirror horizontally
      globalAimAngle = 180 - player.aimAngle;
    }

    const baseRad = globalAimAngle * (Math.PI / 180);
    let speed = power * 3; // Adjust scalar for slower, realistic floaty arcs
    
    if (weapon.id === 'blaster') {
      speed = 750; // Laser goes fast but not infinite
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
      const vy = Math.sin(rad) * speed; // Negative is up, positive is down

      const proj = new Projectile(startX, startY, vx, vy, weapon);
      (proj as any).owner = player; // Attach owner for stats tracking
      this.state.projectiles.push(proj);
    }
  }

  public updateMobileWeaponIcon(player: any) {
    const iconEl = document.getElementById('current-weapon-icon') as HTMLImageElement;
    if (iconEl && player) {
      const weapon = player.getCurrentWeapon();
      if (weapon) {
        iconEl.src = `/weapon_${weapon.id}.png`;
      }
    }
  }
}
