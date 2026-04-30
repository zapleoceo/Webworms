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
  const buildVersion = '20260430_0526';
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
const profileScreen = document.getElementById('profile-screen')!;
const btnOpenAuth = document.getElementById('btn-open-auth')!;
const btnUserProfile = document.getElementById('btn-user-profile') as HTMLButtonElement;

const loaderTextEl = document.getElementById('loader-text') as HTMLElement | null;
const loaderProgressBarEl = document.getElementById('loader-progress-bar') as HTMLElement | null;
const loaderProgressTextEl = document.getElementById('loader-progress-text') as HTMLElement | null;
const loaderWormImageEl = document.getElementById('loader-worm-image') as HTMLImageElement | null;
const enemyDifficultyEl = document.getElementById('enemy-difficulty') as HTMLElement | null;

let currentAIDifficultyForMatch: AIDifficulty | null = null;

function getDifficultyLabel(d: AIDifficulty): string {
  return d.toUpperCase();
}

function setEnemyDifficultyLabel(mode: 'training' | 'ai' | 'friend' | 'random') {
  if (!enemyDifficultyEl) return;
  if (mode !== 'ai') {
    enemyDifficultyEl.innerText = '';
    return;
  }
  const d = currentAIDifficultyForMatch || getAIDifficulty();
  enemyDifficultyEl.innerText = getDifficultyLabel(d);
}

function setLoaderDifficultyWorm(mode: 'training' | 'ai' | 'friend' | 'random') {
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

let currentMode: 'training' | 'ai' | 'friend' | 'random' = 'training';


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
    height: 10,
    health: 100,
    speedMultiplier: 1,
    equipmentIds: ['rope', 'grenade', 'bazooka'],
    weaponCooldowns: {}
  };
  const res = debugSurfacePathMatrix(terrain, xs, shooterTemplate, 20, 4);
  return { xs: xs.map(v => Math.round(v)), unreachable: res.unreachable.length, unreachablePairs: res.unreachable.slice(0, 20) };
};

window.addEventListener('resize', () => {
  // We no longer change internal canvas resolution. CSS object-fit handles responsive scaling.
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

const touchActions = [
  { id: 'btn-jump', action: 'jump' },
  { id: 'btn-fire', action: 'fire' },
  { id: 'btn-equip', action: 'switch' },
  { id: 'btn-switch', action: 'switchWormCycle' }
];

touchActions.forEach(({ id, action }) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (window.presenter) window.presenter.handleInput(action, true);
  }, { passive: false });
  
  el.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (window.presenter) window.presenter.handleInput(action, false);
  }, { passive: false });
});

// (Aiming via screen touch removed to prevent conflicts with camera panning)




let currentMatchToken: string | null = null;

  // Start Game Helpers
  async function startGame(mode: 'training' | 'ai' | 'friend' | 'random') {
    currentMode = mode;
    setLoaderProgress(0, 'LOADING...');
    setLoaderDifficultyWorm(mode);
    setEnemyDifficultyLabel(mode);

  const mapTypeSelect = document.getElementById('map-type-select') as HTMLSelectElement;
  const mapType = (mapTypeSelect?.value || 'islands') as 'islands' | 'cave' | 'flat';

  menuScreen.classList.remove('active');
  loaderScreen.classList.add('active');

  // Request match token from backend if not training
  if (mode !== 'training') {
    const sessionId = localStorage.getItem('sessionId');
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
      const settingsPromise = APIClient.getGameSettings();
      const logosPromise = APIClient.getLogos();
      const gameSettings = await settingsPromise;
      const turnTime = gameSettings?.turn_time || (await APIClient.getTurnTime());
      const botConfig = normalizeBotConfig(gameSettings?.bot_settings);
      setLoaderProgress(0.35, 'LOADING GAME...');
      const logos = await logosPromise;
      const airdropPhysics = gameSettings?.airdrop_physics || null;
      setLoaderProgress(0.45, 'LOADING GAME...');
      await window.presenter.startGame({
        width: 1500,
        height: 800,
        mapType: mapType,
        mode: mode,
        turnTime: turnTime,
        logos: logos,
        airdropPhysics: airdropPhysics,
        botConfig: botConfig,
        mapData: null
      });
      window.presenter.localTeam = 'team1';
    })();
  } else {
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
    if (maps && maps.length > 0) {
      // If a specific map is selected, try to use it. Otherwise use the first one.
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

    await window.presenter.startGame({
      width: 1500,
      height: 800,
      mapType: mapType,
      mode: mode,
      aiDifficulty: mode === 'ai' ? (currentAIDifficultyForMatch || getAIDifficulty()) : undefined,
      turnTime: turnTime,
      logos: logos,
      airdropPhysics: airdropPhysics,
      botConfig: botConfig,
      mapData: mapData
    });
    if (mode === 'ai') {
      window.presenter.localTeam = 'team1';
      window.presenter.botTurnController = new BotTurnController();
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
    const controlsHelp = document.getElementById('controls-help') as HTMLElement;
    if (window.innerWidth <= 768) {
      mobileControls.style.display = 'flex';
      if (controlsHelp) controlsHelp.style.display = 'none';
    } else {
      mobileControls.style.display = 'none';
      if (controlsHelp) controlsHelp.style.display = 'block';
    }
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
  if (currentMode !== 'training') {
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
  window.presenter.handleInput('surrender', true);
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

  // Show only if it's local team's turn (or player 1 in local multiplayer)
  const isMyTurn = window.presenter.localTeam === 'training' || window.presenter.localTeam === currentTeam;

  if (!isMyTurn) {
    if (lastWormUIStateStr !== 'none') {
      panel.style.display = 'none';
      lastWormUIStateStr = 'none';
    }
    return;
  }

  // Find all worms of the current team
  const teamWorms = state.players
    .map((p: any, index: number) => ({ p, index }))
    .filter((item: any) => item.p.team === currentTeam);

  const currentStateStr = teamWorms
    .map((item: any) => `${item.index}:${item.p.health}:${state.currentPlayerIndex}:${item.p.currentEquipmentIndex}:${item.p.facingRight ? 1 : 0}`)
    .join(',');
  if (lastWormUIStateStr === currentStateStr) {
    return; // No need to re-render DOM if nothing changed
  }
  lastWormUIStateStr = currentStateStr;

  panel.style.display = 'flex';
  panel.innerHTML = ''; // Clear existing buttons
  
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
  const turnNotification = document.getElementById('turn-notification')!;
  const rewardText = document.getElementById('game-over-reward') || document.getElementById('game-over-stats')!;
  const statsText = document.getElementById('game-over-stats')!;

  let lastTurnPlayerIndex = -1;

  window.presenter.onStateUpdate = (state: any) => {
    // Sync state to client if host
    if (window.presenter.isHost && syncModule && currentMode !== 'training') {
      syncModule.sendStateSync(state);
    }

    // Update local HP (team1)
    const localWorms = state.players.length > 0 ? [state.players[0]] : [];
    const localHp = localWorms.reduce((sum: number, w: any) => sum + w.health, 0);
    hpLocalEl.style.width = `${Math.min(100, Math.max(0, (localHp / 100) * 100))}%`;

    // Update enemy HP (team2)
    const enemyWorms = state.players.length > 1 ? [state.players[1]] : [];
    const enemyHp = enemyWorms.reduce((sum: number, w: any) => sum + w.health, 0);
    hpEnemyEl.style.width = `${Math.min(100, Math.max(0, (enemyHp / 100) * 100))}%`;

    // Update Turn Timer & Wind
    if (turnTimer) {
      let timeStr = '';
      if (state.turnTimeLeft === Infinity) {
        timeStr = '∞';
        turnTimer.style.fontSize = '18px';
      } else {
        timeStr = Math.ceil(state.turnTimeLeft).toString();
        turnTimer.style.fontSize = '18px';
      }
      
      turnTimer.innerText = timeStr;
      
      // Visual ticking at 5 seconds
      if (state.turnTimeLeft <= 5 && state.turnTimeLeft !== Infinity && state.turnTimeLeft > 0 && state.projectiles.length === 0) {
        turnTimer.classList.add('ticking');
      } else {
        turnTimer.classList.remove('ticking');
      }
    }

    // Turn Change Notification
    const activeTeam = state.currentPlayerIndex !== undefined && state.players[state.currentPlayerIndex] 
      ? state.players[state.currentPlayerIndex].team 
      : 'team1';
    const isMyTurn = window.presenter.localTeam === 'training' || activeTeam === window.presenter.localTeam;

    // Update Worm Selection UI
    updateWormSelectionUI(state);

    if (lastTurnPlayerIndex !== state.currentPlayerIndex) {
      lastTurnPlayerIndex = state.currentPlayerIndex;
      turnNotification.style.display = 'block';
      turnNotification.innerText = isMyTurn ? 'YOUR TURN!' : 'ENEMY TURN!';
      turnNotification.style.color = isMyTurn ? 'var(--color-primary)' : 'var(--color-danger)';

      // Auto-hide after 2s
      setTimeout(() => {
        turnNotification.style.display = 'none';
      }, 2000);
    }
  };

  window.presenter.onGameOver = (winner: any, stats: any) => {
    gameScreen.classList.remove('active');
    gameScreen.style.display = 'none'; // Fallback

    mobileControls.style.display = 'none';
    const controlsHelp = document.getElementById('controls-help') as HTMLElement;
    if (controlsHelp) controlsHelp.style.display = 'none';

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
