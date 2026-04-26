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
    damage: 50,
    explosionRadius: 60,
    knockback: 300,
    windMultiplier: 1.0,
    spread: 0,
    projectilesPerShot: 1,
    color: '#FF4500', // OrangeRed
    cooldown: 2.0,
    chargeSpeed: 1.0, // Needs charging
    speedModifier: 1.0
  },
  minigun: {
    id: 'minigun',
    name: 'Minigun',
    damage: 8,
    explosionRadius: 10,
    knockback: 10,
    windMultiplier: 0.5,
    spread: 5,
    projectilesPerShot: 1,
    color: '#FFA500', // Orange
    cooldown: 0.1, // Almost instant reload
    chargeSpeed: 0, // Fires instantly without charging
    speedModifier: 2.0 // Fast bullets
  },
  triple: {
    id: 'triple',
    name: 'Triple-barrel',
    damage: 15, // Per pellet
    explosionRadius: 25, // Small explosion per pellet
    knockback: 100,
    windMultiplier: 0.8,
    spread: 15, // 15 degrees spread
    projectilesPerShot: 3,
    color: '#FFD700', // Gold
    cooldown: 2.5,
    chargeSpeed: 1.5, // Charges a bit faster than bazooka
    speedModifier: 1.2
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket Launcher',
    damage: 35,
    explosionRadius: 40,
    knockback: 200,
    windMultiplier: 0.2, // Less affected by wind
    spread: 0,
    projectilesPerShot: 1,
    color: '#FF1493', // DeepPink
    cooldown: 3.0,
    chargeSpeed: 2.0, // Fast charge
    speedModifier: 2.5 // Very fast straight trajectory
  }
};
