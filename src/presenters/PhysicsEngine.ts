import { GameState } from '../models/GameState';
import { Projectile } from '../models/Projectile';
import { Explosion } from '../models/Explosion';
import { MathUtils } from '../utils/MathUtils';

export class PhysicsEngine {
  public gravity: number = 200; // pixels per second squared
  public safeFallSpeed: number = 280; // Safe landing speed
  public fallDamageMultiplier: number = 0.2; // Damage per extra speed unit
  public onExplode?: () => void;

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

    // Smoothly transition wind to target
    if (Math.random() < 0.01) { // Random chance to change wind direction every frame
      state.windTarget = (Math.random() - 0.5) * 150; // Random wind up to +/- 75 px/s
    }
    state.wind += (state.windTarget - state.wind) * dt * 0.5; // Lerp wind

    // Update explosions
    for (const exp of state.explosions) {
      exp.update(dt);
    }
    state.explosions = state.explosions.filter(e => e.life > 0);

    // Update dynamic props
    this.updateProps(state, dt);

    // Handle worm-to-worm collisions (Heavy Pushing)
    this.handleWormCollisions(state);
    
    // Handle worm-to-prop collisions (Kinetic damage, falling)
    this.handleWormPropCollisions(state);
    
    // Cleanup dead props
    state.props = state.props.filter(p => p.health > 0);
  }

  private updateProps(state: GameState, dt: number): void {
    for (const prop of state.props) {
      if (prop.isSettled) {
        // Quick check to see if ground under it disappeared
        const bottomY = Math.floor(prop.y + prop.radius + 1);
        if (!state.landscape.isSolid(Math.floor(prop.x), bottomY)) {
          prop.isSettled = false;
        } else {
          continue;
        }
      }

      prop.vy += this.gravity * dt;
      prop.x += prop.vx * dt;
      prop.y += prop.vy * dt;
      prop.rotation += prop.angularVelocity * dt;

      const cx = Math.floor(prop.x);
      const bottomY = Math.floor(prop.y + prop.radius);

      // Map bounds
      if (prop.x < prop.radius) { prop.x = prop.radius; prop.vx *= -prop.bounce; }
      if (prop.x > state.width - prop.radius) { prop.x = state.width - prop.radius; prop.vx *= -prop.bounce; }
      if (prop.y > state.height) { prop.isSettled = true; continue; }

      // Terrain collision
      if (state.landscape.isSolid(cx, bottomY)) {
        // Push out
        let y = bottomY;
        while (state.landscape.isSolid(cx, y) && y > 0) {
          y--;
        }
        prop.y = y - prop.radius;

        // Bounce
        prop.vy = -prop.vy * prop.bounce;
        prop.vx *= prop.friction;

        // Spin
        prop.angularVelocity = prop.vx * 0.05;

        // Settle if slow
        if (Math.abs(prop.vy) < 15 && Math.abs(prop.vx) < 5) {
          prop.vy = 0;
          prop.vx = 0;
          prop.angularVelocity = 0;
          prop.isSettled = true;
        } else if (Math.abs(prop.vy) > 200) {
          // Prop takes fall damage if hitting ground hard
          prop.takeDamage((Math.abs(prop.vy) - 200) * 0.1);
        }
      }
    }
  }

  private handleWormPropCollisions(state: GameState): void {
    for (const worm of state.players) {
      if (worm.health <= 0) continue;
      
      for (const prop of state.props) {
        const dist = MathUtils.distance(worm.x, worm.y, prop.x, prop.y);
        const minDist = worm.width / 2 + prop.radius;
        
        if (dist < minDist && dist > 0) {
          // Overlapping! Positional correction
          const overlap = minDist - dist;
          const nx = (worm.x - prop.x) / dist;
          const ny = (worm.y - prop.y) / dist;
          
          // Prop is heavy, worm moves out of the way more
          worm.x += nx * overlap * 0.8;
          worm.y += ny * overlap * 0.8;
          prop.x -= nx * overlap * 0.2;
          prop.y -= ny * overlap * 0.2;

          // Kinetic damage calculation
          const relVx = prop.vx - worm.vx;
          const relVy = prop.vy - worm.vy;
          const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);

          // If crash is fast enough, apply damage
          if (relSpeed > 100) {
            let rawDamage = (relSpeed - 100) * 0.1;
            // Cap kinetic damage to never exceed a direct projectile hit (25)
            if (rawDamage > 24) rawDamage = 24; 
            
            worm.takeDamage(rawDamage);
            prop.takeDamage(rawDamage * 0.5); // Prop also takes some damage from hitting the worm
          }

          // Exchange momentum
          worm.vx += nx * relSpeed * 0.5;
          worm.vy += ny * relSpeed * 0.5;
          prop.vx -= nx * relSpeed * 0.1;
          prop.vy -= ny * relSpeed * 0.1;
        }
      }
    }
  }
  private handleWormCollisions(state: GameState): void {
    for (let i = 0; i < state.players.length; i++) {
      for (let j = i + 1; j < state.players.length; j++) {
        const p1 = state.players[i];
        const p2 = state.players[j];
        
        // Skip dead worms
        if (p1.health <= 0 || p2.health <= 0) continue;

        const dist = MathUtils.distance(p1.x, p1.y, p2.x, p2.y);
        const minDist = p1.width / 2 + p2.width / 2;

        if (dist < minDist && dist > 0) {
          // Overlapping! Apply heavy pushing
          const overlap = minDist - dist;
          const nx = (p1.x - p2.x) / dist;
          const ny = (p1.y - p2.y) / dist;
          
          // Physically separate them (50/50 split of the overlap)
          p1.x += nx * overlap * 0.5;
          p1.y += ny * overlap * 0.5;
          p2.x -= nx * overlap * 0.5;
          p2.y -= ny * overlap * 0.5;

          // Momentum transfer (heavy pushing makes initiator lose speed)
          const relVx = p1.vx - p2.vx;
          
          // The pusher loses most of their momentum, the pushed gains a little
          p1.vx -= relVx * 0.8;
          p2.vx += relVx * 0.2;
        }
      }
    }
  }

  private updateWorm(worm: any, state: GameState, dt: number): void {
    // Apply gravity
    worm.vy += this.gravity * dt;
    
    // Attempt Horizontal Movement (with slope logic)
    const dx = worm.vx * dt;
    if (dx !== 0) {
      worm.x += dx;
      
      // Screen bounds with 5px padding (clamp before checking terrain to avoid infinite push-up bug)
      if (worm.x < 5) { worm.x = 5; worm.vx = 0; }
      if (worm.x > state.width - 5) { worm.x = state.width - 5; worm.vx = 0; }

      const cx = Math.floor(worm.x);
      const bottomY = Math.floor(worm.y + worm.height / 2);

      // Slope limit check
      if (state.landscape.isSolid(cx, bottomY)) {
        let step = 0;
        const maxStep = 3; // Allow climbing up to ~60 degree slope (approx 3px up for 1-2px across)
        
        while (step <= maxStep && state.landscape.isSolid(cx, bottomY - step)) {
          step++;
        }

        if (step <= maxStep) {
          // Valid slope, step up
          worm.y -= step;
        } else {
          // Too steep! Hit a wall. Revert X movement and kill horizontal speed
          worm.x -= dx;
          worm.vx = 0;
        }
      }
    }

    // Attempt Vertical Movement
    const dy = worm.vy * dt;
    worm.y += dy;
    
    const cx = Math.floor(worm.x);
    let bottomY = Math.floor(worm.y + worm.height / 2);

    // Ground collision (falling)
    if (worm.vy >= 0 && state.landscape.isSolid(cx, bottomY)) {
      // Push up to exactly the surface level (no infinite loops)
      while (state.landscape.isSolid(cx, bottomY) && bottomY > 0) {
        bottomY--;
      }
      worm.y = bottomY - worm.height / 2;

      // Fall Damage Calculation (check speed BEFORE resetting it)
      if (worm.vy > this.safeFallSpeed) {
        const damage = (worm.vy - this.safeFallSpeed) * this.fallDamageMultiplier;
        worm.takeDamage(damage);
      }

      worm.vy = 0;
      worm.isJumping = false;
    } 
    // Ceiling collision (jumping up into something)
    else if (worm.vy < 0 && state.landscape.isSolid(cx, Math.floor(worm.y - worm.height / 2))) {
      worm.vy = 0; // Bonk head, stop moving up
    }

    // Check if falling off the map
    if (worm.y > state.height) {
      worm.takeDamage(9999); // Instant death
      worm.y = state.height;
      worm.vy = 0; // stop falling
    }

    // Apply friction
    if (!worm.isJumping) {
      // Ground friction
      worm.vx *= 0.8;
      if (Math.abs(worm.vx) < 5) worm.vx = 0; // complete stop
    } else {
      // Air resistance
      worm.vx *= 0.98;
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
      const playerRadius = player.width / 2;
      if (MathUtils.distance(proj.x, proj.y, player.x, player.y) < playerRadius + proj.radius) {
        this.explode(proj, state);
        return;
      }
    }

    // Collision with props
    for (const prop of state.props) {
      if (MathUtils.distance(proj.x, proj.y, prop.x, prop.y) < prop.radius + proj.radius) {
        this.explode(proj, state);
        return;
      }
    }

    // Out of bounds / Hitting the unbreakable cosmic barrier (5px border)
    if (proj.x <= 5 || proj.x >= state.width - 5 || proj.y >= state.height - 5) {
      this.explode(proj, state);
      return;
    }
  }

  private explode(proj: Projectile, state: GameState): void {
    proj.active = false;
    // Carve landscape
    state.landscape.createCrater(Math.floor(proj.x), Math.floor(proj.y), proj.explosionRadius);

    // Add visual explosion effect
    state.explosions.push(new Explosion(proj.x, proj.y, proj.explosionRadius));

    // Trigger sound
    if (this.onExplode) {
      this.onExplode();
    }

    // Damage nearby players and push props
    for (const player of state.players) {
      const playerRadius = player.width / 2;
      const dist = MathUtils.distance(proj.x, proj.y, player.x, player.y);
      if (dist <= proj.explosionRadius + playerRadius) {
        // Simple damage falloff
        const damageRatio = 1 - (dist / (proj.explosionRadius + playerRadius));
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

    for (const prop of state.props) {
      const dist = MathUtils.distance(proj.x, proj.y, prop.x, prop.y);
      if (dist <= proj.explosionRadius + prop.radius) {
        const damageRatio = 1 - (dist / (proj.explosionRadius + prop.radius));
        prop.takeDamage(proj.damage * damageRatio); // Prop takes explosive damage

        const dx = prop.x - proj.x;
        const dy = prop.y - proj.y;
        const norm = Math.sqrt(dx*dx + dy*dy) || 1;
        
        // Props are heavier, they get knocked back less (e.g., 50 instead of 150/300)
        prop.vx += (dx / norm) * (50 / prop.mass) * damageRatio;
        prop.vy -= (50 / prop.mass) * damageRatio;
        prop.angularVelocity += (Math.random() - 0.5) * 10 * damageRatio;
        prop.isSettled = false;
      }
    }
  }
}
