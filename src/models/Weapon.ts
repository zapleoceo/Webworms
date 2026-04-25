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
}

export const WEAPONS: Record<string, Weapon> = {
  bazooka: { 
    id: 'bazooka', 
    name: 'Bazooka', 
    damage: 25, 
    explosionRadius: 40, 
    knockback: 150, 
    windMultiplier: 1.0, 
    spread: 0, 
    projectilesPerShot: 1, 
    color: '#FF4500', // OrangeRed
    cooldown: 2.0
  },
  blaster: { 
    id: 'blaster', 
    name: 'Plasma Blaster', 
    damage: 15, 
    explosionRadius: 25, 
    knockback: 30, 
    windMultiplier: 0.2, 
    spread: 0, 
    projectilesPerShot: 1, 
    color: '#00FFFF', // Cyan
    cooldown: 1.5
  },
  shotgun: { 
    id: 'shotgun', 
    name: 'Shotgun', 
    damage: 8, // Per pellet
    explosionRadius: 15, // Small explosion per pellet
    knockback: 50, 
    windMultiplier: 0.5, 
    spread: 15, // 15 degrees spread
    projectilesPerShot: 5, 
    color: '#FFD700', // Gold
    cooldown: 2.5
  },
  sniper: { 
    id: 'sniper', 
    name: 'Railgun', 
    damage: 40, 
    explosionRadius: 10, // Piercing damage, small hole
    knockback: 200, 
    windMultiplier: 0.05, 
    spread: 0, 
    projectilesPerShot: 1, 
    color: '#FF1493', // DeepPink
    cooldown: 4.0
  },
  minigun: {
    id: 'minigun',
    name: 'Minigun',
    damage: 5,
    explosionRadius: 12,
    knockback: 10,
    windMultiplier: 0.8,
    spread: 5,
    projectilesPerShot: 1,
    color: '#FFA500', // Orange
    cooldown: 0.15
  },
  laser: {
    id: 'laser',
    name: 'Laser',
    damage: 8,
    explosionRadius: 5, // Direct hit required basically
    knockback: 5,
    windMultiplier: 0.0,
    spread: 0,
    projectilesPerShot: 1,
    color: '#00FF00', // Lime
    cooldown: 0.05
  }
};
