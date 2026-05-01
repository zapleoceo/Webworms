import type { GameState } from '../../models/GameState';

export const BURST_SHOTS_PER_TURN = 25;

export function isBurstWeapon(weaponId: string): boolean {
  return weaponId === 'minigun' || weaponId === 'heavy_gun';
}

export function burstUsed(shotsFiredThisTurnByWeaponId: Record<string, number>, weaponId: string): number {
  return (shotsFiredThisTurnByWeaponId as any)[weaponId] || 0;
}

export function incrementBurst(shotsFiredThisTurnByWeaponId: Record<string, number>, weaponId: string, delta: number): void {
  if (!isBurstWeapon(weaponId)) return;
  const cur = burstUsed(shotsFiredThisTurnByWeaponId, weaponId);
  (shotsFiredThisTurnByWeaponId as any)[weaponId] = cur + Math.max(0, delta);
}

export function canFireBurstWeapon(shotsFiredThisTurnByWeaponId: Record<string, number>, weaponId: string, turnTimeLeft: number): boolean {
  if (!isBurstWeapon(weaponId)) return true;
  if (turnTimeLeft <= 0) return false;
  return burstUsed(shotsFiredThisTurnByWeaponId, weaponId) < BURST_SHOTS_PER_TURN;
}

export function trySpendGrenade(state: GameState, team: string): boolean {
  const t = team === 'team2' ? 'team2' : 'team1';
  const cur = state.teamAmmo?.[t]?.grenade;
  if (typeof cur !== 'number' || !Number.isFinite(cur)) return true;
  if (cur <= 0) return false;
  state.teamAmmo[t].grenade = cur - 1;
  return true;
}

