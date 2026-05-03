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

export type BestPracticePrior = {
  n: number;
  bestAngleBin: number;
  bestPowerBin: number;
  meanEnemyDelta: number;
  meanAllyDelta: number;
  meanScore: number;
  updatedAt: number;
};

export type BestPracticeTemplate = {
  n: number;
  meanSuccess: number;
  updatedAt: number;
  params?: any;
};

export type BestPracticesStore = {
  v: 1;
  priors: Record<string, BestPracticePrior>;
  templates: Record<string, BestPracticeTemplate>;
  updatedAt: number;
};

const KEY = 'ww_ai_bp_v1';
let store: BestPracticesStore = { v: 1, priors: {}, templates: {}, updatedAt: 0 };

const nowMs = () => Date.now();

const safeParse = (raw: string | null): any => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export function loadBestPractices(): BestPracticesStore {
  const raw = getStorage().getItem(KEY);
  const parsed = safeParse(raw);
  if (parsed && parsed.v === 1 && parsed.priors && typeof parsed.priors === 'object') {
    store = { v: 1, priors: parsed.priors || {}, templates: parsed.templates || {}, updatedAt: Number(parsed.updatedAt) || 0 };
  }
  return store;
}

export function getBestPractices(): BestPracticesStore {
  return store;
}

export function saveBestPractices(): void {
  store.updatedAt = nowMs();
  const s = getStorage();
  try { s.setItem(KEY, JSON.stringify(store)); } catch {}
}

export function snapshotBestPracticesForWorker(): { priors: Record<string, BestPracticePrior> } {
  return { priors: store.priors || {} };
}

export function recordPriorSample(key: string, sample: { angleBin: number; powerBin: number; enemyDelta: number; allyDelta: number; score: number }): void {
  if (!key || typeof key !== 'string') return;
  if (sample.enemyDelta <= 0) return;
  if (sample.allyDelta > 0) return;
  const priors = store.priors || (store.priors = {});
  const prev = priors[key];
  const t = nowMs();
  if (!prev) {
    priors[key] = { n: 1, bestAngleBin: sample.angleBin, bestPowerBin: sample.powerBin, meanEnemyDelta: sample.enemyDelta, meanAllyDelta: sample.allyDelta, meanScore: sample.score, updatedAt: t };
  } else {
    const n = Math.min(5000, (prev.n || 0) + 1);
    const a = 0.06;
    prev.n = n;
    if (sample.score > (prev.meanScore || -Infinity)) {
      prev.bestAngleBin = sample.angleBin;
      prev.bestPowerBin = sample.powerBin;
    }
    prev.meanScore = (1 - a) * (prev.meanScore || 0) + a * sample.score;
    prev.meanEnemyDelta = (1 - a) * (prev.meanEnemyDelta || 0) + a * sample.enemyDelta;
    prev.meanAllyDelta = (1 - a) * (prev.meanAllyDelta || 0) + a * sample.allyDelta;
    prev.updatedAt = t;
  }
  const keys = Object.keys(priors);
  if (keys.length > 2000) {
    keys.sort((a, b) => (priors[a]?.updatedAt || 0) - (priors[b]?.updatedAt || 0));
    for (let i = 0; i < keys.length - 1800; i++) delete priors[keys[i]];
  }
}

export function recordTemplateSample(key: string, sample: { success: 0 | 1; params?: any }): void {
  if (!key || typeof key !== 'string') return;
  const templates = store.templates || (store.templates = {});
  const prev = templates[key];
  const t = nowMs();
  if (!prev) {
    templates[key] = { n: 1, meanSuccess: sample.success ? 1 : 0, updatedAt: t, params: sample.params };
  } else {
    const n = Math.min(8000, (prev.n || 0) + 1);
    const a = 0.08;
    prev.n = n;
    prev.meanSuccess = (1 - a) * (prev.meanSuccess || 0) + a * (sample.success ? 1 : 0);
    prev.updatedAt = t;
    if (sample.params !== undefined) prev.params = sample.params;
  }
  const keys = Object.keys(templates);
  if (keys.length > 2000) {
    keys.sort((a, b) => (templates[a]?.updatedAt || 0) - (templates[b]?.updatedAt || 0));
    for (let i = 0; i < keys.length - 1800; i++) delete templates[keys[i]];
  }
}

export function getTemplate(key: string): BestPracticeTemplate | null {
  const t = store.templates || {};
  return t[key] || null;
}
