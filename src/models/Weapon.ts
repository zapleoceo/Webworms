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
    speedModifier: 1.0
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
    speedModifier: 1.0
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
    speedModifier: 1.2
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
    speedModifier: 1.0
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
    speedModifier: 1.0
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
    speedModifier: 0.9
  }
};
