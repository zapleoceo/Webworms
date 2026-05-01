import { Landscape } from './Landscape';
import { Worm } from './Worm';
import { Projectile } from './Projectile';
import { Explosion } from './Explosion';
import { PhysicsProp } from './PhysicsProp';
import { BrandLogo } from './BrandLogo';
import type { AirdropPhysicsConfig } from '../physics/AirdropConfig';
import type { BotConfig } from '../ai/BotConfig';
import type { AIDifficulty } from '../ai/AIDifficulty';

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number; // 0 to 1
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export class GameState {
  public landscape!: Landscape;
  public players: Worm[] = [];
  public currentPlayerIndex: number = 0;
  public projectiles: Projectile[] = [];
  public explosions: Explosion[] = [];
  public props: PhysicsProp[] = [];
  public brandLogos: BrandLogo[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public teamAmmo: Record<'team1' | 'team2', { grenade: number }> = { team1: { grenade: Infinity }, team2: { grenade: Infinity } };
  
  public width: number;
  public height: number;
  public mapSeed?: number;
  public mapData?: string; // Add mapData field

  public snowflakes: {x: number, y: number, vx: number, vy: number}[] = [];

  public cameraX: number = 0;
  public cameraY: number = 0;
  public zoom: number = 1;
  
  public wind: number = 0; // Wind affecting projectiles
  public windTarget: number = 0; // Target for smooth random transition
  public hasFiredThisTurn: boolean = false;
  public turnTimeLeft: number = 30;
  public mode: string = 'training';
  public availableLogos: any[] = [];
  public airdropTimer: number = 60;
  public airdropIndex: number = 0;
  public airdropOffset: number = 0;
  public airdropPhysics?: AirdropPhysicsConfig;
  public botConfig?: BotConfig;
  public aiDifficulty?: AIDifficulty;
  public cameraShakeTime: number = 0;
  public lastPlayedIndex?: { [team: string]: number };

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.landscape = new Landscape(width, height);
  }

  public addPlayer(worm: Worm): void {
    this.players.push(worm);
  }

  public getAlivePlayers(team: string): Worm[] {
    return this.players.filter(p => p.team === team && p.health > 0);
  }

  public getCurrentPlayer(): Worm | null {
    if (this.players.length === 0) return null;
    // currentPlayerIndex points to the active worm
    return this.players[this.currentPlayerIndex] || null;
  }

  public nextTurn(): void {
    if (this.players.length === 0) return;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    // Randomize wind
    this.wind = (Math.random() - 0.5) * 100;
  }

  public addProjectile(proj: Projectile): void {
    this.projectiles.push(proj);
  }
}
