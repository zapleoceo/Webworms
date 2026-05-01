export type WeaponKind = 'projectile' | 'grenade' | 'hitscan' | 'homing' | 'stream';

export interface Weapon {
  id: string;
  name: string;
  kind: WeaponKind;
  damage: number;
  explosionRadius: number;
  crater: boolean;
  knockback: number;
  windMultiplier: number;
  spread: number;
  projectilesPerShot: number;
  color: string;
  cooldown: number;
  chargeSpeed: number;
  speedModifier: number;
  maxRange: number;
  fuseSeconds?: number;
  hitscanRange?: number;
  homingTurnRate?: number;
  flameTicks?: number;
}

export const WEAPONS: Record<string, Weapon> = {
  bazooka: {
    id: 'bazooka',
    name: 'Bazooka',
    kind: 'projectile',
    damage: 26,
    explosionRadius: 44,
    crater: true,
    knockback: 230,
    windMultiplier: 1.0,
    spread: 0,
    projectilesPerShot: 1,
    color: '#ff5a36',
    cooldown: 1.05,
    chargeSpeed: 1.0,
    speedModifier: 1.0,
    maxRange: 1900
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    kind: 'hitscan',
    damage: 14,
    explosionRadius: 18,
    crater: true,
    knockback: 170,
    windMultiplier: 0.0,
    spread: 6,
    projectilesPerShot: 2,
    color: '#ffd27a',
    cooldown: 1.15,
    chargeSpeed: 0,
    speedModifier: 1.0,
    maxRange: 900,
    hitscanRange: 520
  },
  minigun: {
    id: 'minigun',
    name: 'Minigun',
    kind: 'projectile',
    damage: 1,
    explosionRadius: 6,
    crater: true,
    knockback: 22,
    windMultiplier: 0.45,
    spread: 12,
    projectilesPerShot: 1,
    color: '#ffb46b',
    cooldown: 0.1,
    chargeSpeed: 0,
    speedModifier: 1.0,
    maxRange: 1400
  },
  homing_missile: {
    id: 'homing_missile',
    name: 'Homing Missile',
    kind: 'homing',
    damage: 28,
    explosionRadius: 54,
    crater: true,
    knockback: 280,
    windMultiplier: 0.65,
    spread: 0,
    projectilesPerShot: 1,
    color: '#ff3f5f',
    cooldown: 1.9,
    chargeSpeed: 1.0,
    speedModifier: 0.95,
    maxRange: 2300,
    homingTurnRate: 3.0
  },
  heavy_gun: {
    id: 'heavy_gun',
    name: 'Heavy Gun',
    kind: 'hitscan',
    damage: 1,
    explosionRadius: 6,
    crater: true,
    knockback: 34,
    windMultiplier: 0.0,
    spread: 7,
    projectilesPerShot: 1,
    color: '#ffc24b',
    cooldown: 0.16,
    chargeSpeed: 0,
    speedModifier: 1.05,
    maxRange: 1500,
    hitscanRange: 820
  },
  handgun: {
    id: 'handgun',
    name: 'Handgun',
    kind: 'hitscan',
    damage: 10,
    explosionRadius: 10,
    crater: true,
    knockback: 70,
    windMultiplier: 0.0,
    spread: 2,
    projectilesPerShot: 1,
    color: '#ffe7c7',
    cooldown: 0.32,
    chargeSpeed: 0,
    speedModifier: 1.35,
    maxRange: 1600,
    hitscanRange: 950
  },
  grenade: {
    id: 'grenade',
    name: 'Grenade',
    kind: 'grenade',
    damage: 30,
    explosionRadius: 52,
    crater: true,
    knockback: 240,
    windMultiplier: 0.6,
    spread: 0,
    projectilesPerShot: 1,
    color: '#9acd32',
    cooldown: 1.55,
    chargeSpeed: 1.0,
    speedModifier: 0.92,
    maxRange: 1200,
    fuseSeconds: 3.0
  },
  plasma_gun: {
    id: 'plasma_gun',
    name: 'Plasma Gun',
    kind: 'hitscan',
    damage: 18,
    explosionRadius: 14,
    crater: true,
    knockback: 80,
    windMultiplier: 0.0,
    spread: 1,
    projectilesPerShot: 1,
    color: '#55d7ff',
    cooldown: 0.45,
    chargeSpeed: 0.85,
    speedModifier: 1.0,
    maxRange: 2000,
    hitscanRange: 900
  },
  flamethrower: {
    id: 'flamethrower',
    name: 'Flamethrower',
    kind: 'stream',
    damage: 4,
    explosionRadius: 8,
    crater: true,
    knockback: 25,
    windMultiplier: 0.0,
    spread: 22,
    projectilesPerShot: 1,
    color: '#ff7f2a',
    cooldown: 0.25,
    chargeSpeed: 0,
    speedModifier: 1.0,
    maxRange: 520,
    flameTicks: 7
  }
};
