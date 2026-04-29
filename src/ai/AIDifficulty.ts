export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface AIDifficultyConfig {
  aimAngleNoiseRad: number;
  aimPowerNoise: number;
  reactionDelayMs: number;
  considerWind: boolean;
  angleSamples: number;
  powerSamples: number;
  weaponMistakeChance: number;
}

export const AI_DIFFICULTY: Record<AIDifficulty, AIDifficultyConfig> = {
  easy: {
    aimAngleNoiseRad: 0.22,
    aimPowerNoise: 18,
    reactionDelayMs: 650,
    considerWind: false,
    angleSamples: 10,
    powerSamples: 6,
    weaponMistakeChance: 0.35
  },
  medium: {
    aimAngleNoiseRad: 0.1,
    aimPowerNoise: 10,
    reactionDelayMs: 350,
    considerWind: true,
    angleSamples: 16,
    powerSamples: 9,
    weaponMistakeChance: 0.18
  },
  hard: {
    aimAngleNoiseRad: 0.035,
    aimPowerNoise: 4,
    reactionDelayMs: 140,
    considerWind: true,
    angleSamples: 24,
    powerSamples: 12,
    weaponMistakeChance: 0.06
  }
};
