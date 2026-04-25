import { GameState } from '../models/GameState';
import { Projectile } from '../models/Projectile';
import { MathUtils } from '../utils/MathUtils';

export class PhysicsEngine {
  public gravity: number = 200; // pixels per second squared

  public update(state: GameState, dt: number): void {
    // Update players
    for (const worm of state.players) {
      this.updateWorm(worm, state, dt);
    }

    // Update projectiles
    for (const proj of state.projectiles) {
      if (proj.active) {
        this.updateProjectile(proj, state, dt);
      }
    }
    
    // Clean up inactive projectiles
    state.projectiles = state.projectiles.filter(p => p.active);
  }

  private updateWorm(worm: any, state: GameState, dt: number): void {
    // Apply gravity
    worm.vy += this.gravity * dt;
    
    // Update position
    worm.x += worm.vx * dt;
    worm.y += worm.vy * dt;

    // Apply friction to x velocity
    worm.vx *= 0.9;

    // Check landscape collision
    // Basic ground collision: check points at the bottom of the worm
    const bottomY = Math.floor(worm.y + worm.height / 2);
    const centerX = Math.floor(worm.x);

    // Stop falling if hitting ground
    if (state.landscape.isSolid(centerX, bottomY)) {
      worm.vy = 0;
      worm.isJumping = false;
      
      // Push up slightly out of the ground
      let y = bottomY;
      while (state.landscape.isSolid(centerX, y) && y > 0) {
        y--;
      }
      worm.y = y - worm.height / 2;
    }

    // Screen bounds
    if (worm.x < 0) { worm.x = 0; worm.vx = 0; }
    if (worm.x > state.width) { worm.x = state.width; worm.vx = 0; }
    if (worm.y > state.height) {
      worm.takeDamage(100); // death by falling off map
      worm.y = state.height;
    }
  }

  private updateProjectile(proj: Projectile, state: GameState, dt: number): void {
    proj.vy += this.gravity * dt;
    proj.vx += state.wind * dt; // Apply wind
    
    proj.updatePosition(dt);

    // Collision with landscape
    if (state.landscape.isSolid(Math.floor(proj.x), Math.floor(proj.y))) {
      this.explode(proj, state);
      return;
    }

    // Collision with players
    for (const player of state.players) {
      if (MathUtils.distance(proj.x, proj.y, player.x, player.y) < player.width + proj.radius) {
        this.explode(proj, state);
        return;
      }
    }

    // Out of bounds
    if (proj.y > state.height + 100 || proj.x < -100 || proj.x > state.width + 100) {
      proj.active = false;
    }
  }

  private explode(proj: Projectile, state: GameState): void {
    proj.active = false;
    // Carve landscape
    state.landscape.createCrater(Math.floor(proj.x), Math.floor(proj.y), proj.explosionRadius);

    // Damage nearby players
    for (const player of state.players) {
      const dist = MathUtils.distance(proj.x, proj.y, player.x, player.y);
      if (dist <= proj.explosionRadius + player.width) {
        // Simple damage falloff
        const damageRatio = 1 - (dist / (proj.explosionRadius + player.width));
        player.takeDamage(proj.damage * damageRatio);
        
        // Add knockback
        const dx = player.x - proj.x;
        const dy = player.y - proj.y;
        const norm = Math.sqrt(dx*dx + dy*dy) || 1;
        player.vx += (dx / norm) * 150 * damageRatio;
        player.vy -= 150 * damageRatio; // push up
        player.isJumping = true;
      }
    }
  }
}
