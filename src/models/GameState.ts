import { Landscape } from './Landscape';
import { Worm } from './Worm';
import { Projectile } from './Projectile';
import { Explosion } from './Explosion';

export class GameState {
  public landscape: Landscape;
  public players: Worm[] = [];
  public projectiles: Projectile[] = [];
  public explosions: Explosion[] = [];
  public currentPlayerIndex: number = 0;
  public width: number;
  public height: number;
  public wind: number = 0; // Wind affecting projectiles

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.landscape = new Landscape(width, height);
  }

  public addPlayer(worm: Worm): void {
    this.players.push(worm);
  }

  public getCurrentPlayer(): Worm | null {
    if (this.players.length === 0) return null;
    return this.players[this.currentPlayerIndex];
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
