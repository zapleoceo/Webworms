export function emitAivaiTrace(presenter: any, payload: any): void {
  try {
    if (presenter?.state?.mode !== 'aivai2') return;
    const cb = presenter?.onAIVaiTrace;
    if (typeof cb !== 'function') return;
    cb(payload);
  } catch {}
}

