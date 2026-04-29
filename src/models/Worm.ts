import type { Weapon } from './Weapon';
import { getDefaultLoadout, getWeaponByEquipmentId, isWeaponEquipment } from '../equipment/EquipmentRegistry';

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
  
  public equipmentIds: string[] = [];
  public currentEquipmentIndex: number = 0;
  public weaponCooldowns: Record<string, number> = {};
  public maxWeaponCooldowns: Record<string, number> = {};

  public damageDealt: number = 0;

  public ropeActive: boolean = false;
  public ropeAnchorX: number = 0;
  public ropeAnchorY: number = 0;
  public ropeLength: number = 0;
  public ropeCastTime: number = 0;
  public ropeCastDuration: number = 0;
  public ropeCastX: number = 0;
  public ropeCastY: number = 0;
  public ropeNodes: Array<{ x: number; y: number }> = [];

  constructor(
    x: number,
    y: number,
    isDummy: boolean = false,
    name: string = 'Player',
    unitClass: 'soldier' | 'heavy' | 'scout' = 'soldier',
    equipmentIds: string[] = getDefaultLoadout(),
    forceTeam?: string
  ) {
    this.x = x;
    this.y = y;
    this.name = name;
    this.unitClass = unitClass;
    this.team = forceTeam ? forceTeam : (isDummy ? 'team2' : 'team1');
    
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
    
    this.equipmentIds = equipmentIds.length > 0 ? [...equipmentIds] : getDefaultLoadout();
    for (const id of this.equipmentIds) {
      if (!isWeaponEquipment(id)) continue;
      const w = getWeaponByEquipmentId(id);
      if (!w) continue;
      if (this.weaponCooldowns[id] === undefined) this.weaponCooldowns[id] = 0;
      if (this.maxWeaponCooldowns[id] === undefined) this.maxWeaponCooldowns[id] = w.cooldown;
    }

    const preferredWeaponIndex = this.equipmentIds.findIndex((id) => isWeaponEquipment(id) && id !== 'grenade');
    if (preferredWeaponIndex >= 0) {
      this.currentEquipmentIndex = preferredWeaponIndex;
    } else {
      const grenadeIndex = this.equipmentIds.findIndex((id) => id === 'grenade');
      if (grenadeIndex >= 0) this.currentEquipmentIndex = grenadeIndex;
    }
  }

  public getCurrentEquipmentId(): string {
    if (this.equipmentIds.length === 0) return 'bazooka';
    return this.equipmentIds[Math.max(0, Math.min(this.currentEquipmentIndex, this.equipmentIds.length - 1))];
  }

  public getCurrentWeapon(): Weapon | null {
    const id = this.getCurrentEquipmentId();
    if (!isWeaponEquipment(id)) return null;
    return getWeaponByEquipmentId(id) || null;
  }

  public switchEquipment(): void {
    if (this.equipmentIds.length > 0) {
      this.currentEquipmentIndex = (this.currentEquipmentIndex + 1) % this.equipmentIds.length;
    }
  }

  public setEquipmentIndex(index: number): void {
    if (this.equipmentIds.length > 0 && index >= 0 && index < this.equipmentIds.length) {
      this.currentEquipmentIndex = index;
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
