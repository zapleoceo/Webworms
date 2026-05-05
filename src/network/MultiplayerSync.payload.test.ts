import { describe, expect, it } from 'vitest';
import { MultiplayerSync } from './MultiplayerSync';

describe('MultiplayerSync.buildStatePayload', () => {
  it('includes brandLogos for syncing airdrops/graves', () => {
    const payload = (MultiplayerSync as any).buildStatePayload({
      currentPlayerIndex: 0,
      wind: 0,
      turnTimeLeft: 10,
      hasFiredThisTurn: false,
      lastPlayedIndex: { team1: 0, team2: 0 },
      teamAmmo: { team1: { grenade: 10 }, team2: { grenade: 10 } },
      players: [],
      projectiles: [],
      brandLogos: [
        { netId: 7, sprite: 'brand_apple', x: 1, y: 2, vx: 0, vy: 0, angle: 0, angularVelocity: 0, width: 10, height: 20, isDynamic: true, isSolid: true, health: 5, hardness: 10, collisionWidth: 10, collisionHeight: 20, touchedGround: false }
      ],
      landscape: { syncCraters: [] }
    });

    expect(payload.brandLogos).toEqual([
      expect.objectContaining({ id: 7, sprite: 'brand_apple', x: 1, y: 2 })
    ]);
  });
});

