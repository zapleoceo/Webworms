import { describe, expect, it } from 'vitest';
import { Landscape } from '../../models/Landscape';
import { applyCraterToGrid } from './TerrainPatches';

describe('applyCraterToGrid', () => {
  it('matches Landscape.createCrater for solid terrain', () => {
    const w = 160;
    const h = 120;
    const land = new Landscape(w, h);
    land.grid.fill(1);
    const copy = new Uint8Array(land.grid);

    const cx = 80;
    const cy = 60;
    const r = 12;

    land.createCrater(cx, cy, r);
    applyCraterToGrid(copy, w, h, cx, cy, r);

    expect(Array.from(copy)).toEqual(Array.from(land.grid));
  });
});

