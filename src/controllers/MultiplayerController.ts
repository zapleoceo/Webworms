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
  private hasInit: boolean = false;
  private pendingState: any | null = null;
  private lastSeq: number = 0;
  private projectileById: Map<number, Projectile> = new Map();

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

    this.sync.onInitReceived = (initData) => {
      if (this.presenter.localTeam !== 'team2') return;
      this.applyHostInit(initData);
    };

    this.sync.onStateReceived = (stateData) => {
      if (this.presenter.localTeam !== 'team2') return;
      if (!this.hasInit) {
        this.pendingState = stateData;
        return;
      }
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
    const seq = typeof stateData?.seq === 'number' ? stateData.seq : 0;
    if (seq > 0 && seq <= this.lastSeq) return;
    if (seq > 0) this.lastSeq = seq;

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

    const smooth = (cur: number, target: number, a: number) => cur + (target - cur) * a;
    const a = 0.45;
    stateData.players.forEach((pData: any, i: number) => {
      if (this.presenter.state.players[i]) {
        const p = this.presenter.state.players[i];
        p.x = smooth(p.x, pData.x, a);
        p.y = smooth(p.y, pData.y, a);
        p.vx = smooth(p.vx, pData.vx, a);
        p.vy = smooth(p.vy, pData.vy, a);
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

    const nextProjectiles: Projectile[] = [];
    const seen = new Set<number>();
    for (const projData of stateData.projectiles || []) {
      const id = typeof projData?.id === 'number' ? projData.id : null;
      const weapon = WEAPONS[projData.weaponId] || WEAPONS['bazooka'];

      if (id === null) {
        if (projData.weaponId === 'grenade') {
          const gp = new GrenadeProjectile(projData.x, projData.y, projData.vx, projData.vy, weapon, 3);
          if (typeof projData.fuseRemaining === 'number') gp.fuseRemaining = projData.fuseRemaining;
          nextProjectiles.push(gp);
        } else {
          nextProjectiles.push(new Projectile(projData.x, projData.y, projData.vx, projData.vy, weapon));
        }
        continue;
      }

      let p = this.projectileById.get(id);
      if (!p) {
        p = projData.weaponId === 'grenade'
          ? new GrenadeProjectile(projData.x, projData.y, projData.vx, projData.vy, weapon, 3)
          : new Projectile(projData.x, projData.y, projData.vx, projData.vy, weapon);
        (p as any).netId = id;
        this.projectileById.set(id, p);
      }
      p.x = smooth(p.x, projData.x, 0.55);
      p.y = smooth(p.y, projData.y, 0.55);
      p.vx = smooth(p.vx, projData.vx, 0.55);
      p.vy = smooth(p.vy, projData.vy, 0.55);
      if (p instanceof GrenadeProjectile && typeof projData.fuseRemaining === 'number') {
        p.fuseRemaining = projData.fuseRemaining;
      }
      nextProjectiles.push(p);
      seen.add(id);
    }
    for (const [id] of this.projectileById) {
      if (!seen.has(id)) this.projectileById.delete(id);
    }
    this.presenter.state.projectiles = nextProjectiles;

    if (stateData.craters && stateData.craters.length > 0) {
      stateData.craters.forEach((crater: any) => {
        this.presenter.state.landscape.createCrater(crater.x, crater.y, crater.r);
      });
    }
  }

  private applyHostInit(initData: any) {
    const mapSeed = initData?.mapSeed;
    const mapData = initData?.mapData;
    if (typeof mapSeed === 'number') {
      this.presenter.state.mapSeed = mapSeed;
      Random.setSeed(mapSeed);
    }
    if (typeof mapData === 'string') {
      this.presenter.state.mapData = mapData;
      const fullUrl = mapData.startsWith('http') ? mapData : APIClient.BASE_URL.replace('/api', '') + mapData;
      this.presenter.isPaused = true;
      this.presenter.state.landscape.generateFromImage(fullUrl).then(() => {
        this.presenter.state.width = this.presenter.state.landscape.width;
        this.presenter.state.height = this.presenter.state.landscape.height;
        this.rebuildWorms(typeof mapSeed === 'number' ? mapSeed : 1);
        this.presenter.isPaused = false;
        this.hasInit = true;
        const pending = this.pendingState;
        this.pendingState = null;
        if (pending) this.applyHostState(pending);
      }).catch(() => {
        this.presenter.isPaused = false;
      });
      return;
    }
    this.hasInit = true;
    const pending = this.pendingState;
    this.pendingState = null;
    if (pending) this.applyHostState(pending);
  }

  private rebuildWorms(mapSeed: number) {
    this.presenter.state.players = [];

    const spawnPoints: {x: number, y: number}[] = [];
    const availableClasses = ['soldier', 'heavy', 'scout'];
    this.presenter.state.landscape.computeSpawnCandidates(8, 14, 4, 10);

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
