import type { BotAction, BotWorldSnapshot, BotWormSnapshot, Rng } from '../BotAI';
import type { AIDifficulty } from '../AIDifficulty';
import type { BotConfig } from '../BotConfig';

export type MctsMove = { kind: 'move'; x: number; y: number };
export type MctsShot = { kind: 'shot'; action: BotAction; score: number; expectedDamage: number; targetId?: string };
export type MctsAction = MctsMove | MctsShot;

export type MctsPlan = {
  moveTo?: { x: number; y: number; allowRope?: boolean };
  action?: BotAction;
  debug?: { iterations: number; used2ply: number; bestScore: number; fallback?: 1 };
};

export type MctsContext = {
  rng: Rng;
  world: BotWorldSnapshot;
  shooter: BotWormSnapshot;
  enemies: BotWormSnapshot[];
  allies: BotWormSnapshot[];
  botCfg: BotConfig;
  difficulty: AIDifficulty;
  moveSeconds: number;
  ropeAttachBudget: number;
  shotMemory: Array<any>;
};

