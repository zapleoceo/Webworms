import { describe, expect, test } from 'vitest';
import { Landscape } from '../models/Landscape';
import { findSafeWormSpawn } from './SpawnSelector';

describe('SpawnSelector', () => {
  test('findSafeWormSpawn avoids ceiling and does not spawn inside terrain', () => {
    const land = new Landscape(220, 220);

    for (let y = 0; y < land.height; y++) {
      for (let x = 0; x < land.width; x++) {
        if (x < 30 || x >= land.width - 30 || y >= land.height - 30) {
          land.setMaterial(x, y, 255);
        } else {
          land.setMaterial(x, y, 0);
        }
      }
    }

    for (let x = 30; x < land.width - 30; x++) {
      land.setMaterial(x, 60, 1);
    }

    for (let x = 30; x < land.width - 30; x++) {
      land.setMaterial(x, 160, 1);
    }

    land.computeSpawnCandidates(8, 14, 4, 10);

    const p = findSafeWormSpawn(land, 123, 'team1:0', [], 120);
    expect(p.y).toBeGreaterThan(70);
    expect(land.isSpawnFree(p.x, p.y, 8, 14, 4, 30)).toBe(true);
  });
});

