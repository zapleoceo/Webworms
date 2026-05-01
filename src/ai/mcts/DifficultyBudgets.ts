import type { AIDifficulty } from '../AIDifficulty';

export type MctsBudget = {
  iterations: number;
  topMoves: number;
  topShots: number;
  maxDepth: number;
  enable2plyPct: number;
};

export function budgetForDifficulty(difficulty: AIDifficulty): MctsBudget {
  if (difficulty === 'easy') {
    return { iterations: 180, topMoves: 4, topShots: 10, maxDepth: 1, enable2plyPct: 0 };
  }
  if (difficulty === 'hard') {
    return { iterations: 1600, topMoves: 8, topShots: 28, maxDepth: 2, enable2plyPct: 0.35 };
  }
  return { iterations: 650, topMoves: 6, topShots: 18, maxDepth: 2, enable2plyPct: 0.12 };
}

