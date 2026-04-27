import './style.css';
import { AdminPanel } from './admin/AdminPanel';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';
import { APIClient } from './network/APIClient';
import { MultiplayerSync } from './network/MultiplayerSync';
import { AudioManager } from './utils/AudioManager';

declare global {
  interface Window {
    presenter: GamePresenter;
    renderer: CanvasRenderer;
    inputHandler: InputHandler;
  }
}

if (window.location.pathname === '/admin') {
  new AdminPanel();
} else {

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
const timeBalanceEl = document.getElementById('profile-stats-balance')!;

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
let userSessionName: string | null = localStorage.getItem('userSessionName');
let userBalanceSeconds = parseInt(localStorage.getItem('userBalanceSeconds') || '3600');
let deductInterval: number | null = null;
let syncModule: MultiplayerSync | null = null;

function updateTimeBalanceDisplay() {
  const display = document.getElementById('play-time-display');
  if (!display) return;
  
  const balanceStr = localStorage.getItem('playTimeBalance');
  const premiumStr = localStorage.getItem('premiumUntil');
  
  if (premiumStr) {
    const premiumUntil = parseInt(premiumStr);
    if (premiumUntil > Date.now()) {
      display.innerText = 'Time: ∞ (Premium)';
      display.style.color = '#ffeb3b';
      return;
    }
  }

  if (balanceStr) {
    const seconds = parseInt(balanceStr);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    display.innerText = `Time: ${m}:${s.toString().padStart(2, '0')}`;
    display.style.color = 'white';
  }
}

// Add PayPal Button Rendering
function renderPayPalButton() {
  const container = document.getElementById('paypal-subscription-container');
  const buttonContainer = document.getElementById('paypal-container-Y6VMR7NQXRJRA');
  
  if (!container || !buttonContainer) return;
  
  const premiumStr = localStorage.getItem('premiumUntil');
  if (premiumStr) {
    const premiumUntil = parseInt(premiumStr);
    if (premiumUntil > Date.now()) {
      // Already premium, hide the button
      container.style.display = 'none';
      return;
    }
  }

  // Check if we are logged in
  if (!localStorage.getItem('sessionId')) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  // Render PayPal button only if it hasn't been rendered yet
  if (buttonContainer.innerHTML === '') {
    try {
      // @ts-ignore
      paypal.HostedButtons({
        hostedButtonId: "Y6VMR7NQXRJRA",
      }).render("#paypal-container-Y6VMR7NQXRJRA");
    } catch(e) {
      // Fallback if hosted buttons fail - use Smart Buttons
      buttonContainer.innerHTML = '';
      // @ts-ignore
      paypal.Buttons({
        createOrder: function(_data: any, actions: any) {
          return actions.order.create({
            purchase_units: [{
              amount: { value: '1.00', currency_code: 'USD' },
              description: '7 Days Unlimited Play Time'
            }]
          });
        },
        onApprove: function(data: any, actions: any) {
          return actions.order.capture().then(function(_details: any) {
            // Verify with our backend
            const sessionId = localStorage.getItem('sessionId');
            fetch(APIClient.BASE_URL + '/payment/paypal/capture', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
              },
              body: JSON.stringify({ orderID: data.orderID })
            }).then(res => res.json()).then((res: any) => {
              if (res.success) {
                alert('Payment successful! You now have 7 days of unlimited play time.');
                localStorage.setItem('premiumUntil', res.premium_until.toString());
                updateTimeBalanceDisplay();
                container.style.display = 'none';
              } else {
                alert('Verification failed: ' + res.error);
              }
            });
          });
        }
      }).render('#paypal-container-Y6VMR7NQXRJRA');
    }
  }
}

const sessionId = localStorage.getItem('sessionId');
if (sessionId) {
  // @ts-ignore
  APIClient.getSession(sessionId).then((res: any) => {
    if (res.success && res.user) {
      localStorage.setItem('playTimeBalance', res.user.play_time_balance.toString());
      localStorage.setItem('premiumUntil', res.user.premium_until?.toString() || '0');
      // @ts-ignore
      if (typeof updateTimeBalanceDisplay === 'function') updateTimeBalanceDisplay();
      // @ts-ignore
      if (typeof renderPayPalButton === 'function') renderPayPalButton();
      // @ts-ignore
      if (typeof updateAuthUI === 'function') updateAuthUI();
    }
  });
}

// Auto-login check
if (userSessionId && userSessionName) {
  btnOpenAuth.style.display = 'none';
  btnUserProfile.style.display = 'block';
  btnUserProfile.innerText = userSessionName;
  
  const hrs = Math.floor(Math.max(0, userBalanceSeconds) / 3600);
  const mins = Math.floor((Math.max(0, userBalanceSeconds) % 3600) / 60);
  timeBalanceEl.innerText = `Time Left: ${hrs}h ${mins}m`;
}

// Close modals manually if needed (already handled by ID-based listeners, but let's be safe)
const btnCloseAuth = document.getElementById('btn-close-auth')!;
btnCloseAuth.addEventListener('click', () => {
  authScreen.classList.remove('active');
  authScreen.style.display = 'none'; // Fallback
});

const btnCloseProfile = document.getElementById('btn-close-profile')!;
btnCloseProfile.addEventListener('click', () => {
  profileScreen.classList.remove('active');
  profileScreen.style.display = 'none'; // Fallback
});

btnOpenAuth.addEventListener('click', () => {
  authScreen.style.display = ''; // Reset display inline
  authScreen.classList.add('active');
});

btnUserProfile.addEventListener('click', () => {
  profileScreen.style.display = ''; 
  profileScreen.classList.add('active');
  (document.getElementById('profile-username') as HTMLInputElement).value = userSessionName || '';
  const hrs = Math.floor(Math.max(0, userBalanceSeconds) / 3600);
  const mins = Math.floor((Math.max(0, userBalanceSeconds) % 3600) / 60);
  timeBalanceEl.innerText = `Play Time Balance: ${hrs}h ${mins}m`;
});

document.getElementById('btn-logout')!.addEventListener('click', () => {
  userSessionId = null;
  userSessionName = null;
  userBalanceSeconds = 0;
  localStorage.removeItem('userSessionId');
  localStorage.removeItem('userSessionName');
  localStorage.removeItem('userBalanceSeconds');
  btnUserProfile.style.display = 'none';
  btnOpenAuth.style.display = 'block';
  profileScreen.style.display = 'none';
});

const profilePasswordInput = document.getElementById('profile-password') as HTMLInputElement;

document.getElementById('btn-save-profile')!.addEventListener('click', async () => {
  const newName = (document.getElementById('profile-username') as HTMLInputElement).value.trim();
  const newPassword = profilePasswordInput ? profilePasswordInput.value : '';

  if (!newName && !newPassword) {
    profileScreen.classList.remove('active');
    return;
  }

  if (userSessionId) {
      if (newName) {
        const res = await APIClient.updateProfile(userSessionId, newName);
        if (res.success) {
          userSessionName = res.username;
          localStorage.setItem('userSessionName', userSessionName || '');
          btnUserProfile.innerText = userSessionName || 'USER';
        } else {
          alert(res.error || 'Failed to update username');
        }
      }
      
      if (newPassword) {
        const res = await APIClient.updatePassword(userSessionId, newPassword);
        if (res.success) {
          alert('Password updated successfully.');
        } else {
          alert(res.error || 'Failed to update password');
        }
        profilePasswordInput.value = '';
      }
      
      profileScreen.classList.remove('active');
  }
});

let isLoginMode = true;

document.getElementById('auth-toggle-text')!.addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  document.getElementById('auth-title')!.innerText = isLoginMode ? 'LOGIN' : 'REGISTER';
  document.getElementById('auth-username')!.style.display = isLoginMode ? 'none' : 'block';
  document.getElementById('btn-submit-auth')!.innerText = isLoginMode ? 'ENTER THE ARENA' : 'REGISTER NOW';
  document.getElementById('auth-toggle-text')!.innerText = isLoginMode 
    ? 'Need an account? Register here.' 
    : 'Already have an account? Login here.';
});

document.getElementById('btn-submit-auth')!.addEventListener('click', async () => {
  const email = (document.getElementById('auth-email') as HTMLInputElement).value;
  const username = (document.getElementById('auth-username') as HTMLInputElement).value;
  const password = (document.getElementById('auth-password') as HTMLInputElement).value;
  
  if (!email || !password || (!isLoginMode && !username)) {
    alert('Please fill in all required fields!');
    return;
  }
  
  const btn = document.getElementById('btn-submit-auth') as HTMLButtonElement;
  btn.innerText = 'CONNECTING...';
  btn.disabled = true;

  // Check URL for referral
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref') || undefined;

  try {
    let res;
    if (isLoginMode) {
      res = await APIClient.login(email, password);
    } else {
      res = await APIClient.register(email, username, password, ref);
    }

    if (res.success) {
      if (!isLoginMode) {
        alert('Registration successful! Please login.');
        document.getElementById('auth-toggle-text')!.click();
      } else {
        // Login success
        userSessionId = res.user.id;
        userSessionName = res.user.username;
        userBalanceSeconds = res.user.play_time_balance || 3600;
        
        localStorage.setItem('userSessionId', userSessionId || '');
        localStorage.setItem('userSessionName', userSessionName || '');
        localStorage.setItem('userBalanceSeconds', userBalanceSeconds.toString());
        localStorage.setItem('premiumUntil', res.user.premium_until?.toString() || '0');
        // @ts-ignore
        if (typeof renderPayPalButton === 'function') renderPayPalButton();
        
        authScreen.style.display = 'none';
        
        btnOpenAuth.style.display = 'none';
        btnUserProfile.style.display = 'block';
        btnUserProfile.innerText = userSessionName || 'USER';

        const hrs = Math.floor(Math.max(0, userBalanceSeconds) / 3600);
        const mins = Math.floor((Math.max(0, userBalanceSeconds) % 3600) / 60);
        timeBalanceEl.innerText = `Play Time Balance: ${hrs}h ${mins}m`;

        const joinRoomId = new URLSearchParams(window.location.search).get('room');
        if (joinRoomId) {
          startGame('friend');
        }
      }
    } else {
      alert('Authentication failed: ' + (res.error || 'Unknown error'));
    }
  } catch (e) {
    alert('Network error during authentication');
  } finally {
    btn.innerText = isLoginMode ? 'ENTER THE ARENA' : 'REGISTER NOW';
    btn.disabled = false;
  }
});

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

let currentMode: 'training' | 'friend' | 'random' = 'training';


const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;
canvas.width = GAME_WIDTH;
canvas.height = GAME_HEIGHT;

// Set up global game objects
const presenter = new GamePresenter(GAME_WIDTH, GAME_HEIGHT);
window.presenter = presenter;

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
  { id: 'btn-switch', action: 'switch' }
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

if (joystickMove) {
  joystickMove.addEventListener('touchstart', (e) => {
    isDraggingMove = true;
    moveBaseRect = joystickMove.getBoundingClientRect();
    handleMove(e.touches[0]);
  }, { passive: false });

  joystickMove.addEventListener('touchmove', (e) => {
    if (isDraggingMove) handleMove(e.touches[0]);
  }, { passive: false });

  joystickMove.addEventListener('touchend', () => {
    isDraggingMove = false;
    moveStick.style.transform = `translate(-50%, -50%)`;
    if (window.presenter) {
      window.presenter.handleAnalogInput(0, 0); // Stop movement and aiming
    }
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
  { id: 'btn-fire', action: 'fire' }
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
  async function startGame(mode: 'training' | 'friend' | 'random') {
  currentMode = mode;

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
  
  // Allow UI to paint the loader
  await new Promise(resolve => setTimeout(resolve, 50));

  // Re-instantiate the GamePresenter to completely wipe old state
  if (window.presenter) {
    window.presenter.stop();
  }
  const canvasEl = document.getElementById('gameCanvas') as HTMLCanvasElement;
  window.presenter = new GamePresenter(GAME_WIDTH, GAME_HEIGHT);
  window.renderer = new CanvasRenderer(canvasEl);
  
  // Re-bind input handler to new presenter
  window.inputHandler = new InputHandler(window.presenter, canvasEl, [
    { id: 'btn-left', action: 'left' },
    { id: 'btn-right', action: 'right' },
    { id: 'btn-up', action: 'up' },
    { id: 'btn-down', action: 'down' },
    { id: 'btn-jump', action: 'jump' },
    { id: 'btn-fire', action: 'fire' },
    { id: 'btn-switch', action: 'switch' }
  ]);

  // Re-bind events for the new presenter
  bindPresenterEvents();

  const turnTime = await APIClient.getTurnTime();
  const logos = await APIClient.getLogos();

  window.presenter.startGame({
    width: 1500,
    height: 800,
    mapType: mapType,
    mode: mode,
    turnTime: turnTime,
    logos: logos
  });
  window.presenter.localTeam = mode === 'training' ? 'training' : 'team1';
  window.presenter.start();

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
  if (mode === 'friend') {
    if (!userSessionId) {
      alert('You must be logged in to play with a friend!');
      loaderScreen.classList.remove('active');
      authScreen.classList.add('active');
      return;
    }
    const loaderText = document.getElementById('loader-text')!;
    const invitePanel = document.getElementById('invite-panel')!;
    const inviteInput = document.getElementById('invite-link') as HTMLInputElement;
    
    loaderText.innerText = 'CONNECTING TO SERVER...';
    syncModule = new MultiplayerSync();
    
    // Check if we are joining a room via URL
  const urlParams = new URLSearchParams(window.location.search);
  const joinRoomId = urlParams.get('room') || undefined;

  syncModule.onReady = () => {
      invitePanel.style.display = 'none';
      loaderScreen.classList.remove('active');
      gameScreen.classList.add('active');
      resizeCanvas();
      showControls();
      window.presenter.start();
    };

    syncModule.onPlayerAction = (action, active, payload) => {
      window.presenter.handleInput(action, active, true, payload); // true = from network
    };

    window.presenter.onLocalAction = (action: string, active: boolean, payload?: any) => {
      syncModule?.sendAction(action, active, payload);
    };

    try {
      const roomId = await syncModule.createOrJoinRoom(joinRoomId);
      
      if (!joinRoomId) {
        // We are the host, waiting for someone
        window.presenter.localTeam = 'team1';
        loaderText.innerText = 'WAITING FOR OPPONENT...';
        invitePanel.style.display = 'flex';

        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
        inviteInput.value = inviteUrl;

        // Make it clear the host shouldn't open this link
        const hostWarning = document.createElement('p');
        hostWarning.innerText = "Don't open this link yourself! Just send it to your friend.";
        hostWarning.style.color = '#ffeb3b';
        hostWarning.style.fontSize = '12px';
        hostWarning.style.marginTop = '10px';
        invitePanel.appendChild(hostWarning);

        document.getElementById('btn-copy-invite')!.onclick = () => {
          navigator.clipboard.writeText(inviteUrl);
          document.getElementById('btn-copy-invite')!.innerText = 'COPIED!';
        };

        document.getElementById('btn-cancel-invite')!.onclick = () => {
          if (syncModule) {
            syncModule.peerConnection?.close();
            syncModule = null;
          }
          invitePanel.style.display = 'none';
          loaderScreen.classList.remove('active');
          menuScreen.classList.add('active');
        };
      } else {
        window.presenter.localTeam = 'team2';
        loaderText.innerText = 'JOINING ROOM...';
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
      updateTimeBalanceDisplay();
      
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
document.getElementById('btn-play-friends')!.addEventListener('click', () => {
  AudioManager.isGameStarted = true; // Enable sounds
  startGame('friend');
});

document.getElementById('btn-share-clip')!.addEventListener('click', () => {
  const btn = document.getElementById('btn-share-clip')!;
  btn.innerText = '🎬 GENERATING...';
  setTimeout(() => {
    btn.innerText = '🎬 LINK COPIED!';
    // Simulate share
    const dummyLink = window.location.origin + '?replay=' + Math.random().toString(36).substring(7);
    navigator.clipboard.writeText(dummyLink).catch(err => {
      console.warn('Could not copy text: ', err);
    });
    setTimeout(() => btn.innerText = '🎬 SHARE CLIP', 2000);
  }, 1000);
});

document.getElementById('btn-return-menu')!.addEventListener('click', () => {
  location.reload();
});

// Update HUD elements
const hpLocalEl = document.getElementById('hp-local')!;
const hpEnemyEl = document.getElementById('hp-enemy')!;
function updateWormSelectionUI(state: any) {
  const panel = document.getElementById('worm-selection-panel');
  if (!panel) return;

  const currentPlayer = state.getCurrentPlayer();
  const currentTeam = currentPlayer ? currentPlayer.team : 'team1';
  
  // Show only if it's local team's turn (or player 1 in local multiplayer)
  const isMyTurn = window.presenter.localTeam === 'training' || window.presenter.localTeam === currentTeam;
  
  if (!isMyTurn) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'flex';
  
  // Find all worms of the current team
  const teamWorms = state.players
    .map((p: any, index: number) => ({ p, index }))
    .filter((item: any) => item.p.team === currentTeam);

  panel.innerHTML = ''; // Clear existing buttons
  
  teamWorms.forEach((item: any, i: number) => {
    const btn = document.createElement('button');
    btn.className = `worm-btn ${item.index === state.currentPlayerIndex ? 'active' : ''} ${item.p.health <= 0 ? 'dead' : ''}`;
    btn.dataset.index = item.index.toString();
    
    const spriteUrl = item.p.health > 0 ? '/sprites/Worms/wbrth1.png' : '/sprites/Misc/grave1.png';
    const hpStr = Math.ceil(Math.max(0, item.p.health)).toString();
    
    btn.innerHTML = `<img src="${spriteUrl}" alt="W${i+1}"><span class="hp">${hpStr}</span>`;
    
    btn.addEventListener('click', () => {
      if (item.p.health > 0 && !window.presenter.hasFiredThisTurn) {
        // Find actual index in global players array, not just team index
        const globalIndex = window.presenter.state.players.indexOf(item.p);
        if (globalIndex !== -1) {
          window.presenter.state.currentPlayerIndex = globalIndex;
          window.presenter.updateMobileWeaponIcon(item.p);
          updateWormSelectionUI(window.presenter.state); // Force re-render immediately
        }
      }
    });
    
    panel.appendChild(btn);
  });
}

function bindPresenterEvents() {
  const turnTimer = document.getElementById('turn-timer')!;
  const turnNotification = document.getElementById('turn-notification')!;
  const rewardText = document.getElementById('game-over-reward') || document.getElementById('game-over-stats')!;
  const statsText = document.getElementById('game-over-stats')!;

  window.presenter.onStateUpdate = (state: any) => {
    // Update local HP (team1)
    const localWorms = state.players.length > 0 ? [state.players[0]] : [];
    const localHp = localWorms.reduce((sum: number, w: any) => sum + w.health, 0);
    hpLocalEl.style.width = `${Math.min(100, Math.max(0, (localHp / 100) * 100))}%`;

    // Update enemy HP (team2)
    const enemyWorms = state.players.length > 1 ? [state.players[1]] : [];
    const enemyHp = enemyWorms.reduce((sum: number, w: any) => sum + w.health, 0);
    hpEnemyEl.style.width = `${Math.min(100, Math.max(0, (enemyHp / 100) * 100))}%`;

    const windIndicatorEl = document.getElementById('wind-indicator');

    // Update Turn Timer & Wind
    if (turnTimer) {
      const timeStr = state.turnTimeLeft === Infinity ? '∞' : Math.ceil(state.turnTimeLeft).toString();
      turnTimer.innerText = timeStr;
      
      // Visual ticking at 5 seconds
      if (state.turnTimeLeft <= 5 && state.turnTimeLeft !== Infinity && state.turnTimeLeft > 0) {
        turnTimer.classList.add('ticking');
      } else {
        turnTimer.classList.remove('ticking');
      }
    }
    if (windIndicatorEl) {
      windIndicatorEl.innerText = `Wind: ${state.wind > 0 ? '→' : state.wind < 0 ? '←' : '0'}`;
    }

    // Turn Change Notification
    const activeTeam = state.currentPlayerIndex !== undefined && state.players[state.currentPlayerIndex] 
      ? state.players[state.currentPlayerIndex].team 
      : 'team1';
    const isMyTurn = window.presenter.localTeam === 'training' || activeTeam === window.presenter.localTeam;

    // Update Worm Selection UI
    updateWormSelectionUI(state);

    if (state.turnTimeLeft === window.presenter.maxTurnTime) {
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
        const reward = currentMode === 'friend' ? 5 : 10;
        rewardText.innerText = `You earned ${reward} WebCoins and 10 minutes of play time!`;
        
        // Report match end to server to get playtime reward
        const sessionId = localStorage.getItem('sessionId');
        const userId = localStorage.getItem('userId');
        if (sessionId && userId && currentMatchToken) {
          APIClient.reportMatchEnd(sessionId, userId, currentMatchToken).then(res => {
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
        <p>Match Time: ${Math.round(stats.matchTime || 0)}s</p>
      `;
    }
  };
}

bindPresenterEvents();

} // End of else block for game init

let lastTime = performance.now();
  function gameLoop(time: number) {
    try {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      window.presenter.update(dt);
      window.renderer.render(window.presenter.state);

      requestAnimationFrame(gameLoop);
    } catch (e) {
      console.error('Game Loop Error:', e);
      requestAnimationFrame(gameLoop); // Try to recover
    }
  }

  requestAnimationFrame(gameLoop);
  // Add orientation check if needed.

// Auto-join logic if room URL param exists
const initUrlParams = new URLSearchParams(window.location.search);
if (initUrlParams.get('room')) {
  // Use localStorage directly to check if user is logged in
  const savedSession = localStorage.getItem('userSessionId');
  if (savedSession) {
    // User is already logged in, join the game directly
    // Call startGame which is available in the global scope or wait for it
    setTimeout(() => {
      const btnPlayFriends = document.getElementById('btn-play-friends');
      if (btnPlayFriends) btnPlayFriends.click();
    }, 500);
  } else {
    // User needs to login
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

