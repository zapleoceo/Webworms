import { APIClient } from '../network/APIClient';
import { MultiplayerSync } from '../network/MultiplayerSync';
import { Random } from '../utils/Random';
import { Worm } from '../models/Worm';
import { Projectile } from '../models/Projectile';
import { WEAPONS } from '../models/Weapon';
import { GrenadeProjectile } from '../models/GrenadeProjectile';
import type { GamePresenter } from '../presenters/GamePresenter';
import { getLoadoutForWorm } from '../equipment/LoadoutGenerator';
import { findSafeWormSpawn } from '../gameplay/SpawnSelector';

export type MultiplayerMode = 'friend' | 'random';

export class MultiplayerController {
  public readonly sync: MultiplayerSync;
  private presenter: GamePresenter;
  private userId: string;

  constructor(presenter: GamePresenter, userId: string) {
    this.presenter = presenter;
    this.userId = userId;
    this.sync = new MultiplayerSync();

    this.sync.onPlayerAction = (action, active, payload) => {
      if (action === 'analog') {
        this.presenter.handleAnalogInput(payload.x, payload.y, true);
      } else if (action === 'switchWorm') {
        const index = payload;
        if (index >= 0 && index < this.presenter.state.players.length) {
          this.presenter.state.currentPlayerIndex = index;
          const cp = this.presenter.state.getCurrentPlayer();
          if (cp) this.presenter.updateMobileWeaponIcon(cp);
        }
      } else {
        this.presenter.handleInput(action, active, true, payload);
      }
    };

    this.sync.onStateReceived = (stateData) => {
      if (this.presenter.localTeam !== 'team2') return;
      this.applyHostState(stateData);
    };

    this.presenter.onLocalAction = (action: string, active: boolean, payload?: any) => {
      this.sync.sendAction(action, active, payload);
    };
  }

  async connect(mode: MultiplayerMode, joinRoomId: string | undefined, isHostResume: boolean): Promise<{ roomId: string; isJoining: boolean }> {
    const roomId = await this.sync.createOrJoinRoom(joinRoomId, this.userId, isHostResume, mode === 'random');
    const isJoining = mode === 'random' ? !this.sync.isHost : !!(joinRoomId && !isHostResume);
    return { roomId, isJoining };
  }

  dispose() {
    try {
      this.sync.peerConnection?.close();
    } catch {}
  }

  private applyHostState(stateData: any) {
    if (this.presenter.state.mapSeed !== stateData.mapSeed || (stateData.mapData && this.presenter.state.mapData !== stateData.mapData)) {
      this.presenter.state.mapSeed = stateData.mapSeed;
      this.presenter.state.mapData = stateData.mapData;
      Random.setSeed(stateData.mapSeed);

      if (stateData.mapData) {
        const fullUrl = stateData.mapData.startsWith('http') ? stateData.mapData : APIClient.BASE_URL.replace('/api', '') + stateData.mapData;
        this.presenter.isPaused = true;

        this.presenter.state.landscape.generateFromImage(fullUrl).then(() => {
          this.presenter.state.width = this.presenter.state.landscape.width;
          this.presenter.state.height = this.presenter.state.landscape.height;
          this.rebuildWorms(stateData.mapSeed);
          this.presenter.isPaused = false;
        }).catch(() => {
          this.presenter.isPaused = false;
        });
      }
    }

    const oldCurrentPlayerIndex = this.presenter.state.currentPlayerIndex;
    this.presenter.state.currentPlayerIndex = stateData.currentPlayerIndex;
    if (oldCurrentPlayerIndex !== stateData.currentPlayerIndex) {
      const cp = this.presenter.state.getCurrentPlayer();
      if (cp) this.presenter.updateMobileWeaponIcon(cp);
    }

    this.presenter.state.wind = stateData.wind;
    this.presenter.turnTimeLeft = stateData.turnTimeLeft;
    this.presenter.state.turnTimeLeft = stateData.turnTimeLeft;
    this.presenter.hasFiredThisTurn = stateData.hasFiredThisTurn;
    if (stateData.lastPlayedIndex) {
      this.presenter.state.lastPlayedIndex = stateData.lastPlayedIndex;
    }

    stateData.players.forEach((pData: any, i: number) => {
      if (this.presenter.state.players[i]) {
        const p = this.presenter.state.players[i];
        p.x = pData.x;
        p.y = pData.y;
        p.vx = pData.vx;
        p.vy = pData.vy;
        p.health = pData.health;
        p.aimAngle = pData.aimAngle;
        p.facingRight = pData.facingRight;

        if (pData.currentEquipmentIndex !== undefined) {
          p.currentEquipmentIndex = pData.currentEquipmentIndex;
        }
        if (pData.ropeActive !== undefined) {
          p.ropeActive = pData.ropeActive;
          p.ropeAnchorX = pData.ropeAnchorX || 0;
          p.ropeAnchorY = pData.ropeAnchorY || 0;
          p.ropeLength = pData.ropeLength || 0;
        }
        p.team = pData.team;
        if (pData.unitClass && p.unitClass !== pData.unitClass) {
          p.unitClass = pData.unitClass;
        }
      }
    });

    this.presenter.state.projectiles = stateData.projectiles.map((projData: any) => {
      const weapon = WEAPONS[projData.weaponId] || WEAPONS['bazooka'];
      if (projData.weaponId === 'grenade') {
        const p = new GrenadeProjectile(projData.x, projData.y, projData.vx, projData.vy, weapon, 3);
        if (typeof projData.fuseRemaining === 'number') p.fuseRemaining = projData.fuseRemaining;
        return p;
      }
      return new Projectile(projData.x, projData.y, projData.vx, projData.vy, weapon);
    });

    if (stateData.craters && stateData.craters.length > 0) {
      stateData.craters.forEach((crater: any) => {
        this.presenter.state.landscape.createCrater(crater.x, crater.y, crater.r);
      });
    }
  }

  private rebuildWorms(mapSeed: number) {
    this.presenter.state.players = [];

    const spawnPoints: {x: number, y: number}[] = [];
    const availableClasses = ['soldier', 'heavy', 'scout'];

    const t1Classes = [
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)]
    ];
    const t2Classes = [
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)],
      availableClasses[Random.nextInt(0, availableClasses.length - 1)]
    ];

    for (let i = 0; i < 3; i++) {
      const s = findSafeWormSpawn(this.presenter.state.landscape, mapSeed || 1, `team1:${i}`, spawnPoints, 150);
      spawnPoints.push(s);
      const loadout = getLoadoutForWorm(this.presenter.state.mode as any, mapSeed || 1, 'team1', i);
      const p = new Worm(s.x, s.y, false, `Worm ${i+1}`, t1Classes[i] as any, loadout, 'team1');
      this.presenter.state.addPlayer(p);
    }
    for (let i = 0; i < 3; i++) {
      const s = findSafeWormSpawn(this.presenter.state.landscape, mapSeed || 1, `team2:${i}`, spawnPoints, 150);
      spawnPoints.push(s);
      const loadout = getLoadoutForWorm(this.presenter.state.mode as any, mapSeed || 1, 'team2', i);
      const p = new Worm(s.x, s.y, false, `Enemy ${i+1}`, t2Classes[i] as any, loadout, 'team2');
      this.presenter.state.addPlayer(p);
    }
  }
}
