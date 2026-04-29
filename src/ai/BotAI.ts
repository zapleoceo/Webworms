import { getWeaponByEquipmentId, isWeaponEquipment } from '../equipment/EquipmentRegistry';
import type { Weapon } from '../models/Weapon';
import type { AIDifficulty, BotConfig } from './BotConfig';
import { DEFAULT_BOT_CONFIG } from './BotConfig';
import { gunMuzzlePosition, simulateTrajectory, type TerrainQuery } from './PhysicsHelper';

export type Rng = () => number;

export interface BotWorldSnapshot {
  gravity: number;
  wind: number;
  terrain: TerrainQuery;
}

export interface BotWormSnapshot {
  id: string;
  team: 'team1' | 'team2';
  x: number;
  y: number;
  height: number;
  health: number;
  speedMultiplier?: number;
  equipmentIds: string[];
  weaponCooldowns: Record<string, number>;
}

export interface BotAction {
  weaponIndex: number;
  facingRight: boolean;
  aimAngle: number;
  power: number;
  targetId: string;
}

export interface BotPlan {
  moveTo?: { x: number; y: number };
  action: BotAction;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const angleNorm = (a: number): number => {
  const TAU = Math.PI * 2;
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

function localAimFromGlobal(global: number): { facingRight: boolean; aimAngle: number } {
  const facingRight = Math.cos(global) >= 0;
  if (facingRight) {
    return { facingRight: true, aimAngle: clamp(angleNorm(global), -Math.PI / 2, Math.PI / 2) };
  }
  const aimAngle = clamp(angleNorm(Math.PI - global), -Math.PI / 2, Math.PI / 2);
  return { facingRight: false, aimAngle };
}

function weaponCandidates(shooter: BotWormSnapshot): Array<{ index: number; weapon: Weapon; id: string }> {
  const out: Array<{ index: number; weapon: Weapon; id: string }> = [];
  for (let i = 0; i < shooter.equipmentIds.length; i++) {
    const id = shooter.equipmentIds[i];
    if (!isWeaponEquipment(id)) continue;
    const w = getWeaponByEquipmentId(id);
    if (!w) continue;
    if ((shooter.weaponCooldowns?.[id] || 0) > 0) continue;
    out.push({ index: i, weapon: w, id });
  }
  return out;
}

function sampleAngles(n: number): number[] {
  const max = 78 * (Math.PI / 180);
  const min = -78 * (Math.PI / 180);
  const cnt = Math.max(8, n);
  const out: number[] = [];
  for (let i = 0; i < cnt; i++) {
    const t = cnt === 1 ? 0.5 : i / (cnt - 1);
    out.push(min + (max - min) * t);
  }
  return out;
}

function samplePowers(n: number): number[] {
  const lo = 22;
  const hi = 100;
  const cnt = Math.max(6, n);
  const out: number[] = [];
  for (let i = 0; i < cnt; i++) {
    const t = cnt === 1 ? 1 : i / (cnt - 1);
    out.push(lo + (hi - lo) * t);
  }
  return out;
}

function pickWeaponByRange(weapons: Array<{ index: number; weapon: Weapon; id: string }>, dist: number): Array<{ index: number; weapon: Weapon; id: string }> {
  const byId = new Map(weapons.map(w => [w.id, w]));
  const pick = (ids: string[]) => ids.map(id => byId.get(id)).filter(Boolean) as any[];

  if (dist > 520) return pick(['rocket', 'bazooka', 'grenade', 'blaster', 'triple', 'minigun']).concat(weapons);
  if (dist > 280) return pick(['bazooka', 'rocket', 'grenade', 'blaster', 'triple', 'minigun']).concat(weapons);
  return pick(['grenade', 'triple', 'blaster', 'bazooka', 'minigun', 'rocket']).concat(weapons);
}

type ScoredAction = { action: BotAction; score: number; impact: { x: number; y: number } };

function chooseBotActionScored(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[],
  botCfg: BotConfig
): ScoredAction | null {
  const aliveEnemies = enemies.filter(e => e.health > 0);
  if (aliveEnemies.length === 0) return null;

  const weapons = weaponCandidates(shooter);
  if (weapons.length === 0) return null;

  const angleList = sampleAngles(18);
  const powerList = samplePowers(10);

  const targetRadius = 10;

  let best: { score: number; global: number; power: number; weaponIndex: number; impact: { x: number; y: number }; weapon: Weapon; target: BotWormSnapshot } | null = null;

  for (const target of aliveEnemies) {
    const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y);
    const ordered = pickWeaponByRange(weapons, dist);

    for (let wIdx = 0; wIdx < ordered.length; wIdx++) {
      const w = ordered[wIdx];
      const weapon = w.weapon;

      for (const localAngle of angleList) {
        const global = (target.x >= shooter.x) ? localAngle : (Math.PI - localAngle);
        for (const power of powerList) {
          let speed = power * 4.2 * (weapon.speedModifier || 1);
          if (weapon.id === 'blaster') speed = 750;
          const muzzle = gunMuzzlePosition(shooter, global);
          const res = simulateTrajectory(
            world.terrain,
            {
              start: muzzle,
              velocity: { x: Math.cos(global) * speed, y: Math.sin(global) * speed },
              gravity: world.gravity,
              wind: world.wind,
              windMultiplier: weapon.windMultiplier || 0,
              radius: weapon.id === 'grenade' ? 6 : 3,
              dt: 1 / 60,
              maxTime: weapon.id === 'grenade' ? botCfg.grenade.fuseSeconds : 2.2,
              mode: weapon.id === 'grenade' ? 'grenade' : 'projectile',
              grenade: weapon.id === 'grenade' ? botCfg.grenade : undefined
            },
            { x: target.x, y: target.y },
            targetRadius
          );

          const distEnd = Math.hypot(res.end.x - target.x, res.end.y - target.y);
          const miss = weapon.id === 'grenade' ? distEnd : res.minDistToTarget;

          const falloff = clamp(1 - miss / Math.max(1, weapon.explosionRadius), 0, 1);
          const expectedDamage = weapon.damage * falloff;
          const isKill = expectedDamage >= target.health && target.health > 0;
          let score = expectedDamage * botCfg.scoring.damageWeight - miss * botCfg.scoring.missWeight;
          if (isKill) score += botCfg.scoring.killBonus;

          const safeRadius = weapon.explosionRadius + botCfg.scoring.safeExtraRadius;
          let unsafe = false;
          for (const ally of allies) {
            if (ally.health <= 0) continue;
            const d = Math.hypot(res.end.x - ally.x, res.end.y - ally.y);
            if (d < safeRadius) {
              unsafe = true;
              break;
            }
          }
          if (unsafe) continue;

          if (!best || score > best.score) {
            best = { score, global, power, weaponIndex: w.index, impact: res.end, weapon, target };
          }
        }
      }
    }
  }

  if (!best) return null;

  const local = localAimFromGlobal(best.global);

  return {
    action: {
      weaponIndex: best.weaponIndex,
      facingRight: local.facingRight,
      aimAngle: local.aimAngle,
      power: best.power,
      targetId: best.target.id
    },
    score: best.score,
    impact: best.impact
  };
}

export function buildSnapshotFromState(
  state: any,
  gravity: number,
  terrain: TerrainQuery
): { world: BotWorldSnapshot; worms: BotWormSnapshot[] } {
  const worms: BotWormSnapshot[] = (state.players || []).map((p: any, idx: number) => ({
    id: String(idx),
    team: p.team,
    x: p.x,
    y: p.y,
    height: p.height || 10,
    health: p.health || 0,
    speedMultiplier: p.speedMultiplier || 1,
    equipmentIds: Array.isArray(p.equipmentIds) ? p.equipmentIds : [],
    weaponCooldowns: p.weaponCooldowns || {}
  }));
  return {
    world: { gravity, wind: state.wind || 0, terrain },
    worms
  };
}

export function terrainFromLandscape(landscape: any): TerrainQuery {
  return {
    width: landscape.width,
    height: landscape.height,
    isSolid: (x: number, y: number) => {
      if (y < 0) return false;
      return landscape.getMaterial(x, y) > 0;
    }
  };
}

function surfaceY(terrain: TerrainQuery, x: number): number | null {
  const px = Math.floor(x);
  if (px < 0 || px >= terrain.width) return null;
  for (let y = 0; y < terrain.height; y++) {
    if (terrain.isSolid(px, y)) return y;
  }
  return null;
}

export function chooseBotAction(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[] = [shooter],
  botCfg: BotConfig = DEFAULT_BOT_CONFIG
): BotAction | null {
  return chooseBotActionScored(rng, world, shooter, enemies, allies, botCfg)?.action || null;
}

export function chooseBotPlan(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[],
  botCfg: BotConfig,
  moveSeconds: number,
  ropeAttachBudget: number
): BotPlan | null {
  const maxSpeed = 22.75 * (shooter.speedMultiplier || 1);
  const maxMoveDist = Math.max(0, maxSpeed * Math.max(0, moveSeconds));
  const ropeRange = 252 * 0.85;
  const ropeBoost = ropeRange * Math.min(2, Math.max(0, ropeAttachBudget));

  const xs = [
    shooter.x,
    shooter.x - maxMoveDist * 0.9,
    shooter.x - maxMoveDist * 0.6,
    shooter.x - maxMoveDist * 0.3,
    shooter.x + maxMoveDist * 0.3,
    shooter.x + maxMoveDist * 0.6,
    shooter.x + maxMoveDist * 0.9
  ];

  if (ropeBoost > 0) {
    xs.push(shooter.x - (maxMoveDist * 0.6 + ropeBoost));
    xs.push(shooter.x + (maxMoveDist * 0.6 + ropeBoost));
  }

  const bounded = xs.map(x => clamp(x, 30, world.terrain.width - 30));

  const uniq: number[] = [];
  for (const x of bounded) {
    if (uniq.every(u => Math.abs(u - x) > 24)) uniq.push(x);
  }

  let best: { plan: BotPlan; score: number } | null = null;

  for (const x of uniq) {
    const ySolid = surfaceY(world.terrain, x);
    const y = ySolid === null ? shooter.y : (ySolid - 1 - shooter.height / 2);
    const moveDist = Math.hypot(x - shooter.x, y - shooter.y);
    const movePenalty = moveDist * botCfg.scoring.movePenaltyPerPx;
    const s2: BotWormSnapshot = { ...shooter, x, y };
    const scored = chooseBotActionScored(rng, world, s2, enemies, allies, botCfg);
    if (!scored) continue;
    const totalScore = scored.score - movePenalty;
    if (!best || totalScore > best.score) {
      best = { score: totalScore, plan: { moveTo: moveDist > 20 ? { x, y } : undefined, action: scored.action } };
    }
  }

  return best?.plan || null;
}
