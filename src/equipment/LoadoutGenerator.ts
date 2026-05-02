import { mulberry32, hashStringToSeed } from '../utils/SeededRng';

export type GameMode = 'training' | 'ai' | 'friend' | 'random';

const FULL_LOADOUT = ['bazooka', 'shotgun', 'minigun', 'homing_missile', 'heavy_gun', 'handgun', 'grenade', 'plasma_gun', 'flamethrower', 'ninja_rope'];
const RANDOM_WEAPONS = ['bazooka', 'shotgun', 'minigun', 'homing_missile', 'heavy_gun', 'handgun', 'plasma_gun', 'flamethrower'];

export function getLoadoutForWorm(mode: GameMode, seed: number, team: string, wormIndex: number): string[] {
  if (mode === 'training' || mode === 'ai' || (mode as any) === 'aivai') return [...FULL_LOADOUT];

  const rngSeed = (seed ^ hashStringToSeed(team) ^ (wormIndex * 0x9E3779B1)) >>> 0;
  const rng = mulberry32(rngSeed);
  const pick = RANDOM_WEAPONS[Math.floor(rng() * RANDOM_WEAPONS.length)] || 'bazooka';
  return ['ninja_rope', 'grenade', pick];
}
