import type { Weapon } from './Weapon';
import { WEAPONS } from './Weapon';

export class Worm {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 10;
  public height: number = 10;
  public isJumping: boolean = false;
  
  public health: number = 100;
  public maxHealth: number = 100;
  public defense: number = 0; // 0.0 to 1.0 (e.g. 0.2 = 20% damage reduction)
  public mass: number = 1.0;
  public jumpForce: number = -150;
  public speedMultiplier: number = 1.0;
  
  public aimAngle: number = 0; // 0 to 360 degrees
  public aimPower: number = 0; // 0 to 100
  public facingRight: boolean = true;
  public isFallingSoundPlaying: boolean = false;

  // Animation state
  public walkCycle: number = 0;

  // Visual/team identifier
  public teamColor: string;
  public name: string;
  public unitClass: 'soldier' | 'heavy' | 'scout';
  
  // Weapons
  public weapons: Weapon[] = [];
  public currentWeaponIndex: number = 0;
  public weaponCooldowns: Record<string, number> = {};

  constructor(x: number, y: number, isDummy: boolean = false, name: string = 'Player', unitClass: 'soldier' | 'heavy' | 'scout' = 'soldier', selectedWeapons: string[] = ['bazooka', 'blaster']) {
    this.x = x;
    this.y = y;
    this.name = name;
    this.unitClass = unitClass;
    
    // Apply Class Stats
    if (unitClass === 'heavy') {
      this.health = 150;
      this.maxHealth = 150;
      this.defense = 0.2;
      this.mass = 1.5;
      this.jumpForce = -100;
      this.speedMultiplier = 0.6;
      this.teamColor = '#FF3333'; // Red
      this.width = 12;
      this.height = 12;
    } else if (unitClass === 'scout') {
      this.health = 70;
      this.maxHealth = 70;
      this.defense = 0.0;
      this.mass = 0.7;
      this.jumpForce = -200;
      this.speedMultiplier = 1.4;
      this.teamColor = '#FFFF33'; // Yellow
      this.width = 8;
      this.height = 8;
    } else {
      // Soldier
      this.health = 100;
      this.maxHealth = 100;
      this.defense = 0.0;
      this.mass = 1.0;
      this.jumpForce = -150;
      this.speedMultiplier = 1.0;
      this.teamColor = '#33FF33'; // Green
    }

    if (isDummy) {
      this.health = 10000;
      this.maxHealth = 10000;
      this.teamColor = '#4169E1';
    }
    
    // Load selected weapons
    for (const wid of selectedWeapons) {
      if (WEAPONS[wid]) {
        this.weapons.push(WEAPONS[wid]);
        this.weaponCooldowns[wid] = 0;
      }
    }
    // Fallback if none selected
    if (this.weapons.length === 0) {
      this.weapons.push(WEAPONS['bazooka']);
      this.weaponCooldowns['bazooka'] = 0;
    }
  }

  public getCurrentWeapon(): Weapon {
    return this.weapons[this.currentWeaponIndex];
  }

  public switchWeapon(): void {
    if (this.weapons.length > 0) {
      this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    }
  }

  public updateAim(delta: number): void {
    this.aimAngle += delta;
    
    // Normalize to 0-360
    while (this.aimAngle >= 360) this.aimAngle -= 360;
    while (this.aimAngle < 0) this.aimAngle += 360;

    // Automatically face the direction of the aim
    if (this.aimAngle > 90 && this.aimAngle < 270) {
      this.facingRight = false;
    } else {
      this.facingRight = true;
    }
  }

  public changePower(delta: number): void {
    this.aimPower += delta;
    if (this.aimPower > 100) this.aimPower = 100;
    if (this.aimPower < 0) this.aimPower = 0;
  }

  public takeDamage(amount: number): void {
    const actualDamage = amount * (1 - this.defense);
    this.health -= actualDamage;
    if (this.health < 0) this.health = 0;
  }
}
