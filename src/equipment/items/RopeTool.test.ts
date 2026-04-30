import { describe, expect, test } from 'vitest';
import { GameState } from '../../models/GameState';
import { Landscape } from '../../models/Landscape';
import { RopeTool } from './RopeTool';

describe('RopeTool', () => {
  test('caps rope nodes length', () => {
    const state = new GameState(300, 300);
    state.landscape = new Landscape(300, 300);
    state.landscape.setMaterial(150, 80, 1);

    const player: any = {
      x: 150,
      y: 180,
      vx: 0,
      vy: 0,
      width: 12,
      height: 20,
      ropeActive: true,
      ropeAnchorX: 150,
      ropeAnchorY: 80,
      ropeLength: 200,
      ropeNodes: Array.from({ length: 80 }, (_, i) => ({ x: 150 + i, y: 120 })),
      isJumping: true
    };

    RopeTool.applyConstraint(player, state, 1 / 60);
    expect(player.ropeNodes.length).toBeLessThanOrEqual(24);
  });
});

