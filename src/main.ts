import './style.css';
import { AdminPanel } from './admin/AdminPanel';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';
import { APIClient } from './network/APIClient';
import { getEquipmentDefinition } from './equipment/EquipmentRegistry';
import { MultiplayerSync } from './network/MultiplayerSync';
import { AudioManager } from './utils/AudioManager';
import { PaymentController } from './controllers/PaymentController';
import { MultiplayerController } from './controllers/MultiplayerController';
import { ContactController } from './controllers/ContactController';
import { TimeBalanceController } from './controllers/TimeBalanceController';
import { AuthController } from './controllers/AuthController';
import { BotTurnController } from './controllers/BotTurnController';
import { getAIDifficulty, setAIDifficulty } from './ai/AIStorage';
import { normalizeBotConfig } from './ai/BotConfig';
import type { AIDifficulty } from './ai/AIDifficulty';
import { debugSurfacePathMatrix, terrainFromLandscape } from './ai/BotAI';
import { AI_V } from './ai/AIVersion';

declare global {
  interface Window {
    presenter: GamePresenter;
    renderer: CanvasRenderer;
    inputHandler: InputHandler;
    botDebugMatrix?: () => any;
  }
}

const isAdminPage = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

if (isAdminPage) {
  new AdminPanel();
}

if (!isAdminPage) {
  const buildVersion = '20260502_1820';
  const url = new URL(window.location.href);
  if (url.searchParams.get('v') !== buildVersion && sessionStorage.getItem('buildVersionRedirected') !== buildVersion) {
    sessionStorage.setItem('buildVersionRedirected', buildVersion);
    url.searchParams.set('v', buildVersion);
    window.location.replace(url.toString());
  }
}

// DOM Elements
const authScreen = document.getElementById('auth-screen')!;
const menuScreen = document.getElementById('main-menu')!;
const loaderScreen = document.getElementById('loader-screen')!;
const gameScreen = document.getElementById('game-screen')!;
const gameOverScreen = document.getElementById('game-over-screen')!;
const winnerText = document.getElementById('game-over-title')!;
const mobileControls = document.getElementById('mobile-controls')!;
const controlsUI = document.getElementById('controls-ui') as HTMLElement | null;
const controlsToggleBtn = document.getElementById('controls-toggle') as HTMLButtonElement | null;
const profileScreen = document.getElementById('profile-screen')!;
const btnOpenAuth = document.getElementById('btn-open-auth')!;
const btnUserProfile = document.getElementById('btn-user-profile') as HTMLButtonElement;

const loaderTextEl = document.getElementById('loader-text') as HTMLElement | null;
const loaderProgressBarEl = document.getElementById('loader-progress-bar') as HTMLElement | null;
const loaderProgressTextEl = document.getElementById('loader-progress-text') as HTMLElement | null;
const loaderWormImageEl = document.getElementById('loader-worm-image') as HTMLImageElement | null;
const enemyDifficultyEl = document.getElementById('enemy-difficulty') as HTMLElement | null;
const teamNameLeftEl = document.getElementById('team-name-left') as HTMLElement | null;
const teamNameRightTextEl = document.getElementById('team-name-right-text') as HTMLElement | null;
const teamGrenadesLeftWrapEl = document.getElementById('team-grenades-left-wrap') as HTMLElement | null;
const teamGrenadesRightWrapEl = document.getElementById('team-grenades-right-wrap') as HTMLElement | null;
const teamGrenadesLeftEl = document.getElementById('team-grenades-left') as HTMLElement | null;
const teamGrenadesRightEl = document.getElementById('team-grenades-right') as HTMLElement | null;

let currentAIDifficultyForMatch: AIDifficulty | null = null;
let controlsBound = false;
let controlsAutoCloseTimer: number | null = null;
let wakeLockSentinel: any = null;
let wakeLockWanted = false;
let wakeLockGestureHandler: ((e: Event) => void) | null = null;

async function requestWakeLock(): Promise<void> {
  try {
    if (!wakeLockWanted) return;
    if (wakeLockSentinel) return;
    if (document.visibilityState !== 'visible') return;
    const nav: any = navigator as any;
    if (!nav?.wakeLock?.request) return;
    wakeLockSentinel = await nav.wakeLock.request('screen');
    const cur = wakeLockSentinel;
    if (wakeLockGestureHandler) {
      document.removeEventListener('pointerdown', wakeLockGestureHandler);
      document.removeEventListener('touchstart', wakeLockGestureHandler);
      wakeLockGestureHandler = null;
    }
    if (cur?.addEventListener) {
      cur.addEventListener('release', () => {
        if (wakeLockSentinel === cur) wakeLockSentinel = null;
        requestWakeLock().catch(() => {});
      });
    }
  } catch {
    wakeLockSentinel = null;
  }
}

async function releaseWakeLock(): Promise<void> {
  try {
    if (wakeLockSentinel?.release) await wakeLockSentinel.release();
  } catch {}
  wakeLockSentinel = null;
}

function setWakeLockWanted(wanted: boolean): void {
  wakeLockWanted = wanted;
  if (wanted) {
    if (!wakeLockGestureHandler) {
      wakeLockGestureHandler = () => {
        requestWakeLock().catch(() => {});
      };
      document.addEventListener('pointerdown', wakeLockGestureHandler, { passive: true });
      document.addEventListener('touchstart', wakeLockGestureHandler, { passive: true });
    }
    requestWakeLock().catch(() => {});
  } else {
    releaseWakeLock().catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (wakeLockWanted && document.visibilityState === 'visible') {
    requestWakeLock().catch(() => {});
  }
});

document.addEventListener('fullscreenchange', () => {
  if (wakeLockWanted) requestWakeLock().catch(() => {});
});

window.addEventListener('focus', () => {
  if (wakeLockWanted) requestWakeLock().catch(() => {});
});

window.addEventListener('pageshow', () => {
  if (wakeLockWanted) requestWakeLock().catch(() => {});
});

function setControlsOpen(open: boolean, persist: boolean = true) {
  if (!controlsUI) return;
  controlsUI.classList.toggle('is-open', open);
  if (persist) {
    try {
      localStorage.setItem('ww_controls_open', open ? '1' : '0');
    } catch {}
  }
  if (controlsAutoCloseTimer) {
    clearTimeout(controlsAutoCloseTimer);
    controlsAutoCloseTimer = null;
  }
}

function ensureControlsBoundOnce() {
  if (controlsBound) return;
  controlsBound = true;
  if (!controlsUI) return;
  if (controlsToggleBtn) {
    controlsToggleBtn.addEventListener('click', () => {
      const open = controlsUI.classList.contains('is-open');
      setControlsOpen(!open, true);
    });
  }
  document.getElementById('controls-toggle-top')?.addEventListener('click', () => {
    if (!controlsUI) return;
    const open = controlsUI.classList.contains('is-open');
    setControlsOpen(!open, true);
  });
}

function syncControlsForViewport(inGame: boolean) {
  if (!controlsUI) return;
  if (!inGame) {
    controlsUI.style.display = 'none';
    controlsUI.classList.remove('is-open');
    return;
  }
  ensureControlsBoundOnce();
  if (window.innerWidth <= 768) {
    mobileControls.style.display = 'flex';
    controlsUI.style.display = 'none';
    setControlsOpen(false, false);
  } else {
    mobileControls.style.display = 'none';
    controlsUI.style.display = 'flex';
  }
}

function autoShowControlsOnce() {
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
  setControlsOpen(true, false);
  controlsAutoCloseTimer = window.setTimeout(() => {
    controlsAutoCloseTimer = null;
    setControlsOpen(false, false);
  }, 8000);
}

function getDifficultyLabel(d: AIDifficulty): string {
  return d.toUpperCase();
}

function setEnemyDifficultyLabel(mode: 'training' | 'ai' | 'aivai' | 'friend' | 'random') {
  if (!enemyDifficultyEl) return;
  if (mode !== 'ai') {
    enemyDifficultyEl.innerText = '';
    return;
  }
  const d = currentAIDifficultyForMatch || getAIDifficulty();
  enemyDifficultyEl.innerText = getDifficultyLabel(d);
}

function getHudSides(mode: 'training' | 'ai' | 'aivai' | 'friend' | 'random', _state: any): { leftTeam: 'team1' | 'team2'; rightTeam: 'team1' | 'team2'; leftName: string; rightName: string } {
  const lt = window.presenter.localTeam as any;
  const localTeam = (lt === 'team1' || lt === 'team2') ? lt : null;

  if (mode === 'aivai') {
    const a1 = new URLSearchParams(window.location.search).get('a1') || 'hard';
    const a2 = new URLSearchParams(window.location.search).get('a2') || 'hard';
    return { leftTeam: 'team1', rightTeam: 'team2', leftName: `${a1.toUpperCase()}1`, rightName: `${a2.toUpperCase()}2` };
  }

  if (mode === 'training' || mode === 'ai') {
    const enemyName = mode === 'ai' ? 'ENEMY' : 'ENEMY';
    return { leftTeam: 'team1', rightTeam: 'team2', leftName: 'YOU', rightName: enemyName };
  }

  if (!localTeam) {
    return { leftTeam: 'team1', rightTeam: 'team2', leftName: 'TEAM1', rightName: 'TEAM2' };
  }

  if (localTeam === 'team1') return { leftTeam: 'team1', rightTeam: 'team2', leftName: 'YOU', rightName: 'ENEMY' };
  return { leftTeam: 'team2', rightTeam: 'team1', leftName: 'YOU', rightName: 'ENEMY' };
}

function setLoaderDifficultyWorm(mode: 'training' | 'ai' | 'aivai' | 'friend' | 'random') {
  if (!loaderWormImageEl) return;
  if (mode !== 'ai') {
    loaderWormImageEl.style.display = 'none';
    loaderWormImageEl.removeAttribute('src');
    return;
  }
  const d = currentAIDifficultyForMatch || getAIDifficulty();
  const src = d === 'easy' ? '/assets/ai-worms/e3.png' : d === 'medium' ? '/assets/ai-worms/m3.png' : '/assets/ai-worms/h3.png';
  loaderWormImageEl.style.display = 'block';
  loaderWormImageEl.src = src;
}

function setLoaderProgress(progress01: number, text?: string) {
  const p = Math.max(0, Math.min(1, progress01));
  if (loaderProgressBarEl) loaderProgressBarEl.style.width = `${Math.round(p * 100)}%`;
  if (loaderProgressTextEl) loaderProgressTextEl.innerText = `${Math.round(p * 100)}%`;
  if (loaderTextEl && text) loaderTextEl.innerText = text;
}

// Only run game logic if we are not on the admin page and have game elements
if (!isAdminPage) {

let aivaiLogSent = false;

function flushAIVaiLog(reason: string, winner: any = null) {
  if (currentMode !== 'aivai' || !aivaiLog) return;
  if (aivaiLogSent) return;
  aivaiLogSent = true;
  aivaiLog.abortedAt = Date.now();
  aivaiLog.abortReason = reason;
  aivaiLog.result = { winner, stats: null };
  APIClient.uploadAIVaiLog(aivaiLog).then((res: any) => {
    if (res?.success && res.key) {
      aivaiLog.r2Key = res.key;
    } else {
      downloadJson(`${aivaiLog.matchId}.json`, aivaiLog);
    }
  }).catch(() => {
    downloadJson(`${aivaiLog.matchId}.json`, aivaiLog);
  });
}

window.addEventListener('error', (ev: any) => {
  const msg = String(ev?.message || ev?.error?.message || 'error');
  flushAIVaiLog(`window_error:${msg}`.slice(0, 240));
});

window.addEventListener('unhandledrejection', (ev: any) => {
  const msg = String(ev?.reason?.message || ev?.reason || 'unhandledrejection');
  flushAIVaiLog(`unhandledrejection:${msg}`.slice(0, 240));
});

window.addEventListener('beforeunload', () => {
  flushAIVaiLog('beforeunload');
});

// Load custom maps into dropdown
APIClient.getMaps().then(maps => {
  const mapTypeSelect = document.getElementById('map-type-select') as HTMLSelectElement;
  
  if (mapTypeSelect && maps && maps.length > 0) {
    mapTypeSelect.innerHTML = ''; // Clear "Loading maps..."

    maps.forEach((m: any) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      // Strip 'custom_' prefix if it exists
      const cleanName = m.name.replace(/^custom_/i, '');
      opt.innerText = cleanName;
      mapTypeSelect.appendChild(opt);
    });
  } else if (mapTypeSelect) {
    mapTypeSelect.innerHTML = '<option disabled>No custom maps found</option>';
  }
});

const aiHoverLoaded = new Set<string>();

function preloadImageOnce(src: string): Promise<void> {
  if (!src) return Promise.resolve();
  if (aiHoverLoaded.has(src)) return Promise.resolve();
  aiHoverLoaded.add(src);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

function bindAIDifficultyWormCards() {
  const cards = Array.from(document.querySelectorAll<HTMLButtonElement>('.ai-worm-card'));
  if (cards.length === 0) return;

  const scheduleIdle = (fn: () => void, delayMs: number) => {
    const w = window as any;
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(fn, { timeout: delayMs });
      return;
    }
    window.setTimeout(fn, delayMs);
  };

  scheduleIdle(() => {
    for (const card of cards) {
      const hoverSrc = card.dataset.hoverSrc || '';
      const loaderSrc = card.dataset.loaderSrc || '';
      if (hoverSrc) preloadImageOnce(hoverSrc);
      if (loaderSrc) preloadImageOnce(loaderSrc);
    }
  }, 1400);

  cards.forEach((card) => {
    const imgEl = card.querySelector<HTMLImageElement>('img');
    if (!imgEl) return;

    const baseSrc = card.dataset.src || imgEl.getAttribute('src') || '';
    const hoverSrc = card.dataset.hoverSrc || '';

    card.addEventListener('pointerenter', () => {
      if (!hoverSrc) return;
      preloadImageOnce(hoverSrc).then(() => {
        if (card.matches(':hover')) imgEl.src = hoverSrc;
      });
    });

    card.addEventListener('pointerleave', () => {
      if (!baseSrc) return;
      imgEl.src = baseSrc;
    });

    card.addEventListener('click', () => {
      const d = card.dataset.difficulty as AIDifficulty | undefined;
      if (!d) return;
      currentAIDifficultyForMatch = d;
      setAIDifficulty(d);
      AudioManager.isGameStarted = true;
      startGame('ai');
    });
  });
}

// Weapon Carousel Logic
const weaponSlots = document.querySelectorAll('.weapon-slot');

weaponSlots.forEach((slot, index) => {
  slot.addEventListener('click', () => {
    weaponSlots.forEach(s => s.classList.remove('active'));
    slot.classList.add('active');
    if (window.presenter) {
      window.presenter.handleInput('switch', true, false, index);
    }
  });
});

let userSessionId: string | null = localStorage.getItem('userSessionId');
let deductInterval: number | null = null;
let syncModule: MultiplayerSync | null = null;
let multiplayerController: MultiplayerController | null = null;

const timeBalanceController = new TimeBalanceController({
  displayEl: document.getElementById('play-time-display'),
  profileBalanceEl: document.getElementById('profile-stats-balance'),
  btnAddTimeEl: document.getElementById('btn-add-time'),
  storage: localStorage
});

const authController = new AuthController({
  authScreen,
  profileScreen,
  btnOpenAuth,
  btnUserProfile,
  btnCloseAuth: document.getElementById('btn-close-auth')!,
  btnCloseProfile: document.getElementById('btn-close-profile')!,
  btnLogout: document.getElementById('btn-logout')!,
  btnSaveProfile: document.getElementById('btn-save-profile')!,
  profileUsernameInput: document.getElementById('profile-username') as HTMLInputElement,
  profilePasswordInput: document.getElementById('profile-password') as HTMLInputElement,
  authEmailInput: document.getElementById('auth-email') as HTMLInputElement,
  authUsernameInput: document.getElementById('auth-username') as HTMLInputElement,
  authPasswordInput: document.getElementById('auth-password') as HTMLInputElement,
  authToggleText: document.getElementById('auth-toggle-text')!,
  authTitle: document.getElementById('auth-title')!,
  btnSubmitAuth: document.getElementById('btn-submit-auth') as HTMLButtonElement,
  timeBalance: timeBalanceController,
  storage: localStorage,
  getRef: () => new URLSearchParams(window.location.search).get('ref') || undefined,
  onSessionChanged: (sid) => {
    userSessionId = sid;
  }
});
authController.init();

const paymentController = new PaymentController(() => timeBalanceController.update());
document.getElementById('btn-add-time')?.addEventListener('click', () => paymentController.openPaymentModal());
document.getElementById('btn-close-payment')?.addEventListener('click', () => paymentController.closePaymentModal());

// Contact Author Modal
const contactModal = document.getElementById('contact-modal')!;
const contactMessage = document.getElementById('contact-message') as HTMLTextAreaElement;
new ContactController(
  contactModal,
  contactMessage,
  document.getElementById('btn-contact-author'),
  document.getElementById('btn-close-contact'),
  document.getElementById('btn-send-message') as HTMLButtonElement,
  () => localStorage.getItem('userSessionId')
).init();


// Weapon Selection Logic
const weaponCheckboxes = document.querySelectorAll('.weapon-cb') as NodeListOf<HTMLInputElement>;
weaponCheckboxes.forEach(cb => {
  cb.addEventListener('change', () => {
    const checked = document.querySelectorAll('.weapon-cb:checked');
    if (checked.length > 2) {
      cb.checked = false; // prevent checking more than 2
    }
  });
});

let currentMode: 'training' | 'ai' | 'aivai' | 'friend' | 'random' = 'training';
let aivaiLog: any | null = null;


const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Set up global game objects
const presenter = new GamePresenter(GAME_WIDTH, GAME_HEIGHT);
window.presenter = presenter;

window.botDebugMatrix = () => {
  const state: any = window.presenter?.state;
  const landscape = state?.landscape;
  if (!landscape) return null;
  const terrain = terrainFromLandscape(landscape);
  const seed = state.mapSeed || 1;
  const rng = (() => {
    let s = (seed ^ 0x9e3779b9) >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const surfaceY = (x: number): number | null => {
    const px = Math.floor(x);
    if (px < 0 || px >= landscape.width) return null;
    for (let y = 0; y < landscape.height; y++) {
      if (landscape.getMaterial(px, y) > 0) return y;
    }
    return null;
  };
  const xs: number[] = [];
  for (let tries = 0; tries < 600 && xs.length < 10; tries++) {
    const x = 40 + rng() * (landscape.width - 80);
    const sy = surfaceY(x);
    if (sy === null) continue;
    if (xs.every(v => Math.abs(v - x) > 90)) xs.push(x);
  }
  const shooterTemplate = {
    team: 'team2' as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    health: 100,
    speedMultiplier: 1,
    equipmentIds: ['ninja_rope', 'grenade', 'bazooka'],
    weaponCooldowns: {}
  };
  const res = debugSurfacePathMatrix(terrain, xs, shooterTemplate, 20, 4);
  return { xs: xs.map(v => Math.round(v)), unreachable: res.unreachable.length, unreachablePairs: res.unreachable.slice(0, 20) };
};

window.addEventListener('resize', () => {
  syncControlsForViewport(gameScreen.classList.contains('active'));
});

const renderer = new CanvasRenderer(canvas);
window.renderer = renderer;
window.inputHandler = new InputHandler(window.presenter, canvas, [
  { id: 'btn-left', action: 'left' },
  { id: 'btn-right', action: 'right' },
  { id: 'btn-up', action: 'up' },
  { id: 'btn-down', action: 'down' },
  { id: 'btn-jump', action: 'jump' },
  { id: 'btn-fire', action: 'fire' },
  { id: 'btn-equip', action: 'switch' },
  { id: 'btn-switch', action: 'switchWormCycle' }
]);

// Hook input to canvas for zooming and moving
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  // Pass canvas dimensions and the bounding client rect for zoom target calculation
  const rect = canvas.getBoundingClientRect();
  window.presenter.changeZoom(e.deltaY > 0 ? 1 : -1, canvas.width, canvas.height, e.clientX - rect.left, e.clientY - rect.top);
});

let isDragging = false;
canvas.addEventListener('mousedown', () => isDragging = true);
window.addEventListener('mouseup', () => isDragging = false);
canvas.addEventListener('mousemove', (e) => {
  if (isDragging) {
    window.presenter.moveCamera(e.movementX, e.movementY, canvas.width, canvas.height);
  }
});

// Mobile Controls Setup
const joystickMove = document.getElementById('joystick-move') as HTMLElement;
const moveStick = joystickMove?.querySelector('.joystick-stick') as HTMLElement;

let isDraggingMove = false;
let moveBaseRect: DOMRect | null = null;
let moveTouchId: number | null = null;

if (joystickMove) {
  joystickMove.addEventListener('touchstart', (e) => {
    isDraggingMove = true;
    moveBaseRect = joystickMove.getBoundingClientRect();
    const t = e.changedTouches[0];
    if (t) {
      moveTouchId = t.identifier;
      handleMove(t);
    }
  }, { passive: false });

  joystickMove.addEventListener('touchmove', (e) => {
    if (!isDraggingMove || moveTouchId === null) return;
    const t = Array.from(e.touches).find(tt => tt.identifier === moveTouchId);
    if (t) handleMove(t);
  }, { passive: false });

  const endMove = () => {
    isDraggingMove = false;
    moveTouchId = null;
    moveStick.style.transform = `translate(-50%, -50%)`;
    if (window.presenter) {
      window.presenter.handleAnalogInput(0, 0); // Stop movement and aiming
    }
  };

  joystickMove.addEventListener('touchend', (e) => {
    if (moveTouchId === null) return endMove();
    const ended = Array.from(e.changedTouches).some(t => t.identifier === moveTouchId);
    if (ended) endMove();
  });

  joystickMove.addEventListener('touchcancel', (e) => {
    if (moveTouchId === null) return endMove();
    const ended = Array.from(e.changedTouches).some(t => t.identifier === moveTouchId);
    if (ended) endMove();
  });

  function handleMove(touch: Touch) {
    if (!moveBaseRect || !window.presenter) return;
    const centerX = moveBaseRect.left + moveBaseRect.width / 2;
    const centerY = moveBaseRect.top + moveBaseRect.height / 2;
    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;

    // Visual limit
    const maxDist = moveBaseRect.width / 2 - 25;
    
    // Calculate angle and constrained distance for visual stick
    const angle = Math.atan2(dy, dx);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDist);
    
    const stickX = Math.cos(angle) * dist;
    const stickY = Math.sin(angle) * dist;

    moveStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

    // Normalize input values between -1 and 1
    const normalizedX = stickX / maxDist;
    const normalizedY = stickY / maxDist;

    window.presenter.handleAnalogInput(normalizedX, normalizedY);
  }
}

// (Aiming via screen touch removed to prevent conflicts with camera panning)




let currentMatchToken: string | null = null;
let currentRoomId: string | null = null;
let currentRoomPlayerId: string | null = null;

  function downloadJson(filename: string, data: any) {
    const text = JSON.stringify(data);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Start Game Helpers
  async function startGame(mode: 'training' | 'ai' | 'aivai' | 'friend' | 'random') {
    currentMode = mode;
    setWakeLockWanted(true);
    aivaiLogSent = false;
    setLoaderProgress(0, 'LOADING...');
    setLoaderDifficultyWorm(mode);
    setEnemyDifficultyLabel(mode);

  const mapTypeSelect = document.getElementById('map-type-select') as HTMLSelectElement;
  const mapType = (mapTypeSelect?.value || 'islands') as 'islands' | 'cave' | 'flat';

  menuScreen.classList.remove('active');
  loaderScreen.classList.add('active');

  // Request match token from backend if not training
  if (mode !== 'training' && mode !== 'aivai') {
    const sessionId = localStorage.getItem('sessionId');
    currentRoomPlayerId = sessionId;
    if (sessionId) {
      const res = await APIClient.startMatch(sessionId);
      if (res && res.success) {
        currentMatchToken = res.matchToken;
      }
    }
  }
  setLoaderProgress(0.1, 'PREPARING...');
  
  // Allow UI to paint the loader
  await new Promise(resolve => setTimeout(resolve, 50));

  // Re-instantiate the GamePresenter to completely wipe old state
  if (window.presenter) {
    window.presenter.stop();
  }
  const canvasEl = document.getElementById('gameCanvas') as HTMLCanvasElement;
  window.presenter = new GamePresenter(GAME_WIDTH, GAME_HEIGHT);
  window.renderer = new CanvasRenderer(canvasEl);
  setLoaderProgress(0.2, 'CONNECTING...');
  
  // Re-bind input handler to new presenter
  window.inputHandler = new InputHandler(window.presenter, canvasEl, [
    { id: 'btn-left', action: 'left' },
    { id: 'btn-right', action: 'right' },
    { id: 'btn-up', action: 'up' },
    { id: 'btn-down', action: 'down' },
    { id: 'btn-jump', action: 'jump' },
    { id: 'btn-fire', action: 'fire' },
    { id: 'btn-equip', action: 'switch' },
    { id: 'btn-switch', action: 'switchWormCycle' }
  ]);

  // Re-bind events for the new presenter
  bindPresenterEvents();

  let gameInitPromise: Promise<void> | null = null;

  if (mode === 'friend' || mode === 'random') {
    gameInitPromise = (async () => {
      const dbg = APIClient.isDebugEnabled();
      const t0 = performance.now();
      const settingsPromise = APIClient.getGameSettings();
      const logosPromise = APIClient.getLogos();
      const gameSettings = await settingsPromise;
      const turnTime = gameSettings?.turn_time || (await APIClient.getTurnTime());
      const botConfig = normalizeBotConfig(gameSettings?.bot_settings);
      setLoaderProgress(0.35, 'LOADING GAME...');
      const logos = await logosPromise;
      const airdropPhysics = gameSettings?.airdrop_physics || null;
      setLoaderProgress(0.45, 'LOADING GAME...');
      const maps = await APIClient.getMaps();
      setLoaderProgress(0.6, 'LOADING MAP...');

      let mapData = null;
      if (maps && maps.length > 0) {
        const selectedMapId = mapTypeSelect.value;
        let mapObj = maps.find((m: any) => m.id === selectedMapId);
        if (!mapObj) {
          mapObj = maps[0];
        }
        
        if (mapObj) {
          const fullMap = await APIClient.getMapById(mapObj.id);
          if (fullMap) {
            mapData = APIClient.BASE_URL.replace('/api', '') + fullMap.image_data + '?t=' + Date.now();
          }
        }
      }
      setLoaderProgress(0.75, 'PROCESSING MAP...');
      await window.presenter.startGame({
        width: 1500,
        height: 800,
        mapType: mapType,
        mode: mode,
        turnTime: turnTime,
        logos: logos,
        airdropPhysics: airdropPhysics,
        botConfig: botConfig,
        mapData: mapData
      });
      dbg && console.log('[LOADER] multiplayer init ms', Math.round(performance.now() - t0));
    })();
  } else {
    const dbg = APIClient.isDebugEnabled();
    const t0 = performance.now();
    const gameSettings = await APIClient.getGameSettings();
    const turnTime = gameSettings?.turn_time || (await APIClient.getTurnTime());
    const botConfig = normalizeBotConfig(gameSettings?.bot_settings);
    setLoaderProgress(0.35, 'LOADING GAME...');
    const logos = await APIClient.getLogos();
    const airdropPhysics = gameSettings?.airdrop_physics || null;
    setLoaderProgress(0.45, 'LOADING GAME...');
    const maps = await APIClient.getMaps();
    setLoaderProgress(0.6, 'LOADING MAP...');

    // Use the first uploaded custom map if available
    let mapData = null;
    let chosenMapId: string | null = null;
    let chosenMapName: string | null = null;
    if (maps && maps.length > 0) {
      // If a specific map is selected, try to use it. Otherwise use the first one.
      const urlMap = new URLSearchParams(window.location.search).get('map');
      const selectedMapId = urlMap || mapTypeSelect.value;
      let mapObj = maps.find((m: any) => m.id === selectedMapId);
      if (!mapObj) {
        mapObj = maps[0];
      }
      
      if (mapObj) {
        chosenMapId = mapObj.id;
        chosenMapName = mapObj.name || null;
        const fullMap = await APIClient.getMapById(mapObj.id);
        if (fullMap) {
          mapData = APIClient.BASE_URL.replace('/api', '') + fullMap.image_data + '?t=' + Date.now();
        }
      }
    }

    setLoaderProgress(0.75, 'PROCESSING MAP...');
    const ai1 = new URLSearchParams(window.location.search).get('a1') as any;
    const ai2 = new URLSearchParams(window.location.search).get('a2') as any;
    const a1d: AIDifficulty = ai1 === 'easy' || ai1 === 'medium' || ai1 === 'hard' ? ai1 : 'easy';
    const a2d: AIDifficulty = ai2 === 'easy' || ai2 === 'medium' || ai2 === 'hard' ? ai2 : 'medium';
    if (mode === 'aivai') {
      const createdAt = Date.now();
      aivaiLog = {
        matchId: `aivai_${createdAt}_${a1d}_${a2d}`,
        createdAt,
        url: window.location.href,
        aiV: AI_V,
        a1: a1d,
        a2: a2d,
        mapType,
        map: { id: chosenMapId, name: chosenMapName },
        turnTime,
        botConfig,
        gameSettings,
        events: [],
        truncated: false
      };
      const pushEvent = (e: any) => {
        if (!aivaiLog || aivaiLog.truncated) return;
        if (aivaiLog.events.length >= 12000) {
          aivaiLog.truncated = true;
          return;
        }
        if (!e || typeof e !== 'object') return;
        if (!('type' in e)) e.type = 'event';
        aivaiLog.events.push(e);
      };
      window.presenter.onAIVaiTrace = pushEvent;
      window.presenter.onPhysicsTrace = pushEvent;
      (window as any).__aivaiMatchId = aivaiLog.matchId;
    } else {
      aivaiLog = null;
      window.presenter.onAIVaiTrace = undefined;
      window.presenter.onPhysicsTrace = undefined;
      (window as any).__aivaiMatchId = null;
    }
    await window.presenter.startGame({
      width: 1500,
      height: 800,
      mapType: mapType,
      mode: mode,
      aiDifficulty: mode === 'ai' ? (currentAIDifficultyForMatch || getAIDifficulty()) : undefined,
      aiDifficultyByTeam: mode === 'aivai' ? { team1: a1d, team2: a2d } : undefined,
      turnTime: turnTime,
      logos: logos,
      airdropPhysics: airdropPhysics,
      botConfig: botConfig,
      mapData: mapData
    });
    if (aivaiLog && window.presenter?.state) {
      aivaiLog.mapSeed = window.presenter.state.mapSeed || null;
      aivaiLog.weapons = (window.presenter.state as any).weapons || null;
      aivaiLog.terrainSeed = (window.presenter.state as any).terrainSeed || null;
    }
    dbg && console.log('[LOADER] solo init ms', Math.round(performance.now() - t0));
    if (mode === 'ai') {
      window.presenter.localTeam = 'team1';
      window.presenter.botTurnController = new BotTurnController();
    } else if (mode === 'aivai') {
      window.presenter.localTeam = 'spectator';
      window.presenter.botTurnController = new BotTurnController({ team1: a1d, team2: a2d });
    } else {
      window.presenter.localTeam = 'training';
      window.presenter.botTurnController = null;
    }
    setLoaderProgress(1, 'STARTING...');
  }

  function resizeCanvas() {
    // Canvas internal size remains fixed for proper physics/camera calculations
    canvasEl.width = GAME_WIDTH;
    canvasEl.height = GAME_HEIGHT;
    if (window.presenter) {
      window.presenter.updateScreenSize(GAME_WIDTH, GAME_HEIGHT);
      if (window.presenter.state && window.presenter.state.landscape) {
        window.presenter.state.landscape.needsUpdate = true;
      }
    }
  }

  function showControls() {
    syncControlsForViewport(true);
    let open = false;
    try {
      open = localStorage.getItem('ww_controls_open') === '1';
    } catch {}
    setControlsOpen(open, false);
    autoShowControlsOnce();
  }

  // Handle Multiplayer Mode
  if (mode === 'friend' || mode === 'random') {
    if (!userSessionId) {
      alert('You must be logged in to play multiplayer!');
      loaderScreen.classList.remove('active');
      authScreen.classList.add('active');
      return;
    }
    const loaderText = document.getElementById('loader-text')!;
    const invitePanel = document.getElementById('invite-panel')!;
    const inviteInput = document.getElementById('invite-link') as HTMLInputElement;
    
    loaderText.innerText = 'CONNECTING TO SERVER...';
    setLoaderProgress(0.3, 'CONNECTING TO SERVER...');
    multiplayerController = new MultiplayerController(window.presenter, userSessionId);
    syncModule = multiplayerController.sync;
    
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomId = urlParams.get('room') || undefined;
    const savedHostRoomId = localStorage.getItem('friendHostRoomId') || undefined;
    const isHostResume = !!(joinRoomId && savedHostRoomId && joinRoomId === savedHostRoomId);

    const prevRoomId = localStorage.getItem('ww_last_room_id');
    if (prevRoomId && prevRoomId !== joinRoomId) {
      APIClient.leaveRoom(prevRoomId, userSessionId);
      localStorage.removeItem('ww_last_room_id');
    }

    syncModule.onReady = () => {
      const ready = gameInitPromise || Promise.resolve();
      ready.then(() => {
        setLoaderProgress(1, 'STARTING...');
        document.getElementById('cancel-search-container')!.style.display = 'none';
        invitePanel.style.display = 'none';
        loaderScreen.classList.remove('active');
        gameScreen.classList.add('active');
        resizeCanvas();
        showControls();
        window.presenter.start();
      });
    };

    syncModule.onPeerDisconnected = () => {
      if (window.presenter.isRunning) {
        alert("The enemy has disconnected.");
        window.presenter.handleInput('surrender', true, true);
      }
    };

    syncModule.onMatchmakingExpired = () => {
      multiplayerController?.dispose();
      multiplayerController = null;
      syncModule = null;
      document.getElementById('cancel-search-container')!.style.display = 'none';
      loaderScreen.classList.remove('active');
      menuScreen.classList.add('active');
      alert('No opponent found. Please try again.');
    };

    try {
      const { roomId, isJoining } = await multiplayerController.connect(mode, joinRoomId, isHostResume);
      currentRoomId = roomId;
      localStorage.setItem('ww_last_room_id', roomId);
      if (!isJoining) {
        // We are the host, waiting for someone
        window.presenter.localTeam = 'team1';
        loaderText.innerText = 'WAITING FOR OPPONENT...';
        setLoaderProgress(0.8, 'WAITING FOR OPPONENT...');
        
        if (mode === 'friend') {
          invitePanel.style.display = 'block';
          document.getElementById('cancel-search-container')!.style.display = 'none';
          const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
          inviteInput.value = inviteUrl;
          localStorage.setItem('friendHostRoomId', roomId);
          window.history.replaceState({}, document.title, inviteUrl);
          
          // Make it clear the host shouldn't open this link
          if (!document.getElementById('host-warning-text')) {
            const hostWarning = document.createElement('p');
            hostWarning.id = 'host-warning-text';
            hostWarning.innerText = "Don't open this link yourself! Just send it to your friend.";
            hostWarning.style.color = '#ffeb3b';
            hostWarning.style.fontSize = '12px';
            hostWarning.style.marginTop = '10px';
            invitePanel.appendChild(hostWarning);
          }

          document.getElementById('btn-copy-invite')!.onclick = () => {
            navigator.clipboard.writeText(inviteUrl);
            document.getElementById('btn-copy-invite')!.innerText = 'COPIED!';
          };
        } else {
          invitePanel.style.display = 'none'; // Random mode doesn't show invite
          document.getElementById('cancel-search-container')!.style.display = 'block';
          
          document.getElementById('btn-cancel-search')!.onclick = () => {
            multiplayerController?.dispose();
            multiplayerController = null;
            syncModule = null;
            document.getElementById('cancel-search-container')!.style.display = 'none';
            loaderScreen.classList.remove('active');
            menuScreen.classList.add('active');
          };
        }

        document.getElementById('btn-cancel-invite')!.onclick = () => {
          multiplayerController?.dispose();
          multiplayerController = null;
          syncModule = null;
          invitePanel.style.display = 'none';
          loaderScreen.classList.remove('active');
          menuScreen.classList.add('active');
          localStorage.removeItem('friendHostRoomId');
          window.history.replaceState({}, document.title, window.location.pathname);
        };
      } else {
        window.presenter.localTeam = 'team2';
        window.presenter.isHost = false; // Important for dumb client
        window.presenter.state.mode = 'friend'; // Fix: Ensure client is not in training mode
        window.presenter.maxTurnTime = 30; // Fix: Ensure maxTurnTime is not Infinity
        loaderText.innerText = 'JOINING ROOM...';
        setLoaderProgress(0.8, 'JOINING ROOM...');
        
        document.getElementById('cancel-search-container')!.style.display = 'block';
        document.getElementById('btn-cancel-search')!.onclick = () => {
            multiplayerController?.dispose();
            multiplayerController = null;
            syncModule = null;
            document.getElementById('cancel-search-container')!.style.display = 'none';
            loaderScreen.classList.remove('active');
            menuScreen.classList.add('active');
        };
      }
    } catch (e: any) {
      alert('Failed to connect: ' + e.message);
      loaderScreen.classList.remove('active');
      menuScreen.classList.add('active');

      // Clear the room from URL so we don't get stuck in a loop if the user clicks play again
      if (joinRoomId) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      return;
    }
  } else {
    // Training mode starts immediately
    loaderScreen.classList.remove('active');
    gameScreen.classList.add('active');
    resizeCanvas();
    showControls();
    window.presenter.start();
  }

  // Start time deduction interval ONLY if not training
  if (deductInterval) clearInterval(deductInterval);
  if (currentMode !== 'training' && currentMode !== 'aivai') {
    deductInterval = window.setInterval(() => {
      const premiumStr = localStorage.getItem('premiumUntil');
      if (premiumStr) {
        const premiumUntil = parseInt(premiumStr);
        if (premiumUntil > Date.now()) return; // Don't deduct if premium
      }
      
      let balance = parseInt(localStorage.getItem('playTimeBalance') || '0');
      balance -= 60;
      localStorage.setItem('playTimeBalance', balance.toString());
      timeBalanceController.update();
      
      if (balance <= 0) {
        console.warn('Time limit reached! Grace period active.');
      }
    }, 60000);
  }
}

  // End Game Helpers

document.getElementById('btn-play-training')!.addEventListener('click', () => {
  AudioManager.isGameStarted = true; // Enable sounds
  startGame('training');
});
document.getElementById('btn-play-random')!.addEventListener('click', () => {
  AudioManager.isGameStarted = true; // Enable sounds
  startGame('random');
});
document.getElementById('btn-play-friends')!.addEventListener('click', () => {
  AudioManager.isGameStarted = true; // Enable sounds
  startGame('friend');
});

document.getElementById('btn-return-menu')!.addEventListener('click', () => {
  setWakeLockWanted(false);
  window.location.href = window.location.pathname;
});

document.getElementById('btn-leave-game')?.addEventListener('click', () => {
  document.getElementById('leave-confirm-modal')!.style.display = 'flex';
});

document.getElementById('btn-cancel-leave')?.addEventListener('click', () => {
  document.getElementById('leave-confirm-modal')!.style.display = 'none';
});

document.getElementById('btn-confirm-leave')?.addEventListener('click', () => {
  document.getElementById('leave-confirm-modal')!.style.display = 'none';
  flushAIVaiLog('leave');
  setWakeLockWanted(false);
  if (currentRoomId && currentRoomPlayerId) {
    APIClient.leaveRoom(currentRoomId, currentRoomPlayerId);
    localStorage.removeItem('ww_last_room_id');
    currentRoomId = null;
  }
  window.presenter.handleInput('surrender', true);
});

window.addEventListener('pagehide', () => {
  const roomId = localStorage.getItem('ww_last_room_id');
  const playerId = localStorage.getItem('sessionId');
  if (roomId && playerId) {
    APIClient.leaveRoom(roomId, playerId);
  }
});

// Helper to process sprites for UI (remove background)
const transparentSprites: Record<string, string> = {};
const loadingSprites: Record<string, boolean> = {};
const waitingSpriteCallbacks: Record<string, Array<(newUrl: string) => void>> = {};

function getTransparentSprite(url: string, fw: number, fh: number, callback: (newUrl: string) => void) {
  if (transparentSprites[url]) {
    return callback(transparentSprites[url]);
  }
  if (loadingSprites[url]) {
    if (!waitingSpriteCallbacks[url]) waitingSpriteCallbacks[url] = [];
    waitingSpriteCallbacks[url].push(callback);
    return;
  }
  loadingSprites[url] = true;
  waitingSpriteCallbacks[url] = [callback];

  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = url;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      delete loadingSprites[url];
      return callback(url);
    }
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const bgR = data[0], bgG = data[1], bgB = data[2];
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - bgR) < 10 && Math.abs(data[i+1] - bgG) < 10 && Math.abs(data[i+2] - bgB) < 10) {
        data[i+3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    
    const outW = fw || canvas.width;
    const outH = fh || canvas.height;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = outW;
    cropCanvas.height = outH;
    cropCanvas.getContext('2d')?.drawImage(canvas, 0, 0, outW, outH, 0, 0, outW, outH);
    
    const newUrl = cropCanvas.toDataURL('image/png');
    transparentSprites[url] = newUrl;
    delete loadingSprites[url];
    const cbs = waitingSpriteCallbacks[url] || [];
    delete waitingSpriteCallbacks[url];
    cbs.forEach((cb) => cb(newUrl));
  };
  img.onerror = () => {
    delete loadingSprites[url];
    const cbs = waitingSpriteCallbacks[url] || [];
    delete waitingSpriteCallbacks[url];
    cbs.forEach((cb) => cb(url));
  };
}
// Export to window for presenters to use
(window as any).getTransparentSprite = getTransparentSprite;

// Update HUD elements
const hpLocalEl = document.getElementById('hp-local')!;
const hpEnemyEl = document.getElementById('hp-enemy')!;

let lastWormUIStateStr = '';

function updateWormSelectionUI(state: any) {
  const panel = document.getElementById('worm-selection-panel');
  if (!panel) return;

  const currentPlayer = state.getCurrentPlayer();
  const currentTeam = currentPlayer ? currentPlayer.team : 'team1';
  const hud = getHudSides(currentMode, state);
  const equipBtn = document.getElementById('btn-equip') as HTMLButtonElement | null;

  // Show only if it's local team's turn (or player 1 in local multiplayer)
  const isMyTurn = window.presenter.localTeam === 'training' || window.presenter.localTeam === currentTeam;

  if (!isMyTurn) {
    if (lastWormUIStateStr !== 'none') {
      panel.style.display = 'none';
      lastWormUIStateStr = 'none';
    }
    if (equipBtn) equipBtn.innerText = 'ITEM';
    return;
  }

  // Find all worms of the current team
  const teamWorms = state.players
    .map((p: any, index: number) => ({ p, index }))
    .filter((item: any) => item.p.team === currentTeam);

  const currentStateStr = teamWorms
    .map((item: any) => `${item.index}:${item.p.health}:${state.currentPlayerIndex}:${item.p.currentEquipmentIndex}:${item.p.facingRight ? 1 : 0}`)
    .join(',');
  const ammoStr = (() => {
    const g1 = state.teamAmmo?.team1?.grenade;
    const g2 = state.teamAmmo?.team2?.grenade;
    const s1 = typeof g1 === 'number' && Number.isFinite(g1) ? Math.max(0, Math.floor(g1)).toString() : 'inf';
    const s2 = typeof g2 === 'number' && Number.isFinite(g2) ? Math.max(0, Math.floor(g2)).toString() : 'inf';
    return `${s1}:${s2}`;
  })();
  const stateKey = `${currentStateStr}|ammo:${ammoStr}`;
  if (lastWormUIStateStr === stateKey) {
    return; // No need to re-render DOM if nothing changed
  }
  lastWormUIStateStr = stateKey;

  panel.style.display = 'flex';
  panel.classList.toggle('team-left', currentTeam === hud.leftTeam);
  panel.classList.toggle('team-right', currentTeam === hud.rightTeam);
  panel.innerHTML = ''; // Clear existing buttons

  if (equipBtn && currentPlayer) {
    const equipmentIds = currentPlayer.equipmentIds || [];
    const eqLen = Array.isArray(equipmentIds) ? equipmentIds.length : 0;
    const equipmentId = currentPlayer.getCurrentEquipmentId?.() || 'bazooka';
    const def = getEquipmentDefinition(equipmentId);
    const idx = Number.isFinite(currentPlayer.currentEquipmentIndex) ? Math.max(0, Math.min(eqLen - 1, currentPlayer.currentEquipmentIndex)) : 0;
    let label = def?.name ? def.name : 'ITEM';
    if (equipmentId === 'grenade') {
      const gren = state.teamAmmo?.[currentPlayer.team]?.grenade;
      if (typeof gren === 'number' && Number.isFinite(gren)) label = `${label} x${Math.max(0, Math.floor(gren))}`;
    }
    if (eqLen > 0) label = `ITEM: ${label} (${idx + 1}/${eqLen})`;
    else label = `ITEM: ${label}`;
    equipBtn.innerText = label;
  }
  
  teamWorms.forEach((item: any, i: number) => {
    const btn = document.createElement('button');
    btn.className = `worm-btn ${item.index === state.currentPlayerIndex ? 'active' : ''} ${item.p.health <= 0 ? 'dead' : ''}`;
    btn.dataset.index = item.index.toString();
    
    const hpStr = Math.ceil(Math.max(0, item.p.health)).toString();
    const thumb = (window.renderer as any)?.getWormThumbnail?.(item.p, 160) || '/sprites/Worms/wbrth1.png';
    const equipmentId = item.p.getCurrentEquipmentId?.() || 'bazooka';
    const def = getEquipmentDefinition(equipmentId);
    const iconUrl = def?.icon ? (def.icon.endsWith('.1.png') ? def.icon.replace('.1.png', '.2.png') : def.icon) : '';
    const thumbEl = document.createElement('img');
    thumbEl.src = thumb;
    thumbEl.alt = `W${i + 1}`;
    (thumbEl.style as any).background = 'transparent';
    btn.appendChild(thumbEl);

    if (iconUrl) {
      const iconEl = document.createElement('img');
      iconEl.className = 'equip-icon';
      iconEl.src = iconUrl;
      iconEl.alt = '';
      btn.appendChild(iconEl);
      getTransparentSprite(iconUrl, 0, 0, (newUrl) => {
        iconEl.src = newUrl;
      });
    }

    if (def?.name) {
      const nameEl = document.createElement('div');
      nameEl.className = 'equip-name';
      nameEl.innerText = def.name;
      btn.appendChild(nameEl);
    }

    if (equipmentId === 'grenade') {
      const gren = state.teamAmmo?.[item.p.team]?.grenade;
      if (typeof gren === 'number' && Number.isFinite(gren)) {
        const ammoEl = document.createElement('div');
        ammoEl.className = 'equip-ammo';
        ammoEl.innerText = `x${Math.max(0, Math.floor(gren))}`;
        btn.appendChild(ammoEl);
        const nameEl = btn.querySelector('.equip-name') as HTMLElement | null;
        if (nameEl) nameEl.style.bottom = '16px';
      }
    }

    const hpEl = document.createElement('span');
    hpEl.className = 'hp';
    hpEl.innerText = hpStr;
    btn.appendChild(hpEl);

  // Use both touchstart and click to ensure it works on mobile
  const handleSwitch = (e: Event) => {
    e.preventDefault();
    const allowAfterFire = window.presenter?.state?.mode === 'training';
    if (item.p.health > 0 && (!window.presenter.hasFiredThisTurn || allowAfterFire)) {
      window.presenter.handleInput('switchWorm', true, false, item.index);
      updateWormSelectionUI(window.presenter.state); // Force re-render immediately
    }
  };
  
  btn.addEventListener('touchstart', handleSwitch, { passive: false });
  btn.addEventListener('click', handleSwitch);

  panel.appendChild(btn);
  });
}

function bindPresenterEvents() {
  const turnTimer = document.getElementById('turn-timer')!;
  const turnTimerValue = document.getElementById('turn-timer-value') as HTMLElement | null;
  const matchTimer = document.getElementById('match-timer') as HTMLElement | null;
  const windIndicator = document.getElementById('wind-indicator') as HTMLElement | null;
  const windKnob = document.getElementById('wind-knob') as HTMLElement | null;
  const turnNotification = document.getElementById('turn-notification')!;
  const localTurnLabel = document.getElementById('turn-label-local');
  const enemyTurnLabel = document.getElementById('turn-label-enemy');
  const localTeamStatus = document.querySelector('.team-status.left-team') as HTMLElement | null;
  const enemyTeamStatus = document.querySelector('.team-status.right-team') as HTMLElement | null;
  const rewardText = document.getElementById('game-over-reward') || document.getElementById('game-over-stats')!;
  const statsText = document.getElementById('game-over-stats')!;
  const ensureAivaiMatchBox = (): { box: HTMLElement; line: HTMLElement; btnCopy: HTMLButtonElement; btnStats: HTMLButtonElement } => {
    let box = document.getElementById('aivai-match-box') as HTMLElement | null;
    let line = document.getElementById('aivai-match-line') as HTMLElement | null;
    let btnCopy = document.getElementById('btn-copy-aivai-match') as HTMLButtonElement | null;
    let btnStats = document.getElementById('btn-open-aivai-stats') as HTMLButtonElement | null;

    if (!box) {
      box = document.createElement('div');
      box.id = 'aivai-match-box';
      box.style.marginTop = '12px';
      box.style.display = 'none';

      line = document.createElement('div');
      line.id = 'aivai-match-line';
      line.className = 'stats-text';
      box.appendChild(line);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '10px';
      actions.style.marginTop = '10px';

      btnCopy = document.createElement('button');
      btnCopy.id = 'btn-copy-aivai-match';
      btnCopy.className = 'secondary-btn w-full';
      btnCopy.textContent = 'COPY MATCH ID';

      btnStats = document.createElement('button');
      btnStats.id = 'btn-open-aivai-stats';
      btnStats.className = 'primary-btn w-full';
      btnStats.textContent = 'OPEN STATS';

      actions.appendChild(btnCopy);
      actions.appendChild(btnStats);
      box.appendChild(actions);

      const modal = gameOverScreen.querySelector('.modal-box') as HTMLElement | null;
      const actionsRoot = modal?.querySelector('.game-over-actions') as HTMLElement | null;
      if (actionsRoot && modal) {
        modal.insertBefore(box, actionsRoot);
      } else {
        statsText.insertAdjacentElement('afterend', box);
      }
    }

    line = (line || document.getElementById('aivai-match-line')) as HTMLElement;
    btnCopy = (btnCopy || document.getElementById('btn-copy-aivai-match')) as HTMLButtonElement;
    btnStats = (btnStats || document.getElementById('btn-open-aivai-stats')) as HTMLButtonElement;
    return { box, line, btnCopy, btnStats };
  };

  let lastTurnPlayerIndex = -1;
  let lastTurnActiveTeam: string | null = null;

  window.presenter.onStateUpdate = (state: any) => {
    // Sync state to client if host
    if (window.presenter.isHost && syncModule && currentMode !== 'training') {
      syncModule.sendStateSync(state);
    }

    const hud = getHudSides(currentMode, state);

    const teamHpPct = (team: 'team1' | 'team2') => {
      const worms = Array.isArray(state.players) ? state.players.filter((p: any) => p.team === team) : [];
      const hpSum = worms.reduce((sum: number, w: any) => sum + Math.max(0, Number(w.health) || 0), 0);
      const maxSum = worms.reduce((sum: number, w: any) => sum + Math.max(0, Number(w.maxHealth) || 100), 0);
      const denom = maxSum > 0 ? maxSum : 100;
      return Math.min(100, Math.max(0, (hpSum / denom) * 100));
    };

    hpLocalEl.style.width = `${teamHpPct(hud.leftTeam)}%`;
    hpEnemyEl.style.width = `${teamHpPct(hud.rightTeam)}%`;

    const gLeft = state.teamAmmo?.[hud.leftTeam]?.grenade;
    const gRight = state.teamAmmo?.[hud.rightTeam]?.grenade;
    const gLeftOk = typeof gLeft === 'number' && Number.isFinite(gLeft);
    const gRightOk = typeof gRight === 'number' && Number.isFinite(gRight);
    if (teamGrenadesLeftWrapEl && teamGrenadesLeftEl) {
      if (gLeftOk) {
        teamGrenadesLeftWrapEl.style.display = '';
        teamGrenadesLeftEl.innerText = `${Math.max(0, Math.floor(gLeft))}`;
      } else {
        teamGrenadesLeftWrapEl.style.display = 'none';
      }
    }
    if (teamGrenadesRightWrapEl && teamGrenadesRightEl) {
      if (gRightOk) {
        teamGrenadesRightWrapEl.style.display = '';
        teamGrenadesRightEl.innerText = `${Math.max(0, Math.floor(gRight))}`;
      } else {
        teamGrenadesRightWrapEl.style.display = 'none';
      }
    }

    if (teamNameLeftEl) teamNameLeftEl.textContent = hud.leftName;
    if (teamNameRightTextEl) teamNameRightTextEl.textContent = hud.rightName;

    // Update Turn Timer & Wind
    if (turnTimer && turnTimerValue) {
      let timeStr = '';
      if (state.turnTimeLeft === Infinity) {
        timeStr = '∞';
        turnTimer.style.fontSize = '18px';
      } else {
        timeStr = Math.ceil(state.turnTimeLeft).toString();
        turnTimer.style.fontSize = '18px';
      }
      
      turnTimerValue.innerText = timeStr;
      
      // Visual ticking at 5 seconds
      if (state.turnTimeLeft <= 5 && state.turnTimeLeft !== Infinity && state.turnTimeLeft > 0 && state.projectiles.length === 0) {
        turnTimer.classList.add('ticking');
      } else {
        turnTimer.classList.remove('ticking');
      }
    }

    if (matchTimer) {
      const t = Number(state.matchDuration);
      matchTimer.innerText = Number.isFinite(t) ? Math.floor(t).toString() : '0';
    }

    if (windIndicator) {
      const w = Number(state.wind) || 0;
      if (w === 0) {
        windIndicator.style.display = 'none';
      } else {
        windIndicator.style.display = 'block';
        if (windKnob) {
          const clamped = Math.max(-100, Math.min(100, w));
          const px = (clamped / 100) * 40;
          windKnob.parentElement?.style.setProperty('--wind-shift', `${px}px`);
        }
      }
    }

    // Turn Change Notification
    const activeTeam = state.currentPlayerIndex !== undefined && state.players[state.currentPlayerIndex] 
      ? state.players[state.currentPlayerIndex].team 
      : 'team1';
    const localTeam = window.presenter.localTeam;
    let isMyTurn = false;
    if (currentMode === 'training') isMyTurn = true;
    else if (localTeam === 'team1' || localTeam === 'team2') isMyTurn = activeTeam === localTeam;

    const leftActive = activeTeam === hud.leftTeam;
    const rightActive = activeTeam === hud.rightTeam;

    // Update Worm Selection UI
    updateWormSelectionUI(state);

    if (lastTurnActiveTeam !== activeTeam) {
      lastTurnActiveTeam = activeTeam;
      if (currentMode === 'aivai') {
        if (localTurnLabel) localTurnLabel.textContent = leftActive ? 'TURN' : 'WAITING';
        if (enemyTurnLabel) enemyTurnLabel.textContent = rightActive ? 'TURN' : 'WAITING';
        if (localTeamStatus) localTeamStatus.classList.toggle('turn-active', leftActive);
        if (enemyTeamStatus) enemyTeamStatus.classList.toggle('turn-active', rightActive);
      } else {
        if (localTurnLabel) localTurnLabel.textContent = isMyTurn ? 'YOUR TURN' : 'WAITING';
        if (enemyTurnLabel) enemyTurnLabel.textContent = isMyTurn ? 'WAITING' : 'ENEMY TURN';
        if (localTeamStatus) localTeamStatus.classList.toggle('turn-active', !!isMyTurn);
        if (enemyTeamStatus) enemyTeamStatus.classList.toggle('turn-active', !isMyTurn && localTeam !== 'training');
      }
    }

    if (lastTurnPlayerIndex !== state.currentPlayerIndex) {
      lastTurnPlayerIndex = state.currentPlayerIndex;
      turnNotification.style.display = 'block';
      turnNotification.innerText = isMyTurn ? 'YOUR TURN!' : 'ENEMY TURN!';
      turnNotification.style.color = isMyTurn ? 'var(--color-primary)' : 'var(--color-danger)';

      setTimeout(() => {
        turnNotification.style.display = 'none';
      }, 650);
    }
  };

  window.presenter.onGameOver = (winner: any, stats: any) => {
    setWakeLockWanted(false);
    gameScreen.classList.remove('active');
    gameScreen.style.display = 'none'; // Fallback

    mobileControls.style.display = 'none';
    syncControlsForViewport(false);

    gameOverScreen.style.display = '';
    gameOverScreen.classList.add('active');

    if (deductInterval) clearInterval(deductInterval);

    if (winner === 'draw') {
      winnerText.innerText = 'DRAW!';
      winnerText.style.color = 'var(--color-secondary)';
    } else {
      const isLocalWinner = (winner === 'team1');
      winnerText.innerText = isLocalWinner ? 'VICTORY!' : 'DEFEAT!';
      winnerText.style.color = isLocalWinner ? 'var(--color-primary)' : 'var(--color-danger)';

      if (isLocalWinner && currentMode !== 'training') {
        let reward = currentMode === 'friend' ? 5 : 10;
        let timeRewardStr = '10 minutes';
        
        if (stats?.isTechnical) {
          // Calculate minutes and seconds
          const totalSecs = Math.max(0, Math.floor(stats.matchDuration || 0));
          const m = Math.floor(totalSecs / 60);
          const s = totalSecs % 60;
          timeRewardStr = `${m}m ${s}s (Technical Win)`;
          rewardText.innerText = `Enemy surrendered! You earned back ${timeRewardStr} of play time!`;
        } else {
          rewardText.innerText = `You earned ${reward} WebCoins and ${timeRewardStr} of play time!`;
        }
        
        // Report match end to server to get playtime reward
        const sessionId = localStorage.getItem('sessionId');
        const userId = localStorage.getItem('userId');
        if (sessionId && userId && currentMatchToken) {
          APIClient.reportMatchEnd(sessionId, userId, currentMatchToken, stats?.isTechnical).then(res => {
            if (res.success) {
              console.log('Reward granted successfully!');
            } else {
              console.log('Reward error:', res.error);
            }
          });
        }
      } else {
        rewardText.innerText = '';
      }
    }

    if (stats) {
      statsText.innerHTML = `
        <p>Damage Dealt: ${Math.round(stats.damageDealt || stats.p1Dmg || 0)}</p>
        <p>Match Time: ${Math.round(stats.matchDuration || stats.matchTime || 0)}s</p>
      `;
    }

    const { box, line, btnCopy, btnStats } = ensureAivaiMatchBox();
    if (currentMode === 'aivai') {
      const matchId = (aivaiLog?.matchId || (window as any).__aivaiMatchId || '').toString();
      if (matchId) {
        box.style.display = '';
        (box as any).dataset.matchId = matchId;
        line.textContent = `AIVAI Match ID: ${matchId}`;
        btnCopy.onclick = async () => {
          const id = ((box as any).dataset.matchId || matchId).toString();
          try {
            if (navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(id);
              return;
            }
          } catch {}
          const input = document.createElement('input');
          input.value = id;
          document.body.appendChild(input);
          input.select();
          try { document.execCommand('copy'); } catch {}
          document.body.removeChild(input);
        };
        btnStats.onclick = () => {
          const id = ((box as any).dataset.matchId || matchId).toString();
          const url = `/api/aivai/log/stats?matchId=${encodeURIComponent(id)}`;
          window.open(url, '_blank');
        };
      } else {
        box.style.display = 'none';
      }
    } else {
      box.style.display = 'none';
    }

    if (currentMode === 'aivai' && aivaiLog) {
      aivaiLog.finishedAt = Date.now();
      aivaiLog.result = { winner, stats };
      if (!aivaiLogSent) {
        aivaiLogSent = true;
        APIClient.uploadAIVaiLog(aivaiLog).then((res: any) => {
          if (res?.success && res.key) {
            aivaiLog.r2Key = res.key;
          } else {
            downloadJson(`${aivaiLog.matchId}.json`, aivaiLog);
          }
        }).catch(() => {
          downloadJson(`${aivaiLog.matchId}.json`, aivaiLog);
        });
      }
    }
  };
}

bindPresenterEvents();
bindAIDifficultyWormCards();

// Auto-join logic if room URL param exists
const initUrlParams = new URLSearchParams(window.location.search);
if (initUrlParams.get('room')) {
  const savedSession = localStorage.getItem('userSessionId');
  if (savedSession) {
    setTimeout(() => {
      const btnPlayFriends = document.getElementById('btn-play-friends');
      if (btnPlayFriends) btnPlayFriends.click();
    }, 500);
  } else {
    setTimeout(() => {
      alert("You have been invited to a game! Please login to join.");
      document.getElementById('btn-open-auth')!.click();
    }, 500);
  }
}

if (initUrlParams.get('mode') === 'aivai') {
  setTimeout(() => {
    AudioManager.isGameStarted = true;
    startGame('aivai');
  }, 200);
}

// Override render method to connect View layer
(GamePresenter.prototype as any).render = function (this: any) {
  if (window.renderer) {
    window.renderer.render(this.state);
  }
};

// Initialize and bind
window.inputHandler.bind();

// Initial draw for background before start
window.renderer.render(window.presenter.state);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.presenter.stop();
    window.inputHandler.unbind();
  });
}
}
