type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const mem = new Map<string, string>();

function getStorage(): StorageLike {
  const s: any = (globalThis as any).localStorage;
  if (s && typeof s.getItem === 'function' && typeof s.setItem === 'function') return s as StorageLike;
  return {
    getItem: (k) => (mem.has(k) ? (mem.get(k) as string) : null),
    setItem: (k, v) => { mem.set(k, v); }
  };
}

export type AIVaiCasePlan = {
  moveTo?: { x: number; y: number };
  movePath?: { waypoints: Array<{ x: number; y: number }>; primitive: 'walk' | 'jump' | 'rope' };
  action: { weaponIndex: number; facingRight: boolean; aimAngle: number; power: number; targetId: string };
  intent?: 'attack' | 'approach';
  intentReason?: Record<string, any>;
};

export type AIVaiCase = {
  aiV: string;
  stateKey: string;
  caseId: string;
  plan: AIVaiCasePlan;
  weaponId: string | null;
  expectedDamage: number;
  utility: number;
  enemyDelta: number;
  allyDelta: number;
  samples: number;
  emaUtility: number;
  updatedAt: number;
};

type Store = {
  v: 1;
  byKey: Record<string, AIVaiCase[]>;
  updatedAt: number;
};

const KEY = 'ww_ai_cases_v1';
let store: Store = { v: 1, byKey: {}, updatedAt: 0 };

const safeParse = (raw: string | null): any => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export function loadCaseLibrary(): Store {
  const raw = getStorage().getItem(KEY);
  const parsed = safeParse(raw);
  if (parsed && parsed.v === 1 && parsed.byKey && typeof parsed.byKey === 'object') {
    store = { v: 1, byKey: parsed.byKey || {}, updatedAt: Number(parsed.updatedAt) || 0 };
  }
  return store;
}

export function saveCaseLibrary(): void {
  store.updatedAt = Date.now();
  const s = getStorage();
  try { s.setItem(KEY, JSON.stringify(store)); } catch {}
}

export function getCasesByKey(stateKey: string): AIVaiCase[] {
  const arr = store.byKey?.[stateKey];
  return Array.isArray(arr) ? arr : [];
}

export function mergeCases(cases: Array<Partial<AIVaiCase>>): void {
  if (!Array.isArray(cases) || cases.length === 0) return;
  const byKey = store.byKey || (store.byKey = {});
  const alpha = 0.15;
  const now = Date.now();

  for (const c0 of cases) {
    const aiV = typeof c0.aiV === 'string' ? c0.aiV : '';
    const stateKey = typeof c0.stateKey === 'string' ? c0.stateKey : '';
    const caseId = typeof c0.caseId === 'string' ? c0.caseId : '';
    const plan = (c0 as any).plan;
    if (!aiV || !stateKey || !caseId || !plan) continue;
    const expectedDamage = Number((c0 as any).expectedDamage) || 0;
    const utility = Number((c0 as any).utility) || 0;
    const enemyDelta = Number((c0 as any).enemyDelta) || 0;
    const allyDelta = Number((c0 as any).allyDelta) || 0;
    const weaponId = typeof (c0 as any).weaponId === 'string' ? String((c0 as any).weaponId) : null;
    const updatedAt = Number.isFinite(Number((c0 as any).updatedAt)) ? Number((c0 as any).updatedAt) : now;

    const arr = byKey[stateKey] || (byKey[stateKey] = []);
    const idx = arr.findIndex(x => x && x.caseId === caseId);
    if (idx < 0) {
      arr.push({
        aiV,
        stateKey,
        caseId,
        plan,
        weaponId,
        expectedDamage,
        utility,
        enemyDelta,
        allyDelta,
        samples: 1,
        emaUtility: utility,
        updatedAt
      } as AIVaiCase);
    } else {
      const prev = arr[idx] as AIVaiCase;
      prev.samples = Math.min(10000, (prev.samples || 0) + 1);
      prev.emaUtility = (1 - alpha) * (prev.emaUtility || 0) + alpha * utility;
      prev.utility = utility;
      prev.enemyDelta = enemyDelta;
      prev.allyDelta = allyDelta;
      prev.expectedDamage = expectedDamage;
      prev.weaponId = weaponId;
      prev.updatedAt = updatedAt;
      prev.plan = plan as any;
    }
    arr.sort((a, b) => (b.emaUtility || 0) - (a.emaUtility || 0));
    if (arr.length > 30) arr.length = 30;
  }

  const keys = Object.keys(byKey);
  if (keys.length > 400) {
    keys.sort((a, b) => {
      const ta = (byKey[a]?.[0]?.updatedAt || 0);
      const tb = (byKey[b]?.[0]?.updatedAt || 0);
      return ta - tb;
    });
    for (let i = 0; i < keys.length - 360; i++) delete byKey[keys[i]];
  }
}

export function normalizePlanJsonRow(row: any): Partial<AIVaiCase> | null {
  const aiV = typeof row?.aiV === 'string' ? row.aiV : '';
  const stateKey = typeof row?.stateKey === 'string' ? row.stateKey : '';
  const caseId = typeof row?.caseId === 'string' ? row.caseId : '';
  const planJson = typeof row?.planJson === 'string' ? row.planJson : '';
  if (!aiV || !stateKey || !caseId || !planJson) return null;
  let plan: any = null;
  try { plan = JSON.parse(planJson); } catch { plan = null; }
  if (!plan || typeof plan !== 'object') return null;
  const weaponId = typeof row?.weaponId === 'string' ? row.weaponId : null;
  const expectedDamage = Number(row?.lastExpectedDamage) || Number(row?.expectedDamage) || 0;
  const utility = Number(row?.lastUtility) || Number(row?.utility) || 0;
  const enemyDelta = Number(row?.lastEnemyDelta) || Number(row?.enemyDelta) || 0;
  const allyDelta = Number(row?.lastAllyDelta) || Number(row?.allyDelta) || 0;
  const samples = Number(row?.samples) || 1;
  const emaUtility = Number(row?.emaUtility) || utility;
  const updatedAt = Number(row?.updatedAt) || Date.now();
  return { aiV, stateKey, caseId, plan, weaponId, expectedDamage, utility, enemyDelta, allyDelta, samples, emaUtility, updatedAt };
}

export function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function computeWeaponsMask(equipmentIds: string[]): string {
  const ids = equipmentIds.filter(Boolean).slice().sort();
  const joined = ids.join(',');
  return fnv1a32(joined);
}

export function buildStateKey(aiV: string, mapSeed: number, sx: number, sy: number, ex: number, ey: number, weaponsMask: string): string {
  const xBin = Math.floor(sx / 64);
  const yBin = Math.floor(sy / 64);
  const dx = ex - sx;
  const dy = ey - sy;
  const dxBin = Math.max(-20, Math.min(20, Math.floor(dx / 64)));
  const dyBin = Math.max(-20, Math.min(20, Math.floor(dy / 64)));
  const ms = Number.isFinite(mapSeed) ? Math.floor(mapSeed) : 0;
  return `v:${aiV}|sx:${xBin}|sy:${yBin}|dx:${dxBin}|dy:${dyBin}|wm:${weaponsMask}|ms:${ms}`;
}

export function buildStateKeyFromPresenter(aiV: string, presenter: any, shooterIdx: number): { stateKey: string; weaponsMask: string } | null {
  const st = presenter?.state;
  const players: any[] = Array.isArray(st?.players) ? st.players : [];
  const shooter = players[shooterIdx];
  if (!shooter || (shooter.health || 0) <= 0) return null;
  const enemies = players.filter(p => p && p.team !== shooter.team && (p.health || 0) > 0);
  if (enemies.length === 0) return null;
  enemies.sort((a, b) => Math.hypot((a.x || 0) - shooter.x, (a.y || 0) - shooter.y) - Math.hypot((b.x || 0) - shooter.x, (b.y || 0) - shooter.y));
  const e = enemies[0];
  const eq: string[] = Array.isArray(shooter.equipmentIds) ? shooter.equipmentIds.filter((x: any) => typeof x === 'string') : [];
  const weaponsMask = computeWeaponsMask(eq);
  const key = buildStateKey(aiV, Number(st?.mapSeed) || 0, Number(shooter.x) || 0, Number(shooter.y) || 0, Number(e.x) || 0, Number(e.y) || 0, weaponsMask);
  return { stateKey: key, weaponsMask };
}

export function computeCaseId(stateKey: string, plan: AIVaiCasePlan): string {
  const wi = Number(plan?.action?.weaponIndex) || 0;
  const fr = plan?.action?.facingRight ? 1 : 0;
  const ang = Math.round((Number(plan?.action?.aimAngle) || 0) * 1000);
  const pow = Math.round((Number(plan?.action?.power) || 0) * 10);
  const mt = plan?.moveTo ? `${Math.round(plan.moveTo.x)}:${Math.round(plan.moveTo.y)}` : 'n';
  return fnv1a32(`${stateKey}|wi:${wi}|fr:${fr}|a:${ang}|p:${pow}|mt:${mt}`);
}

export function extractTopCasesFromEvents(aiV: string, events: any[], limit: number = 10): Array<Partial<AIVaiCase> & { planJson: string }> {
  const byTurn: Record<string, any> = {};
  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const t = typeof e.type === 'string' ? e.type : '';
    const wormId = typeof e.wormId === 'string' ? e.wormId : null;
    const turnNo = typeof e.turnNo === 'number' ? e.turnNo : null;
    if (!wormId || turnNo === null) continue;
    const k = `${wormId}|${turnNo}`;
    const a = (byTurn[k] ||= { wormId, turnNo, plan: null as any, expectedDamage: 0, mapSeed: 0, sx: null as any, sy: null as any, ex: null as any, ey: null as any, weaponsMask: null as any, weaponId: null as any, enemyDelta: 0, allyDelta: 0, wall: 0 });
    if (t === 'bot_plan_start') {
      a.plan = e.plan || null;
      a.expectedDamage = Number(e.expectedDamage) || 0;
      a.mapSeed = Number(e.mapSeed) || 0;
      a.sx = Number(e.sx);
      a.sy = Number(e.sy);
      a.ex = Number(e.ex);
      a.ey = Number(e.ey);
      a.weaponsMask = typeof e.weaponsMask === 'string' ? e.weaponsMask : null;
    } else if (t === 'weapon_fired') {
      a.weaponId = typeof e.weaponId === 'string' ? e.weaponId : a.weaponId;
    } else if (t === 'shot_eval') {
      a.enemyDelta += Number(e.enemyDelta) || 0;
      a.allyDelta += Number(e.allyDelta) || 0;
    } else if (t === 'bot_wall_stall') {
      a.wall = 1;
    }
  }

  const out: Array<any> = [];
  for (const a of Object.values(byTurn)) {
    if (!a.plan || !a.plan.action) continue;
    if (!Number.isFinite(a.sx) || !Number.isFinite(a.sy) || !Number.isFinite(a.ex) || !Number.isFinite(a.ey)) continue;
    if (!a.weaponsMask) continue;
    const stateKey = buildStateKey(aiV, a.mapSeed || 0, a.sx, a.sy, a.ex, a.ey, a.weaponsMask);
    const plan: AIVaiCasePlan = a.plan;
    const caseId = computeCaseId(stateKey, plan);
    const enemyDelta = Number(a.enemyDelta) || 0;
    const allyDelta = Number(a.allyDelta) || 0;
    const moveCost = plan.moveTo ? Math.abs((Number(plan.moveTo.x) || 0) - a.sx) : 0;
    const utility = enemyDelta - 3.0 * allyDelta - 0.02 * moveCost - 1.0 * (a.wall ? 1 : 0);
    if (!Number.isFinite(utility)) continue;
    const weaponId = typeof a.weaponId === 'string' ? a.weaponId : null;
    const updatedAt = Date.now();
    const planJson = JSON.stringify(plan);
    out.push({ aiV, stateKey, caseId, plan, planJson, weaponId, expectedDamage: Number(a.expectedDamage) || 0, utility, enemyDelta, allyDelta, samples: 1, emaUtility: utility, updatedAt });
  }

  out.sort((x: any, y: any) => (y.utility || 0) - (x.utility || 0));
  const picked = out.slice(0, Math.max(1, Math.min(20, limit)));
  const uniq: Record<string, any> = {};
  for (const c of picked) uniq[`${c.stateKey}|${c.caseId}`] = c;
  return Object.values(uniq).slice(0, limit);
}
