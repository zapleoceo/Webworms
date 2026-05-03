export type WakeLockManager = {
  setWanted(wanted: boolean): void;
};

export function createWakeLockManager(): WakeLockManager {
  let sentinel: any = null;
  let wanted = false;
  let gestureHandler: (() => void) | null = null;

  const request = async (): Promise<void> => {
    try {
      if (!wanted) return;
      if (sentinel) return;
      if (document.visibilityState !== 'visible') return;
      const nav: any = navigator as any;
      if (!nav?.wakeLock?.request) return;
      sentinel = await nav.wakeLock.request('screen');
      const cur = sentinel;
      if (gestureHandler) {
        document.removeEventListener('pointerdown', gestureHandler);
        document.removeEventListener('touchstart', gestureHandler);
        gestureHandler = null;
      }
      if (cur?.addEventListener) {
        cur.addEventListener('release', () => {
          if (sentinel === cur) sentinel = null;
          request().catch(() => {});
        });
      }
    } catch {
      sentinel = null;
    }
  };

  const release = async (): Promise<void> => {
    try {
      if (sentinel?.release) await sentinel.release();
    } catch {}
    sentinel = null;
  };

  const setWanted = (next: boolean): void => {
    wanted = next;
    if (wanted) {
      if (!gestureHandler) {
        gestureHandler = () => {
          request().catch(() => {});
        };
        document.addEventListener('pointerdown', gestureHandler, { passive: true });
        document.addEventListener('touchstart', gestureHandler, { passive: true });
      }
      request().catch(() => {});
    } else {
      release().catch(() => {});
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible') request().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    if (wanted) request().catch(() => {});
  });
  window.addEventListener('focus', () => {
    if (wanted) request().catch(() => {});
  });
  window.addEventListener('pageshow', () => {
    if (wanted) request().catch(() => {});
  });

  return { setWanted };
}

