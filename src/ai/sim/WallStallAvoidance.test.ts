import { expect, test } from 'vitest';
import { BotTurnController } from '../../controllers/BotTurnController';

test('avoids holding into wall without progress for >=0.25s', () => {
  const groundY = 340;
  const width = 900;
  const height = 560;
  const dt = 1 / 60;

  const player: any = {
    team: 'team1',
    x: 280,
    y: groundY - 12,
    vx: 0,
    vy: 0,
    width: 18,
    height: 18,
    health: 100,
    equipmentIds: ['bazooka', 'grenade'],
    weaponCooldowns: {},
    isJumping: false,
    ropeActive: false,
    facingRight: true,
    aimAngle: 0,
    aimPower: 60
  };

  const landscape: any = {
    getMaterial: (x: number, y: number) => (void x, y >= groundY ? 1 : 0)
  };

  const state: any = {
    mode: 'aivai2',
    width,
    height,
    mapSeed: 1,
    wind: 0,
    teamAmmo: { team1: { grenade: 3 }, team2: { grenade: 3 } },
    botConfig: null,
    landscape,
    players: [player],
    currentPlayerIndex: 0,
    getCurrentPlayer: () => player,
    projectiles: []
  };

  const inputState: any = { left: false, right: false, jump: false };
  const events: any[] = [];

  const presenter: any = {
    isRunning: true,
    isHost: true,
    state,
    physics: { gravity: 195, lastExplosionAt: -999 },
    matchDuration: 0,
    maxTurnTime: 30,
    turnTimeLeft: 18,
    deltaTime: dt,
    onAIVaiTrace: (p: any) => { events.push(p); },
    handleInput: (k: string, v: any) => {
      if (k === 'left') inputState.left = !!v;
      if (k === 'right') inputState.right = !!v;
      if (k === 'jump') inputState.jump = !!v;
    }
  };

  const ctrl = new BotTurnController({ team1: 'hard', team2: 'hard' }) as any;
  const moveTo = { x: 520, y: groundY - 12 };

  let tripped = 0;
  for (let i = 0; i < 120; i++) {
    presenter.matchDuration = i * dt;
    const did = ctrl.trackWallStall(presenter, player, 'right', moveTo, dt, presenter.matchDuration);
    if (did) tripped += 1;
  }

  expect(tripped).toBeGreaterThan(0);
  expect(events.some(e => e && e.type === 'bot_wall_stall')).toBe(true);
});
