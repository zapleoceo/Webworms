import { getWeaponByEquipmentId, isWeaponEquipment } from '../equipment/EquipmentRegistry';
import type { Weapon } from '../models/Weapon';
import type { AIDifficulty, AIDifficultyConfig } from './AIDifficulty';
import { AI_DIFFICULTY } from './AIDifficulty';
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

function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng());
  const v = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

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

function chooseTarget(difficulty: AIDifficulty, rng: Rng, shooter: BotWormSnapshot, enemies: BotWormSnapshot[]): BotWormSnapshot | null {
  const alive = enemies.filter(e => e.health > 0);
  if (alive.length === 0) return null;

  if (difficulty === 'easy') {
    return alive[Math.floor(rng() * alive.length)] || alive[0];
  }

  const scored = alive.map(t => {
    const d = Math.hypot(t.x - shooter.x, t.y - shooter.y);
    const lowHp = (100 - t.health) / 100;
    const score = (difficulty === 'hard' ? 0.55 : 0.35) * lowHp + 0.65 * (1 / Math.max(60, d));
    return { t, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.t || alive[0];
}

function sampleAngles(cfg: AIDifficultyConfig): number[] {
  const max = 78 * (Math.PI / 180);
  const min = -78 * (Math.PI / 180);
  const n = Math.max(6, cfg.angleSamples);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push(min + (max - min) * t);
  }
  return out;
}

function samplePowers(cfg: AIDifficultyConfig): number[] {
  const lo = 22;
  const hi = 100;
  const n = Math.max(4, cfg.powerSamples);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
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
  difficulty: AIDifficulty,
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[]
): ScoredAction | null {
  const cfg = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.medium;
  const target = chooseTarget(difficulty, rng, shooter, enemies);
  if (!target) return null;

  const weapons = weaponCandidates(shooter);
  if (weapons.length === 0) return null;

  const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y);
  const ordered = pickWeaponByRange(weapons, dist);

  const angleList = sampleAngles(cfg);
  const powerList = samplePowers(cfg);

  const targetRadius = 10;

  let best: { score: number; global: number; power: number; weaponIndex: number; impact: { x: number; y: number }; weapon: Weapon } | null = null;

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
            wind: cfg.considerWind ? world.wind : 0,
            windMultiplier: weapon.windMultiplier || 0,
            radius: weapon.id === 'grenade' ? 6 : 3,
            dt: 1 / 60,
            maxTime: weapon.id === 'grenade' ? 3.0 : 2.2
          },
          { x: target.x, y: target.y },
          targetRadius
        );

        const miss = res.minDistToTarget;
        const hitBonus = res.hitTarget ? 2000 : 0;
        const splash = weapon.explosionRadius * 0.75;
        const splashScore = Math.max(0, splash - miss) * 4;
        let score = hitBonus + splashScore - miss;

        const safeRadius = weapon.explosionRadius + 14;
        for (const ally of allies) {
          if (ally.health <= 0) continue;
          const d = Math.hypot(res.end.x - ally.x, res.end.y - ally.y);
          if (d < safeRadius) score -= 100000;
        }

        if (!best || score > best.score) {
          best = { score, global, power, weaponIndex: w.index, impact: res.end, weapon };
        }
      }
    }
    if (difficulty === 'easy' && best && best.score > 1500) break;
  }

  if (!best) return null;

  const mistake = rng() < cfg.weaponMistakeChance;
  if (mistake && weapons.length > 1) {
    const alt = weapons[Math.floor(rng() * weapons.length)];
    if (alt) best.weaponIndex = alt.index;
  }

  const noisyGlobal = best.global + gaussian(rng) * cfg.aimAngleNoiseRad;
  const noisyPower = clamp(best.power + gaussian(rng) * cfg.aimPowerNoise, 10, 100);
  const local = localAimFromGlobal(noisyGlobal);

  return {
    action: {
      weaponIndex: best.weaponIndex,
      facingRight: local.facingRight,
      aimAngle: local.aimAngle,
      power: noisyPower,
      targetId: target.id
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
  difficulty: AIDifficulty,
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[]
): BotAction | null {
  const allies = [shooter];
  return chooseBotActionScored(difficulty, rng, world, shooter, enemies, allies)?.action || null;
}

export function chooseBotPlan(
  difficulty: AIDifficulty,
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[]
): BotPlan | null {
  const maxSpeed = 22.75 * (shooter.speedMultiplier || 1);
  const maxMoveDist = Math.max(0, maxSpeed * 25);
  const xs = [
    shooter.x,
    shooter.x - maxMoveDist * 0.9,
    shooter.x - maxMoveDist * 0.6,
    shooter.x - maxMoveDist * 0.3,
    shooter.x + maxMoveDist * 0.3,
    shooter.x + maxMoveDist * 0.6,
    shooter.x + maxMoveDist * 0.9
  ].map(x => clamp(x, 30, world.terrain.width - 30));

  const uniq: number[] = [];
  for (const x of xs) {
    if (uniq.every(u => Math.abs(u - x) > 24)) uniq.push(x);
  }

  let best: { plan: BotPlan; score: number } | null = null;

  for (const x of uniq) {
    const ySolid = surfaceY(world.terrain, x);
    const y = ySolid === null ? shooter.y : (ySolid - 1 - shooter.height / 2);
    const moveDist = Math.hypot(x - shooter.x, y - shooter.y);
    const movePenalty = moveDist * 0.35;
    const s2: BotWormSnapshot = { ...shooter, x, y };
    const scored = chooseBotActionScored(difficulty, rng, world, s2, enemies, allies);
    if (!scored) continue;
    const totalScore = scored.score - movePenalty;
    if (!best || totalScore > best.score) {
      best = { score: totalScore, plan: { moveTo: moveDist > 20 ? { x, y } : undefined, action: scored.action } };
    }
  }

  return best?.plan || null;
}
