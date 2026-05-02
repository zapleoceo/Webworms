import { GameState } from '../models/GameState';
import { PhysicsEngine } from './PhysicsEngine';
import { Worm } from '../models/Worm';
import { Projectile } from '../models/Projectile';
import { Random } from '../utils/Random';
import { SoundManager } from '../utils/SoundManager';
import { AudioManager } from '../utils/AudioManager';
import { RopeTool } from '../equipment/items/RopeTool';
import { GrenadeWeapon } from '../equipment/items/GrenadeWeapon';
import { getEquipmentDefinition } from '../equipment/EquipmentRegistry';
import { getLoadoutForWorm } from '../equipment/LoadoutGenerator';
import { findSafeWormSpawn } from '../gameplay/SpawnSelector';

import { BrandLogo } from '../models/BrandLogo';
import { DEFAULT_AIRDROP_PHYSICS, normalizeAirdropPhysicsConfig } from '../physics/AirdropConfig';
import { BotTurnController } from '../controllers/BotTurnController';
import { terrainHitCircle } from '../physics/TrajectorySim';
import { stepTurn } from '../game/turns/TurnSystem';
import { BURST_SHOTS_PER_TURN, burstUsed, canFireBurstWeapon, incrementBurst, isBurstWeapon, trySpendGrenade } from '../game/combat/WeaponSystem';

export class GamePresenter {
  public state: GameState;
  public physics: PhysicsEngine;
  private lastTime: number = 0;
  public isRunning: boolean = false;
  private activeInputs: Set<string> = new Set(); // Track held keys/buttons
  private shotsFiredThisTurnByWeaponId: Record<string, number> = {};
  private nextProjectileNetId = 1;
  
  // Track analog joystick inputs (-1.0 to 1.0)
  private analogX: number = 0;
  private analogY: number = 0;

  public handleAnalogInput(x: number, y: number, isRemote: boolean = false): void {
    if (!isRemote && this.localTeam !== null) {
      const currentPlayer = this.state.getCurrentPlayer();
      const activeTeam = currentPlayer ? currentPlayer.team : 'team1';
      if (this.localTeam !== 'training' && activeTeam !== this.localTeam) {
        this.analogX = 0;
        this.analogY = 0;
        return;
      }
    }
    if (!this.isHost && !isRemote) {
      if (this.onLocalAction) {
        this.onLocalAction('analog', true, {x, y});
      }
      return;
    }
    this.analogX = x;
    this.analogY = y;
  }
  private soundManager: SoundManager;
  private initialWidth: number;
  private initialHeight: number;
  private cameraFreeMode: boolean = false;

  public turnTimeLeft: number = 30;
  public maxTurnTime: number = 30;
  public matchDuration: number = 0;
  public hasFiredThisTurn: boolean = false;
  public isPaused: boolean = false;
  public isHost: boolean = true; // Is this client computing physics?
  public brandAssets: string[] = ['apple', 'android', 'windows'];
  
  // Camera delay after explosion
  private cameraDelayTimer: number = 0;
  private lastExplosionX: number = 0;
  private lastExplosionY: number = 0;

  public onGameOver?: (winner: string | null, stats: {p1Dmg: number, p2Dmg: number}) => void;
  public onLocalAction?: (action: string, isActive: boolean, payload?: any) => void;
  public onClientTick?: (dt: number) => void;
  public onStateUpdate: ((state: any) => void) | null = null;

  public botTurnController: BotTurnController | null = null;
  public onPhysicsTrace?: (event: any) => void;
  private physicsSampleAccum: number = 0;
  private lastPhysSample?: { t: number; projs: any[]; props: any[]; logos: any[] };


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
    this.physics.onHeavyImpact = () => {
      this.soundManager.playHeavyImpact();
      const shake = this.state.airdropPhysics?.impactShakeTime;
      this.state.cameraShakeTime = typeof shake === 'number' ? shake : 0.3;
    };
    this.physics.onTrace = (e) => {
      if (!this.onPhysicsTrace) return;
      this.onPhysicsTrace(e);
      if (this.state?.mode !== 'aivai' || !this.lastPhysSample) return;
      if (!e || typeof e !== 'object' || e.type !== 'physics_collision') return;
      if (e.kind !== 'projectile' && e.kind !== 'prop_ground' && e.kind !== 'airdrop_contact') return;

      const t = Number.isFinite(Number(e.t)) ? Number(e.t) : this.matchDuration;
      const last = this.lastPhysSample;
      const dt = Math.max(1e-6, t - last.t);

      if (e.kind === 'projectile') {
        const v0 = e.vBefore;
        const v1 = e.vAfter;
        if (!v0 || !v1) return;
        const dvx = (v1.vx || 0) - (v0.vx || 0);
        const dvy = (v1.vy || 0) - (v0.vy || 0);
        const dv = Math.hypot(dvx, dvy);
        const vyFlip = (v0.vy || 0) < 0 && (v1.vy || 0) > 0 && Math.abs(v1.vy) > 120;
        const spike = dv / dt > 12000 || dv > 420 || vyFlip;
        if (!spike) return;
        this.onPhysicsTrace({
          type: 'anomaly',
          t,
          kind: 'grenade_bounce_spike',
          weaponId: e.weaponId,
          dv,
          dt,
          normal: e.normal,
          hitTerrain: e.hitTerrain,
          hitEntity: e.hitEntity,
          sample: last
        });
      } else if (e.kind === 'prop_ground') {
        const v0 = e.vBefore;
        const v1 = e.vAfter;
        if (!v0 || !v1) return;
        const dvx = (v1.vx || 0) - (v0.vx || 0);
        const dvy = (v1.vy || 0) - (v0.vy || 0);
        const dv = Math.hypot(dvx, dvy);
        const spike = dv / dt > 10000 || dv > 380;
        if (!spike) return;
        this.onPhysicsTrace({
          type: 'anomaly',
          t,
          kind: 'prop_impulse_spike',
          dv,
          dt,
          targetAngle: e.targetAngle,
          sample: last
        });
      } else if (e.kind === 'airdrop_contact') {
        const v0 = e.v0;
        const v1 = e.v1;
        if (!v0 || !v1) return;
        const dvx = (v1.vx || 0) - (v0.vx || 0);
        const dvy = (v1.vy || 0) - (v0.vy || 0);
        const dv = Math.hypot(dvx, dvy);
        const spike = dv / dt > 10000 || dv > 380 || (e.maxPen || 0) >= 5;
        if (!spike) return;
        this.onPhysicsTrace({
          type: 'anomaly',
          t,
          kind: 'airdrop_impulse_spike',
          dv,
          dt,
          avgN: e.avgN,
          maxPen: e.maxPen,
          contacts: e.contacts,
          sample: last
        });
      }
    };
  }

  public updateScreenSize(width: number, height: number): void {
    this.initialWidth = width;
    this.initialHeight = height;
  }

  public localTeam: string | null = null;
  public onAIVaiTrace?: (event: any) => void;

  public async startGame(settings: any) {
    if (settings.mode !== 'training' && settings.mode !== 'aivai') {
      const premiumStr = localStorage.getItem('premiumUntil');
      let isPremium = false;
      if (premiumStr) {
        const premiumUntil = parseInt(premiumStr);
        if (premiumUntil > Date.now()) {
          isPremium = true;
        }
      }

      if (!isPremium) {
        let balance = parseInt(localStorage.getItem('playTimeBalance') || '0');
        balance = Math.max(0, balance - 1);
        localStorage.setItem('playTimeBalance', balance.toString());
      }
    }

    this.maxTurnTime = settings.mode === 'training' ? Infinity : (settings.turnTime || 30);
    this.turnTimeLeft = this.maxTurnTime;
    this.state.turnTimeLeft = this.turnTimeLeft;
    this.state.hasFiredThisTurn = this.hasFiredThisTurn;
    
    let worldWidth = this.initialWidth * 1.5;
    let worldHeight = this.initialHeight * 1.2;
    this.state = new GameState(worldWidth, worldHeight);
    this.state.mode = settings.mode;
    this.state.aiDifficulty = settings.aiDifficulty;
    (this.state as any).aiDifficultyByTeam = settings.aiDifficultyByTeam;
    this.state.availableLogos = settings.logos || [];
    const grenadeLimit = settings.mode === 'training' ? Infinity : 15;
    this.state.teamAmmo = { team1: { grenade: grenadeLimit }, team2: { grenade: grenadeLimit } };
    
    // Require a custom map
    if (!settings.mapData) {
      throw new Error("No map data provided. Custom map is required.");
    }
    
    this.state.mapData = settings.mapData;
    await this.state.landscape.generateFromImage(settings.mapData);
    this.state.landscape.computeSpawnCandidates(8, 14, 4, 10);
    worldWidth = this.state.landscape.width;
    worldHeight = this.state.landscape.height;
    this.state.width = worldWidth;
    this.state.height = worldHeight;

    // Set map seed for deterministic item generation (airdrops, wind, etc.)
    this.state.mapSeed = settings.seed || Math.floor(Math.random() * 1000000);
    Random.setSeed(this.state.mapSeed!);

    this.state.airdropPhysics = normalizeAirdropPhysicsConfig(settings.airdropPhysics || DEFAULT_AIRDROP_PHYSICS);
    this.state.botConfig = settings.botConfig || undefined;

    this.state.airdropTimer = 20 + Random.next() * 25; // First airdrop in 20-45s
    this.state.airdropIndex = 0;
    this.state.airdropOffset = Random.next();
    this.state.cameraX = Math.max(0, (worldWidth - this.initialWidth) / 2);
    this.state.cameraY = Math.max(0, (worldHeight - this.initialHeight) / 2);
    this.activeInputs.clear();
    this.shotsFiredThisTurnByWeaponId = {};
    this.nextProjectileNetId = 1;
    
    // Reset timers
    this.matchDuration = 0;
    this.hasFiredThisTurn = false;
    this.state.hasFiredThisTurn = false;
    this.turnTimeLeft = this.maxTurnTime;
    this.state.turnTimeLeft = this.turnTimeLeft;

    this.state.lastPlayedIndex = { 'team1': -1, 'team2': -1 };

    // Set initial wind deterministically
    this.state.wind = (Random.next() - 0.5) * 40;

    // Add teams of 3 worms
    const spawnPoints: {x: number, y: number}[] = [];
    const availableClasses: ('soldier'|'heavy'|'scout')[] = ['soldier', 'heavy', 'scout'];

    // Generate team classes deterministically from seed so both clients agree
    const t1Classes = [
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)]
    ];
    const t2Classes = [
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)]
    ];

    // Team 1 (Player 1)
    for (let i = 0; i < 3; i++) {
      const s = findSafeWormSpawn(this.state.landscape, this.state.mapSeed || 1, `team1:${i}`, spawnPoints, 150);
      spawnPoints.push(s);
      const loadout = settings.mode === 'training'
        ? getLoadoutForWorm('training', this.state.mapSeed || 1, 'team1', i)
        : (Array.isArray(settings?.loadout) ? settings.loadout : getLoadoutForWorm(settings.mode as any, this.state.mapSeed || 1, 'team1', i));
      const a1d = (settings.aiDifficultyByTeam && settings.aiDifficultyByTeam.team1) ? settings.aiDifficultyByTeam.team1 : 'easy';
      const p = new Worm(
        s.x,
        s.y,
        false,
        (settings.mode === 'ai' || settings.mode === 'aivai') ? `${a1d}${i + 1}` : `Worm ${i + 1}`,
        t1Classes[i] as any,
        loadout,
        'team1'
      );
      this.state.addPlayer(p);
    }

    // Team 2 (Player 2 or AI)
    for (let i = 0; i < 3; i++) {
      const s = findSafeWormSpawn(this.state.landscape, this.state.mapSeed || 1, `team2:${i}`, spawnPoints, 150);
      spawnPoints.push(s);
      const loadout = settings.mode === 'training'
        ? getLoadoutForWorm('training', this.state.mapSeed || 1, 'team2', i)
        : (Array.isArray(settings?.loadout) ? settings.loadout : getLoadoutForWorm(settings.mode as any, this.state.mapSeed || 1, 'team2', i));
      const a2d = (settings.aiDifficultyByTeam && settings.aiDifficultyByTeam.team2) ? settings.aiDifficultyByTeam.team2 : (settings.aiDifficulty || 'medium');
      const p = new Worm(
        s.x,
        s.y,
        this.state.mode === 'training',
        (settings.mode === 'ai' || settings.mode === 'aivai') ? `${a2d}${i + 1}` : `Enemy ${i + 1}`,
        t2Classes[i] as any,
        loadout,
        'team2'
      );
      this.state.addPlayer(p);
    }

    // Set initial active player (first alive worm of team 1)
    this.state.currentPlayerIndex = 0;
    this.state.lastPlayedIndex['team1'] = 0;
    this.updateMobileWeaponIcon(this.state.players[0]);

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
    
    const dtReal = (time - this.lastTime) / 1000;
    this.lastTime = time;

    try {
      const dtSim = Math.min(dtReal, 0.1);
      const dtTimer = Math.min(dtReal, 0.25);
      this.update(dtSim, dtTimer);
      this.render();
      this.postRender();
    } catch (e) {
      console.error('Game Loop Error in Presenter:', e);
    }

    requestAnimationFrame(this.loop.bind(this));
  }

  public update(dt: number, dtTimer: number = dt): void {
    if (this.isPaused) return;

    if (this.isRunning) {
      this.matchDuration += dtTimer;
    }

    // Only host computes physics and updates timers
    if (this.isRunning && this.isHost) {
      (this.state as any).matchDuration = this.matchDuration;
      // Find active player before physics step
      const currentPlayer = this.state.getCurrentPlayer();
      if (!currentPlayer) return;

      for (const proj of this.state.projectiles as any[]) {
        if (!proj || !proj.active) continue;
        if (proj.weaponId !== 'homing_missile') continue;
        if (proj.owner !== currentPlayer) continue;
        let dir = 0;
        if (this.activeInputs.has('left')) dir -= 1;
        if (this.activeInputs.has('right')) dir += 1;
        if (dir === 0) continue;
        const turnRate = Number(proj.homingTurnRate) || 3.0;
        const speed = Math.hypot(proj.vx || 0, proj.vy || 0);
        if (speed <= 1e-3) continue;
        const a = Math.atan2(proj.vy, proj.vx) + dir * turnRate * dt;
        proj.vx = Math.cos(a) * speed;
        proj.vy = Math.sin(a) * speed;
      }
      
      // Update Physics
      this.physics.update(this.state, dt);

      if (this.state.mode === 'aivai' && this.onPhysicsTrace) {
        this.physicsSampleAccum += dt;
        const wantsFast = this.state.projectiles.length > 0 || (this.state.brandLogos || []).length > 0;
        const sampleInterval = wantsFast ? 0.1 : 0.3;
        if (this.physicsSampleAccum >= sampleInterval) {
          this.physicsSampleAccum -= sampleInterval;
          const projs = this.state.projectiles.map((p: any, idx: number) => [p.weaponId, p.x, p.y, p.vx, p.vy, p.radius, idx]);
          const propsTopN = 8;
          const props = this.state.props
            .map((p: any, idx: number) => ({ p, idx, s: Math.hypot(p.vx || 0, p.vy || 0) }))
            .sort((a: any, b: any) => b.s - a.s)
            .slice(0, propsTopN)
            .map((it: any) => [it.p.x, it.p.y, it.p.vx, it.p.vy, it.p.radius, it.p.rotation, it.p.angularVelocity, it.idx]);
          const logos = (this.state.brandLogos || []).map((l: any, idx: number) => [l.x, l.y, l.vx, l.vy, l.angle, l.angularVelocity, l.collisionWidth, l.collisionHeight, l.isDynamic ? 1 : 0, l.touchedGround ? 1 : 0, idx]);
          const worms = this.state.players.map((w: any, idx: number) => [w.team, w.x, w.y, w.vx, w.vy, w.health, idx]);
          this.lastPhysSample = { t: this.matchDuration, projs, props, logos };
          this.onPhysicsTrace({
            type: 'physics_sample',
            t: this.matchDuration,
            projs,
            props,
            logos,
            worms
          });
        }
      }
      
      const turnStepTimer = stepTurn({
        mode: this.state.mode as any,
        hasFiredThisTurn: this.hasFiredThisTurn,
        isStable: false,
        turnTimeLeft: this.turnTimeLeft,
        dtTimer
      });
      this.turnTimeLeft = turnStepTimer.turnTimeLeft;
      this.state.turnTimeLeft = this.turnTimeLeft;
      this.state.hasFiredThisTurn = this.hasFiredThisTurn

      // Airdrop Logic
      this.state.airdropTimer -= dtTimer;
      if (this.state.airdropTimer <= 0) {
        this.spawnAirdrop();
        this.state.airdropTimer = 20 + Random.next() * 25; // 20 to 45 seconds
      }
      
      this.processActiveInputs(dt);

      const hasProjectiles = this.state.projectiles.length > 0;
      if (this.botTurnController) {
        this.botTurnController.update(this, hasProjectiles);
      }
      const isStable = this.state.projectiles.length === 0;
      const turnStep = stepTurn({
        mode: this.state.mode as any,
        hasFiredThisTurn: this.hasFiredThisTurn,
        isStable,
        turnTimeLeft: this.turnTimeLeft,
        dtTimer: 0
      });
      this.turnTimeLeft = turnStep.turnTimeLeft;
      this.state.turnTimeLeft = this.turnTimeLeft;
      this.state.hasFiredThisTurn = this.hasFiredThisTurn;
      if (turnStep.nextTurn) {
        this.nextTurn();
        return;
      }
      
      // Check game over
      const winner = this.checkGameOver();
      if (winner !== undefined) {
        this.isRunning = false;
        const t1Dmg = this.state.players.filter(p => p.team === 'team1').reduce((sum, p) => sum + p.damageDealt, 0);
        const t2Dmg = this.state.players.filter(p => p.team === 'team2').reduce((sum, p) => sum + p.damageDealt, 0);
        const stats = {
          p1Dmg: Math.round(t1Dmg),
          p2Dmg: Math.round(t2Dmg),
          matchDuration: this.matchDuration
        };
        if (this.onGameOver) this.onGameOver(winner === null ? 'draw' : winner, stats);
        return;
      }
    } else if (this.isRunning && !this.isHost) {
      // CLIENT MODE: Only process local inputs to send to host, and update camera
      // Local inputs are still collected in activeInputs, but we don't apply physics.
      // MultiplayerSync will send them.
      if (this.onClientTick) this.onClientTick(dt);
    }

    // Camera update happens for both host and client
    this.updateCamera(dt);

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

    // Apply Camera Shake
    if (this.state.cameraShakeTime > 0) {
      this.state.cameraShakeTime -= dt;
      if (this.state.cameraShakeTime > 0) {
        const shakeIntensity = 15 * (this.state.cameraShakeTime / 0.3); // up to 15px
        this.state.cameraX += (Random.next() - 0.5) * shakeIntensity;
        this.state.cameraY += (Random.next() - 0.5) * shakeIntensity;
      }
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

  private getMaxSpeed(player: any): number {
    return (17.5 * 1.3) * (player.speedMultiplier || 1);
  }

  private computeJumpImpulse(player: any): { vx: number; vy: number } {
    const maxSpeed = this.getMaxSpeed(player);
    const preVx = player.vx || 0;

    let dir = player.facingRight ? 1 : -1;
    if (this.activeInputs.has('left') || this.analogX < -0.1) dir = -1;
    else if (this.activeInputs.has('right') || this.analogX > 0.1) dir = 1;
    else if (Math.abs(preVx) > 1) dir = Math.sign(preVx);

    const runRatio = Math.min(1, Math.abs(preVx) / Math.max(1, maxSpeed));
    const minAngle = 10 * (Math.PI / 180);
    const maxAngle = 60 * (Math.PI / 180);
    const theta = minAngle + (maxAngle - minAngle) * runRatio;

    const baseSpeed = Math.abs(player.jumpForce) * 1.15;
    const speedScale = 1 + 0.45 * runRatio;
    const jumpSpeed = baseSpeed * speedScale;

    const horizontalBoost = 1.2;
    const vx = preVx * 0.95 + dir * jumpSpeed * Math.sin(theta) * horizontalBoost;
    const vy = -jumpSpeed * Math.cos(theta);
    return { vx, vy };
  }

  private focusCameraOn(x: number, y: number, duration: number = 0.6): void {
    this.cameraFreeMode = false;
    this.cameraDelayTimer = Math.max(0, duration);
    this.lastExplosionX = x;
    this.lastExplosionY = y;
  }

  private processActiveInputs(dt: number): void {
    const player = this.state.getCurrentPlayer();
    if (!player) return;

    // Halved speeds as per user request + floaty worms physics
    const moveForce = 100 * player.speedMultiplier; // pixels per second squared (acceleration)
    const maxSpeed = this.getMaxSpeed(player);
    const airControl = 0.3; // 30% control while in the air

    // --- Handle Aiming (Keyboard + Analog Joystick) ---
    // Slower aim speed (Decreased by 3x for desktop precision)
    const actualAimSpeed = Math.PI / 6; // rad/sec

    if (player.ropeActive) {
      const ropeRate = 220;
      if (Math.abs(this.analogY) > 0.1) {
        RopeTool.adjustLength(player, this.analogY * ropeRate * dt);
      } else {
        if (this.activeInputs.has('up')) RopeTool.adjustLength(player, -ropeRate * dt);
        if (this.activeInputs.has('down')) RopeTool.adjustLength(player, ropeRate * dt);
      }
    } else if (Math.abs(this.analogY) > 0.1) {
      const targetAngle = this.analogY * (Math.PI / 2);
      player.aimAngle += (targetAngle - player.aimAngle) * dt * 1.25;
      if (player.aimAngle < -Math.PI / 2) player.aimAngle = -Math.PI / 2;
      if (player.aimAngle > Math.PI / 2) player.aimAngle = Math.PI / 2;
    } else {
      if (this.activeInputs.has('up')) player.updateAim(-actualAimSpeed * dt);
      if (this.activeInputs.has('down')) player.updateAim(actualAimSpeed * dt);
    }

    if (this.activeInputs.has('fire')) {
      const weapon = player.getCurrentWeapon();
      const blockBurstWeapon = weapon ? (isBurstWeapon(weapon.id) && !canFireBurstWeapon(this.shotsFiredThisTurnByWeaponId, weapon.id, this.turnTimeLeft)) : false;
      if (blockBurstWeapon) {
        player.aimPower = 0;
      } else if (weapon && player.weaponCooldowns[weapon.id] <= 0) {
        if (weapon && isBurstWeapon(weapon.id) && weapon.chargeSpeed <= 0) {
          player.aimPower = 100;
          this.fireWeapon(player);
        } else {
          const rate = 100 * weapon.chargeSpeed;
          player.changePower(rate * dt);
          if (player.aimPower >= 100) {
            this.fireWeapon(player);
          }
          if (Math.random() < 0.1) AudioManager.playCharge(player.aimPower);
        }
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

    if (player.ropeActive) {
      const dir = isMovingLeft ? -1 : isMovingRight ? 1 : 0;
      if (dir !== 0) {
        player.facingRight = dir > 0;
        const pump = 240 * analogSpeedMod * (player.speedMultiplier || 1);
        RopeTool.pump(player, dir, pump, dt);
      }
    } else if (isMovingLeft) {
      player.facingRight = false;
      if (!player.isJumping) player.vx = -maxSpeed * analogSpeedMod;
      else player.vx -= moveForce * airControl * dt;
    } else if (isMovingRight) {
      player.facingRight = true;
      if (!player.isJumping) player.vx = maxSpeed * analogSpeedMod;
      else player.vx += moveForce * airControl * dt;
    }

    // Clamp air speed so they don't accelerate infinitely
    if (player.isJumping) {
      if (player.vx > maxSpeed * 2.2) player.vx = maxSpeed * 2.2;
      if (player.vx < -maxSpeed * 2.2) player.vx = -maxSpeed * 2.2;
    }
  }

  public render(): void {
    // This is overridden by main.ts
  }

  public postRender(): void {
    this.state.landscape.newCraters = [];
    this.state.landscape.newStamps = [];
  }

  public handleInput(action: string, isActive: boolean, isRemote: boolean = false, payload?: any): void {
    if (!this.isRunning) return;

    if (action === 'surrender' && isActive) {
      if (!isRemote && this.onLocalAction) {
        this.onLocalAction(action, true, payload);
      }
      
      // Determine who surrendered. If it's local, the enemy wins. If it's remote, we win.
      const winningTeam = isRemote ? this.localTeam : (this.localTeam === 'team1' ? 'team2' : 'team1');
      this.isRunning = false;
      
      const t1Dmg = this.state.players.filter(p => p.team === 'team1').reduce((sum, p) => sum + p.damageDealt, 0);
      const t2Dmg = this.state.players.filter(p => p.team === 'team2').reduce((sum, p) => sum + p.damageDealt, 0);
      const stats = {
        p1Dmg: Math.round(t1Dmg),
        p2Dmg: Math.round(t2Dmg),
        isTechnical: true,
        matchDuration: this.matchDuration
      };
      
      if (this.onGameOver) this.onGameOver(winningTeam, stats);
      return;
    }

    if (action === 'spawnAirdrop' && isActive) {
      if (this.isHost) {
        this.spawnAirdrop();
      }
      return;
    }
    
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

    // DUMB CLIENT: If we are not the host, we ONLY send the input to the host via onLocalAction above.
    // We do NOT apply it to the local physics/state. The host will compute it and send the new state back.
    // Except for UI-only actions like 'switchWorm' which we might want to predict, but for safety let's skip them or only do local UI.
    // Actually, 'switchWorm' needs to be authorized by host too.
    if (!this.isHost && !isRemote) {
      // We still want to let the UI update if needed, but we shouldn't change physics state.
      // We return here so we don't modify the player object.
      // Wait, if it's an analog stick move, it comes through handleAnalogInput, which isn't 'action'.
      return;
    }

    const player = this.state.getCurrentPlayer();
    if (!player) return;

    if (isActive) {
      this.activeInputs.add(action);
    } else {
      this.activeInputs.delete(action);
    }

    switch (action) {
      case 'switchWormCycle':
        if (isActive) {
          const allowAfterFire = this.state.mode === 'training';
          if (this.hasFiredThisTurn && !allowAfterFire) break;

          const team = player.team;
          const aliveTeamIndices = this.state.players
            .map((p, idx) => ({ p, idx }))
            .filter(({ p }) => p.team === team && p.health > 0)
            .map(({ idx }) => idx);

          if (aliveTeamIndices.length <= 1) break;

          const curIdx = this.state.currentPlayerIndex;
          const pos = aliveTeamIndices.indexOf(curIdx);
          const next = aliveTeamIndices[(pos >= 0 ? pos + 1 : 0) % aliveTeamIndices.length];
          if (next === curIdx) break;

          this.state.currentPlayerIndex = next;
          const nextWorm = this.state.players[next];
          this.updateMobileWeaponIcon(nextWorm);
          this.focusCameraOn(nextWorm.x, nextWorm.y);
        }
        break;
      case 'jump':
        if (isActive && !player.isJumping) {
          player.isJumping = true;
          const impulse = this.computeJumpImpulse(player);
          player.vx = impulse.vx;
          player.vy = impulse.vy;

          // Play jump sound
          if (this.physics.onJump) this.physics.onJump();
          AudioManager.playJump();
        }
        break;
      case 'fire':
        if (player.getCurrentEquipmentId() === 'ninja_rope') {
          if (isActive) {
            if (player.ropeActive) RopeTool.detach(player);
            else RopeTool.tryAttach(player, this.state);
          }
          break;
        }
        if (isActive) {
          if (player.aimPower === 0) player.aimPower = 1;
        } else {
          this.fireWeapon(player);
        }
        break;
      case 'switch':
        if (isActive && typeof payload === 'number') {
          player.setEquipmentIndex(payload);
          this.updateMobileWeaponIcon(player);
        } else if (isActive) {
          const allowAfterFire = this.state.mode === 'training';
          if (player.ropeActive) RopeTool.detach(player);
          if (this.hasFiredThisTurn && !allowAfterFire) break

          player.switchEquipment();
          this.updateMobileWeaponIcon(player);
        }
        break;
      case 'switchWorm':
        if (isActive && typeof payload === 'number') {
          const allowAfterFire = this.state.mode === 'training';
          if (this.hasFiredThisTurn && !allowAfterFire) break;
          const targetWorm = this.state.players[payload];
          if (!targetWorm) break;
          if (targetWorm.health <= 0) break;
          if (targetWorm.team !== player.team) break;
          this.state.currentPlayerIndex = payload;
          this.updateMobileWeaponIcon(targetWorm);
          this.focusCameraOn(targetWorm.x, targetWorm.y);
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
    const viewW = canvasWidth / this.state.zoom;
    const viewH = canvasHeight / this.state.zoom;
    const maxCamX = Math.max(0, this.state.width - viewW);
    const maxCamY = Math.max(0, this.state.height - viewH);

    if (viewW >= this.state.width) {
      this.state.cameraX = (this.state.width - viewW) / 2;
    } else {
      if (this.state.cameraX < 0) this.state.cameraX = 0;
      if (this.state.cameraX > maxCamX) this.state.cameraX = maxCamX;
    }

    if (viewH >= this.state.height) {
      this.state.cameraY = (this.state.height - viewH) / 2;
    } else {
      if (this.state.cameraY < 0) this.state.cameraY = 0;
      if (this.state.cameraY > maxCamY) this.state.cameraY = maxCamY;
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

    if (weapon.id === 'grenade') {
      if (!trySpendGrenade(this.state, (player as any).team)) return;
    }

    if (isBurstWeapon(weapon.id) && !canFireBurstWeapon(this.shotsFiredThisTurnByWeaponId, weapon.id, this.turnTimeLeft)) return;
    
    this.hasFiredThisTurn = true;
    this.state.hasFiredThisTurn = true;
    
    AudioManager.playShoot(weapon.id);

    // Apply cooldown (Dynamic: based on shot power, min 20% of base cooldown)
    const powerRatio = Math.max(0.2, power / 100);
    const actualCooldown = weapon.cooldown * powerRatio;
    player.weaponCooldowns[weapon.id] = actualCooldown;
    player.maxWeaponCooldowns[weapon.id] = actualCooldown;

    // Calculate vector based on angle and power
    // Determine global Aim Angle
      // aimAngle goes from -PI/2 (up) to PI/2 (down).
      // We assume aimAngle 0 is pointing "Forward".
      let globalAimAngle = player.aimAngle;
      
      // If facing left, the bullet should go left.
      // -PI/2 is up. If we face left, up is still up (-PI/2).
      // 0 is right. If we face left, we want it to be PI (left).
      // PI/2 is down. If we face left, down is still down (PI/2).
      // The transformation for facing left:
      if (!player.facingRight) {
        // Mirrored angle across Y-axis:
        globalAimAngle = Math.PI - player.aimAngle;
      }

      const baseRad = globalAimAngle;
    const speed = power * 4.2 * (weapon.speedModifier || 1);

    const gunLength = 25;
    const muzzleX = player.x + Math.cos(baseRad) * gunLength;
    const muzzleY = (player.y - player.height / 2) + Math.sin(baseRad) * gunLength;
    if (!this.state.particles) this.state.particles = [];
    for (let i = 0; i < 6; i++) {
      const s = 120 + Random.next() * 180;
      const spread = 0.18;
      const rad = baseRad + (Random.next() - 0.5) * spread;
      this.state.particles.push({
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(rad) * s,
        vy: Math.sin(rad) * s,
        life: 0.08 + Random.next() * 0.06,
        maxLife: 0.14,
        color: weapon.color || '#ffffff',
        size: 1.5 + Random.next() * 2.5
      });
    }

    const hitscanRange = typeof (weapon as any).hitscanRange === 'number' ? Number((weapon as any).hitscanRange) : 0;
    const isHitscan = weapon.kind === 'hitscan' && hitscanRange > 0;
    const isStream = weapon.kind === 'stream';

    if (isHitscan) {
      const crater = weapon.crater !== false;
      const shots = Math.max(1, Math.floor(weapon.projectilesPerShot || 1));
      for (let i = 0; i < shots; i++) {
        const spreadRad = (weapon.spread || 0) * (Math.PI / 180);
        const rad = baseRad + (spreadRad > 0 ? (Random.next() - 0.5) * spreadRad : 0);
        const hit = this.raycastHitscan(player, rad, hitscanRange);
        if (hit) {
          this.physics.explodeAt(
            this.state,
            hit.x,
            hit.y,
            { weaponId: weapon.id, damage: weapon.damage, explosionRadius: weapon.explosionRadius, knockback: weapon.knockback, crater, owner: player },
            1.0
          );
        }
        incrementBurst(this.shotsFiredThisTurnByWeaponId, weapon.id, 1);
      }
      return;
    }

    if (isStream) {
      const ticks = Math.max(1, Math.floor((weapon as any).flameTicks || 6));
      const coneShots = Math.max(1, Math.floor(ticks));
      const crater = weapon.crater !== false;
      for (let i = 0; i < coneShots; i++) {
        const spreadRad = (weapon.spread || 0) * (Math.PI / 180);
        const rad = baseRad + (spreadRad > 0 ? (Random.next() - 0.5) * spreadRad : 0);
        const hit = this.raycastHitscan(player, rad, weapon.maxRange || 520);
        if (!hit) continue;
        const radiusScale = 1 / Math.sqrt(coneShots);
        this.physics.explodeAt(
          this.state,
          hit.x,
          hit.y,
          { weaponId: weapon.id, damage: weapon.damage * radiusScale, explosionRadius: weapon.explosionRadius * radiusScale, knockback: weapon.knockback * radiusScale, crater, owner: player },
          1.0
        );
      }
      return;
    }

    let pCount = Math.max(1, weapon.projectilesPerShot || 1);
    if (weapon.id === 'minigun') {
      const used = burstUsed(this.shotsFiredThisTurnByWeaponId, weapon.id);
      const remaining = Math.max(0, BURST_SHOTS_PER_TURN - used);
      if (remaining <= 0) return;
      pCount = Math.min(pCount, remaining);
    }
    const radiusScale = pCount > 1 ? 1 / Math.sqrt(pCount) : 1;
    const projWeapon = {
      ...weapon,
      damage: weapon.damage / pCount,
      explosionRadius: weapon.explosionRadius * radiusScale,
      knockback: weapon.knockback * radiusScale
    };

    for (let i = 0; i < pCount; i++) {
      this.spawnSingleProjectile(player, projWeapon, speed, baseRad);
    }

    incrementBurst(this.shotsFiredThisTurnByWeaponId, weapon.id, pCount);
  }

  private raycastHitscan(player: Worm, globalAimAngle: number, maxDist: number): { x: number; y: number } | null {
    const gunLength = 25;
    const originX = player.x;
    const originY = (player.y - player.height / 2);
    const dirX = Math.cos(globalAimAngle);
    const dirY = Math.sin(globalAimAngle);
    const startX = originX + dirX * gunLength;
    const startY = originY + dirY * gunLength;

    const step = 4;
    let bestPlayer: Worm | null = null;
    let bestDist = Infinity;
    let bestPoint: { x: number; y: number } | null = null;

    for (let d = 0; d <= maxDist; d += step) {
      const x = startX + dirX * d;
      const y = startY + dirY * d;
      if (x < 0 || x >= this.state.width || y < 0 || y >= this.state.height) break;
      if (this.state.landscape.getMaterial(Math.floor(x), Math.floor(y)) > 0) {
        return { x, y };
      }
      for (const p of this.state.players) {
        if (p === player) continue;
        if (p.health <= 0) continue;
        const r = p.width / 2;
        const dx = x - p.x;
        const dy = y - p.y;
        const dd = Math.hypot(dx, dy);
        if (dd <= r + 2) {
          if (d < bestDist) {
            bestDist = d;
            bestPlayer = p;
            bestPoint = { x, y };
          }
        }
      }
      if (bestPlayer && d > bestDist + 8) break;
    }

    return bestPoint;
  }

  private spawnSingleProjectile(player: Worm, weapon: any, speed: number, baseRadOverride?: number): void {
    let globalAimAngle = player.aimAngle;
    if (!player.facingRight) {
      globalAimAngle = Math.PI - player.aimAngle;
    }
    const baseRad = typeof baseRadOverride === 'number' ? baseRadOverride : globalAimAngle;

    const gunLength = 25;
    const originX = player.x;
    const originY = (player.y - player.height / 2);
    const dirX = Math.cos(baseRad);
    const dirY = Math.sin(baseRad);
    let startX = originX + dirX * gunLength;
    let startY = originY + dirY * gunLength;
    const pr = Math.max(1, Math.floor(((weapon.id === 'grenade') ? 6 : 3) * 0.8));
    if (terrainHitCircle(this.state.landscape, startX, startY, pr).hit) {
      let found = false;
      for (let t = gunLength; t >= 0; t -= 1) {
        const cx = originX + dirX * t;
        const cy = originY + dirY * t;
        if (!terrainHitCircle(this.state.landscape, cx, cy, pr).hit) {
          startX = cx;
          startY = cy;
          found = true;
          break;
        }
      }
      if (!found) {
        startX = originX;
        startY = originY;
      }
    }

    let rad = baseRad;
    if (weapon.spread > 0) {
      const spreadRad = weapon.spread * (Math.PI / 180);
      rad += (Random.next() - 0.5) * spreadRad;
    }

    const vx = Math.cos(rad) * speed;
    const vy = Math.sin(rad) * speed;
    const proj = weapon.id === 'grenade'
      ? GrenadeWeapon.createProjectile(startX, startY, vx, vy, weapon as any)
      : new Projectile(startX, startY, vx, vy, weapon as any);
    if (weapon.id === 'homing_missile') {
      (proj as any).homingTurnRate = typeof weapon.homingTurnRate === 'number' ? weapon.homingTurnRate : 3.0;
    }
    (proj as any).netId = this.nextProjectileNetId++;
    (proj as any).owner = player;
    this.state.projectiles.push(proj);
  }

  private spawnAirdrop() {
    let sprite = '';
    let width = 100;
    let height = 60;
    let hardness = 10;
    
    // Check if custom logos from DB are available
    if (this.state.availableLogos && this.state.availableLogos.length > 0) {
      const logo = this.state.availableLogos[Random.nextInt(0, this.state.availableLogos.length - 1)];
      sprite = logo.image_data; // This contains the base64
      width = logo.width || 100;
      height = logo.height || 60;
      hardness = logo.hardness || 10;
    } else {
      // Fallback to text_to_image URLs
      const logos = [
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20colorful%20supermarket%20logo%20saying%20MEGA%20MART%20transparent%20background&image_size=landscape_16_9',
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20coffee%20shop%20logo%20with%20a%20star%20saying%20KOSTAR%20transparent%20background&image_size=landscape_16_9',
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20fast%20food%20logo%20with%20golden%20M%20saying%20MUGDONALDS%20transparent%20background&image_size=landscape_16_9',
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20burger%20restaurant%20logo%20saying%20BURGO%20BURGER%20transparent%20background&image_size=landscape_16_9'
      ];
      sprite = logos[Random.nextInt(0, logos.length - 1)];
    }

    const phi = 0.61803398875;
    const i = (this.state.airdropIndex || 0) + 1;
    this.state.airdropIndex = i;
    const u = (this.state.airdropOffset + i * phi) % 1;
    const spawnX = 150 + u * (this.state.landscape.width - 300);
    const spawnY = -100; // Above screen
    
    const vx = (Random.next() - 0.5) * 60; // -30 to +30
    const vy = 0;
    const angle = (Random.next() - 0.5) * 0.5; // slight initial tilt
    const angularVelocity = (Random.next() - 0.5) * 2;

    const brandLogo = new BrandLogo(sprite, spawnX, spawnY, vx, vy, angle, angularVelocity);
    brandLogo.width = width * 2;
    brandLogo.height = height * 2;
    brandLogo.hardness = hardness;
    brandLogo.maxHealth = Math.max(10, hardness * 10);
    brandLogo.health = brandLogo.maxHealth;
    (brandLogo as any).airdropPhysics = this.state.airdropPhysics;
    
    if (!this.state.brandLogos) this.state.brandLogos = [];
    this.state.brandLogos.push(brandLogo);
  }

  public updateMobileWeaponIcon(player: any) {
    const iconEl = document.getElementById('current-weapon-icon') as HTMLImageElement;
    if (iconEl && player) {
      const equipmentId = player.getCurrentEquipmentId?.() || 'bazooka';
      const def = getEquipmentDefinition(equipmentId);
      if (!def) return;

      const selectedUrl = def.icon.endsWith('.1.png') ? def.icon.replace('.1.png', '.2.png') : def.icon;
      const url = selectedUrl;

      if ((window as any).getTransparentSprite) {
        (window as any).getTransparentSprite(url, 60, 60, (newUrl: string) => {
          iconEl.src = newUrl;
        });
      } else {
        iconEl.src = url;
      }
    }
  }

  public nextTurn() {
    const totalPlayers = this.state.players.length;
    if (totalPlayers === 0) return;

    this.activeInputs.clear();
    this.analogX = 0;
    this.analogY = 0;
    this.shotsFiredThisTurnByWeaponId = {};

    this.hasFiredThisTurn = false;
    this.state.hasFiredThisTurn = false;

    // Keep track of which team went last
    const currentPlayer = this.state.getCurrentPlayer();
    if (currentPlayer?.ropeActive) {
      RopeTool.detach(currentPlayer);
    }
    const currentTeam = currentPlayer ? currentPlayer.team : 'team1';
    
    // Only switch teams if it's not training mode, otherwise just loop through team 1
    const nextTeam = (this.state.mode === 'training') ? 'team1' : (currentTeam === 'team1' ? 'team2' : 'team1');

    // Find the next worm for the NEXT team
    let nextIndex = -1;
    let attempts = 0;
    
    // In order to not just keep jumping to the same worm, we need to find the NEXT worm 
    // that belongs to `nextTeam` and is alive. 
    // BUT we also need to remember the turn order within that team.
    // Right now, `currentPlayerIndex` might belong to `team1`. If we want the next `team2` worm,
    // we should really keep a separate index for each team, OR just iterate from the last used index
    // of `nextTeam`.
    // Simple approach: start searching from `currentPlayerIndex + 1` wrapping around.
    // This naturally cycles through all worms, effectively alternating teams if worms are interleaved,
    // but they are NOT interleaved in the array (team1 is 0,1,2; team2 is 3,4,5).
    // So if team1 finishes, searching from index 0+1=1 finds team1 again. 
    // We MUST search for the next alive worm of `nextTeam`.
    
    // To ensure fair cycling within a team, we need to know the *last* worm that played for that team.
    // We can just find the *first* alive worm of `nextTeam` that appears *after* the last worm that played for `nextTeam`.
    
    // If we haven't tracked this, we can just find the NEXT worm of the NEXT team starting from `currentPlayerIndex + 1` 
    // Wait, if team1 is 0,1,2 and team2 is 3,4,5. 
    // Player 0 (team1) plays. Next is team2. Search from 1. 1, 2 are team1. 3 is team2! Next is 3.
    // Player 3 (team2) plays. Next is team1. Search from 4. 4, 5 are team2. 0 is team1! Next is 0.
    // Player 0 plays again? No, we want player 1!
    // Ah, because search from 4 wraps to 0. It finds 0 again.
    
    // Correct logic: find the NEXT worm of the target team, relative to the LAST worm that played for that team.
    // Since we don't have that easily stored, we can calculate it:
    // Actually, a simple fix is to keep `teamTurnIndex[team]` in GameState, but we can also just find the NEXT worm of `nextTeam` 
    // starting from `lastPlayedIndex[nextTeam] + 1`.
    
    if (this.state.lastPlayedIndex === undefined) {
      this.state.lastPlayedIndex = { 'team1': -1, 'team2': -1 };
    }
    
    this.state.lastPlayedIndex[currentTeam] = this.state.currentPlayerIndex;
    
    let searchIndex = (this.state.lastPlayedIndex[nextTeam] + 1) % totalPlayers;
    
    while (attempts < totalPlayers) {
      const p = this.state.players[searchIndex];
      if (p.team === nextTeam && p.health > 0) {
        nextIndex = searchIndex;
        break;
      }
      searchIndex = (searchIndex + 1) % totalPlayers;
      attempts++;
    }

    // If the next team has no alive worms, try to find ANY alive worm (game over condition usually catches this first)
    if (nextIndex === -1) {
      searchIndex = (this.state.currentPlayerIndex + 1) % totalPlayers;
      attempts = 0;
      while (attempts < totalPlayers) {
        const p = this.state.players[searchIndex];
        if (p.health > 0) {
          nextIndex = searchIndex;
          break;
        }
        searchIndex = (searchIndex + 1) % totalPlayers;
        attempts++;
      }
    }

    // Update last played index ONLY if we successfully found a next worm
    if (nextIndex !== -1) {
      this.state.currentPlayerIndex = nextIndex;
      // We found a worm for nextTeam, so we will update lastPlayedIndex for nextTeam right now?
      // No, we update lastPlayedIndex[currentTeam] to be currentPlayerIndex, which we did.
      const player = this.state.getCurrentPlayer();
      if (player) {
        this.updateMobileWeaponIcon(player);
        player.vx = 0;
        player.vy = 0;
        player.isJumping = false;
      }
    }

    this.turnTimeLeft = this.maxTurnTime;
    this.state.turnTimeLeft = this.turnTimeLeft;
    this.state.wind = (Random.next() - 0.5) * 40;
  }
}
