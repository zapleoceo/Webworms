import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { Worm } from '../models/Worm';
import { Projectile } from '../models/Projectile';
import { PhysicsProp } from '../models/PhysicsProp';
import { SoundManager } from '../utils/SoundManager';
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
  private turnTimeLeft: number = 30;
  public maxTurnTime: number = 30;
  public hasFiredThisTurn: boolean = false;
  public brandAssets: string[] = ['apple', 'android', 'windows'];
  
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

  public startGame(settings: any) {
    this.maxTurnTime = settings.mode === 'training' ? Infinity : (settings.turnTime || 30);
    this.turnTimeLeft = this.maxTurnTime;
    
    let worldWidth = this.initialWidth * 1.5;
    let worldHeight = this.initialHeight * 1.2;
    this.state = new GameState(worldWidth, worldHeight);
    this.state.availableLogos = settings.logos || [];
    this.state.airdropTimer = 60; // First airdrop in 60s
    this.state.cameraX = Math.max(0, (worldWidth - this.initialWidth) / 2);
    this.state.cameraY = Math.max(0, (worldHeight - this.initialHeight) / 2);
    this.activeInputs.clear();
    this.matchTime = 0;

    this.state.landscape.generateTerrain();

    // Add teams of 3 worms
    const spawnPoints: {x: number, y: number}[] = [];
    const availableWeapons = ['bazooka', 'minigun', 'triple', 'rocket'];
    const availableClasses: ('soldier'|'heavy'|'scout')[] = ['soldier', 'heavy', 'scout'];

    // Team 1 (Player 1)
    for (let i = 0; i < 3; i++) {
      const s = this.state.landscape.getSafeSpawn(spawnPoints, 150);
      spawnPoints.push(s);
      const wpn = availableWeapons[Math.floor(Math.random() * availableWeapons.length)];
      const cls = availableClasses[Math.floor(Math.random() * availableClasses.length)];
      const p = new Worm(s.x, s.y, false, `Worm ${i+1}`, cls, [wpn]);
      this.state.addPlayer(p);
    }

    // Team 2 (Player 2 or AI)
    for (let i = 0; i < 3; i++) {
      const s = this.state.landscape.getSafeSpawn(spawnPoints, 150);
      spawnPoints.push(s);
      const wpn = availableWeapons[Math.floor(Math.random() * availableWeapons.length)];
      const cls = availableClasses[Math.floor(Math.random() * availableClasses.length)];
      const p = new Worm(s.x, s.y, true, `Enemy ${i+1}`, cls, [wpn]);
      this.state.addPlayer(p);
    }

    // Set initial active player (first alive worm of team 1)
    this.state.currentPlayerIndex = 0;

    // Set initial wind
    this.state.wind = (Math.random() - 0.5) * 40;

    // Update UI right away
    if (this.onStateUpdate) {
      this.onStateUpdate(this.state);
    }
    
    const cp = this.state.getCurrentPlayer();
    if (cp) this.updateMobileWeaponIcon(cp);
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

      // Timer countdown logic
      if (!this.hasFiredThisTurn) {
        if (this.turnTimeLeft > 0 && this.turnTimeLeft !== Infinity) {
          const oldTime = Math.ceil(this.turnTimeLeft);
          this.turnTimeLeft -= dt;
          const newTime = Math.ceil(this.turnTimeLeft);
          
          // Tick sound at 5 seconds left
          if (newTime <= 5 && newTime > 0 && oldTime !== newTime) {
            // Optional: Play tick sound here
            // this.soundManager.playTick();
            // We just let UI handle it, but it's good to have it triggered
          }
          
          if (this.turnTimeLeft <= 0) {
            this.turnTimeLeft = 0;
            this.nextTurn();
          }
        }
      }

      // Airdrop Logic
      this.state.airdropTimer -= dt;
      if (this.state.airdropTimer <= 0) {
        this.spawnAirdrop();
        this.state.airdropTimer = 60; // Reset for next minute
      }
    }

    this.processActiveInputs(dt);
    this.physics.update(this.state, dt);
    this.updateCamera(dt);

    // Check game over
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

  private updateCamera(dt: number): void {
    // Determine camera target to follow
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

    const team1Alive = this.state.getAlivePlayers('team1').length > 0;
    const team2Alive = this.state.getAlivePlayers('team2').length > 0;

    if (team1Alive && team2Alive) {
      return undefined; // Game continues
    }

    this.stop();
    if (team1Alive && !team2Alive) return 'team1';
    if (!team1Alive && team2Alive) return 'team2';
    return 'draw';
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
      player.aimAngle += (targetAngle - player.aimAngle) * dt * 1; // Halved
      
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
      const currentPlayer = this.state.getCurrentPlayer();
      const activeTeam = currentPlayer ? currentPlayer.team : 'team1';
      // Allow training mode to control both teams
      if (this.localTeam !== 'training' && activeTeam !== this.localTeam) {
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
          if (this.hasFiredThisTurn) break;

          const team = player.team;
          const teamAliveWorms = this.state.players
            .filter(p => p.team === team && p.health > 0);

          if (teamAliveWorms.length > 1) {
            // Find next index in the filtered team array
            const currentIndexInTeam = teamAliveWorms.indexOf(player);
            const nextIndexInTeam = (currentIndexInTeam + 1) % teamAliveWorms.length;
            
            // Get the actual player object
            const nextPlayer = teamAliveWorms[nextIndexInTeam];
            
            // Find its global index in state.players
            this.state.currentPlayerIndex = this.state.players.indexOf(nextPlayer);
            
            this.updateMobileWeaponIcon(nextPlayer);
          }
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
    // Determine global Aim Angle
    // In W:A, 0 is directly right. The sprite natively points right? Or left?
    // If the sprite natively faces LEFT, then when facingRight is TRUE, we flipped it.
    // The aimAngle is -90 (up) to +90 (down).
    let globalAimAngle = player.aimAngle;
    if (!player.facingRight) {
      // If facing left, mirror the angle
      globalAimAngle = 180 - player.aimAngle;
    }

    const baseRad = globalAimAngle * (Math.PI / 180);
    let speed = power * 3; // Adjust scalar for slower, realistic floaty arcs

    if (weapon.id === 'blaster') {
      speed = 750; // Laser goes fast but not infinite
    }

    // Spawn perfectly at the end of the visual gun barrel
    // Worm is drawn from bottom center (player.height / 2), so we offset Y
    const gunLength = 25;
    const startX = player.x + Math.cos(baseRad) * gunLength;
    const startY = (player.y - player.height / 2) + Math.sin(baseRad) * gunLength;

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

  private spawnAirdrop() {
    if (!this.state.availableLogos || this.state.availableLogos.length === 0) return;

    // Pick random logo
    const logo = this.state.availableLogos[Math.floor(Math.random() * this.state.availableLogos.length)];
    
    // Spawn at top, random X
    const spawnX = Math.random() * (this.state.landscape.width - 200) + 100;
    const spawnY = -200; // Above screen

    const prop = new PhysicsProp(spawnX, spawnY, 'brand', undefined, logo.hardness, logo.image_data);
    // Override width/height from DB settings
    prop.width = logo.width || 60;
    prop.height = logo.height || 60;
    prop.radius = Math.max(prop.width, prop.height) / 2;
    prop.mass = logo.hardness * 2; // Harder logos are heavier
    prop.defense = logo.hardness;

    this.state.props.push(prop);
  }

  public updateMobileWeaponIcon(player: any) {
    const iconEl = document.getElementById('current-weapon-icon') as HTMLImageElement;
    if (iconEl && player) {
      const weapon = player.getCurrentWeapon();
      if (weapon) {
        // Map weapon id to actual original sprite filename
        const weaponSpriteMap: Record<string, string> = {
          'bazooka': 'bazooka.1.png',
          'minigun': 'minigun.1.png',
          'triple': 'shotgun.1.png',
          'rocket': 'hmissile.1.png',
          'blaster': 'laser.1.png'
        };
        const spriteName = weaponSpriteMap[weapon.id] || 'bazooka.1.png';
        iconEl.src = `/sprites/Weapon Icons/${spriteName}`;
      }
    }
  }

  public nextTurn() {
    const totalPlayers = this.state.players.length;
    if (totalPlayers === 0) return;

    this.hasFiredThisTurn = false;

    const currentPlayer = this.state.getCurrentPlayer();
    const currentTeam = currentPlayer ? currentPlayer.team : 'team1';
    const nextTeam = currentTeam === 'team1' ? 'team2' : 'team1';

    const nextTeamAliveWorms = this.state.players
      .map((p, index) => ({ p, index }))
      .filter(item => item.p.team === nextTeam && item.p.health > 0);

    if (nextTeamAliveWorms.length === 0) {
      return;
    }

    const nextIndex = nextTeamAliveWorms[0].index;
    this.state.currentPlayerIndex = nextIndex;
    
    const player = this.state.getCurrentPlayer();
    if (player) {
      this.updateMobileWeaponIcon(player);
      player.vx = 0;
      player.vy = 0;
      player.isJumping = false;
      this.turnTimeLeft = this.maxTurnTime;
      this.state.wind = (Math.random() - 0.5) * 40;
    }
  }
}
