import { describe, expect, it } from 'vitest';
import { Landscape } from '../models/Landscape';
import { TerrainDistanceField } from './TerrainDistanceField';

describe('TerrainDistanceField crater invalidation', () => {
  it('updates signedDistance after createCrater', () => {
    const land = new Landscape(200, 200);
    land.grid.fill(1);
    land.revision++;
    land.dfMarkReset();

    const df = new TerrainDistanceField(land);
    const before = df.signedDistance(100, 100);
    expect(before).toBeLessThan(0);

    land.createCrater(100, 100, 12);
    const after = df.signedDistance(100, 100);
    expect(after).toBeGreaterThanOrEqual(0);
  });
});

