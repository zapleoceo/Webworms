import type { Weapon } from '../models/Weapon';
import { WEAPONS } from '../models/Weapon';

export type EquipmentKind = 'weapon' | 'tool';

export interface EquipmentDefinition {
  id: string;
  kind: EquipmentKind;
  name: string;
  icon: string;
  aimAnimKey?: string;
  projectileAnimKey?: string;
  weapon?: Weapon;
}

const EQUIPMENT: Record<string, EquipmentDefinition> = {
  bazooka: { id: 'bazooka', kind: 'weapon', name: 'Bazooka', icon: '/sprites/Weapon Icons/bazooka.1.png', aimAnimKey: 'bazooka', projectileAnimKey: 'proj_bazooka', weapon: WEAPONS.bazooka },
  minigun: { id: 'minigun', kind: 'weapon', name: 'Minigun', icon: '/sprites/Weapon Icons/minigun.1.png', aimAnimKey: 'minigun', projectileAnimKey: 'proj_minigun', weapon: WEAPONS.minigun },
  triple: { id: 'triple', kind: 'weapon', name: 'Triple-barrel', icon: '/sprites/Weapon Icons/shotgun.1.png', aimAnimKey: 'shotgun', projectileAnimKey: 'proj_triple', weapon: WEAPONS.triple },
  rocket: { id: 'rocket', kind: 'weapon', name: 'Rocket', icon: '/sprites/Weapon Icons/hmissile.1.png', aimAnimKey: 'rocket', projectileAnimKey: 'proj_rocket', weapon: WEAPONS.rocket },
  blaster: { id: 'blaster', kind: 'weapon', name: 'Blaster', icon: '/sprites/Weapon Icons/laser.1.png', aimAnimKey: 'bazooka', projectileAnimKey: 'proj_blaster', weapon: WEAPONS.blaster },
  grenade: { id: 'grenade', kind: 'weapon', name: 'Grenade', icon: '/sprites/Weapon Icons/grenade.1.png', aimAnimKey: 'throw', projectileAnimKey: 'proj_grenade', weapon: WEAPONS.grenade },
  rope: { id: 'rope', kind: 'tool', name: 'Rope', icon: '/sprites/Weapon Icons/rope.1.png', aimAnimKey: 'rope' }
};

export function getEquipmentDefinition(id: string): EquipmentDefinition | undefined {
  return EQUIPMENT[id];
}

export function isWeaponEquipment(id: string): boolean {
  return EQUIPMENT[id]?.kind === 'weapon';
}

export function getWeaponByEquipmentId(id: string): Weapon | undefined {
  return EQUIPMENT[id]?.weapon;
}

export function getDefaultLoadout(): string[] {
  return ['bazooka', 'grenade', 'rope'];
}
