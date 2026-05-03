export type ControlsUi = {
  setOpen(open: boolean, persist?: boolean): void;
  syncForViewport(inGame: boolean): void;
  autoShowOnce(): void;
};

export function createControlsUi(params: {
  controlsUI: HTMLElement | null;
  mobileControls: HTMLElement;
  controlsToggleBtn: HTMLButtonElement | null;
}): ControlsUi {
  const { controlsUI, mobileControls, controlsToggleBtn } = params;
  let bound = false;
  let autoCloseTimer: number | null = null;

  const setOpen = (open: boolean, persist: boolean = true) => {
    if (!controlsUI) return;
    controlsUI.classList.toggle('is-open', open);
    if (persist) {
      try {
        localStorage.setItem('ww_controls_open', open ? '1' : '0');
      } catch {}
    }
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  };

  const ensureBoundOnce = () => {
    if (bound) return;
    bound = true;
    if (!controlsUI) return;
    if (controlsToggleBtn) {
      controlsToggleBtn.addEventListener('click', () => {
        const open = controlsUI.classList.contains('is-open');
        setOpen(!open, true);
      });
    }
    document.getElementById('controls-toggle-top')?.addEventListener('click', () => {
      if (!controlsUI) return;
      const open = controlsUI.classList.contains('is-open');
      setOpen(!open, true);
    });
  };

  const syncForViewport = (inGame: boolean) => {
    if (!controlsUI) return;
    if (!inGame) {
      controlsUI.style.display = 'none';
      controlsUI.classList.remove('is-open');
      return;
    }
    ensureBoundOnce();
    if (window.innerWidth <= 768) {
      mobileControls.style.display = 'flex';
      controlsUI.style.display = 'none';
      setOpen(false, false);
    } else {
      mobileControls.style.display = 'none';
      controlsUI.style.display = 'flex';
    }
  };

  const autoShowOnce = () => {
    if (!controlsUI) return;
    if (window.innerWidth <= 768) return;
    let seen = false;
    try {
      seen = localStorage.getItem('ww_controls_seen') === '1';
    } catch {}
    if (seen) return;
    try {
      localStorage.setItem('ww_controls_seen', '1');
    } catch {}
    setOpen(true, false);
    autoCloseTimer = window.setTimeout(() => {
      autoCloseTimer = null;
      setOpen(false, false);
    }, 8000);
  };

  return { setOpen, syncForViewport, autoShowOnce };
}

