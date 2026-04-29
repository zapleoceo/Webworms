export type AIDifficulty = 'easy' | 'medium' | 'hard';

export type BotConfig = {
  planSeconds: number;
  reserveSeconds: number;
  ropeAttachLimit: Record<AIDifficulty, number>;
  aimErrorPct: Record<AIDifficulty, number>;
  powerErrorPct: Record<AIDifficulty, number>;
  movement: {
    maxStrategyAttemptsPerTurn: number;
    maxStrategyFailuresPerTurn: number;
    replanWhenBannedAtLeast: number;
    replanCooldownSeconds: number;
  };
  dig: {
    enabled: boolean;
    maxShotsPerTurn: number;
    distances: number[];
    depthMin: number;
    depthMax: number;
  };
  grenade: {
    fuseSeconds: number;
    restitution: number;
    friction: number;
    stopSpeed: number;
  };
  scoring: {
    killBonus: number;
    damageWeight: number;
    missWeight: number;
    movePenaltyPerPx: number;
    safeExtraRadius: number;
  };
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: any, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const int = (v: any, fallback: number) => Math.floor(num(v, fallback));

export const DEFAULT_BOT_CONFIG: BotConfig = {
  planSeconds: 3,
  reserveSeconds: 1,
  ropeAttachLimit: { easy: 3, medium: 4, hard: 5 },
  aimErrorPct: { easy: 0.3, medium: 0.15, hard: 0.05 },
  powerErrorPct: { easy: 0.3, medium: 0.15, hard: 0.05 },
  movement: { maxStrategyAttemptsPerTurn: 3, maxStrategyFailuresPerTurn: 3, replanWhenBannedAtLeast: 3, replanCooldownSeconds: 1.2 },
  dig: { enabled: true, maxShotsPerTurn: 1, distances: [80, 120, 160], depthMin: 10, depthMax: 40 },
  grenade: { fuseSeconds: 3, restitution: 0.35, friction: 0.85, stopSpeed: 28 },
  scoring: { killBonus: 4000, damageWeight: 1, missWeight: 1, movePenaltyPerPx: 0.35, safeExtraRadius: 14 }
};

export function normalizeBotConfig(raw: any): BotConfig {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const rope = r.ropeAttachLimit && typeof r.ropeAttachLimit === 'object' ? r.ropeAttachLimit : {};
  const aim = r.aimErrorPct && typeof r.aimErrorPct === 'object' ? r.aimErrorPct : {};
  const power = r.powerErrorPct && typeof r.powerErrorPct === 'object' ? r.powerErrorPct : {};
  const movement = r.movement && typeof r.movement === 'object' ? r.movement : {};
  const dig = r.dig && typeof r.dig === 'object' ? r.dig : {};
  const grenade = r.grenade && typeof r.grenade === 'object' ? r.grenade : {};
  const scoring = r.scoring && typeof r.scoring === 'object' ? r.scoring : {};

  const distancesRaw = Array.isArray(dig.distances) ? dig.distances : DEFAULT_BOT_CONFIG.dig.distances;
  const distances = distancesRaw
    .map((v: any) => num(v, 0))
    .filter((v: number) => Number.isFinite(v) && v > 0)
    .slice(0, 8);

  return {
    planSeconds: clamp(num(r.planSeconds, DEFAULT_BOT_CONFIG.planSeconds), 0.2, 8),
    reserveSeconds: clamp(num(r.reserveSeconds, DEFAULT_BOT_CONFIG.reserveSeconds), 0, 3),
    ropeAttachLimit: {
      easy: clamp(int(rope.easy, DEFAULT_BOT_CONFIG.ropeAttachLimit.easy), 0, 8),
      medium: clamp(int(rope.medium, DEFAULT_BOT_CONFIG.ropeAttachLimit.medium), 0, 10),
      hard: clamp(int(rope.hard, DEFAULT_BOT_CONFIG.ropeAttachLimit.hard), 0, 12)
    },
    aimErrorPct: {
      easy: clamp(num(aim.easy, DEFAULT_BOT_CONFIG.aimErrorPct.easy), 0, 0.8),
      medium: clamp(num(aim.medium, DEFAULT_BOT_CONFIG.aimErrorPct.medium), 0, 0.8),
      hard: clamp(num(aim.hard, DEFAULT_BOT_CONFIG.aimErrorPct.hard), 0, 0.8)
    },
    powerErrorPct: {
      easy: clamp(num(power.easy, DEFAULT_BOT_CONFIG.powerErrorPct.easy), 0, 0.8),
      medium: clamp(num(power.medium, DEFAULT_BOT_CONFIG.powerErrorPct.medium), 0, 0.8),
      hard: clamp(num(power.hard, DEFAULT_BOT_CONFIG.powerErrorPct.hard), 0, 0.8)
    },
    movement: {
      maxStrategyAttemptsPerTurn: clamp(int(movement.maxStrategyAttemptsPerTurn, DEFAULT_BOT_CONFIG.movement.maxStrategyAttemptsPerTurn), 1, 10),
      maxStrategyFailuresPerTurn: clamp(int(movement.maxStrategyFailuresPerTurn, DEFAULT_BOT_CONFIG.movement.maxStrategyFailuresPerTurn), 1, 10),
      replanWhenBannedAtLeast: clamp(int(movement.replanWhenBannedAtLeast, DEFAULT_BOT_CONFIG.movement.replanWhenBannedAtLeast), 0, 10),
      replanCooldownSeconds: clamp(num(movement.replanCooldownSeconds, DEFAULT_BOT_CONFIG.movement.replanCooldownSeconds), 0, 10)
    },
    dig: {
      enabled: Boolean(dig.enabled ?? DEFAULT_BOT_CONFIG.dig.enabled),
      maxShotsPerTurn: clamp(int(dig.maxShotsPerTurn, DEFAULT_BOT_CONFIG.dig.maxShotsPerTurn), 0, 3),
      distances: distances.length > 0 ? distances : DEFAULT_BOT_CONFIG.dig.distances,
      depthMin: clamp(num(dig.depthMin, DEFAULT_BOT_CONFIG.dig.depthMin), 0, 120),
      depthMax: clamp(num(dig.depthMax, DEFAULT_BOT_CONFIG.dig.depthMax), 0, 200)
    },
    grenade: {
      fuseSeconds: clamp(num(grenade.fuseSeconds, DEFAULT_BOT_CONFIG.grenade.fuseSeconds), 0.6, 6),
      restitution: clamp(num(grenade.restitution, DEFAULT_BOT_CONFIG.grenade.restitution), 0, 0.85),
      friction: clamp(num(grenade.friction, DEFAULT_BOT_CONFIG.grenade.friction), 0, 2),
      stopSpeed: clamp(num(grenade.stopSpeed, DEFAULT_BOT_CONFIG.grenade.stopSpeed), 0, 200)
    },
    scoring: {
      killBonus: clamp(num(scoring.killBonus, DEFAULT_BOT_CONFIG.scoring.killBonus), 0, 20000),
      damageWeight: clamp(num(scoring.damageWeight, DEFAULT_BOT_CONFIG.scoring.damageWeight), 0, 50),
      missWeight: clamp(num(scoring.missWeight, DEFAULT_BOT_CONFIG.scoring.missWeight), 0, 10),
      movePenaltyPerPx: clamp(num(scoring.movePenaltyPerPx, DEFAULT_BOT_CONFIG.scoring.movePenaltyPerPx), 0, 10),
      safeExtraRadius: clamp(num(scoring.safeExtraRadius, DEFAULT_BOT_CONFIG.scoring.safeExtraRadius), 0, 100)
    }
  };
}
