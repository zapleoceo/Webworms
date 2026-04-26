import { GameState } from '../models/GameState';
import { Projectile } from '../models/Projectile';
import { Explosion } from '../models/Explosion';
import { MathUtils } from '../utils/MathUtils';
import { AudioManager } from '../utils/AudioManager';

export class PhysicsEngine {
  public gravity: number = 150; // pixels per second squared (Slowed down for realism)
  public safeFallSpeed: number = 200; // Safe landing speed
  public fallDamageMultiplier: number = 0.15; // Damage per extra speed unit
  public onExplode?: (x: number, y: number) => void;
  public onJump?: () => void;
  public onHurt?: () => void;
  public onFallStart?: () => void;
  public onFallStop?: () => void;
  public onFallUpdate?: (vy: number) => void;
  public onLand?: () => void;
  public onHeavyImpact?: () => void;

  public update(state: GameState, dt: number): void {
    // Handle input (walking)
    if (state.currentPlayerIndex >= 0 && state.currentPlayerIndex < state.players.length) {
      const player = state.getCurrentPlayer();
      if (player) {
        // Decrease cooldowns
        for (const weaponId in player.weaponCooldowns) {
          if (player.weaponCooldowns[weaponId] > 0) {
            player.weaponCooldowns[weaponId] -= dt;
            if (player.weaponCooldowns[weaponId] < 0) player.weaponCooldowns[weaponId] = 0;
          }
        }
      }
    }

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

    // Update floating texts
    if (state.floatingTexts) {
      for (const text of state.floatingTexts) {
        text.y -= 30 * dt; // Float upwards
        text.life -= dt;
      }
      state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);
    }

    this.updateSnowflakes(state, dt);
  }

  private updateSnowflakes(_state: GameState, _dt: number): void {
    // SNOW DISABLED TEMPORARILY
    /*
    const flakes = state.snowflakes;
    if (!flakes) return;

    // Spawn new flakes randomly
    // Spawn rate relative to map width
    const spawnRate = state.width * 0.05;
    for (let i = 0; i < spawnRate; i++) {
      if (Math.random() < 0.1) {
        flakes.push({
          x: Math.random() * state.width,
          y: 0,
          vx: 0,
          vy: 30 + Math.random() * 20 // constant fall speed, no acceleration
        });
      }
    }

    for (let i = flakes.length - 1; i >= 0; i--) {
      const flake = flakes[i];
      // Wind affects horizontal speed
      flake.vx = state.wind * 0.5;

      flake.x += flake.vx * dt;
      flake.y += flake.vy * dt;

      const px = Math.floor(flake.x);
      const py = Math.floor(flake.y);

      // Check bounds
      if (py >= state.height - 30 || px < 30 || px >= state.width - 30) {
        flakes.splice(i, 1);
        continue;
      }

      // Check collision
      if (state.landscape.isSolid(px, py)) {
        // Find highest non-solid pixel to pile up snow
        let targetY = py - 1;
        while (targetY > 0 && state.landscape.isSolid(px, targetY)) {
          targetY--;
        }

        // Become snow (material 5)
        if (targetY > 0) {
          state.landscape.setMaterial(px, targetY, 5);
        }
        flakes.splice(i, 1);
      }
    }
    */
  }

  private updateProps(state: GameState, dt: number): void {
    for (const prop of state.props) {
      if (prop.health <= 0) continue;

      const oldVy = prop.vy;
      prop.vy += this.gravity * dt;

      prop.x += prop.vx * dt;
      prop.y += prop.vy * dt;

      // Ground collision
      const cx = Math.floor(prop.x);
      const bottomY = Math.floor(prop.y + prop.radius);

      if (state.landscape.isSolid(cx, bottomY)) {
        // Find exact surface
        let searchY = bottomY;
        let embedded = 0;
        while (state.landscape.isSolid(cx, searchY) && searchY > 0 && embedded < 20) {
          searchY--;
          embedded++;
        }
        
        prop.y = searchY - prop.radius;
        
        // High speed impact (dig into terrain)
        if (oldVy > 250) {
          AudioManager.playLand();
          // Prop damages terrain based on its hardness
          const digRadius = prop.radius * 0.8;
          for (let dy = -digRadius; dy <= digRadius; dy++) {
            for (let dx = -digRadius; dx <= digRadius; dx++) {
              if (dx * dx + dy * dy <= digRadius * digRadius) {
                const tx = Math.floor(cx + dx);
                const ty = Math.floor(searchY + dy);
                if (tx >= 0 && tx < state.width && ty >= 0 && ty < state.height) {
                  // If terrain is softer than the prop, destroy it
                  const mat = state.landscape.getMaterial(tx, ty);
                  if (mat === 1 || mat === 5) { // Dirt or snow
                    state.landscape.setMaterial(tx, ty, 0); // Destroy
                  }
                }
              }
            }
          }
          state.landscape.needsUpdate = true;
          // Kill momentum, it's stuck in the dirt
          prop.vy = 0;
          prop.vx = 0;
        } else {
          // Low speed - no bounce, just slide/roll
          prop.vy = 0;
          prop.vx *= 0.5; // heavy friction
          
          if (oldVy > 50) {
            AudioManager.playLand();
          }

          // Calculate slope to rotate
          const leftSolid = state.landscape.isSolid(cx - 5, bottomY);
          const rightSolid = state.landscape.isSolid(cx + 5, bottomY);

          if (leftSolid && !rightSolid) {
            prop.rotation += 0.05;
            prop.vx += 10; // roll right
          } else if (!leftSolid && rightSolid) {
            prop.rotation -= 0.05;
            prop.vx -= 10; // roll left
          } else {
            // Flatten out slightly if on flat ground
            prop.rotation *= 0.9;
          }
        }
      } else {
        // Free falling rotation
        prop.rotation += prop.vx * dt * 0.01;
      }

      // Bounds
      if (prop.x < 30) { prop.x = 30; prop.vx *= -0.5; }
      if (prop.x > state.width - 30) { prop.x = state.width - 30; prop.vx *= -0.5; }
      if (prop.y > state.height) { prop.health = 0; }
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

  private addFloatingText(state: GameState, x: number, y: number, text: string, color: string) {
    if (!state.floatingTexts) state.floatingTexts = [];
    state.floatingTexts.push({ x, y, text, color, life: 2.0, maxLife: 2.0 });
  }

  private updateWorm(worm: any, state: GameState, dt: number): void {
    if (worm.health <= 0) return;

    const cx = Math.floor(worm.x);
    const bottomY = Math.floor(worm.y + worm.height / 2);

    // Ground check (is there a solid pixel exactly below the worm?)
    const isGrounded = state.landscape.isSolid(cx, bottomY) || state.landscape.isSolid(cx, bottomY + 1);

    if (!isGrounded || worm.isJumping) {
      worm.vy += this.gravity * dt;
    } else {
      worm.vy = 0; // Prevent gravity accumulation when resting on the ground
    }
    
    // Update walk cycle animation
    if (Math.abs(worm.vx) > 5 && !worm.isJumping) {
      worm.walkCycle += Math.abs(worm.vx) * dt * 0.2;
    } else {
      worm.walkCycle = 0;
    }

    // Attempt Horizontal Movement (with slope logic)
    const dx = worm.vx * dt;
    if (dx !== 0) {
      worm.x += dx;
      
      // Screen bounds with 30px padding (clamp before checking terrain to avoid infinite push-up bug)
      if (worm.x < 30) { worm.x = 30; worm.vx = 0; }
      if (worm.x > state.width - 30) { worm.x = state.width - 30; worm.vx = 0; }

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
    
    // Check if falling fast enough to trigger sound
    if (worm.vy > 150) {
      if (!worm.isFallingSoundPlaying) {
        worm.isFallingSoundPlaying = true;
        if (this.onFallStart) this.onFallStart();
      }
      if (this.onFallUpdate) this.onFallUpdate(worm.vy);
    } else {
      if (worm.isFallingSoundPlaying) {
        worm.isFallingSoundPlaying = false;
        if (this.onFallStop) this.onFallStop();
      }
    }

    // Ground collision (falling)
      const currentBottomY = Math.floor(worm.y + worm.height / 2);
      if (worm.vy >= 0 && state.landscape.isSolid(cx, currentBottomY)) {
        // Stop falling sound
        if (worm.isFallingSoundPlaying) {
          worm.isFallingSoundPlaying = false;
          if (this.onFallStop) this.onFallStop();
        }
  
        // Push up to exactly the surface level (no infinite loops)
        let searchY = currentBottomY;
        let pushedUp = 0;
        while (state.landscape.isSolid(cx, searchY) && searchY > 0 && pushedUp < 20) { // Limit push up to prevent infinite loops if buried
          searchY--;
          pushedUp++;
        }
        
        const newY = searchY - worm.height / 2;
        worm.y = newY;
        
        const oldVy = worm.vy;
        const wasJumping = worm.isJumping;
        worm.vy = 0;
        worm.isJumping = false;
  
        // Always play a landing "thud" (boov) if we just landed from a jump/fall
        if (wasJumping || oldVy > 50) {
          if (this.onLand) this.onLand();
        }

        // Heavy impact damage
        if (oldVy > this.safeFallSpeed) {
          if (this.onHeavyImpact) this.onHeavyImpact();
          const fallDamage = (oldVy - this.safeFallSpeed) * this.fallDamageMultiplier;
          worm.takeDamage(fallDamage);
          this.addFloatingText(state, worm.x, worm.y - 20, `-${Math.round(fallDamage)}`, '#FF0000');
          if (this.onHurt) this.onHurt();
          AudioManager.playDamage();
        }
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

    // Apply friction or wind
    if (!worm.isJumping) {
      // Ground friction
      worm.vx *= 0.8;
      if (Math.abs(worm.vx) < 5) worm.vx = 0; // complete stop
    } else {
      // Air resistance and WIND
      worm.vx *= 0.98;
      // Protect against undefined state wind (in tests)
      if (state.wind) {
        worm.vx += state.wind * dt * 0.5; // Worms are slightly affected by wind in the air
      }
    }
  }

  private updateProjectile(proj: Projectile, state: GameState, dt: number): void {
    proj.vy += this.gravity * dt;
    if (state.wind) {
      proj.vx += state.wind * dt * proj.windMultiplier; // Apply wind based on weapon stats
    }

    const oldX = proj.x;
    const oldY = proj.y;

    proj.updatePosition(dt);

    const newX = proj.x;
    const newY = proj.y;

    // Raycast / Substepping to prevent tunneling through terrain
    const dist = Math.hypot(newX - oldX, newY - oldY);
    const steps = Math.max(1, Math.ceil(dist)); // roughly 1 step per pixel
    const pr = Math.max(1, Math.floor(proj.radius * 0.8)); // slightly smaller than visual radius for forgiveness

    let hitTerrain = false;
    let hitMaterial = 0;
    let hitX = newX;
    let hitY = newY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const checkX = oldX + (newX - oldX) * t;
      const checkY = oldY + (newY - oldY) * t;

      const px = Math.floor(checkX);
      const py = Math.floor(checkY);

      for (let y = py - pr; y <= py + pr; y++) {
        for (let x = px - pr; x <= px + pr; x++) {
          if (x >= 0 && x < state.width && y >= 0 && y < state.height) {
            const mat = state.landscape.getMaterial(x, y);
            if (mat > 0) {
              hitTerrain = true;
              hitMaterial = mat;
              hitX = checkX;
              hitY = checkY;
              break;
            }
          }
        }
        if (hitTerrain) break;
      }
      if (hitTerrain) break;
    }

    // Move projectile to exact collision point
    proj.x = hitX;
    proj.y = hitY;

    if (hitTerrain) {
      // Determine material strength modifier for explosion radius
      let radiusModifier = 1.0;
      if (hitMaterial === 2) radiusModifier = 0.75; // Meteorite Rock is harder
      else if (hitMaterial === 4) radiusModifier = 0.5; // Metal Platform is very hard
      else if (hitMaterial === 5) radiusModifier = 2.0; // Snow is very weak
      else if (hitMaterial === 255) radiusModifier = 0.3; // Barely scratches the indestructible border

      this.explode(proj, state, radiusModifier);
      return;
    }

    // Collision with other projectiles
    for (const otherProj of state.projectiles) {
      if (otherProj !== proj && otherProj.active) {
        if (MathUtils.distance(proj.x, proj.y, otherProj.x, otherProj.y) < proj.radius + otherProj.radius) {
          otherProj.active = false;
          this.explode(otherProj, state, 1.0); // Secondary explosion
          this.explode(proj, state, 1.0);
          return;
        }
      }
    }

    // Collision with players
    for (const player of state.players) {
      const playerRadius = player.width / 2;
      if (MathUtils.distance(proj.x, proj.y, player.x, player.y) < playerRadius + proj.radius) {
        this.explode(proj, state, 1.0);
        return;
      }
    }

    // Collision with props
    for (const prop of state.props) {
      if (MathUtils.distance(proj.x, proj.y, prop.x, prop.y) < prop.radius + proj.radius) {
        this.explode(proj, state, 1.0);
        return;
      }
    }

    // Out of bounds / Hitting the unbreakable cosmic barrier (30px border)
    if (proj.x <= 30 || proj.x >= state.width - 30 || proj.y >= state.height - 30) {
      this.explode(proj, state, 0.3); // Minimal crater on border
      return;
    }
  }

  private explode(proj: Projectile, state: GameState, radiusModifier: number = 1.0): void {
    const owner = (proj as any).owner; // Track projectile owner for damage attribution
    proj.active = false;
    
    // Calculate final explosion radius based on the material hit
    const finalRadius = proj.explosionRadius * radiusModifier;
    
    // Carve landscape
    state.landscape.createCrater(Math.floor(proj.x), Math.floor(proj.y), finalRadius);

    // Add visual explosion effect
    state.explosions.push(new Explosion(proj.x, proj.y, finalRadius));
    AudioManager.playExplosion();

    // Trigger sound
    if (this.onExplode) {
      this.onExplode(proj.x, proj.y);
    }

    // Damage nearby players and push props
    for (const player of state.players) {
      const playerRadius = player.width / 2;
      const dist = MathUtils.distance(proj.x, proj.y, player.x, player.y);
      if (dist <= proj.explosionRadius + playerRadius) {
        // Simple damage falloff
        const damageRatio = 1 - (dist / (proj.explosionRadius + playerRadius));
        const actualDamage = proj.damage * damageRatio;
        player.takeDamage(actualDamage);
        this.addFloatingText(state, player.x, player.y - 20, `-${Math.round(actualDamage)}`, '#FF0000');
        if (this.onHurt) this.onHurt();
        AudioManager.playDamage();
        
        // Track damage dealt
        if (owner && owner !== player) {
          owner.damageDealt += actualDamage;
        }

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
      if (dist < finalRadius * 1.5) { // Prop damage radius is slightly larger
        const damage = Math.max(10, 100 * (1 - dist / (finalRadius * 1.5)));
        prop.health -= damage;
        // Knockback prop
        const angle = Math.atan2(prop.y - proj.y, prop.x - proj.x);
        const knockback = (proj as any).knockback || proj.damage || 50;
        prop.vx += Math.cos(angle) * knockback * 2;
        prop.vy += Math.sin(angle) * knockback * 2;
        prop.rotation += (Math.random() - 0.5) * 5;
        prop.isSettled = false;
      }
    }
  }
}
