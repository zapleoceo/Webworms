export function getUserSessionId(storage: Pick<Storage, 'getItem'>): string | null {
  try {
    const a = (storage.getItem('userSessionId') || '').trim();
    if (a) return a;
  } catch {}
  try {
    const b = (storage.getItem('sessionId') || '').trim();
    if (b) return b;
  } catch {}
  return null;
}
