export async function d1Retry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [0, 75, 250];
  let lastErr: any;
  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e);
      const retryable = msg.includes('D1_ERROR') || msg.toLowerCase().includes('timeout');
      if (!retryable) break;
    }
  }
  throw lastErr;
}
