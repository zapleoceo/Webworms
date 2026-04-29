import { mulberry32, hashStringToSeed } from '../utils/SeededRng';

export type GameMode = 'training' | 'friend' | 'random';

const FULL_LOADOUT = ['bazooka', 'triple', 'rocket', 'minigun', 'grenade', 'blaster', 'rope'];
const RANDOM_WEAPONS = ['bazooka', 'triple', 'rocket', 'minigun', 'blaster'];

export function getLoadoutForWorm(mode: GameMode, seed: number, team: string, wormIndex: number): string[] {
  if (mode === 'training') return [...FULL_LOADOUT];

  const rngSeed = (seed ^ hashStringToSeed(team) ^ (wormIndex * 0x9E3779B1)) >>> 0;
  const rng = mulberry32(rngSeed);
  const pick = RANDOM_WEAPONS[Math.floor(rng() * RANDOM_WEAPONS.length)] || 'bazooka';
  return ['rope', 'grenade', pick];
}

