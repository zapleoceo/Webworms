import { GameState } from '../models/GameState';
import { Projectile } from '../models/Projectile';
import { Explosion } from '../models/Explosion';
import { BrandLogo } from '../models/BrandLogo';
import { MathUtils } from '../utils/MathUtils';
import { Random } from '../utils/Random';
import { AudioManager } from '../utils/AudioManager';
import { RopeTool } from '../equipment/items/RopeTool';
import { circleOffsets } from '../physics/TrajectorySim';
import { assetUrl } from '../utils/assetUrl';
import { TerrainDistanceField } from '../physics/TerrainDistanceField';

export class PhysicsEngine {
  public gravity: number = 195; // pixels per second squared (Increased by 30% from 150)
  public safeFallSpeed: number = 260; // Safe landing speed (also increased to match gravity)
  public fallDamageMultiplier: number = 0.075; // Half fall damage
  public onExplode?: (x: number, y: number) => void;
  public onJump?: () => void;
  public onHurt?: () => void;
  public onFallStart?: () => void;
  public onFallStop?: () => void;
  public onFallUpdate?: (vy: number) => void;
  public onLand?: () => void;
  public onHeavyImpact?: () => void;
  public onTrace?: (event: any) => void;
  private fixedDt: number = 1 / 60;
  private accumulator: number = 0;
  private maxSubsteps: number = 8;
  private terrainDf: TerrainDistanceField | null = null;

  private spawnGrave(state: GameState, worm: any, wormIndex: number): void {
    const sprite = assetUrl('sprites_v2/misc/grave1.png');
    const x = Number(worm.x) || 0;
    const wormH = Math.max(0, Number(worm.height) || 0);
    const bottomY = (Number(worm.y) || 0) + wormH / 2;
    const y = bottomY - 42 / 2 - 1;
    const vx = (Number(worm.vx) || 0) * 0.15;
    const vy = (Number(worm.vy) || 0) * 0.15;
    const logo = new BrandLogo(sprite, x, y, vx, vy, 0, 0);
    logo.width = 42;
    logo.height = 42;
    logo.collisionWidth = 30;
    logo.collisionHeight = 34;
    logo.y = bottomY - logo.height / 2 - 1;
    logo.hardness = 999;
    logo.maxHealth = 9999;
    logo.health = 9999;
    (logo as any).airdropPhysics = state.airdropPhysics;
    (logo as any).requireGroundToSleep = true;
    (logo as any).graveFrame = 0;
    if (!state.brandLogos) state.brandLogos = [];
    state.brandLogos.push(logo);
    (worm as any).graveSpawned = true;
  }

  public update(state: GameState, dt: number): void {
    const clamped = Math.max(0, Math.min(0.25, dt));
    this.accumulator += clamped;
    const maxAccum = this.fixedDt * this.maxSubsteps;
    if (this.accumulator > maxAccum) this.accumulator = maxAccum;

    let steps = Math.floor(this.accumulator / this.fixedDt);
    if (steps > this.maxSubsteps) steps = this.maxSubsteps;

    for (let i = 0; i < steps; i++) {
      this.step(state, this.fixedDt);
      this.accumulator -= this.fixedDt;
    }
  }

  private step(state: GameState, dt: number): void {
    if (state.currentPlayerIndex >= 0 && state.currentPlayerIndex < state.players.length) {
      const player = state.getCurrentPlayer();
      if (player) {
        for (const weaponId in player.weaponCooldowns) {
          if (player.weaponCooldowns[weaponId] > 0) {
            player.weaponCooldowns[weaponId] -= dt;
            if (player.weaponCooldowns[weaponId] < 0) player.weaponCooldowns[weaponId] = 0;
          }
        }
      }
    }

    for (const worm of state.players) {
      this.updateWorm(worm, state, dt);
    }

    for (const proj of state.projectiles) {
      if (proj.active) {
        this.updateProjectile(proj, state, dt);
      }
    }
    state.projectiles = state.projectiles.filter(p => p.active);

    if (Random.next() < 0.6 * dt) {
      state.windTarget = (Random.next() - 0.5) * 150;
    }
    state.wind += (state.windTarget - state.wind) * dt * 0.5;

    for (const exp of state.explosions) {
      exp.update(dt);
    }
    state.explosions = state.explosions.filter(e => e.life > 0);

    this.updateProps(state, dt);
    this.updateBrandLogos(state, dt);

    this.handleWormCollisions(state);
    this.handleWormPropCollisions(state);
    this.handleWormBrandLogoCollisions(state, dt);

    for (const worm of state.players) {
      if (worm.health <= 0) continue;
      this.resolveAgainstTerrainWorm(worm, state);
    }
    for (const prop of state.props) {
      if (prop.health <= 0) continue;
      this.resolveAgainstTerrainProp(prop, state);
    }

    state.props = state.props.filter(p => p.health > 0);

    for (let i = 0; i < state.players.length; i++) {
      const worm: any = state.players[i];
      if (!worm) continue;
      if (worm.health > 0) continue;
      if ((worm as any).graveSpawned) continue;
      this.spawnGrave(state, worm, i);
    }

    if (state.particles) {
      for (const p of state.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      state.particles = state.particles.filter(p => p.life > 0);
    }

    if (state.floatingTexts) {
      for (const text of state.floatingTexts) {
        text.y -= 30 * dt;
        text.life -= dt;
      }
      state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);
    }

    this.updateSnowflakes(state, dt);
  }

  private updateSnowflakes(_state: GameState, _dt: number): void {}

  private updateBrandLogos(state: GameState, dt: number): void {
    if (!state.brandLogos) return;

    const stamped: BrandLogo[] = [];
    const dynamic = state.brandLogos.filter(l => l.isDynamic);
    if (dynamic.length > 1) {
      for (let i = 0; i < dynamic.length; i++) {
        const a = dynamic[i];
        if (!a) continue;
        for (let j = i + 1; j < dynamic.length; j++) {
          const b = dynamic[j];
          if (!b) continue;
          const ax = a.collisionWidth / 2;
          const ay = a.collisionHeight / 2;
          const bx = b.collisionWidth / 2;
          const by = b.collisionHeight / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const overlapX = ax + bx - Math.abs(dx);
          const overlapY = ay + by - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;

          if (overlapX < overlapY) {
            const sx = Math.sign(dx) || 1;
            a.x -= sx * overlapX * 0.5;
            b.x += sx * overlapX * 0.5;
            const rv = a.vx - b.vx;
            a.vx -= rv * 0.5;
            b.vx += rv * 0.5;
            a.angularVelocity *= 0.6;
            b.angularVelocity *= 0.6;
            if (this.onTrace) {
              try {
                this.onTrace({ type: 'physics_collision', t: (state as any).matchDuration || 0, kind: 'logo_logo', axis: 'x', ax: a.x, ay: a.y, avx: a.vx, avy: a.vy, bx: b.x, by: b.y, bvx: b.vx, bvy: b.vy });
              } catch {}
            }
          } else {
            const sy = Math.sign(dy) || 1;
            a.y -= sy * overlapY * 0.5;
            b.y += sy * overlapY * 0.5;
            const rv = a.vy - b.vy;
            a.vy -= rv * 0.5;
            b.vy += rv * 0.5;
            a.angularVelocity *= 0.6;
            b.angularVelocity *= 0.6;
            if (this.onTrace) {
              try {
                this.onTrace({ type: 'physics_collision', t: (state as any).matchDuration || 0, kind: 'logo_logo', axis: 'y', ax: a.x, ay: a.y, avx: a.vx, avy: a.vy, bx: b.x, by: b.y, bvx: b.vx, bvy: b.vy });
              } catch {}
            }
          }
        }
      }
    }

    for (const logo of state.brandLogos) {
      const wasDynamic = logo.isDynamic;
      const touchedBefore = logo.touchedGround;
      (logo as any).onTrace = this.onTrace;
      logo.update(dt, this.gravity, state.landscape, state.brandLogos);

      if (!(logo as any).didImpact && !touchedBefore && logo.touchedGround) {
        (logo as any).didImpact = true;
        if (this.onHeavyImpact) {
          this.onHeavyImpact();
        }
      }

      // Effect: Landed this frame
      if (wasDynamic && !logo.isDynamic) {
        const halfW = logo.collisionWidth / 2;
        const halfH = logo.collisionHeight / 2;
        let hitWorm = false;
        for (const worm of state.players) {
          if (worm.health <= 0) continue;
          const wHalfW = 6;
          const wHalfH = 10;
          if (Math.abs(logo.x - worm.x) < halfW + wHalfW && Math.abs(logo.y - worm.y) < halfH + wHalfH) {
            hitWorm = true;
            logo.isDynamic = true;
            logo.vy = 0;
            logo.vx += (logo.x > worm.x ? 1 : -1) * 90;
            logo.y = worm.y - wHalfH - halfH;
            break;
          }
        }
        if (hitWorm) continue;

        AudioManager.playLand();
        state.landscape.stampImage(logo.sprite, logo.x, logo.y, logo.collisionWidth, logo.collisionHeight, logo.angle, (logo as any).spriteCrop);
        stamped.push(logo);
        
        // Spawn dust particles
        if (!state.particles) state.particles = [];
        for (let i = 0; i < 20; i++) {
          state.particles.push({
            x: logo.x + (Random.next() - 0.5) * logo.width,
            y: logo.y + logo.height / 2,
            vx: (Random.next() - 0.5) * 100,
            vy: -Random.next() * 50 - 20,
            life: 0.3 + Random.next() * 0.4,
            maxLife: 0.7,
            color: '#8B5A2B', // Dirt color
            size: 2 + Random.next() * 3
          });
        }
      }
    }

    if (stamped.length > 0) {
      state.brandLogos = state.brandLogos.filter(l => !stamped.includes(l));
    }
  }

  private updateProps(state: GameState, dt: number): void {
    for (const prop of state.props) {
      if (prop.health <= 0) continue;

      const oldVy = prop.vy;
      prop.vy += this.gravity * dt;

      prop.x += prop.vx * dt;
      prop.y += prop.vy * dt;
      prop.rotation += prop.angularVelocity * dt;
      const TAU = Math.PI * 2;
      const norm = (a: number) => {
        a = (a + Math.PI) % TAU;
        if (a < 0) a += TAU;
        return a - Math.PI;
      };
      prop.rotation = norm(prop.rotation);

      // Ground collision
      const cx = Math.floor(prop.x);
      const bottomY = Math.floor(prop.y + prop.radius);

      if (state.landscape.isSolid(cx, bottomY)) {
        const vBefore = { vx: prop.vx, vy: prop.vy };
        if ((prop as any).settleAge === undefined) (prop as any).settleAge = 0;
        (prop as any).settleAge += dt;

        // Find exact surface
        let searchY = bottomY;
        let embedded = 0;
        while (state.landscape.isSolid(cx, searchY) && searchY > 0 && embedded < 20) {
          searchY--;
          embedded++;
        }
        
        prop.y = searchY - prop.radius;

        if (!(prop as any).touchedGround) {
          (prop as any).touchedGround = true;
          AudioManager.playLand();
          if (this.onHeavyImpact) this.onHeavyImpact();
        }

        // High speed impact (dig into terrain)
        if (oldVy > 250 && !(prop as any).didDig) {
          (prop as any).didDig = true;
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
        }

        const halfW = Math.max(8, prop.width ? prop.width / 2 : prop.radius);
        const sample = (sx: number) => {
          const ix = Math.floor(sx);
          let y = bottomY;
          let steps = 0;
          while (state.landscape.isSolid(ix, y) && y > 0 && steps < 40) {
            y--;
            steps++;
          }
          return y;
        };
        const yL = sample(prop.x - halfW);
        const yC = sample(prop.x);
        const yR = sample(prop.x + halfW);
        const dx = Math.max(1, halfW * 2);
        const slope = (((yR - yC) / (dx / 2)) + ((yC - yL) / (dx / 2))) * 0.5;
        const baseAngle = Math.max(-0.8, Math.min(0.8, Math.atan(slope)));
        const a0 = norm(baseAngle);
        const a1 = norm(baseAngle + Math.PI);
        const cur = prop.rotation;
        const d0 = Math.abs(norm(cur - a0));
        const d1 = Math.abs(norm(cur - a1));
        const targetAngle = d0 <= d1 ? a0 : a1;

        const cosA = Math.cos(targetAngle);
        const sinA = Math.sin(targetAngle);
        let along = prop.vx * cosA + prop.vy * sinA;
        let perp = -prop.vx * sinA + prop.vy * cosA;

        if (perp > 20) {
          perp = -perp * prop.bounce;
        } else {
          perp = 0;
        }
        along *= prop.friction;

        prop.vx = along * cosA - perp * sinA;
        prop.vy = along * sinA + perp * cosA;
        if (this.onTrace) {
          try {
            this.onTrace({
              type: 'physics_collision',
              t: (state as any).matchDuration || 0,
              kind: 'prop_ground',
              x: prop.x,
              y: prop.y,
              radius: prop.radius,
              vBefore,
              vAfter: { vx: prop.vx, vy: prop.vy },
              targetAngle
            });
          } catch {}
        }

        prop.angularVelocity += norm(targetAngle - prop.rotation) * 18 * dt;
        prop.angularVelocity *= 0.9;

        const shouldSettle =
          (prop as any).settleAge > 1.2 &&
          Math.abs(prop.vx) < 8 &&
          Math.abs(prop.vy) < 8 &&
          Math.abs(prop.angularVelocity) < 0.4 &&
          Math.abs(norm(prop.rotation - targetAngle)) < 0.2;

        if (shouldSettle) {
          const imgKey = prop.brandImage?.split('/').pop()?.split('.')[0] || 'brand_apple';
          state.landscape.stampImage(imgKey, prop.x, prop.y, prop.radius * 2, prop.radius * 2, prop.rotation);
          prop.health = 0;
        }
      } else {
        if ((prop as any).settleAge !== undefined) (prop as any).settleAge = 0;
        prop.angularVelocity += (prop.vx * 0.02 - prop.angularVelocity) * dt * 2;
      }

      // Bounds
      if (prop.x < 30) { prop.x = 30; prop.vx *= -0.5; }
      if (prop.x > state.width - 30) { prop.x = state.width - 30; prop.vx *= -0.5; }
      if (prop.y > state.height) { prop.health = 0; }
    }
  }

  private handleWormBrandLogoCollisions(state: GameState, dt: number): void {
    if (!state.brandLogos) return;
    const hw = 6;
    const hh = 10;
    const frame = this.getWormFrameOffsets(hw, hh);

    for (const worm of state.players) {
      if (worm.health <= 0) continue;

      for (const logo of state.brandLogos) {
        const halfW = logo.collisionWidth / 2;
        const halfH = logo.collisionHeight / 2;

        const dx = worm.x - logo.x;
        const dy = worm.y - logo.y;
        if (Math.abs(dx) > halfW + hw + 6 || Math.abs(dy) > halfH + hh + 6) continue;

        const cosL = Math.cos(-logo.angle);
        const sinL = Math.sin(-logo.angle);
        const cosW = Math.cos(logo.angle);
        const sinW = Math.sin(logo.angle);

        let bestPen = 0;
        let bestN = { x: 0, y: 0 };

        for (const o of frame) {
          const px = worm.x + o.dx - logo.x;
          const py = worm.y + o.dy - logo.y;
          const lx = px * cosL - py * sinL;
          const ly = px * sinL + py * cosL;
          if (Math.abs(lx) > halfW || Math.abs(ly) > halfH) continue;

          const penX = halfW - Math.abs(lx);
          const penY = halfH - Math.abs(ly);
          let nxL = 0;
          let nyL = 0;
          let pen = 0;
          if (penX < penY) {
            pen = penX;
            nxL = lx >= 0 ? 1 : -1;
          } else {
            pen = penY;
            nyL = ly >= 0 ? 1 : -1;
          }

          const nx = nxL * cosW - nyL * sinW;
          const ny = nxL * sinW + nyL * cosW;
          if (pen > bestPen) {
            bestPen = pen;
            bestN = { x: nx, y: ny };
          }
        }

        if (bestPen <= 0) continue;

        const standOnTop = worm.vy > 0 && bestN.y < -0.7 && worm.y + hh - worm.vy * dt <= logo.y - halfH + 6;
        if (standOnTop) {
          worm.y = logo.y - halfH - hh;
          worm.vy = 0;
          worm.isJumping = false;
          if (logo.isDynamic) worm.x += logo.vx * dt;
          continue;
        }

        worm.x += bestN.x * bestPen;
        worm.y += bestN.y * bestPen;
        const vn = worm.vx * bestN.x + worm.vy * bestN.y;
        if (vn > 0) {
          worm.vx -= vn * bestN.x;
          worm.vy -= vn * bestN.y;
        }
        worm.vx *= 0.92;
        if (logo.isDynamic) {
          if (logo.vy > 80) {
            const dmg = Math.max(2, Math.min(8, logo.vy * 0.02));
            worm.takeDamage(dmg);
            this.addFloatingText(state, worm.x, worm.y - 20, `-${Math.round(dmg)}`, '#FF0000');
            if (this.onHurt) this.onHurt();
            AudioManager.playDamage();
          }
          logo.vx *= 0.92;
          logo.vy *= 0.86;
          logo.angularVelocity *= 0.8;
        }
      }
    }
  }

  private wormFrameOffsetsCache: Record<string, Array<{ dx: number; dy: number }>> = {};
  private getWormFrameOffsets(hw: number, hh: number): Array<{ dx: number; dy: number }> {
    const key = `${hw}:${hh}`;
    const cached = this.wormFrameOffsetsCache[key];
    if (cached) return cached;
    const xs4 = [-hw, -hw / 3, hw / 3, hw];
    const ys2 = [-hh / 2, hh / 2];
    const out: Array<{ dx: number; dy: number }> = [];
    for (const x of xs4) out.push({ dx: x, dy: hh });
    for (const x of xs4) out.push({ dx: x, dy: -hh });
    for (const y of ys2) out.push({ dx: -hw, dy: y });
    for (const y of ys2) out.push({ dx: hw, dy: y });
    this.wormFrameOffsetsCache[key] = out;
    return out;
  }

  private grenadeRingOffsetsCache: Record<string, Array<{ dx: number; dy: number }>> = {};
  private getGrenadeRingOffsets(pr: number): Array<{ dx: number; dy: number }> {
    const key = String(pr);
    const cached = this.grenadeRingOffsetsCache[key];
    if (cached) return cached;
    const r0 = 0;
    const r1 = Math.max(1, pr);
    const r2 = Math.max(1, Math.round(pr * 0.55));
    const r3 = Math.max(1, Math.round(pr * 0.3));
    const radii = [r0, r1, r2, r3];
    const out: Array<{ dx: number; dy: number }> = [];
    const addRing = (r: number) => {
      if (r === 0) { out.push({ dx: 0, dy: 0 }); return; }
      const dd = Math.max(1, Math.round(r * 0.70710678));
      out.push({ dx: r, dy: 0 }, { dx: -r, dy: 0 }, { dx: 0, dy: r }, { dx: 0, dy: -r });
      out.push({ dx: dd, dy: dd }, { dx: -dd, dy: dd }, { dx: dd, dy: -dd }, { dx: -dd, dy: -dd });
    };
    for (const r of radii) addRing(r);
    this.grenadeRingOffsetsCache[key] = out;
    return out;
  }

  private resolveAgainstTerrainWorm(worm: any, state: GameState): void {
    const hw = 6;
    const hh = 10;
    if (!this.isBoxSolid(state.landscape, worm.x, worm.y, hw, hh)) return;
    for (let i = 0; i < 36; i++) {
      if (!this.isBoxSolid(state.landscape, worm.x, worm.y, hw, hh)) return;
      worm.y -= 1;
    }
    for (let i = 0; i < 18; i++) {
      if (!this.isBoxSolid(state.landscape, worm.x, worm.y, hw, hh)) return;
      worm.x += (i % 2 === 0 ? 1 : -1) * (i + 1);
    }
  }

  private resolveAgainstTerrainProp(prop: any, state: GameState): void {
    const pr = Math.max(1, Math.floor(prop.radius * 0.8));
    const offsets = circleOffsets(pr);
    const inside = () => {
      const px = Math.floor(prop.x);
      const py = Math.floor(prop.y);
      for (const o of offsets) {
        const x = px + o.dx;
        const y = py + o.dy;
        if (x < 0 || x >= state.width || y < 0 || y >= state.height) continue;
        if (state.landscape.getMaterial(x, y) > 0) return true;
      }
      return false;
    };
    if (!inside()) return;
    for (let i = 0; i < 48; i++) {
      if (!inside()) return;
      prop.y -= 1;
    }
    for (let i = 0; i < 24; i++) {
      if (!inside()) return;
      prop.x += (i % 2 === 0 ? 1 : -1) * (i + 1);
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

  private isBoxSolid(landscape: any, cx: number, cy: number, hw: number, hh: number): boolean {
    const left = Math.floor(cx - hw);
    const right = Math.floor(cx + hw);
    const top = Math.floor(cy - hh);
    const bottom = Math.floor(cy + hh);
    
    // Check perimeter
    for (let x = left; x <= right; x += 2) {
      if (landscape.isSolid(x, top) || landscape.isSolid(x, bottom)) return true;
    }
    for (let y = top; y <= bottom; y += 2) {
      if (landscape.isSolid(left, y) || landscape.isSolid(right, y)) return true;
    }
    return false;
  }

  private updateWorm(worm: any, state: GameState, dt: number): void {
    if (worm.health <= 0) return;

    // Hitbox sizes
    const hw = 6;  // Half width
    const hh = 10; // Half height

    // Ground check
    const isGrounded = this.isBoxSolid(state.landscape, worm.x, worm.y + 1, hw, hh);

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
      const oldX = worm.x;
      worm.x += dx;
      
      // Screen bounds with 30px padding
      if (worm.x < 30) { worm.x = 30; worm.vx = 0; }
      if (worm.x > state.width - 30) { worm.x = state.width - 30; worm.vx = 0; }

      // Slope limit check
      if (this.isBoxSolid(state.landscape, worm.x, worm.y, hw, hh)) {
        let step = 0;
        const maxStep = 4; // Allow climbing up to ~60 degree slope
        
        while (step <= maxStep && this.isBoxSolid(state.landscape, worm.x, worm.y - step, hw, hh)) {
          step++;
        }

        if (step <= maxStep) {
          // Valid slope, step up
          worm.y -= step;
        } else {
          // Too steep! Hit a wall. Revert X movement and kill horizontal speed
          worm.x = oldX;
          worm.vx = 0;
        }
      }
    }

    // Attempt Vertical Movement
    const oldY = worm.y;
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

    // Vertical collision
    if (this.isBoxSolid(state.landscape, worm.x, worm.y, hw, hh)) {
      if (worm.vy >= 0) {
        // Stop falling sound
        if (worm.isFallingSoundPlaying) {
          worm.isFallingSoundPlaying = false;
          if (this.onFallStop) this.onFallStop();
        }
  
        // Push up to exactly the surface level (no infinite loops)
        let searchY = worm.y;
        let pushedUp = 0;
        while (this.isBoxSolid(state.landscape, worm.x, searchY, hw, hh) && searchY > 0 && pushedUp < 20) { // Limit push up to prevent infinite loops if buried
          searchY--;
          pushedUp++;
        }
        
        worm.y = searchY;
        
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
      else if (worm.vy < 0) {
        worm.y = oldY;
        worm.vy = 0; // Bonk head, stop moving up
      }
    }

    // Check if falling off the map
    if (worm.y > state.height) {
      worm.takeDamage(9999); // Instant death
      worm.y = state.height;
      worm.vy = 0; // stop falling
    }

    // Apply friction or wind
    if (!worm.isJumping && this.isBoxSolid(state.landscape, worm.x, worm.y + 1, hw, hh)) {
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

    if (worm.ropeActive && worm.ropeLength > 0) {
      RopeTool.applyConstraint(worm, state, dt);
    }

    if (worm.ropeCastTime && worm.ropeCastTime > 0) {
      worm.ropeCastTime -= dt;
      if (worm.ropeCastTime < 0) worm.ropeCastTime = 0;
    }
  }

  private getTerrainNormal(state: GameState, x: number, y: number): { nx: number; ny: number } {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const sL = state.landscape.getMaterial(ix - 2, iy) > 0 ? 1 : 0;
    const sR = state.landscape.getMaterial(ix + 2, iy) > 0 ? 1 : 0;
    const sU = state.landscape.getMaterial(ix, iy - 2) > 0 ? 1 : 0;
    const sD = state.landscape.getMaterial(ix, iy + 2) > 0 ? 1 : 0;

    let nx = sL - sR;
    let ny = sU - sD;
    const n = Math.hypot(nx, ny);
    if (n < 0.0001) return { nx: 0, ny: -1 };
    nx /= n;
    ny /= n;
    if (Math.abs(nx) > Math.abs(ny)) return { nx: Math.sign(nx) || 1, ny: 0 };
    return { nx: 0, ny: Math.sign(ny) || -1 };
  }

  private bounceOnNormal(
    proj: any,
    nx: number,
    ny: number,
    bounce: number,
    friction: number,
    pushOut: number
  ): void {
    const vDotN = proj.vx * nx + proj.vy * ny;
    let rx = proj.vx - 2 * vDotN * nx;
    let ry = proj.vy - 2 * vDotN * ny;

    rx *= bounce;
    ry *= bounce;

    const tx = -ny;
    const ty = nx;
    const vDotT = rx * tx + ry * ty;
    rx -= tx * vDotT * (1 - friction);
    ry -= ty * vDotT * (1 - friction);

    proj.vx = rx;
    proj.vy = ry;
    proj.x += nx * pushOut;
    proj.y += ny * pushOut;
  }

  private normAngle(a: number): number {
    const t = Math.PI * 2;
    let r = a % t;
    if (r < 0) r += t;
    return r;
  }

  private updateGrenadeSpin(proj: any, settlePhase: boolean): void {
    if (settlePhase) {
      const stopSpeed = Number.isFinite(proj.stopSpeed) ? Math.max(0, Number(proj.stopSpeed)) : 0;
      const speed = Math.hypot(proj.vx || 0, proj.vy || 0);
      if (stopSpeed > 0 && speed <= stopSpeed) {
        proj.angularVelocity = 0;
        return;
      }
    }
    const k = 0.04;
    const omegaMin = 2;
    const omegaMax = 18;
    const speed = Math.hypot(proj.vx || 0, proj.vy || 0);
    const mag = Math.max(omegaMin, Math.min(omegaMax, speed * k));
    if (proj.vx > 1) proj.angularVelocity = mag;
    else if (proj.vx < -1) proj.angularVelocity = -mag;
    else proj.angularVelocity = 0;
  }

  private updateProjectile(proj: Projectile, state: GameState, dt: number): void {
    if ((proj as any).framesAlive === undefined) {
      (proj as any).framesAlive = 0;
    }
    (proj as any).framesAlive++;

    const fuseRemaining = (proj as any).fuseRemaining;
    if (typeof fuseRemaining === 'number') {
      (proj as any).fuseRemaining = fuseRemaining - dt;
      if ((proj as any).fuseRemaining <= 0) {
        this.explode(proj, state, 1.0);
        return;
      }
    }

    const isGrenade = typeof (proj as any).fuseRemaining === 'number';
    const settlePhase = isGrenade && (proj as any).fuseRemaining <= 1.0;
    if (isGrenade) {
      this.updateGrenadeProjectile(proj as any, state, dt, settlePhase);
      return;
    }
    if (isGrenade && (proj as any).resting) {
      proj.vx = 0;
      proj.vy = 0;
      (proj as any).angularVelocity = 0;
    } else {
      proj.vy += this.gravity * dt;
      if (state.wind) {
        proj.vx += state.wind * dt * proj.windMultiplier; // Apply wind based on weapon stats
      }
    }
    if (isGrenade) {
      const rot0 = Number((proj as any).rotation) || 0;
      const av = Number((proj as any).angularVelocity) || 0;
      (proj as any).rotation = this.normAngle(rot0 + av * dt);
    }

    const oldX = proj.x;
    const oldY = proj.y;

    proj.updatePosition(dt);

    const newX = proj.x;
    const newY = proj.y;

    // Raycast / Substepping to prevent tunneling through terrain
    const dist = Math.hypot(newX - oldX, newY - oldY);
    const pr = Math.max(1, Math.floor(proj.radius * 0.8)); // slightly smaller than visual radius for forgiveness
    const maxStepLen = Math.max(1, pr * 0.75);
    const steps = Math.max(1, Math.min(360, Math.ceil(dist / maxStepLen)));
    const terrainOffsets = isGrenade ? this.getGrenadeRingOffsets(pr) : circleOffsets(pr);

    const sweepMinX = Math.min(oldX, newX) - proj.radius - 12;
    const sweepMaxX = Math.max(oldX, newX) + proj.radius + 12;
    const sweepMinY = Math.min(oldY, newY) - proj.radius - 12;
    const sweepMaxY = Math.max(oldY, newY) + proj.radius + 12;

    const playerCandidates: any[] = [];
    for (const player of state.players) {
      if (player.health <= 0) continue;
      const r = Math.max(player.width || 0, player.height || 0) * 0.8 + 4;
      const rr = r + proj.radius;
      if (player.x < sweepMinX - rr || player.x > sweepMaxX + rr || player.y < sweepMinY - rr || player.y > sweepMaxY + rr) continue;
      playerCandidates.push({ player, r });
    }

    const propCandidates: any[] = [];
    for (const prop of state.props) {
      const r = prop.radius + proj.radius;
      if (prop.x < sweepMinX - r || prop.x > sweepMaxX + r || prop.y < sweepMinY - r || prop.y > sweepMaxY + r) continue;
      propCandidates.push({ prop, r });
    }

    const logoCandidates: any[] = [];
    if (state.brandLogos) {
      for (const logo of state.brandLogos) {
        const halfW = logo.collisionWidth / 2 + proj.radius;
        const halfH = logo.collisionHeight / 2 + proj.radius;
        if (logo.x < sweepMinX - halfW || logo.x > sweepMaxX + halfW || logo.y < sweepMinY - halfH || logo.y > sweepMaxY + halfH) continue;
        logoCandidates.push(logo);
      }
    }

    let hitTerrain = false;
    let hitEntity = false;
    let hitEntityType: 'player' | 'prop' | 'logo' | null = null;
    let hitEntityRef: any = null;
    let hitMaterial = 0;
    let hitX = newX;
    let hitY = newY;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const checkX = oldX + (newX - oldX) * t;
      const checkY = oldY + (newY - oldY) * t;

      // 1. Check Players
      for (const c of playerCandidates) {
        const player = c.player;
        const playerRadius = c.r;
        
        // Prevent immediate self-collision when shooting
        if (player === (proj as any).owner && (proj as any).framesAlive !== undefined && (proj as any).framesAlive < 5) {
          continue;
        }

        if (MathUtils.distance(checkX, checkY, player.x, player.y) < playerRadius + proj.radius) {
          hitEntity = true;
          hitEntityType = 'player';
          hitEntityRef = player;
          hitX = checkX;
          hitY = checkY;
          break;
        }
      }
      if (hitEntity) break;

      // 2. Check Props
      for (const c of propCandidates) {
        const prop = c.prop;
        if (MathUtils.distance(checkX, checkY, prop.x, prop.y) < c.r) {
          hitEntity = true;
          hitEntityType = 'prop';
          hitEntityRef = prop;
          hitX = checkX;
          hitY = checkY;
          break;
        }
      }
      if (hitEntity) break;

      // 3. Check BrandLogos
      if (logoCandidates.length > 0) {
        for (const logo of logoCandidates) {
          const halfW = logo.collisionWidth / 2;
          const halfH = logo.collisionHeight / 2;

          // Transform checkX, checkY into logo's local space to account for its rotation
          const dx = checkX - logo.x;
          const dy = checkY - logo.y;
          const cosA = Math.cos(-logo.angle);
          const sinA = Math.sin(-logo.angle);
          const localX = dx * cosA - dy * sinA;
          const localY = dx * sinA + dy * cosA;

          // Check against the unrotated bounding box in local space
          if (localX > -halfW - proj.radius && localX < halfW + proj.radius &&
              localY > -halfH - proj.radius && localY < halfH + proj.radius) {
            hitEntity = true;
            hitEntityType = 'logo';
            hitEntityRef = logo;
            hitX = checkX;
            hitY = checkY;
            break;
          }
        }
      }
      if (hitEntity) break;

      // 4. Check Terrain
      const px = Math.floor(checkX);
      const py = Math.floor(checkY);

      for (const o of terrainOffsets) {
        const x = px + o.dx;
        const y = py + o.dy;
        if (x < 0 || x >= state.width || y < 0 || y >= state.height) continue;
        const mat = state.landscape.getMaterial(x, y);
        if (mat > 0) {
          hitTerrain = true;
          hitMaterial = mat;
          hitX = checkX;
          hitY = checkY;
          break;
        }
      }
      if (hitTerrain) break;
    }

    // Move projectile to exact collision point
    proj.x = hitX;
    proj.y = hitY;

    const traveled = Math.hypot(hitX - oldX, hitY - oldY);
    if (Number.isFinite(proj.rangeRemaining)) {
      proj.rangeRemaining -= traveled;
      if (proj.rangeRemaining <= 0) {
        this.explode(proj, state, 1.0);
        return;
      }
    }

    if (hitTerrain || hitEntity) {
      if (isGrenade) {
        let nx = 0;
        let ny = -1;
        if (hitTerrain) {
          const mvx = hitX - oldX;
          const mvy = hitY - oldY;
          const mn = Math.hypot(mvx, mvy) || 1;
          const dirX = mvx / mn;
          const dirY = mvy / mn;
          const sampleX = hitX - dirX * (proj.radius + 0.75);
          const sampleY = hitY - dirY * (proj.radius + 0.75);
          const n = this.getTerrainNormal(state, sampleX, sampleY);
          nx = n.nx;
          ny = n.ny;
        } else {
          if (hitEntityType === 'player' && hitEntityRef) {
            const dx = hitX - hitEntityRef.x;
            const dy = hitY - hitEntityRef.y;
            const n = Math.hypot(dx, dy) || 1;
            nx = dx / n;
            ny = dy / n;
          } else if (hitEntityType === 'prop' && hitEntityRef) {
            const dx = hitX - hitEntityRef.x;
            const dy = hitY - hitEntityRef.y;
            const n = Math.hypot(dx, dy) || 1;
            nx = dx / n;
            ny = dy / n;
          } else if (hitEntityType === 'logo' && hitEntityRef) {
            const logo = hitEntityRef;
            const halfW = logo.collisionWidth / 2;
            const halfH = logo.collisionHeight / 2;
            const dx = hitX - logo.x;
            const dy = hitY - logo.y;
            const cosA = Math.cos(-logo.angle);
            const sinA = Math.sin(-logo.angle);
            const localX = dx * cosA - dy * sinA;
            const localY = dx * sinA + dy * cosA;
            const penX = halfW - Math.abs(localX);
            const penY = halfH - Math.abs(localY);
            let nxL = 0;
            let nyL = 0;
            if (penX < penY) nxL = localX >= 0 ? 1 : -1;
            else nyL = localY >= 0 ? 1 : -1;
            const cosW = Math.cos(logo.angle);
            const sinW = Math.sin(logo.angle);
            nx = nxL * cosW - nyL * sinW;
            ny = nxL * sinW + nyL * cosW;
          }
        }

        const vDotN = proj.vx * nx + proj.vy * ny;
        if (vDotN > 0) {
          nx = -nx;
          ny = -ny;
        }

        const bounceTerrain = (proj as any).bounce ?? 0.45;
        const bounce = hitEntityType === 'player' ? bounceTerrain / 3 : bounceTerrain;
        const baseFriction = (proj as any).friction ?? 0.85;
        const surfaceFactor = Math.max(0, Math.min(1, -ny));
        const friction = settlePhase ? (1 - (1 - baseFriction) * surfaceFactor) : 1;
        const vBefore = { vx: proj.vx, vy: proj.vy };
        const posBefore = { x: proj.x, y: proj.y };
        this.bounceOnNormal(proj as any, nx, ny, bounce, friction, proj.radius + 0.5);
        let clamped = false;
        try {
          const dvx = proj.vx - vBefore.vx;
          const dvy = proj.vy - vBefore.vy;
          const dv = Math.hypot(dvx, dvy);
          const speed0 = Math.hypot(vBefore.vx, vBefore.vy);
          const dvCap = Math.max(280, speed0 * 2.2);
          if (dv > dvCap) {
            const s = dvCap / dv;
            proj.vx = vBefore.vx + dvx * s;
            proj.vy = vBefore.vy + dvy * s;
            clamped = true;
          }
          const speed1 = Math.hypot(proj.vx, proj.vy);
          const speedCap = Math.max(420, speed0 * 1.6 + 180);
          if (speed1 > speedCap) {
            const s2 = speedCap / speed1;
            proj.vx *= s2;
            proj.vy *= s2;
            clamped = true;
          }
        } catch {}
        if (this.onTrace) {
          try {
            this.onTrace({
              type: 'physics_collision',
              t: (state as any).matchDuration || 0,
              kind: 'projectile',
              weaponId: proj.weaponId,
              isGrenade: true,
              hitTerrain,
              hitEntity,
              mat: hitMaterial,
              pos: { x: hitX, y: hitY },
              normal: { x: nx, y: ny },
              vBefore,
              vAfter: { vx: proj.vx, vy: proj.vy },
              posBefore,
              posAfter: { x: proj.x, y: proj.y },
              clamped: clamped ? 1 : 0
            });
          } catch {}
        }
        if (hitTerrain) {
          for (let k = 0; k < 6; k++) {
            let inside = false;
            const px = Math.floor(proj.x);
            const py = Math.floor(proj.y);
            for (const o of terrainOffsets) {
              const x = px + o.dx;
              const y = py + o.dy;
              if (x < 0 || x >= state.width || y < 0 || y >= state.height) continue;
              if (state.landscape.getMaterial(x, y) > 0) {
                inside = true;
                break;
              }
            }
            if (!inside) break;
            const n2 = this.getTerrainNormal(state, proj.x, proj.y);
            proj.x += n2.nx * 0.9;
            proj.y += n2.ny * 0.9;
          }
        }
        const stopSpeed = Number.isFinite((proj as any).stopSpeed) ? Math.max(0, Number((proj as any).stopSpeed)) : 0;
        const speed = Math.hypot(proj.vx, proj.vy);
        const floorNy = -0.85;
        const canRest = settlePhase && ny <= floorNy;
        if (canRest && stopSpeed > 0 && speed <= stopSpeed) {
          proj.vx = 0;
          proj.vy = 0;
          (proj as any).resting = true;
          (proj as any).angularVelocity = 0;
        } else if (settlePhase && ny <= floorNy) {
          if (Math.abs(proj.vx) < 0.75) proj.vx = 0;
          if (Math.abs(proj.vy) < 0.75) proj.vy = 0;
        }
        this.updateGrenadeSpin(proj as any, settlePhase);
        return;
      }

      // Determine material strength modifier for explosion radius
      let radiusModifier = 1.0;
      if (hitTerrain) {
        if (hitMaterial === 2) radiusModifier = 0.75; // Meteorite Rock is harder
        else if (hitMaterial === 4) radiusModifier = 0.5; // Metal Platform is very hard
        else if (hitMaterial === 5) radiusModifier = 2.0; // Snow is very weak
        else if (hitMaterial === 255) radiusModifier = 0.3; // Barely scratches the indestructible border
      }

      this.explode(proj, state, radiusModifier);
      return;
    }

    // (Projectile-projectile collision removed to prevent multi-shot instant explosions)

    // Substepping collision logic handles all these now!
    // Also check brand logos
    // Handled in substepping now!

    // Out of bounds / Hitting the unbreakable cosmic barrier (30px border)
    if (proj.x <= 30 || proj.x >= state.width - 30 || proj.y >= state.height - 30) {
      const isGrenade = typeof (proj as any).fuseRemaining === 'number';
      if (!isGrenade) {
        this.explode(proj, state, 0.3); // Minimal crater on border
        return;
      }

      if (proj.x <= 30) {
        proj.x = 30 + proj.radius + 0.5;
        proj.vx = Math.abs(proj.vx) * ((proj as any).bounce ?? 0.45);
        this.updateGrenadeSpin(proj as any, settlePhase);
        return;
      }
      if (proj.x >= state.width - 30) {
        proj.x = state.width - 30 - proj.radius - 0.5;
        proj.vx = -Math.abs(proj.vx) * ((proj as any).bounce ?? 0.45);
        this.updateGrenadeSpin(proj as any, settlePhase);
        return;
      }
      if (proj.y >= state.height - 30) {
        proj.y = state.height - 30 - proj.radius - 0.5;
        proj.vy = -Math.abs(proj.vy) * ((proj as any).bounce ?? 0.45);
        const fr = settlePhase ? ((proj as any).friction ?? 0.85) : 1;
        proj.vx *= fr;
        const stopSpeed = Number.isFinite((proj as any).stopSpeed) ? Math.max(0, Number((proj as any).stopSpeed)) : 0;
        const speed = Math.hypot(proj.vx, proj.vy);
        if (settlePhase && stopSpeed > 0 && speed <= stopSpeed) {
          proj.vx = 0;
          proj.vy = 0;
          (proj as any).resting = true;
          (proj as any).angularVelocity = 0;
        }
        this.updateGrenadeSpin(proj as any, settlePhase);
        return;
      }
    }
  }

  private updateGrenadeProjectile(proj: any, state: GameState, dt: number, settlePhase: boolean): void {
    if (!this.terrainDf) this.terrainDf = new TerrainDistanceField(state.landscape);
    else if ((this.terrainDf as any).landscape !== state.landscape) this.terrainDf.setLandscape(state.landscape);

    if (proj.resting) {
      proj.vx = 0;
      proj.vy = 0;
      proj.angularVelocity = 0;
    }
    if (!proj.resting) {
      proj.vy += this.gravity * dt;
      if (state.wind) proj.vx += state.wind * dt * proj.windMultiplier;
    }

    const mass = 1.0;
    const r = Math.max(1, Number(proj.radius) || 6);
    const inertia = 0.5 * mass * r * r;
    const invM = 1 / mass;
    const invI = inertia > 1e-6 ? 1 / inertia : 0;

    const restitution = Math.max(0, Math.min(0.95, Number(proj.bounce) || 0.45));
    const muDyn = Math.max(0, Math.min(2.0, Number(proj.friction) || 0.85));
    const muStatic = Math.min(2.2, muDyn + 0.2);
    const rollRes = 0.08;

    let dtRem = Math.max(0, dt);
    let it = 0;

    const stepRotation = (h: number) => {
      const rot0 = Number(proj.rotation) || 0;
      const av = Number(proj.angularVelocity) || 0;
      proj.rotation = this.normAngle(rot0 + av * h);
    };

    const clampSpeed = (vx0: number, vy0: number) => {
      const dvx = proj.vx - vx0;
      const dvy = proj.vy - vy0;
      const dv = Math.hypot(dvx, dvy);
      const speed0 = Math.hypot(vx0, vy0);
      const dvCap = Math.max(280, speed0 * 2.2);
      if (dv > dvCap) {
        const s = dvCap / dv;
        proj.vx = vx0 + dvx * s;
        proj.vy = vy0 + dvy * s;
      }
      const speed1 = Math.hypot(proj.vx, proj.vy);
      const speedCap = Math.max(420, speed0 * 1.6 + 180);
      if (speed1 > speedCap) {
        const s2 = speedCap / speed1;
        proj.vx *= s2;
        proj.vy *= s2;
      }
    };

    const findCircleHit01 = (p0x: number, p0y: number, p1x: number, p1y: number, cx: number, cy: number, rad: number): number | null => {
      const dx = p1x - p0x;
      const dy = p1y - p0y;
      const fx = p0x - cx;
      const fy = p0y - cy;
      const a = dx * dx + dy * dy;
      if (a < 1e-9) return null;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - rad * rad;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const s = Math.sqrt(disc);
      const t0 = (-b - s) / (2 * a);
      if (t0 >= 0 && t0 <= 1) return t0;
      const t1 = (-b + s) / (2 * a);
      if (t1 >= 0 && t1 <= 1) return t1;
      return null;
    };

    while (dtRem > 1e-6 && it++ < 6) {
      const vLen = Math.hypot(proj.vx || 0, proj.vy || 0);
      if (!Number.isFinite(vLen) || vLen < 1e-6) {
        const sd0 = this.terrainDf.signedDistance(proj.x, proj.y);
        const sep0 = sd0 - r;
        if (sep0 < 0) {
          const n0 = this.terrainDf.normal(proj.x, proj.y);
          const push = (-sep0) + 0.25;
          proj.x += n0.nx * push;
          proj.y += n0.ny * push;
        }
        break;
      }

      const p0x = proj.x;
      const p0y = proj.y;
      const p1x = proj.x + proj.vx * dtRem;
      const p1y = proj.y + proj.vy * dtRem;

      let bestEntityT: number | null = null;
      let bestEntityType: 'player' | 'prop' | null = null;
      let bestEntityRef: any = null;
      let bestEntityNx = 0;
      let bestEntityNy = -1;

      const sweepMinX = Math.min(p0x, p1x) - r - 12;
      const sweepMaxX = Math.max(p0x, p1x) + r + 12;
      const sweepMinY = Math.min(p0y, p1y) - r - 12;
      const sweepMaxY = Math.max(p0y, p1y) + r + 12;

      for (const player of state.players) {
        if (player.health <= 0) continue;
        if (player === proj.owner && proj.framesAlive !== undefined && proj.framesAlive < 5) continue;
        const pr = Math.max(player.width || 0, player.height || 0) * 0.8 + 4;
        const rr = pr + r;
        if (player.x < sweepMinX - rr || player.x > sweepMaxX + rr || player.y < sweepMinY - rr || player.y > sweepMaxY + rr) continue;
        const tHit = findCircleHit01(p0x, p0y, p1x, p1y, player.x, player.y, rr);
        if (tHit === null) continue;
        if (bestEntityT === null || tHit < bestEntityT) {
          const hx = p0x + (p1x - p0x) * tHit;
          const hy = p0y + (p1y - p0y) * tHit;
          const dx = hx - player.x;
          const dy = hy - player.y;
          const nn = Math.hypot(dx, dy) || 1;
          bestEntityNx = dx / nn;
          bestEntityNy = dy / nn;
          bestEntityT = tHit;
          bestEntityType = 'player';
          bestEntityRef = player;
        }
      }

      for (const prop of state.props) {
        const rr = prop.radius + r;
        if (prop.x < sweepMinX - rr || prop.x > sweepMaxX + rr || prop.y < sweepMinY - rr || prop.y > sweepMaxY + rr) continue;
        const tHit = findCircleHit01(p0x, p0y, p1x, p1y, prop.x, prop.y, rr);
        if (tHit === null) continue;
        if (bestEntityT === null || tHit < bestEntityT) {
          const hx = p0x + (p1x - p0x) * tHit;
          const hy = p0y + (p1y - p0y) * tHit;
          const dx = hx - prop.x;
          const dy = hy - prop.y;
          const nn = Math.hypot(dx, dy) || 1;
          bestEntityNx = dx / nn;
          bestEntityNy = dy / nn;
          bestEntityT = tHit;
          bestEntityType = 'prop';
          bestEntityRef = prop;
        }
      }

      const sd = this.terrainDf.signedDistance(p0x, p0y);
      const sep = sd - r;
      const tTerrain = sep > 0 ? Math.min(dtRem, (0.9 * sep) / vLen) : 0;
      const tEntity = bestEntityT !== null ? bestEntityT * dtRem : Infinity;

      const moveT = Math.min(dtRem, tTerrain > 0 ? tTerrain : dtRem, tEntity);

      const nxMove = proj.vx * moveT;
      const nyMove = proj.vy * moveT;
      proj.x += nxMove;
      proj.y += nyMove;
      stepRotation(moveT);

      const traveled = Math.hypot(nxMove, nyMove);
      if (Number.isFinite(proj.rangeRemaining)) {
        proj.rangeRemaining -= traveled;
        if (proj.rangeRemaining <= 0) {
          this.explode(proj, state, 1.0);
          return;
        }
      }

      dtRem -= moveT;

      if (bestEntityT !== null && moveT === tEntity && bestEntityType && bestEntityRef) {
        const vx0 = proj.vx;
        const vy0 = proj.vy;
        const n = { x: bestEntityNx, y: bestEntityNy };
        const vDotN = proj.vx * n.x + proj.vy * n.y;
        if (vDotN > 0) {
          n.x = -n.x;
          n.y = -n.y;
        }

        const rx = -n.x * r;
        const ry = -n.y * r;
        const vcx = proj.vx + (-proj.angularVelocity * ry);
        const vcy = proj.vy + (proj.angularVelocity * rx);
        const vn = vcx * n.x + vcy * n.y;
        if (vn < 0) {
          const jn = (-(1 + restitution) * vn) / invM;
          proj.vx += n.x * jn * invM;
          proj.vy += n.y * jn * invM;

          const tx = -n.y;
          const ty = n.x;
          const vt = vcx * tx + vcy * ty;
          const rt = rx * ty - ry * tx;
          const denomT = invM + rt * rt * invI;
          const jt0 = denomT > 1e-6 ? (-vt) / denomT : 0;
          const jtMax = muDyn * jn;
          const jt = Math.max(-jtMax, Math.min(jtMax, jt0));
          proj.vx += tx * jt * invM;
          proj.vy += ty * jt * invM;
          proj.angularVelocity += rt * jt * invI;
        }
        clampSpeed(vx0, vy0);
        if (bestEntityType === 'player') {
          proj.vx *= 0.92;
          proj.vy *= 0.92;
        }
        continue;
      }

      const sd1 = this.terrainDf.signedDistance(proj.x, proj.y);
      const sep1 = sd1 - r;
      if (sep1 <= 0.25) {
        const vx0 = proj.vx;
        const vy0 = proj.vy;
        const n = this.terrainDf.normal(proj.x, proj.y);

        const vDotN = proj.vx * n.nx + proj.vy * n.ny;
        if (vDotN > 0) {
          n.nx = -n.nx;
          n.ny = -n.ny;
        }

        const push = (-sep1) + 0.35;
        proj.x += n.nx * push;
        proj.y += n.ny * push;

        const rx = -n.nx * r;
        const ry = -n.ny * r;
        const vcx = proj.vx + (-proj.angularVelocity * ry);
        const vcy = proj.vy + (proj.angularVelocity * rx);
        const vn = vcx * n.nx + vcy * n.ny;
        if (vn < 0) {
          const jn = (-(1 + restitution) * vn) / invM;
          proj.vx += n.nx * jn * invM;
          proj.vy += n.ny * jn * invM;

          const tx = -n.ny;
          const ty = n.nx;
          const vt = vcx * tx + vcy * ty;
          const rt = rx * ty - ry * tx;
          const denomT = invM + rt * rt * invI;
          const jt0 = denomT > 1e-6 ? (-vt) / denomT : 0;
          const jtMax = (Math.abs(vt) < 18 ? muStatic : muDyn) * jn;
          const jt = Math.max(-jtMax, Math.min(jtMax, jt0));
          proj.vx += tx * jt * invM;
          proj.vy += ty * jt * invM;
          proj.angularVelocity += rt * jt * invI;

          proj.angularVelocity *= (1 - rollRes);
          proj.vx *= (1 - rollRes * 0.25);
          proj.vy *= (1 - rollRes * 0.25);
        }

        clampSpeed(vx0, vy0);

        const speed = Math.hypot(proj.vx, proj.vy);
        const stopSpeed = Number.isFinite(proj.stopSpeed) ? Math.max(0, Number(proj.stopSpeed)) : 0;
        if (stopSpeed > 0 && speed <= stopSpeed && Math.abs(proj.angularVelocity) <= 2.2 && n.ny <= -0.7) {
          proj.vx = 0;
          proj.vy = 0;
          proj.angularVelocity = 0;
          proj.resting = true;
          break;
        }
        if (settlePhase && n.ny <= -0.7) {
          proj.vx *= 0.88;
          proj.vy *= 0.88;
          proj.angularVelocity *= 0.84;
        }
        continue;
      }

      if (proj.x <= 30 || proj.x >= state.width - 30 || proj.y >= state.height - 30) {
        if (proj.x <= 30) {
          proj.x = 30 + r + 0.5;
          proj.vx = Math.abs(proj.vx) * restitution;
        } else if (proj.x >= state.width - 30) {
          proj.x = state.width - 30 - r - 0.5;
          proj.vx = -Math.abs(proj.vx) * restitution;
        } else if (proj.y >= state.height - 30) {
          proj.y = state.height - 30 - r - 0.5;
          proj.vy = -Math.abs(proj.vy) * restitution;
          proj.vx *= 0.85;
        }
        stepRotation(0);
        break;
      }
    }
  }

  public explodeAt(
    state: GameState,
    x: number,
    y: number,
    cfg: { weaponId: string; damage: number; explosionRadius: number; knockback: number; crater: boolean; owner: any | null },
    radiusModifier: number = 1.0
  ): void {
    const finalRadius = cfg.explosionRadius * radiusModifier;

    if (cfg.crater) {
      state.landscape.createCrater(Math.floor(x), Math.floor(y), finalRadius);
    }

    state.explosions.push(new Explosion(x, y, finalRadius, cfg.weaponId));
    AudioManager.playExplosion(cfg.weaponId);

    if (this.onExplode) {
      this.onExplode(x, y);
    }

    for (const player of state.players) {
      if (player.health <= 0) continue;
      const playerRadius = player.width / 2;
      const dist = MathUtils.distance(x, y, player.x, player.y);
      if (dist <= finalRadius + playerRadius) {
        const damageRatio = 1 - (dist / (finalRadius + playerRadius));
        const actualDamage = Math.max(1, cfg.damage * damageRatio);
        player.takeDamage(actualDamage);
        this.addFloatingText(state, player.x, player.y - 20, `-${Math.round(actualDamage)}`, '#FF0000');
        if (this.onHurt) this.onHurt();
        AudioManager.playDamage();
        
        if (cfg.owner && cfg.owner !== player) {
          cfg.owner.damageDealt += actualDamage;
        }

        const dx = player.x - x;
        const dy = player.y - y;
        const norm = Math.sqrt(dx*dx + dy*dy) || 1;
        const baseKnockback = Math.max(0, Math.min(600, cfg.knockback || 0));
        const k = baseKnockback * damageRatio;
        player.vx += (dx / norm) * k;
        player.vy += (dy / norm) * k;
        player.isJumping = true;
      }
    }

    for (const prop of state.props) {
      const dist = MathUtils.distance(x, y, prop.x, prop.y);
      if (dist < finalRadius * 1.5) {
        const damage = Math.max(10, 100 * (1 - dist / (finalRadius * 1.5)));
        prop.health -= damage;
        const angle = Math.atan2(prop.y - y, prop.x - x);
        const knockback = cfg.knockback || cfg.damage || 50;
        prop.vx += Math.cos(angle) * knockback * 2;
        prop.vy += Math.sin(angle) * knockback * 2;
        prop.rotation += (Random.next() - 0.5) * 5;
        prop.isSettled = false;
      }
    }

    if (state.brandLogos && state.brandLogos.length > 0) {
      for (const logo of state.brandLogos) {
        if (!logo.isSolid || logo.health <= 0) continue;

        const effectiveRadius = Math.max(logo.width, logo.height) / 2;
        const dist = MathUtils.distance(x, y, logo.x, logo.y);
        if (dist <= finalRadius + effectiveRadius) {
          const damageRatio = 1 - (dist / (finalRadius + effectiveRadius));
          const damage = Math.max(1, cfg.damage * damageRatio);
          logo.takeDamage(damage);
          logo.takeHit(x, y, finalRadius);
        }
      }

      state.brandLogos = state.brandLogos.filter(l => l.health > 0);
    }
  }

  private explode(proj: Projectile, state: GameState, radiusModifier: number = 1.0): void {
    const owner = (proj as any).owner;
    proj.active = false;
    this.explodeAt(
      state,
      proj.x,
      proj.y,
      { weaponId: proj.weaponId, damage: proj.damage, explosionRadius: proj.explosionRadius, knockback: proj.knockback, crater: (proj as any).crater !== false, owner },
      radiusModifier
    );
  }
}
