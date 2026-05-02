import { getWeaponByEquipmentId, isWeaponEquipment } from '../equipment/EquipmentRegistry';
import type { Weapon } from '../models/Weapon';
import type { BotConfig } from './BotConfig';
import { DEFAULT_BOT_CONFIG } from './BotConfig';
import { gunMuzzlePosition, simulateTrajectory, type TerrainQuery } from './PhysicsHelper';
import type { AIDifficulty } from './AIDifficulty';

export type Rng = () => number;

export interface BotWorldSnapshot {
  gravity: number;
  wind: number;
  terrain: TerrainQuery;
  teamAmmo?: Record<'team1' | 'team2', { grenade: number }>;
}

export interface BotWormSnapshot {
  id: string;
  team: 'team1' | 'team2';
  x: number;
  y: number;
  width: number;
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
  movePath?: { waypoints: Array<{ x: number; y: number }>; primitive: 'walk' | 'jump' | 'rope' };
  action: BotAction;
  intent?: 'attack' | 'approach';
  intentReason?: Record<string, any>;
}

export type BotCandidateSummary = {
  weaponId: string;
  weaponIndex: number;
  targetId: string;
  globalAngle: number;
  power: number;
  miss: number;
  expectedDamage: number;
  score: number;
  impact: { x: number; y: number };
  selfDist: number;
  selfSafe: number;
  safeRadius: number;
  risk?: number;
};

export type BotDecisionTrace = {
  shooter: { id: string; team: 'team1' | 'team2'; x: number; y: number; health: number };
  targetId: string;
  chosen: BotCandidateSummary;
  bestByWeaponId: Record<string, BotCandidateSummary>;
  rejected: Record<string, number>;
};

type ShotMemoryEntry = { stateKey: string; shotKey: string; noRes: number; ff: number; targetId?: string; lastT?: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function shotStateKey(shooter: BotWormSnapshot, enemies: BotWormSnapshot[]): string {
  const sx = Math.floor(shooter.x / 32);
  const sy = Math.floor(shooter.y / 32);
  const closest = enemies
    .filter(e => e.health > 0)
    .map(e => ({ e, d: Math.hypot(e.x - shooter.x, e.y - shooter.y) }))
    .sort((a, b) => a.d - b.d)[0]?.e;
  const ex = closest ? Math.floor(closest.x / 64) : -1;
  const ey = closest ? Math.floor(closest.y / 64) : -1;
  return `${sx}:${sy}:${ex}:${ey}`;
}

function shotKeyFromLocal(weaponId: string, facingRight: boolean, aimAngle: number, power: number): string {
  const angleDeg = aimAngle * (180 / Math.PI);
  const angleBin = Math.round(angleDeg / 2);
  const powerBin = Math.round(power / 5);
  return `${weaponId}:${facingRight ? 1 : 0}:${angleBin}:${powerBin}`;
}

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

function destructibleWeaponCandidates(shooter: BotWormSnapshot): Array<{ index: number; weapon: Weapon; id: string }> {
  const out = weaponCandidates(shooter).filter(w => w.weapon.explosionRadius > 0 && w.weapon.damage > 0);
  out.sort((a, b) => b.weapon.explosionRadius - a.weapon.explosionRadius);
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

function sampleGrenadePowers(): number[] {
  const out: number[] = [];
  const add = (v: number) => {
    const x = Math.max(1, Math.min(100, Math.round(v)));
    if (!out.includes(x)) out.push(x);
  };
  for (const v of [5, 8, 12, 16, 20, 24, 28]) add(v);
  for (let v = 32; v <= 100; v += 8) add(v);
  out.sort((a, b) => a - b);
  return out;
}

function pickWeaponByRange(weapons: Array<{ index: number; weapon: Weapon; id: string }>, dist: number): Array<{ index: number; weapon: Weapon; id: string }> {
  const byId = new Map(weapons.map(w => [w.id, w]));
  const pick = (ids: string[]) => ids.map(id => byId.get(id)).filter(Boolean) as any[];

  if (dist > 520) return pick(['homing_missile', 'bazooka', 'plasma_gun', 'heavy_gun', 'handgun', 'minigun']).concat(weapons);
  if (dist > 280) return pick(['bazooka', 'homing_missile', 'grenade', 'plasma_gun', 'heavy_gun', 'minigun', 'handgun']).concat(weapons);
  return pick(['shotgun', 'flamethrower', 'grenade', 'heavy_gun', 'minigun', 'handgun', 'bazooka']).concat(weapons);
}

type ScoredAction = { action: BotAction; score: number; impact: { x: number; y: number }; trace?: BotDecisionTrace };

function isCircleBlocked(terrain: TerrainQuery, x: number, y: number, r: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const rr = Math.max(1, Math.floor(r));
  const pts = [
    [0, 0],
    [rr, 0],
    [-rr, 0],
    [0, rr],
    [0, -rr],
    [Math.floor(rr * 0.7), Math.floor(rr * 0.7)],
    [Math.floor(-rr * 0.7), Math.floor(rr * 0.7)],
    [Math.floor(rr * 0.7), Math.floor(-rr * 0.7)],
    [Math.floor(-rr * 0.7), Math.floor(-rr * 0.7)]
  ];
  for (const [dx, dy] of pts) {
    const tx = cx + dx;
    const ty = cy + dy;
    if (tx < 0 || tx >= terrain.width || ty < 0 || ty >= terrain.height) continue;
    if (terrain.isSolid(tx, ty)) return true;
  }
  return false;
}

function chooseBotActionScored(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[],
  botCfg: BotConfig,
  traceEnabled: boolean = false,
  difficulty: AIDifficulty = 'medium',
  shotMemory: ShotMemoryEntry[] = []
): ScoredAction | null {
  const aliveEnemies = enemies.filter(e => e.health > 0);
  if (aliveEnemies.length === 0) return null;

  const grenLeftRaw = (world as any)?.teamAmmo?.[shooter.team]?.grenade;
  const grenLimited = typeof grenLeftRaw === 'number' && Number.isFinite(grenLeftRaw);
  const grenLeft = grenLimited ? Math.max(0, Math.floor(grenLeftRaw)) : Infinity;
  const grenadeWindSpan = 35;

  const weapons = weaponCandidates(shooter);
  if (weapons.length === 0) return null;

  const angleList = sampleAngles(18);
  const grenadeAngleList = sampleAngles(28);
  const powerList = samplePowers(10);
  const grenadePowerList = sampleGrenadePowers();

  const targetRadius = 10;

  const stateKey = shotStateKey(shooter, aliveEnemies);
  const mem = new Map<string, ShotMemoryEntry>();
  for (const m of shotMemory) {
    if (!m || typeof m.stateKey !== 'string' || typeof m.shotKey !== 'string') continue;
    mem.set(`${m.stateKey}|${m.shotKey}`, m);
  }

  const aimPct = (botCfg.aimErrorPct && (botCfg.aimErrorPct as any)[difficulty]) ?? 0.12;
  const powPct = (botCfg.powerErrorPct && (botCfg.powerErrorPct as any)[difficulty]) ?? 0.08;
  const rangePenaltyPerPx = (botCfg as any).scoring?.rangePenaltyPerPx ?? 0.02;
  const friendlyDamageWeight = (botCfg as any).scoring?.friendlyDamageWeight ?? 4.0;
  const grenadeScarcityWeight = (botCfg as any).scoring?.grenadeScarcityWeight ?? 48;
  const grenadeCloseRangePx = (botCfg as any).scoring?.grenadeCloseRangePx ?? 170;
  const grenadeCloseAbsAngleMax = (botCfg as any).scoring?.grenadeCloseAbsAngleMax ?? 1.2;

  let best: { score: number; global: number; power: number; weaponIndex: number; impact: { x: number; y: number }; weaponId: string; expectedDamage: number; target: BotWormSnapshot; trace?: BotDecisionTrace } | null = null;

  for (const target of aliveEnemies) {
    const dist = Math.hypot(target.x - shooter.x, target.y - shooter.y);
    const ordered = pickWeaponByRange(weapons, dist);

    let targetBest: { score: number; global: number; power: number; weaponIndex: number; impact: { x: number; y: number }; weaponId: string; expectedDamage: number; target: BotWormSnapshot } | null = null;
    let bestBazooka: BotCandidateSummary | null = null;
    let bestGrenade: BotCandidateSummary | null = null;
    const rejected: Record<string, number> = {};
    const bestByWeaponId: Record<string, BotCandidateSummary> = {};
    const bump = (k: string) => { if (!traceEnabled) return; rejected[k] = (rejected[k] || 0) + 1; };

    for (let wIdx = 0; wIdx < ordered.length; wIdx++) {
      const w = ordered[wIdx];
      const weapon = w.weapon;
      const simWeapon = weapon;
      if (weapon.id === 'grenade' && grenLimited && grenLeft <= 0) {
        bump('grenade_empty');
        continue;
      }

      const angles = weapon.id === 'grenade' ? grenadeAngleList : angleList;
      const powers = weapon.id === 'grenade' ? grenadePowerList : powerList;
      for (const localAngle of angles) {
        const global = (target.x >= shooter.x) ? localAngle : (Math.PI - localAngle);
        for (const power of powers) {
            let speed = power * 4.2 * (weapon.speedModifier || 1);
          const muzzle = gunMuzzlePosition(shooter, global);
          const projRadius = weapon.id === 'grenade' ? 6 : 3;
          if (isCircleBlocked(world.terrain, muzzle.x, muzzle.y, projRadius)) {
            bump('muzzle_blocked');
            continue;
          }

          const maxByRange = Number.isFinite(weapon.maxRange) && weapon.maxRange > 0 ? (weapon.maxRange / Math.max(1e-3, speed)) : Infinity;
          const fuseSeconds = weapon.id === 'grenade' ? (typeof weapon.fuseSeconds === 'number' ? weapon.fuseSeconds : 3.0) : 0;
          const maxTime = weapon.id === 'grenade'
            ? Math.min(fuseSeconds + (1 / 60), maxByRange)
            : Math.min(2.2, maxByRange);
          if (!Number.isFinite(maxTime) || maxTime <= 0.05) {
            bump('range_blocked');
            continue;
          }

          const res = simulateTrajectory(
            world.terrain,
            {
              start: muzzle,
              velocity: { x: Math.cos(global) * speed, y: Math.sin(global) * speed },
              gravity: world.gravity,
              wind: world.wind,
              windMultiplier: simWeapon.windMultiplier || 0,
              radius: projRadius,
              dt: 1 / 60,
              maxTime,
              mode: weapon.id === 'grenade' ? 'grenade' : 'projectile',
              grenade: weapon.id === 'grenade'
                ? { fuseSeconds, restitution: botCfg.grenade.restitution, friction: botCfg.grenade.friction, stopSpeed: botCfg.grenade.stopSpeed }
                : undefined
            },
            { x: target.x, y: target.y },
            targetRadius
          );

          const distEnd = Math.hypot(res.end.x - target.x, res.end.y - target.y);
          let miss = weapon.id === 'grenade' ? distEnd : res.minDistToTarget;

          if (weapon.id === 'grenade' && grenLimited) {
            const hitTol = Math.max(6, simWeapon.explosionRadius * 0.55);
            const winds = [-grenadeWindSpan, 0, grenadeWindSpan];
            let ok = true;
            for (const wv of winds) {
              const resW = simulateTrajectory(
                world.terrain,
                {
                  start: muzzle,
                  velocity: { x: Math.cos(global) * speed, y: Math.sin(global) * speed },
                  gravity: world.gravity,
                  wind: wv,
                  windMultiplier: simWeapon.windMultiplier || 0,
                  radius: projRadius,
                  dt: 1 / 60,
                  maxTime,
                  mode: 'grenade',
                  grenade: { fuseSeconds, restitution: botCfg.grenade.restitution, friction: botCfg.grenade.friction, stopSpeed: botCfg.grenade.stopSpeed }
                },
                { x: target.x, y: target.y },
                targetRadius
              );
              const missW = Math.hypot(resW.end.x - target.x, resW.end.y - target.y);
              if (!Number.isFinite(missW) || missW > hitTol) {
                ok = false;
                break;
              }
            }
            if (!ok) {
              bump('grenade_not_robust');
              continue;
            }
          }
          if (weapon.spread > 0) {
            const spreadRad = (weapon.spread * (Math.PI / 180)) * 0.5;
            const travel = Math.max(0, Math.hypot(target.x - muzzle.x, target.y - muzzle.y));
            const dev = Math.tan(spreadRad) * travel;
            const multi = Math.max(1, weapon.projectilesPerShot || 1);
            const factor = multi > 1 ? 0.25 : 0.6;
            miss += dev * factor;
          }

          const falloff = clamp(1 - miss / Math.max(1, simWeapon.explosionRadius), 0, 1);
          const travel = Math.hypot(target.x - muzzle.x, target.y - muzzle.y);
          const aimSigma = Math.max(0.01, aimPct * 1.15);
          const spreadSigma = (weapon.spread || 0) * (Math.PI / 180) * 0.35;
          const powSigma = Math.max(0, powPct) * 0.12;
          const sigma = Math.max(8, travel * (Math.tan(aimSigma) + Math.tan(spreadSigma)) + travel * powSigma);
          const pHit = Math.max(0.02, Math.min(1, Math.exp(-(miss * miss) / (2 * sigma * sigma))));
          const expectedDamage = simWeapon.damage * falloff * pHit;
          const isKill = expectedDamage >= target.health && target.health > 0;
          let score = expectedDamage * botCfg.scoring.damageWeight - miss * botCfg.scoring.missWeight;
          if (isKill) score += botCfg.scoring.killBonus;
          score -= travel * rangePenaltyPerPx;
          score += (rng() - 0.5) * 1e-6;

          if (weapon.id === 'grenade') {
            const local0 = localAimFromGlobal(global);
            if (travel < grenadeCloseRangePx && Math.abs(local0.aimAngle) > grenadeCloseAbsAngleMax) {
              bump('grenade_close_vertical');
              continue;
            }
            if (grenLimited) {
              score -= grenadeScarcityWeight / (grenLeft + 1);
            }
          }

          const safeRadius = simWeapon.explosionRadius + botCfg.scoring.safeExtraRadius;
          const selfSafe = simWeapon.explosionRadius + 18 + botCfg.scoring.safeExtraRadius;
          const selfDist = Math.hypot(res.end.x - shooter.x, res.end.y - shooter.y);
          if (selfDist < selfSafe) {
            bump('self_unsafe');
            continue;
          }
          let expectedFriendlyDamage = 0;
          let unsafe = false;
          const allySafe = safeRadius + 26;
          for (const ally of allies) {
            if (ally.health <= 0) continue;
            const d = Math.hypot(res.end.x - ally.x, res.end.y - ally.y);
            if (d < allySafe) {
              unsafe = true;
              break;
            }
            if (d <= safeRadius + (ally.width / 2)) {
              const ar = ally.width / 2;
              const af = clamp(1 - d / Math.max(1, safeRadius + ar), 0, 1);
              expectedFriendlyDamage += simWeapon.damage * af * pHit;
            }
          }
          if (unsafe) {
            bump('ally_unsafe');
            continue;
          }
          score -= expectedFriendlyDamage * friendlyDamageWeight;

          let risk: number | undefined = undefined;
          if (weapon.id === 'grenade') {
            const pert = 2 * (Math.PI / 180);
            const res2 = simulateTrajectory(
              world.terrain,
              {
                start: muzzle,
                velocity: { x: Math.cos(global + pert) * speed, y: Math.sin(global + pert) * speed },
                gravity: world.gravity,
                wind: world.wind,
                windMultiplier: weapon.windMultiplier || 0,
                radius: projRadius,
                dt: 1 / 60,
                maxTime,
                mode: 'grenade',
                grenade: { fuseSeconds, restitution: botCfg.grenade.restitution, friction: botCfg.grenade.friction, stopSpeed: botCfg.grenade.stopSpeed }
              },
              { x: target.x, y: target.y },
              targetRadius
            );
            const miss2 = Math.hypot(res2.end.x - target.x, res2.end.y - target.y);
            risk = Math.abs(miss2 - miss);
            score -= risk * 0.6;
          }

          const local = localAimFromGlobal(global);
          const mk = mem.get(`${stateKey}|${shotKeyFromLocal(weapon.id, local.facingRight, local.aimAngle, power)}`);
          if (mk) {
            score -= (mk.noRes || 0) * 120;
            score -= (mk.ff || 0) * 900;
          }

          const cand = { score, global, power, weaponIndex: w.index, impact: res.end, weaponId: weapon.id, expectedDamage, target };
          if (!targetBest || score > targetBest.score) targetBest = cand;
          if (traceEnabled) {
            const summary: BotCandidateSummary = {
              weaponId: weapon.id,
              weaponIndex: w.index,
              targetId: target.id,
              globalAngle: global,
              power,
              miss,
              expectedDamage,
              score,
              impact: res.end,
              selfDist,
              selfSafe,
              safeRadius,
              risk
            };
            const prev = bestByWeaponId[weapon.id];
            if (!prev || summary.score > prev.score) bestByWeaponId[weapon.id] = summary;
            if (weapon.id === 'bazooka' && (!bestBazooka || summary.score > bestBazooka.score)) bestBazooka = summary;
            if (weapon.id === 'grenade' && (!bestGrenade || summary.score > bestGrenade.score)) bestGrenade = summary;
          }
        }
      }
    }

    if (targetBest?.weaponId === 'grenade' && bestBazooka && bestGrenade) {
      const minPct = botCfg.scoring.grenadeMinDamageAdvantagePct ?? 0;
      if (bestGrenade.expectedDamage < bestBazooka.expectedDamage * (1 + minPct)) {
        targetBest = { score: bestBazooka.score, global: bestBazooka.globalAngle, power: bestBazooka.power, weaponIndex: bestBazooka.weaponIndex, impact: bestBazooka.impact, weaponId: bestBazooka.weaponId, expectedDamage: bestBazooka.expectedDamage, target };
      }
    }

    if (targetBest && (!best || targetBest.score > best.score)) {
      const trace = traceEnabled && bestByWeaponId[targetBest.weaponId]
        ? {
            shooter: { id: shooter.id, team: shooter.team, x: shooter.x, y: shooter.y, health: shooter.health },
            targetId: target.id,
            chosen: bestByWeaponId[targetBest.weaponId],
            bestByWeaponId,
            rejected
          }
        : undefined;
      best = { ...targetBest, trace };
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
    impact: best.impact,
    trace: best.trace
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
    width: p.width || 10,
    height: p.height || 10,
    health: p.health || 0,
    speedMultiplier: p.speedMultiplier || 1,
    equipmentIds: Array.isArray(p.equipmentIds) ? p.equipmentIds : [],
    weaponCooldowns: p.weaponCooldowns || {}
  }));
  return {
    world: { gravity, wind: state.wind || 0, terrain, teamAmmo: state.teamAmmo },
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

function floorY(terrain: TerrainQuery, x: number, yHint: number): number | null {
  const px = Math.floor(x);
  if (px < 0 || px >= terrain.width) return null;
  const y0 = clamp(Math.floor(yHint), 0, terrain.height - 1);
  for (let y = y0; y < terrain.height; y++) {
    if (terrain.isSolid(px, y)) return y;
  }
  return null;
}

type PathPlan = { reachable: boolean; cost: number; next?: { x: number; y: number } };

function buildSurfacePathPlanner(
  terrain: TerrainQuery,
  shooter: BotWormSnapshot,
  moveSeconds: number,
  ropeAttachBudget: number
): (targetX: number) => PathPlan {
  const maxSpeed = 22.75 * (shooter.speedMultiplier || 1);
  const maxMoveDist = Math.max(0, maxSpeed * Math.max(0, moveSeconds));
  const hasRope = Array.isArray(shooter.equipmentIds) && shooter.equipmentIds.includes('ninja_rope') && ropeAttachBudget > 0;
  const ropeRange = 252 * 0.85;
  const ropeBoost = hasRope ? (ropeRange * Math.min(2, Math.max(0, ropeAttachBudget))) : 0;

  const step = 24;
  const span = Math.min(terrain.width, maxMoveDist + ropeBoost + 260);
  const minX = clamp(shooter.x - span, 30, terrain.width - 30);
  const maxX = clamp(shooter.x + span, 30, terrain.width - 30);
  const n = Math.max(2, Math.floor((maxX - minX) / step) + 1);

  const xs: number[] = new Array(n);
  const ys: Array<number | null> = new Array(n);
  const syCache = new Map<number, number | null>();
  const getSY = (x: number): number | null => {
    const k = Math.floor(x);
    const c = syCache.get(k);
    if (c !== undefined) return c;
    const v = floorY(terrain, x, shooter.y);
    syCache.set(k, v);
    return v;
  };

  for (let i = 0; i < n; i++) {
    const x = clamp(minX + i * step, 30, terrain.width - 30);
    xs[i] = x;
    const sy = getSY(x);
    ys[i] = sy === null ? null : (sy - 1 - shooter.height / 2);
  }

  const startIdx = Math.max(0, Math.min(n - 1, Math.round((shooter.x - minX) / step)));
  const isValid = (i: number) => ys[i] !== null;
  const headClear = (x: number, y: number, dx: number): boolean => {
    const dir = dx >= 0 ? 1 : -1;
    const checksX = [x, x + dir * (shooter.height + 8)];
    const checksY = [y - shooter.height * 0.6, y - shooter.height * 1.2];
    for (const cx of checksX) {
      const px = Math.floor(cx);
      if (px < 0 || px >= terrain.width) return false;
      for (const cy of checksY) {
        const py = Math.floor(cy);
        if (py < 0) continue;
        if (terrain.isSolid(px, py)) return false;
      }
    }
    return true;
  };

  const walkMaxStepUp = 26;
  const walkMaxStepDown = 46;
  const jumpMaxDx = 160;
  const ropeMaxDx = 320;
  const jumpPenalty = 160;
  const ropePenalty = 220;
  const cliffPenalty = 240;

  const neighbors = (i: number): Array<{ j: number; w: number }> => {
    const out: Array<{ j: number; w: number }> = [];
    if (!isValid(i)) return out;
    const xi = xs[i];
    const yi = ys[i] as number;

    const addWalk = (j: number) => {
      if (j < 0 || j >= n) return;
      if (!isValid(j)) return;
      const xj = xs[j];
      const yj = ys[j] as number;
      const dy = yj - yi;
      if (dy < -walkMaxStepUp || dy > walkMaxStepDown) return;
      if (!headClear(xj, yj, xj - xi)) return;
      out.push({ j, w: Math.abs(xj - xi) + Math.abs(dy) * 0.6 });
    };

    addWalk(i - 1);
    addWalk(i + 1);

    const addJumpOrRope = (j: number, penalty: number) => {
      if (j < 0 || j >= n) return;
      if (!isValid(j)) return;
      const xj = xs[j];
      const yj = ys[j] as number;
      const dx = xj - xi;
      if (!headClear(xj, yj, dx)) return;
      out.push({ j, w: Math.abs(dx) + penalty + Math.abs(yj - yi) * 0.25 });
    };

    const maxJumpSteps = Math.max(2, Math.floor(jumpMaxDx / step));
    for (let k = 2; k <= maxJumpSteps; k++) {
      const j = i + k;
      if (j >= n) break;
      if (!isValid(j)) continue;
      const mid = i + Math.floor(k / 2);
      const midSy = mid >= 0 && mid < n ? ys[mid] : null;
      if (midSy !== null) continue;
      addJumpOrRope(j, jumpPenalty);
      break;
    }
    for (let k = 2; k <= maxJumpSteps; k++) {
      const j = i - k;
      if (j < 0) break;
      if (!isValid(j)) continue;
      const mid = i - Math.floor(k / 2);
      const midSy = mid >= 0 && mid < n ? ys[mid] : null;
      if (midSy !== null) continue;
      addJumpOrRope(j, jumpPenalty);
      break;
    }

    if (hasRope) {
      const maxRopeSteps = Math.max(3, Math.floor(ropeMaxDx / step));
      for (let k = 3; k <= maxRopeSteps; k++) {
        const j = i + k;
        if (j >= n) break;
        if (!isValid(j)) continue;
        let gap = false;
        for (let t = i + 1; t < j; t++) {
          if (!isValid(t)) {
            gap = true;
            break;
          }
        }
        if (!gap) continue;
        addJumpOrRope(j, ropePenalty);
        break;
      }
      for (let k = 3; k <= maxRopeSteps; k++) {
        const j = i - k;
        if (j < 0) break;
        if (!isValid(j)) continue;
        let gap = false;
        for (let t = j + 1; t < i; t++) {
          if (!isValid(t)) {
            gap = true;
            break;
          }
        }
        if (!gap) continue;
        addJumpOrRope(j, ropePenalty);
        break;
      }
    }

    const belowIdx = i + 1;
    if (belowIdx < n && isValid(belowIdx)) {
      const yj = ys[belowIdx] as number;
      if (yj - yi > 170) out.push({ j: belowIdx, w: cliffPenalty });
    }

    return out;
  };

  const dist: number[] = new Array(n).fill(Infinity);
  const prev: number[] = new Array(n).fill(-1);
  const visited: boolean[] = new Array(n).fill(false);

  if (isValid(startIdx)) dist[startIdx] = 0;

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = dist[i];
      if (d < best) {
        best = d;
        u = i;
      }
    }
    if (u < 0 || best === Infinity) break;
    visited[u] = true;
    for (const { j, w } of neighbors(u)) {
      const nd = best + w;
      if (nd < dist[j]) {
        dist[j] = nd;
        prev[j] = u;
      }
    }
  }

  const toIdx = (x: number): number => {
    const i = Math.round((x - minX) / step);
    return Math.max(0, Math.min(n - 1, i));
  };

  return (targetX: number): PathPlan => {
    const ti = toIdx(targetX);
    if (!isValid(startIdx) || !isValid(ti) || dist[ti] === Infinity) return { reachable: false, cost: Infinity };
    if (ti === startIdx || prev[ti] === -1) return { reachable: true, cost: dist[ti] };
    let cur = ti;
    let parent = prev[cur];
    while (parent !== -1 && parent !== startIdx) {
      cur = parent;
      parent = prev[cur];
    }
    const nx = xs[cur];
    const ny = ys[cur] as number;
    return { reachable: true, cost: dist[ti], next: { x: nx, y: ny } };
  };
}

export function debugSurfacePathMatrix(
  terrain: TerrainQuery,
  xs: number[],
  shooterTemplate: Omit<BotWormSnapshot, 'x' | 'y' | 'id'>,
  moveSeconds: number,
  ropeAttachBudget: number
): { unreachable: Array<{ from: number; to: number }>; costs: number[][] } {
  const costs: number[][] = [];
  const unreachable: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < xs.length; i++) {
    const sy = floorY(terrain, xs[i], terrain.height / 2);
    const y = sy === null ? 0 : (sy - 1 - shooterTemplate.height / 2);
    const shooter: BotWormSnapshot = { ...shooterTemplate, id: String(i), x: xs[i], y };
    const plan = buildSurfacePathPlanner(terrain, shooter, moveSeconds, ropeAttachBudget);
    const row: number[] = [];
    for (let j = 0; j < xs.length; j++) {
      const r = plan(xs[j]);
      row.push(r.cost);
      if (!r.reachable) unreachable.push({ from: i, to: j });
    }
    costs.push(row);
  }
  return { unreachable, costs };
}

export function pickDigPoint(
  terrain: TerrainQuery,
  shooter: { x: number; y: number; height: number },
  enemies: Array<{ x: number; y: number }>,
  botCfg: BotConfig
): { x: number; y: number } | null {
  const alive = enemies;
  if (alive.length === 0) return null;
  const target = alive
    .map(e => ({ e, d: Math.hypot(e.x - shooter.x, e.y - shooter.y) }))
    .sort((a, b) => a.d - b.d)[0]?.e;
  if (!target) return null;

  const dir = target.x >= shooter.x ? 1 : -1;
  const depths = {
    min: Math.min(botCfg.dig.depthMin, botCfg.dig.depthMax),
    max: Math.max(botCfg.dig.depthMin, botCfg.dig.depthMax)
  };
  const depth = (depths.min + depths.max) / 2;

  for (const d of botCfg.dig.distances) {
    const x = clamp(shooter.x + dir * d, 35, terrain.width - 35);
    const yTop = surfaceY(terrain, x);
    if (yTop === null) continue;
    const y = clamp(yTop + depth, 35, terrain.height - 35);
    if (!terrain.isSolid(Math.floor(x), Math.floor(y))) continue;
    return { x, y };
  }

  return null;
}

export function chooseBotAction(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[] = [shooter],
  botCfg: BotConfig = DEFAULT_BOT_CONFIG,
  difficulty: AIDifficulty = 'medium',
  shotMemory: ShotMemoryEntry[] = []
): BotAction | null {
  return chooseBotActionScored(rng, world, shooter, enemies, allies, botCfg, false, difficulty, shotMemory)?.action || null;
}

export function chooseBotActionDebug(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[] = [shooter],
  botCfg: BotConfig = DEFAULT_BOT_CONFIG,
  difficulty: AIDifficulty = 'medium',
  shotMemory: ShotMemoryEntry[] = []
): { action: BotAction; score: number; impact: { x: number; y: number }; trace?: BotDecisionTrace } | null {
  const res = chooseBotActionScored(rng, world, shooter, enemies, allies, botCfg, true, difficulty, shotMemory);
  if (!res) return null;
  return { action: res.action, score: res.score, impact: res.impact, trace: res.trace };
}

export function chooseBotPlan(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[],
  botCfg: BotConfig,
  moveSeconds: number,
  ropeAttachBudget: number,
  difficulty: AIDifficulty = 'medium',
  shotMemory: ShotMemoryEntry[] = []
): BotPlan | null {
  let intentReason: Record<string, any> | undefined;
  const deepBottom = shooter.y > world.terrain.height - 90;
  const pitGeom = (() => {
    const t = world.terrain;
    const px = Math.floor(shooter.x);
    const py = Math.floor(shooter.y);
    const h = Math.max(8, shooter.height || 10);
    const y0 = Math.max(0, Math.min(t.height - 1, py));
    const y1 = Math.max(0, Math.min(t.height - 1, Math.floor(py - h * 0.35)));
    const y2 = Math.max(0, Math.min(t.height - 1, Math.floor(py - h * 0.75)));
    const leftX = Math.max(0, px - 18);
    const rightX = Math.min(t.width - 1, px + 18);
    const wallL = t.isSolid(leftX, y0) || t.isSolid(leftX, y1) || t.isSolid(leftX, y2);
    const wallR = t.isSolid(rightX, y0) || t.isSolid(rightX, y1) || t.isSolid(rightX, y2);
    if (!wallL && !wallR) return null;
    let roof = 0;
    for (let dy = 18; dy <= 90; dy += 18) {
      const yy = Math.max(0, y2 - dy);
      if (t.isSolid(px, yy)) roof += 1;
    }
    return { wallL, wallR, roof };
  })();

  const base = pitGeom
    ? chooseBotActionScored(rng, world, shooter, enemies, allies, botCfg, true, difficulty, shotMemory)
    : chooseBotActionScored(rng, world, shooter, enemies, allies, botCfg, false, difficulty, shotMemory);
  if (!base) return null;

  const baseNoFireAction: BotAction = {
    weaponIndex: -1,
    facingRight: base.action.facingRight,
    aimAngle: base.action.aimAngle,
    power: base.action.power,
    targetId: base.action.targetId
  };

  if (deepBottom) {
    const moveTo = { x: clamp(shooter.x, 30, world.terrain.width - 30), y: clamp(shooter.y - 260, 30, world.terrain.height - 30) };
    return { moveTo, action: baseNoFireAction, intent: 'approach', intentReason: { deepBottom: 1 } };
  }

  if (pitGeom && base.trace) {
    const chosen = base.trace.chosen;
    const rejected = base.trace.rejected || {};
    const muzzleBlocked = rejected.muzzle_blocked || 0;
    const badShot = (chosen.expectedDamage <= 0.01 && chosen.miss >= 240) || chosen.score < -220;
    const stuckByMuzzle = muzzleBlocked >= 90;
    const wantsEscape = badShot || stuckByMuzzle;
    (base.trace as any).pitDetected = 1;
    (base.trace as any).pitGeom = pitGeom;
    (base.trace as any).pitBadShot = badShot ? 1 : 0;
    (base.trace as any).pitMuzzleBlocked = muzzleBlocked;

    if (wantsEscape) {
      const e = enemies.filter(x => x.health > 0).sort((a, b) => Math.hypot(a.x - shooter.x, a.y - shooter.y) - Math.hypot(b.x - shooter.x, b.y - shooter.y))[0] || null;
      const dir = pitGeom.wallR && !pitGeom.wallL ? -1 : pitGeom.wallL && !pitGeom.wallR ? 1 : (e ? (e.x >= shooter.x ? 1 : -1) : (rng() < 0.5 ? -1 : 1));
      const escapeY = clamp(shooter.y - 150 - pitGeom.roof * 28, 30, world.terrain.height - 30);
      const escapeX = clamp(shooter.x + dir * 28, 30, world.terrain.width - 30);
      const moveTo = { x: escapeX, y: escapeY };
      (base.trace as any).escapeMoveTo = moveTo;
      return { moveTo, action: baseNoFireAction, intent: 'approach', intentReason: { pitDetected: 1, pitBadShot: badShot ? 1 : 0, pitMuzzleBlocked: muzzleBlocked } };
    }
  }

  let approachMode = false;
  if (base.trace) {
    const chosen = base.trace.chosen;
    const rejected = base.trace.rejected || {};
    const muzzleBlocked = rejected.muzzle_blocked || 0;
    const expectedBad = chosen.expectedDamage <= 0.1;
    const blockedBad = muzzleBlocked >= 200;
    const tgt = String(chosen.targetId ?? base.trace.targetId ?? '');
    let noRes = 0;
    for (const m of shotMemory) {
      if (!m) continue;
      if (m.targetId == null) continue;
      if (String(m.targetId) !== tgt) continue;
      if (Number.isFinite(Number(m.lastT)) && typeof m.lastT === 'number') {
        if (m.lastT < 0) continue;
      }
      if ((m.noRes || 0) > noRes) noRes = m.noRes || 0;
    }
    const streakBad = noRes >= 3;
    approachMode = expectedBad && blockedBad && streakBad;
    (base.trace as any).approachMode = approachMode ? 1 : 0;
    (base.trace as any).approachNoRes = noRes;
    (base.trace as any).approachMuzzleBlocked = muzzleBlocked;
    (base.trace as any).approachExpectedDamage = chosen.expectedDamage;
    if (approachMode) {
      intentReason = { approachMode: 1, approachNoRes: noRes, approachMuzzleBlocked: muzzleBlocked, approachExpectedDamage: chosen.expectedDamage };
    }
  }

  const maxSpeed = 22.75 * (shooter.speedMultiplier || 1);
  const moveSecondsForMove = approachMode ? (moveSeconds * 0.5) : moveSeconds;
  const maxMoveDist = Math.max(0, maxSpeed * Math.max(0, moveSecondsForMove));
  const ropeRange = 252 * 0.85;
  const hasRope = Array.isArray(shooter.equipmentIds) && shooter.equipmentIds.includes('ninja_rope');
  const ropeBoost = hasRope ? (ropeRange * Math.min(2, Math.max(0, ropeAttachBudget))) : 0;

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

  const aliveEnemies = enemies.filter(e => e.health > 0);
  const aliveAllies = allies.filter(a => a.health > 0 && a.id !== shooter.id);
  const minDistToEnemy = (w: BotWormSnapshot): number => {
    if (aliveEnemies.length === 0) return Infinity;
    let best = Infinity;
    for (const e of aliveEnemies) {
      const d = Math.hypot(e.x - w.x, e.y - w.y);
      if (d < best) best = d;
    }
    return best;
  };
  const minDistToAlly = (w: BotWormSnapshot): number => {
    if (aliveAllies.length === 0) return Infinity;
    let best = Infinity;
    for (const a of aliveAllies) {
      const d = Math.hypot(a.x - w.x, a.y - w.y);
      if (d < best) best = d;
    }
    return best;
  };
  const closestEnemy = (w: BotWormSnapshot): BotWormSnapshot | null => {
    if (aliveEnemies.length === 0) return null;
    let best: BotWormSnapshot | null = null;
    let bestD = Infinity;
    for (const e of aliveEnemies) {
      const d = Math.hypot(e.x - w.x, e.y - w.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  };

  const rayOpenFrac = (x0: number, y0: number, ang: number, maxLen: number): number => {
    const step = 10;
    let free = 0;
    for (let d = 10; d <= maxLen; d += step) {
      const x = x0 + Math.cos(ang) * d;
      const y = y0 + Math.sin(ang) * d;
      const px = Math.floor(x);
      const py = Math.floor(y);
      if (px < 0 || px >= world.terrain.width || py < 0 || py >= world.terrain.height) break;
      if (world.terrain.isSolid(px, py)) break;
      free = d;
    }
    return free / maxLen;
  };

  const opennessScore = (w: BotWormSnapshot): number => {
    const e = closestEnemy(w);
    if (!e) return 0;
    const dx = e.x - w.x;
    const dy = e.y - w.y;
    const ang0 = Math.atan2(dy, dx);
    const muzzleY = w.y - w.height * 0.35;
    const muzzleX = w.x;
    const maxLen = 320;
    const a = rayOpenFrac(muzzleX, muzzleY, ang0 - 0.22, maxLen);
    const b = rayOpenFrac(muzzleX, muzzleY, ang0, maxLen);
    const c = rayOpenFrac(muzzleX, muzzleY, ang0 + 0.22, maxLen);
    const frac = (a + b + c) / 3;
    return frac * 90;
  };

  const d0 = minDistToEnemy(shooter);
  const a0 = minDistToAlly(shooter);
  const nearDist = 210;
  const allyNearDist = 150;
  const retreatBonusPerPx = 0.45;
  const allyBonusPerPx = 0.25;
  const approachBonusPerPx = 0.8;
  const positionWeight = 1.0;

  const planPathToX = buildSurfacePathPlanner(world.terrain, shooter, moveSeconds, ropeAttachBudget);

  let best: { plan: BotPlan; score: number } | null = null;

  for (const x of uniq) {
    const ySolid = floorY(world.terrain, x, shooter.y);
    const y = ySolid === null ? shooter.y : (ySolid - 1 - shooter.height / 2);
    const path = planPathToX(x);
    if (!path.reachable) continue;
    const movePenalty = path.cost * botCfg.scoring.movePenaltyPerPx;
    const s2: BotWormSnapshot = { ...shooter, x, y };
    const scored = chooseBotActionScored(rng, world, s2, enemies, allies, botCfg);
    const d1 = minDistToEnemy(s2);
    const a1 = minDistToAlly(s2);
    const retreatBonus = (d0 < nearDist && d1 > d0) ? ((d1 - d0) * retreatBonusPerPx) : 0;
    const allyBonus = (a0 < allyNearDist && a1 > a0) ? ((a1 - a0) * allyBonusPerPx) : 0;
    const approachBonus = (approachMode && d1 < d0) ? ((d0 - d1) * approachBonusPerPx) : 0;
    const posScore = retreatBonus + allyBonus + opennessScore(s2);
    const shotScore = scored ? scored.score : base.score;
    const totalScore = shotScore - movePenalty + (posScore + approachBonus) * positionWeight;
    if (!best || totalScore > best.score) {
      const moveTo = path.next || { x: s2.x, y: s2.y };
      const action = approachMode ? baseNoFireAction : (scored ? scored.action : base.action);
      best = { score: totalScore, plan: { moveTo, action, intent: approachMode ? 'approach' : 'attack', intentReason } };
    }
  }

  return best?.plan || null;
}

export function chooseDigAction(
  rng: Rng,
  world: BotWorldSnapshot,
  shooter: BotWormSnapshot,
  enemies: BotWormSnapshot[],
  allies: BotWormSnapshot[],
  botCfg: BotConfig
): BotAction | null {
  if (!botCfg.dig.enabled) return null;
  if (!enemies.some(e => e.health > 0)) return null;
  const digPoint = pickDigPoint(world.terrain, shooter, enemies, botCfg);
  if (!digPoint) return null;

  const weapons = destructibleWeaponCandidates(shooter);
  if (weapons.length === 0) return null;

  const angleList = sampleAngles(18);
  const powerList = samplePowers(10);

  let best: { score: number; global: number; power: number; weaponIndex: number; impact: { x: number; y: number }; weapon: Weapon } | null = null;

  for (const w of weapons) {
    const weapon = w.weapon;
    for (const localAngle of angleList) {
      const global = (digPoint.x >= shooter.x) ? localAngle : (Math.PI - localAngle);
      for (const power of powerList) {
        let speed = power * 4.2 * (weapon.speedModifier || 1);
        const muzzle = gunMuzzlePosition(shooter, global);
        const projRadius = weapon.id === 'grenade' ? 6 : 3;
        if (isCircleBlocked(world.terrain, muzzle.x, muzzle.y, projRadius)) continue;
        const maxByRange = Number.isFinite(weapon.maxRange) && weapon.maxRange > 0 ? (weapon.maxRange / Math.max(1e-3, speed)) : Infinity;
        const fuseSeconds = weapon.id === 'grenade' ? (typeof weapon.fuseSeconds === 'number' ? weapon.fuseSeconds : 3.0) : 0;
        const maxTime = weapon.id === 'grenade'
          ? Math.min(fuseSeconds + (1 / 60), maxByRange)
          : Math.min(2.2, maxByRange);
        if (!Number.isFinite(maxTime) || maxTime <= 0.05) continue;
        const res = simulateTrajectory(
          world.terrain,
          {
            start: muzzle,
            velocity: { x: Math.cos(global) * speed, y: Math.sin(global) * speed },
            gravity: world.gravity,
            wind: world.wind,
            windMultiplier: weapon.windMultiplier || 0,
            radius: projRadius,
            dt: 1 / 60,
            maxTime,
            mode: weapon.id === 'grenade' ? 'grenade' : 'projectile',
            grenade: weapon.id === 'grenade'
              ? { fuseSeconds, restitution: botCfg.grenade.restitution, friction: botCfg.grenade.friction, stopSpeed: botCfg.grenade.stopSpeed }
              : undefined
          },
          { x: digPoint.x, y: digPoint.y },
          12
        );

        const miss = Math.hypot(res.end.x - digPoint.x, res.end.y - digPoint.y);
        let score = -miss;
        score += weapon.explosionRadius * 0.5;
        score += (rng() - 0.5) * 1e-6;

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
          best = { score, global, power, weaponIndex: w.index, impact: res.end, weapon };
        }
      }
    }
  }

  if (!best) return null;
  const local = localAimFromGlobal(best.global);
  return {
    weaponIndex: best.weaponIndex,
    facingRight: local.facingRight,
    aimAngle: local.aimAngle,
    power: best.power,
    targetId: 'dig'
  };
}
