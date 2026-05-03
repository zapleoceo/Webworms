import { expect, test } from 'vitest';
import { GamePresenter } from '../../presenters/GamePresenter';
import { GameState } from '../../models/GameState';
import { Worm } from '../../models/Worm';
import { chooseBotPlan } from '../BotAI';
import { DEFAULT_BOT_CONFIG } from '../BotConfig';
import { Random } from '../../utils/Random';

type Team = 'team1' | 'team2';

const mulberry32 = (a: number) => () => {
  let x = (a += 0x6d2b79f5);
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};

const makeFlatState = (w: number, h: number, groundY: number, mapSeed: number) => {
  const state = new GameState(w, h) as any;
  for (let y = groundY; y < h; y++) {
    for (let x = 0; x < w; x++) state.landscape.grid[y * w + x] = 1;
  }
  state.landscape.revision++;
  state.width = w;
  state.height = h;
  state.mode = 'aivai';
  state.mapSeed = mapSeed;
  state.wind = 0;
  state.windTarget = 0;
  state.teamAmmo = { team1: { grenade: 9 }, team2: { grenade: 9 } };
  state.botConfig = {
    ...DEFAULT_BOT_CONFIG,
    planSeconds: 0.25,
    reserveSeconds: 0.6,
    ropeAttachLimit: { easy: 0, medium: 0, hard: 0 }
  };
  state.projectiles = [];
  return state as GameState;
};

const makeWorm = (x: number, y: number, team: Team, name: string) => {
  const p = new Worm(x, y, false, name, 'soldier', ['grenade', 'bazooka', 'shotgun', 'handgun'], team);
  p.width = 18;
  p.height = 18;
  p.health = 220;
  p.maxHealth = 220;
  return p;
};

const buildWorldSnapshot = (presenter: any, shooterIdx: number) => {
  const state = presenter.state as any;
  const shooter = state.players?.[shooterIdx];
  if (!shooter) return null;
  const team = shooter.team as Team;
  const worms = (state.players || []).map((w: any, idx: number) => ({
    id: String(idx),
    team: w.team,
    x: w.x,
    y: w.y,
    width: w.width || 10,
    height: w.height || 10,
    health: w.health || 0,
    speedMultiplier: w.speedMultiplier || 1,
    equipmentIds: Array.isArray(w.equipmentIds) ? w.equipmentIds : [],
    weaponCooldowns: w.weaponCooldowns || {}
  }));
  const terrain = {
    width: state.width,
    height: state.height,
    isSolid: (x: number, y: number) => state.landscape.getMaterial(x, y) > 0
  };
  const world: any = { gravity: presenter.physics?.gravity || 195, wind: Number(state.wind) || 0, terrain, teamAmmo: state.teamAmmo };
  return {
    world,
    shooterIdx,
    shooter: worms[shooterIdx],
    enemies: worms.filter((w: any) => w.team !== team && w.health > 0),
    allies: worms.filter((w: any) => w.team === team && w.health > 0)
  };
};

const choosePlanAction = (seed: number, presenter: any, shooterIdx: number) => {
  const view = buildWorldSnapshot(presenter, shooterIdx);
  if (!view) return null;
  if (!view.shooter || view.enemies.length === 0) return null;
  const rng = mulberry32(seed);
  const plan = chooseBotPlan(
    rng,
    view.world,
    view.shooter as any,
    view.enemies as any,
    view.allies as any,
    DEFAULT_BOT_CONFIG,
    2.4,
    0,
    'hard',
    []
  );
  if (!plan) return null;
  const weaponIndex = Number(plan.action.weaponIndex);
  const facingRight = !!plan.action.facingRight;
  const aimAngle = Number(plan.action.aimAngle);
  const power = Number(plan.action.power);
  const targetId = String(plan.action.targetId ?? '');
  const eq = (presenter.state.players?.[shooterIdx]?.equipmentIds || []) as any[];
  const weaponId = weaponIndex >= 0 && typeof eq[weaponIndex] === 'string' ? String(eq[weaponIndex]) : null;
  if (!Number.isFinite(weaponIndex) || !Number.isFinite(aimAngle) || !Number.isFinite(power)) return null;
  return {
    action: { weaponIndex, facingRight, aimAngle, power, targetId },
    weaponId
  };
};

test(
  'per-worm KPI harness (real damage via health delta) smoke',
  { timeout: 60000 },
  () => {
    const width = 900;
    const height = 560;
    const groundY = 340;
    const mapSeed = 7;
    const dt = 1 / 60;

    const presenter = new GamePresenter(800, 600) as any;
    presenter.updateMobileWeaponIcon = () => {};
    presenter.isRunning = true;
    presenter.isHost = true;
    presenter.matchDuration = 0;

    presenter.state = makeFlatState(width, height, groundY, mapSeed) as any;
    Random.setSeed(mapSeed);
    const w0 = makeWorm(140, groundY - 12, 'team1', 'A1');
    const w1 = makeWorm(260, groundY - 12, 'team1', 'A2');
    const e0 = makeWorm(640, groundY - 12, 'team2', 'B1');
    const e1 = makeWorm(760, groundY - 12, 'team2', 'B2');
    presenter.state.players = [w0, w1, e0, e1];
    presenter.state.currentPlayerIndex = 0;
    presenter.state.getCurrentPlayer = () => presenter.state.players[presenter.state.currentPlayerIndex] || null;

    const turnByTeam: Record<Team, number> = { team1: 0, team2: 0 };
    const turnOrder: Record<Team, number[]> = { team1: [0, 1], team2: [2, 3] };
    let activeTeam: Team = 'team1';

    const stats: Record<string, { turns: number; enemy: number; ally: number; weapons: Set<string> }> = {};
    for (let i = 0; i < 4; i++) stats[String(i)] = { turns: 0, enemy: 0, ally: 0, weapons: new Set() };
    let shots = 0;
    let fallbackShots = 0;

    const nextTurn = () => {
      activeTeam = activeTeam === 'team1' ? 'team2' : 'team1';
      const idxs = turnOrder[activeTeam];
      const pos = turnByTeam[activeTeam];
      const pick = idxs[pos % idxs.length];
      turnByTeam[activeTeam] = pos + 1;
      presenter.state.currentPlayerIndex = pick;
    };

    const totalTurns = 12;
    for (let turnIdx = 0; turnIdx < totalTurns; turnIdx++) {
      const curIdx = presenter.state.currentPlayerIndex;
      const shooter = presenter.state.players[curIdx] as any;
      if (!shooter || shooter.health <= 0) {
        nextTurn();
        continue;
      }

      const s = stats[String(curIdx)];
      s.turns += 1;
      const h0 = presenter.state.players.map((p: any) => Number(p?.health) || 0);

      const pick = choosePlanAction((mapSeed ^ (turnIdx + 1) * 2246822519) >>> 0, presenter, curIdx);
      const enemies = presenter.state.players.filter((p: any) => p && p.team !== shooter.team && (p.health || 0) > 0);
      enemies.sort((a: any, b: any) => Math.hypot((a.x || 0) - shooter.x, (a.y || 0) - shooter.y) - Math.hypot((b.x || 0) - shooter.x, (b.y || 0) - shooter.y));
      const closest = enemies[0] || null;
      const eq: any[] = Array.isArray(shooter.equipmentIds) ? shooter.equipmentIds : [];
      const bazookaIdx = eq.findIndex((id: any) => id === 'bazooka');
      const grenadeIdx = eq.findIndex((id: any) => id === 'grenade');

      const act = (pick && pick.action.weaponIndex >= 0)
        ? pick.action
        : (() => {
            if (!closest) return null;
            const dx = (closest.x - shooter.x) || 0;
            const dy = ((closest.y - (closest.height || 0) * 0.35) - (shooter.y - (shooter.height || 0) * 0.35)) || 0;
            const global = Math.atan2(dy, dx);
            const facingRight = dx >= 0;
            const aimAngle = facingRight ? global : (Math.PI - global);
            const localAim = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, aimAngle));
            const weaponIndex = bazookaIdx >= 0 ? bazookaIdx : grenadeIdx;
            if (weaponIndex < 0) return null;
            fallbackShots += 1;
            return { weaponIndex, facingRight, aimAngle: localAim, power: 74, targetId: String(presenter.state.players.indexOf(closest)) };
          })();
      if (!act) {
        nextTurn();
        continue;
      }

      shooter.setEquipmentIndex(act.weaponIndex);
      shooter.facingRight = act.facingRight;
      shooter.aimAngle = act.aimAngle;
      shooter.aimPower = act.power;

      presenter.hasFiredThisTurn = false;
      presenter.state.hasFiredThisTurn = false;
      (presenter as any).fireWeapon(shooter);
      shots += 1;

      for (let f = 0; f < 2400; f++) {
        presenter.matchDuration += dt;
        presenter.physics.update(presenter.state, dt);
        if ((presenter.state.projectiles?.length || 0) === 0) break;
      }

      const h1 = presenter.state.players.map((p: any) => Number(p?.health) || 0);
      let enemyDelta = 0;
      let allyDelta = 0;
      for (let i = 0; i < h1.length; i++) {
        const d = Math.max(0, (h0[i] ?? 0) - (h1[i] ?? 0));
        const w = presenter.state.players[i];
        if (!w) continue;
        if (w.team !== shooter.team) enemyDelta += d;
        else allyDelta += d;
      }

      if (enemyDelta > 0.01) s.enemy += 1;
      if (allyDelta > 0.01) s.ally += 1;
      const wid = eq[act.weaponIndex];
      if (typeof wid === 'string') s.weapons.add(wid);

      nextTurn();
    }

    expect(shots).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) {
      const s = stats[String(i)];
      expect(s.turns).toBeGreaterThan(0);
    }
    void fallbackShots;
  }
);
