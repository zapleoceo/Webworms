export interface Weapon {
  id: string;
  name: string;
  damage: number;
  explosionRadius: number;
  knockback: number;
  windMultiplier: number;
  spread: number;
  projectilesPerShot: number;
  color: string;
  cooldown: number; // in seconds
  chargeSpeed: number; // multiplier for how fast it charges (1.0 = normal, 0 = instant fire)
  speedModifier: number; // Speed of the projectile
  maxRange: number; // pixels (0 = unlimited)
  fuseSeconds?: number; // grenade fuse (seconds)
}

export const WEAPONS: Record<string, Weapon> = {
  bazooka: {
    id: 'bazooka',
    name: 'Bazooka',
    damage: 25,
    explosionRadius: 40,
    knockback: 220,
    windMultiplier: 1.0,
    spread: 0,
    projectilesPerShot: 1,
    color: '#FF4500', // OrangeRed
    cooldown: 1.0,
    chargeSpeed: 1.0,
    speedModifier: 1.0,
    maxRange: 1900
  },
  minigun: {
    id: 'minigun',
    name: 'Minigun',
    damage: 4,
    explosionRadius: 15,
    knockback: 40,
    windMultiplier: 0.5,
    spread: 15,
    projectilesPerShot: 1,
    color: '#FFA500', // Orange
    cooldown: 0.1,
    chargeSpeed: 0,
    speedModifier: 1.0,
    maxRange: 1400
  },
  triple: {
    id: 'triple',
    name: 'Triple-barrel',
    damage: 15,
    explosionRadius: 25,
    knockback: 120,
    windMultiplier: 1.0,
    spread: 20,
    projectilesPerShot: 3,
    color: '#FFD700', // Gold
    cooldown: 1.5,
    chargeSpeed: 1.0,
    speedModifier: 1.2,
    maxRange: 1700
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket Launcher',
    damage: 40,
    explosionRadius: 60,
    knockback: 320,
    windMultiplier: 1.2,
    spread: 0,
    projectilesPerShot: 1,
    color: '#FF1493', // DeepPink
    cooldown: 2.0,
    chargeSpeed: 1.0,
    speedModifier: 1.0,
    maxRange: 2100
  },
  blaster: {
    id: 'blaster',
    name: 'Blaster',
    damage: 10,
    explosionRadius: 15,
    knockback: 60,
    windMultiplier: 0.1,
    spread: 2,
    projectilesPerShot: 1,
    color: '#7FFFD4',
    cooldown: 0.3,
    chargeSpeed: 0,
    speedModifier: 1.6,
    maxRange: 1700
  },
  grenade: {
    id: 'grenade',
    name: 'Grenade',
    damage: 35,
    explosionRadius: 55,
    knockback: 260,
    windMultiplier: 0.6,
    spread: 0,
    projectilesPerShot: 1,
    color: '#9ACD32',
    cooldown: 1.5,
    chargeSpeed: 1.0,
    speedModifier: 0.9,
    maxRange: 1100,
    fuseSeconds: 3.0
  }
};

export function applyWeaponOverrides(list: any[]): { icons: Record<string, string>; projectiles: Record<string, string>; names: Record<string, string> } {
  const icons: Record<string, string> = {};
  const projectiles: Record<string, string> = {};
  const names: Record<string, string> = {};

  if (!Array.isArray(list)) return { icons, projectiles, names };

  for (const w of list) {
    const id = typeof w?.id === 'string' ? w.id : null;
    if (!id || !WEAPONS[id]) continue;

    const target = WEAPONS[id];
    if (typeof w.name === 'string') {
      target.name = w.name;
      names[id] = w.name;
    }
    if (typeof w.damage === 'number') target.damage = w.damage;
    if (typeof w.explosionRadius === 'number') target.explosionRadius = w.explosionRadius;
    if (typeof w.knockback === 'number') target.knockback = w.knockback;
    if (typeof w.windMultiplier === 'number') target.windMultiplier = w.windMultiplier;
    if (typeof w.spread === 'number') target.spread = w.spread;
    if (typeof w.projectilesPerShot === 'number') target.projectilesPerShot = w.projectilesPerShot;
    if (typeof w.cooldown === 'number') target.cooldown = w.cooldown;
    if (typeof w.chargeSpeed === 'number') target.chargeSpeed = w.chargeSpeed;
    if (typeof w.speedModifier === 'number') target.speedModifier = w.speedModifier;
    if (typeof w.maxRange === 'number') target.maxRange = w.maxRange;
    if (typeof w.fuseSeconds === 'number') (target as any).fuseSeconds = w.fuseSeconds;
    if (typeof w.color === 'string') target.color = w.color;

    if (typeof w.icon_src === 'string' && w.icon_src.length > 0) icons[id] = w.icon_src;
    if (typeof w.projectile_src === 'string' && w.projectile_src.length > 0) projectiles[id] = w.projectile_src;
  }

  return { icons, projectiles, names };
}
