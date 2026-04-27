import type { Weapon } from './Weapon';

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
  
  public aimAngle: number = 0; // -PI/2 (straight up) to PI/2 (straight down). 0 is horizontal.
  public aimPower: number = 0; // 0 to 100
  public facingRight: boolean = true;
  public isFallingSoundPlaying: boolean = false;

  // Animation state
  public walkCycle: number = 0;

  // Visual/team identifier
  public team: string;
  public teamColor: string;
  public name: string;
  public unitClass: 'soldier' | 'heavy' | 'scout';
  
  // Weapons
  public weapons: Weapon[] = [];
  public currentWeaponIndex: number = 0;
  public weaponCooldowns: Record<string, number> = {};
  public maxWeaponCooldowns: Record<string, number> = {};

  public damageDealt: number = 0;

  constructor(x: number, y: number, isDummy: boolean = false, name: string = 'Player', unitClass: 'soldier' | 'heavy' | 'scout' = 'soldier', selectedWeapons: string[] = ['bazooka', 'blaster']) {
    this.x = x;
    this.y = y;
    this.name = name;
    this.unitClass = unitClass;
    this.team = isDummy ? 'team2' : 'team1';
    
    // Everyone starts with 100 HP
    this.health = 100;
    this.maxHealth = 100;
    
    // Apply only visual/physics modifiers, disable HP modifier
    if (unitClass === 'heavy') {
      this.defense = 0.2;
      this.mass = 1.5;
      this.jumpForce = -100;
      this.speedMultiplier = 0.6;
      this.teamColor = '#FF3333'; // Red
      this.width = 12;
      this.height = 12;
    } else if (unitClass === 'scout') {
      this.defense = 0.0;
      this.mass = 0.7;
      this.jumpForce = -200;
      this.speedMultiplier = 1.4;
      this.teamColor = '#FFFF33'; // Yellow
      this.width = 8;
      this.height = 8;
    } else {
      // Soldier
      this.defense = 0.0;
      this.mass = 1.0;
      this.jumpForce = -150;
      this.speedMultiplier = 1.0;
      this.teamColor = '#33FF33'; // Green
    }

    if (isDummy && window.location.pathname.indexOf('training') !== -1) {
      this.health = 10000;
      this.maxHealth = 10000;
      this.teamColor = '#4169E1';
    }
    
    // Load selected weapons
    const WEAPONS: any = {
      'bazooka': { id: 'bazooka', name: 'Bazooka', damage: 25, explosionRadius: 40, projectilesPerShot: 1, spread: 0, cooldown: 1.0, windMultiplier: 1.0 },
      'minigun': { id: 'minigun', name: 'Minigun', damage: 4, explosionRadius: 15, projectilesPerShot: 1, spread: 15, cooldown: 0.1, windMultiplier: 0.5 },
      'triple': { id: 'triple', name: 'Triple Shot', damage: 15, explosionRadius: 25, projectilesPerShot: 3, spread: 20, cooldown: 1.5, windMultiplier: 1.0 },
      'rocket': { id: 'rocket', name: 'Heavy Rocket', damage: 40, explosionRadius: 60, projectilesPerShot: 1, spread: 0, cooldown: 2.0, windMultiplier: 1.2 },
      'blaster': { id: 'blaster', name: 'Blaster', damage: 10, explosionRadius: 15, projectilesPerShot: 1, spread: 2, cooldown: 0.3, windMultiplier: 0.1 }
    };

    for (const wid of selectedWeapons) {
      if (WEAPONS[wid]) {
        this.weapons.push(WEAPONS[wid]);
        this.weaponCooldowns[wid] = 0;
        this.maxWeaponCooldowns[wid] = WEAPONS[wid].cooldown;
      }
    }
    // Fallback if none selected
    if (this.weapons.length === 0) {
      this.weapons.push(WEAPONS['bazooka']);
      this.weaponCooldowns['bazooka'] = 0;
      this.maxWeaponCooldowns['bazooka'] = WEAPONS['bazooka'].cooldown;
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

  public setWeaponIndex(index: number): void {
    if (this.weapons.length > 0 && index >= 0 && index < this.weapons.length) {
      this.currentWeaponIndex = index;
    }
  }

  public updateAim(delta: number): void {
    this.aimAngle += delta;

    // Clamp between -PI/2 (up) and PI/2 (down)
    if (this.aimAngle > Math.PI / 2) this.aimAngle = Math.PI / 2;
    if (this.aimAngle < -Math.PI / 2) this.aimAngle = -Math.PI / 2;
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
