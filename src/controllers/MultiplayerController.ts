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
  private syncBuffer: Array<{ t: number; state: any }> = [];
  private static readonly INTERP_DELAY_MS = 100;

  constructor(presenter: GamePresenter, userId: string) {
    this.presenter = presenter;
    this.userId = userId;
    this.sync = new MultiplayerSync();
    this.presenter.onClientTick = () => this.tickClientInterpolation();

    this.sync.onPlayerAction = (action, active, payload) => {
      if (this.presenter.isHost && !this.isRemotePlayersTurn()) return;
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
      if (this.presenter.isHost) return;
      this.applyHostInit(initData);
    };

    this.sync.onStateReceived = (stateData) => {
      if (this.presenter.isHost) return;
      if (!this.hasInit) {
        this.pendingState = stateData;
        return;
      }
      this.enqueueHostState(stateData);
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

  private isRemotePlayersTurn(): boolean {
    const cp = this.presenter.state.getCurrentPlayer?.();
    const activeTeam = cp?.team || 'team1';
    const localTeam = this.presenter.localTeam;
    const remoteTeam = localTeam === 'team1' ? 'team2' : (localTeam === 'team2' ? 'team1' : 'team2');
    return activeTeam === remoteTeam;
  }

  private enqueueHostState(stateData: any) {
    const seq = typeof stateData?.seq === 'number' ? stateData.seq : 0;
    if (seq > 0 && seq <= this.lastSeq) return;
    if (seq > 0) this.lastSeq = seq;

    if (stateData.craters && stateData.craters.length > 0) {
      stateData.craters.forEach((crater: any) => {
        this.presenter.state.landscape.createCrater(crater.x, crater.y, crater.r);
      });
    }

    this.syncBuffer.push({ t: performance.now(), state: stateData });
    if (this.syncBuffer.length > 3) this.syncBuffer.shift();
  }

  private tickClientInterpolation() {
    if (!this.hasInit) return;
    if (this.syncBuffer.length === 0) return;

    const now = performance.now();
    const renderTime = now - MultiplayerController.INTERP_DELAY_MS;
    let a = this.syncBuffer[0];
    let b = this.syncBuffer[this.syncBuffer.length - 1];

    for (let i = 0; i < this.syncBuffer.length - 1; i++) {
      const s0 = this.syncBuffer[i];
      const s1 = this.syncBuffer[i + 1];
      if (renderTime >= s0.t && renderTime <= s1.t) {
        a = s0;
        b = s1;
        break;
      }
      if (renderTime > s1.t) {
        a = s1;
        b = s1;
      }
    }

    const dt = Math.max(1, b.t - a.t);
    const t = Math.max(0, Math.min(1, (renderTime - a.t) / dt));
    this.applyInterpolatedState(a.state, b.state, t);
  }

  private applyInterpolatedState(s0: any, s1: any, t: number) {
    const lerp = (x: number, y: number) => x + (y - x) * t;
    const s = s1 || s0;

    const oldCurrentPlayerIndex = this.presenter.state.currentPlayerIndex;
    this.presenter.state.currentPlayerIndex = s.currentPlayerIndex;
    if (oldCurrentPlayerIndex !== s.currentPlayerIndex) {
      const cp = this.presenter.state.getCurrentPlayer();
      if (cp) this.presenter.updateMobileWeaponIcon(cp);
    }

    this.presenter.state.wind = s.wind;
    this.presenter.turnTimeLeft = s.turnTimeLeft;
    this.presenter.state.turnTimeLeft = s.turnTimeLeft;
    this.presenter.hasFiredThisTurn = s.hasFiredThisTurn;
    if (s.lastPlayedIndex) {
      this.presenter.state.lastPlayedIndex = s.lastPlayedIndex;
    }

    const p0 = Array.isArray(s0?.players) ? s0.players : [];
    const p1 = Array.isArray(s1?.players) ? s1.players : [];
    for (let i = 0; i < this.presenter.state.players.length; i++) {
      const w = this.presenter.state.players[i];
      const a = p0[i] || p1[i];
      const b = p1[i] || p0[i];
      if (!a || !b) continue;
      w.x = lerp(a.x, b.x);
      w.y = lerp(a.y, b.y);
      w.vx = lerp(a.vx, b.vx);
      w.vy = lerp(a.vy, b.vy);
      w.health = b.health;
      w.aimAngle = b.aimAngle;
      w.facingRight = b.facingRight;
      if (b.currentEquipmentIndex !== undefined) w.currentEquipmentIndex = b.currentEquipmentIndex;
      if (b.ropeActive !== undefined) {
        w.ropeActive = b.ropeActive;
        w.ropeAnchorX = b.ropeAnchorX || 0;
        w.ropeAnchorY = b.ropeAnchorY || 0;
        w.ropeLength = b.ropeLength || 0;
      }
      w.team = b.team;
      if (b.unitClass && w.unitClass !== b.unitClass) w.unitClass = b.unitClass;
    }

    const proj0 = Array.isArray(s0?.projectiles) ? s0.projectiles : [];
    const proj1 = Array.isArray(s1?.projectiles) ? s1.projectiles : [];
    const map0 = new Map<number, any>();
    const map1 = new Map<number, any>();
    for (const pd of proj0) if (typeof pd?.id === 'number') map0.set(pd.id, pd);
    for (const pd of proj1) if (typeof pd?.id === 'number') map1.set(pd.id, pd);

    const ids = new Set<number>([...map0.keys(), ...map1.keys()]);
    const nextProjectiles: Projectile[] = [];
    for (const id of ids) {
      const a = map0.get(id) || map1.get(id);
      const b = map1.get(id) || map0.get(id);
      if (!a || !b) continue;
      const weapon = WEAPONS[b.weaponId] || WEAPONS['bazooka'];
      let p = this.projectileById.get(id);
      if (!p) {
        p = b.weaponId === 'grenade'
          ? new GrenadeProjectile(b.x, b.y, b.vx, b.vy, weapon, 3)
          : new Projectile(b.x, b.y, b.vx, b.vy, weapon);
        (p as any).netId = id;
        this.projectileById.set(id, p);
      }
      p.x = lerp(a.x, b.x);
      p.y = lerp(a.y, b.y);
      p.vx = lerp(a.vx, b.vx);
      p.vy = lerp(a.vy, b.vy);
      if (p instanceof GrenadeProjectile && typeof b.fuseRemaining === 'number') {
        p.fuseRemaining = b.fuseRemaining;
      }
      nextProjectiles.push(p);
    }
    for (const [id] of this.projectileById) {
      if (!ids.has(id)) this.projectileById.delete(id);
    }
    this.presenter.state.projectiles = nextProjectiles;
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
        this.syncBuffer = [];
        this.lastSeq = 0;
        const pending = this.pendingState;
        this.pendingState = null;
        if (pending) this.enqueueHostState(pending);
      }).catch(() => {
        this.presenter.isPaused = false;
      });
      return;
    }
    this.hasInit = true;
    this.syncBuffer = [];
    this.lastSeq = 0;
    const pending = this.pendingState;
    this.pendingState = null;
    if (pending) this.enqueueHostState(pending);
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
