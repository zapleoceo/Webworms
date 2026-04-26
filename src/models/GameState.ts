import { Landscape } from './Landscape';
import { Worm } from './Worm';
import { Projectile } from './Projectile';
import { Explosion } from './Explosion';
import { PhysicsProp } from './PhysicsProp';

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number; // 0 to 1
  maxLife: number;
}

export class GameState {
  public landscape: Landscape;
  public players: Worm[] = [];
  public projectiles: Projectile[] = [];
  public explosions: Explosion[] = [];
  public props: PhysicsProp[] = [];
  public floatingTexts: FloatingText[] = [];
  public currentPlayerIndex: number = 0;
  
  public width: number;
  public height: number;

  public snowflakes: {x: number, y: number, vx: number, vy: number}[] = [];

  public cameraX: number = 0;
  public cameraY: number = 0;
  public zoom: number = 1;
  
  public wind: number = 0; // Wind affecting projectiles
  public windTarget: number = 0; // Target for smooth random transition

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
