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
  bazooka: { id: 'bazooka', kind: 'weapon', name: WEAPONS.bazooka.name, icon: '/sprites/custom_weapons/frames/row1_col0.png', weapon: WEAPONS.bazooka },
  shotgun: { id: 'shotgun', kind: 'weapon', name: WEAPONS.shotgun.name, icon: '/sprites/custom_weapons/frames/row2_col0.png', weapon: WEAPONS.shotgun },
  minigun: { id: 'minigun', kind: 'weapon', name: WEAPONS.minigun.name, icon: '/sprites/custom_weapons/frames/row3_col0.png', weapon: WEAPONS.minigun },
  homing_missile: { id: 'homing_missile', kind: 'weapon', name: WEAPONS.homing_missile.name, icon: '/sprites/custom_weapons/frames/row4_col0.png', weapon: WEAPONS.homing_missile },
  heavy_gun: { id: 'heavy_gun', kind: 'weapon', name: WEAPONS.heavy_gun.name, icon: '/sprites/custom_weapons/frames/row5_col0.png', weapon: WEAPONS.heavy_gun },
  handgun: { id: 'handgun', kind: 'weapon', name: WEAPONS.handgun.name, icon: '/sprites/custom_weapons/frames/row6_col0.png', weapon: WEAPONS.handgun },
  grenade: { id: 'grenade', kind: 'weapon', name: WEAPONS.grenade.name, icon: '/sprites/custom_weapons/frames/row7_col0.png', weapon: WEAPONS.grenade },
  plasma_gun: { id: 'plasma_gun', kind: 'weapon', name: WEAPONS.plasma_gun.name, icon: '/sprites/custom_weapons/frames/row8_col0.png', weapon: WEAPONS.plasma_gun },
  flamethrower: { id: 'flamethrower', kind: 'weapon', name: WEAPONS.flamethrower.name, icon: '/sprites/custom_weapons/frames/row9_col0.png', weapon: WEAPONS.flamethrower },
  ninja_rope: { id: 'ninja_rope', kind: 'tool', name: 'Ninja Rope', icon: '/sprites/custom_weapons/frames/row10_col0.png' }
};

export function getEquipmentDefinition(id: string): EquipmentDefinition | undefined {
  return EQUIPMENT[id];
}

export function applyEquipmentOverrides(overrides: { icons?: Record<string, string>; names?: Record<string, string> }): void {
  if (overrides.icons) {
    for (const [id, src] of Object.entries(overrides.icons)) {
      const def = EQUIPMENT[id];
      if (!def || typeof src !== 'string' || src.length === 0) continue;
      def.icon = src;
    }
  }
  if (overrides.names) {
    for (const [id, name] of Object.entries(overrides.names)) {
      const def = EQUIPMENT[id];
      if (!def || typeof name !== 'string' || name.length === 0) continue;
      def.name = name;
    }
  }
}

export function isWeaponEquipment(id: string): boolean {
  return EQUIPMENT[id]?.kind === 'weapon';
}

export function getWeaponByEquipmentId(id: string): Weapon | undefined {
  return EQUIPMENT[id]?.weapon;
}

export function getDefaultLoadout(): string[] {
  return ['bazooka', 'grenade', 'ninja_rope'];
}
