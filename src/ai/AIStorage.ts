import type { AIDifficulty } from './AIDifficulty';

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
    setItem: (k, v) => {
      mem.set(k, v);
    }
  };
}

const KEY = 'aiDifficulty';

export function getAIDifficulty(): AIDifficulty {
  const raw = getStorage().getItem(KEY);
  if (raw === 'easy' || raw === 'medium' || raw === 'hard') return raw;
  return 'medium';
}

export function setAIDifficulty(v: AIDifficulty): void {
  getStorage().setItem(KEY, v);
}
