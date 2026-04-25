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
    color: '#FF4500' // OrangeRed
  },
  blaster: { 
    id: 'blaster', 
    name: 'Plasma Blaster', 
    damage: 12, 
    explosionRadius: 15, 
    knockback: 30, 
    windMultiplier: 0.2, 
    spread: 5, 
    projectilesPerShot: 3, 
    color: '#00FFFF' // Cyan
  },
  shotgun: { 
    id: 'shotgun', 
    name: 'Shotgun', 
    damage: 8, 
    explosionRadius: 10, 
    knockback: 50, 
    windMultiplier: 0.5, 
    spread: 15, 
    projectilesPerShot: 5, 
    color: '#FFFF00' // Yellow
  },
  sniper: { 
    id: 'sniper', 
    name: 'Railgun', 
    damage: 40, 
    explosionRadius: 20, 
    knockback: 200, 
    windMultiplier: 0.05, 
    spread: 0, 
    projectilesPerShot: 1, 
    color: '#FF00FF' // Magenta
  }
};
