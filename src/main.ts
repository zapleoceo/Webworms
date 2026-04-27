import './style.css';
import { AdminPanel } from './admin/AdminPanel';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';
import { APIClient } from './network/APIClient';
import { MultiplayerSync } from './network/MultiplayerSync';
import { AudioManager } from './utils/AudioManager';
import { Random } from './utils/Random';
import { Worm } from './models/Worm';
import { Projectile } from './models/Projectile';
import { WEAPONS } from './models/Weapon';

declare global {
  interface Window {
    presenter: GamePresenter;
    renderer: CanvasRenderer;
    inputHandler: InputHandler;
  }
}

const isAdminPage = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

if (isAdminPage) {
  new AdminPanel();
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

// Only run game logic if we are not on the admin page and have game elements
if (!isAdminPage) {

// Load custom maps into dropdown
APIClient.getMaps().then(maps => {
  const mapTypeSelect = document.getElementById('map-type-select') as HTMLSelectElement;
  const mapSizeDisplay = document.getElementById('map-size-display') as HTMLDivElement;
  
  if (mapTypeSelect && maps && maps.length > 0) {
    mapTypeSelect.innerHTML = ''; // Clear "Loading maps..."
    
    const updateSizeDisplay = () => {
      const selectedId = mapTypeSelect.value;
      const selectedMap = maps.find((m: any) => m.id === selectedId);
      if (selectedMap && mapSizeDisplay) {
        mapSizeDisplay.style.display = 'inline-block';
        mapSizeDisplay.innerText = `${selectedMap.width} x ${selectedMap.height}`;
      }
    };

    maps.forEach((m: any) => {
      const opt = document.createElement('option');
      opt.value = m.id;
      // Strip 'custom_' prefix if it exists
      const cleanName = m.name.replace(/^custom_/i, '');
      opt.innerText = cleanName;
      mapTypeSelect.appendChild(opt);
    });
    
    // Initial display and listen for changes
    updateSizeDisplay();
    mapTypeSelect.addEventListener('change', updateSizeDisplay);
    
  } else if (mapTypeSelect) {
    mapTypeSelect.innerHTML = '<option disabled>No custom maps found</option>';
  }
});

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
  const timeBalanceEl = document.getElementById('profile-stats-balance');
  const btnAddTime = document.getElementById('btn-add-time');
  
  const balanceStr = localStorage.getItem('playTimeBalance') || localStorage.getItem('userBalanceSeconds');
  const premiumStr = localStorage.getItem('premiumUntil');
  
  let hasPremium = false;
  if (premiumStr) {
    const premiumUntil = parseInt(premiumStr);
    if (premiumUntil > Date.now()) {
      hasPremium = true;
      if (display) {
        display.style.display = 'block';
        display.innerText = 'Time: ∞ (Premium)';
        display.style.color = '#ffeb3b';
      }
      if (timeBalanceEl) {
        timeBalanceEl.innerText = 'Play Time: ∞ (Premium)';
      }
      if (btnAddTime) btnAddTime.style.display = 'none';
    }
  }

  if (!hasPremium) {
    if (btnAddTime && localStorage.getItem('userSessionId')) {
      btnAddTime.style.display = 'block';
    } else if (btnAddTime) {
      btnAddTime.style.display = 'none';
    }

    if (balanceStr) {
      const seconds = parseInt(balanceStr);
      const hrs = Math.floor(Math.max(0, seconds) / 3600);
      const mins = Math.floor((Math.max(0, seconds) % 3600) / 60);
      
      const hh = hrs.toString().padStart(2, '0');
      const mm = mins.toString().padStart(2, '0');
      
      if (display) {
        display.style.display = 'block';
        display.innerText = `Time: ${hh}:${mm}`;
        display.style.color = 'white';
      }
      
      if (timeBalanceEl) {
        timeBalanceEl.innerText = `Play Time Balance: ${hh}:${mm}`;
      }
    } else if (display) {
      display.style.display = 'none';
    }
  }
}

// Add PayPal Button Rendering
function renderPayPalButton() {
  const buttonContainer = document.getElementById('payment-container');
  if (!buttonContainer) return;

  // AdBlock Fallback
  // @ts-ignore
  if (typeof paypal === 'undefined') {
    buttonContainer.innerHTML = `
      <div style="text-align: center; color: #ff3333; padding: 20px;">
        <h3 class="comic-text">Payment Gateway Blocked</h3>
        <p>Your browser or AdBlocker is blocking the secure payment window.</p>
        <p style="margin-top: 10px; color: #000;">Please temporarily pause your AdBlocker on this site and reload the page to purchase extra time.</p>
      </div>
    `;
    return;
  }

  // Render PayPal button only if it hasn't been rendered yet
  if (buttonContainer.innerHTML === '') {
    try {
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
            const sessionId = localStorage.getItem('userSessionId');
            fetch(APIClient.BASE_URL + '/payment/paypal/capture', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionId}`
              },
              body: JSON.stringify({ orderID: data.orderID })
            }).then(res => res.json()).then((res: any) => {
              if (res.success) {
                alert('Payment successful! You now have 7 Days of Unlimited Play Time.');
                localStorage.setItem('premiumUntil', res.premium_until.toString());
                updateTimeBalanceDisplay();
                document.getElementById('payment-modal')!.style.display = 'none';
              } else {
                alert('Verification failed: ' + res.error);
              }
            });
          });
        }
      }).render('#payment-container');
    } catch(e) {
      console.error("PayPal failed to load", e);
    }
  }
}

document.getElementById('btn-add-time')?.addEventListener('click', () => {
  document.getElementById('payment-modal')!.style.display = 'flex';
  renderPayPalButton();
});

document.getElementById('btn-close-payment')?.addEventListener('click', () => {
  document.getElementById('payment-modal')!.style.display = 'none';
});

const savedSessionId = localStorage.getItem('userSessionId');
if (savedSessionId) {
  APIClient.getSession(savedSessionId).then((res: any) => {
    if (res.success && res.user) {
      localStorage.setItem('playTimeBalance', res.user.play_time_balance.toString());
      localStorage.setItem('premiumUntil', res.user.premium_until?.toString() || '0');
      userBalanceSeconds = res.user.play_time_balance;
      updateTimeBalanceDisplay();
    }
  });
}

// Auto-login check
if (userSessionId && userSessionName) {
  btnOpenAuth.style.display = 'none';
  btnUserProfile.style.display = 'block';
  btnUserProfile.innerText = userSessionName;
  updateTimeBalanceDisplay();
}

// Contact Author Modal
const contactModal = document.getElementById('contact-modal')!;
const contactMessage = document.getElementById('contact-message') as HTMLTextAreaElement;

document.getElementById('btn-contact-author')?.addEventListener('click', () => {
  contactModal.style.display = 'flex';
});

document.getElementById('btn-close-contact')?.addEventListener('click', () => {
  contactModal.style.display = 'none';
});

document.getElementById('btn-send-message')?.addEventListener('click', async () => {
  const msg = contactMessage.value.trim();
  if (!msg) {
    alert('Please enter a message first!');
    return;
  }
  
  const btn = document.getElementById('btn-send-message') as HTMLButtonElement;
  const originalText = btn.innerText;
  btn.innerText = 'SENDING...';
  btn.disabled = true;

  try {
    const token = localStorage.getItem('userSessionId');
    const res = await APIClient.sendContactMessage(msg, token);
    
    if (res.success) {
      alert('Message sent successfully! Thank you for your feedback.');
      contactModal.style.display = 'none';
      contactMessage.value = '';
    } else {
      alert('Failed to send message: ' + (res.error || 'Unknown error'));
    }
  } catch (e: any) {
    alert('Error sending message: ' + e.message);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
});

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
  updateTimeBalanceDisplay();
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
        
        authScreen.style.display = 'none';
        
        btnOpenAuth.style.display = 'none';
        btnUserProfile.style.display = 'block';
        btnUserProfile.innerText = userSessionName || 'USER';

        updateTimeBalanceDisplay();

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
  { id: 'btn-fire', action: 'fire' },
  { id: 'btn-switch', action: 'switch' }
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
  const maps = await APIClient.getMaps();

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
    turnTime: turnTime,
    logos: logos,
    mapData: mapData
  });
  window.presenter.localTeam = mode === 'training' ? 'training' : 'team1';
  
  // Do NOT start the presenter loop here if we are playing with a friend and waiting!
  // It will be started in onReady.
  if (mode === 'training') {
    window.presenter.start();
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
    syncModule = new MultiplayerSync();
    
    const urlParams = new URLSearchParams(window.location.search);
    const joinRoomId = urlParams.get('room') || undefined;
    const savedHostRoomId = localStorage.getItem('friendHostRoomId') || undefined;
    const isHostResume = !!(joinRoomId && savedHostRoomId && joinRoomId === savedHostRoomId);

  syncModule.onReady = () => {
      document.getElementById('btn-cancel-random')?.remove();
      invitePanel.style.display = 'none';
      loaderScreen.classList.remove('active');
      gameScreen.classList.add('active');
      resizeCanvas();
      showControls();
      window.presenter.start();
    };

    syncModule.onPlayerAction = (action, active, payload) => {
      if (action === 'analog') {
        window.presenter.handleAnalogInput(payload.x, payload.y, true);
      } else if (action === 'switchWorm') {
        const index = payload;
        if (index >= 0 && index < window.presenter.state.players.length) {
          window.presenter.state.currentPlayerIndex = index;
          const cp = window.presenter.state.getCurrentPlayer();
          if (cp) window.presenter.updateMobileWeaponIcon(cp);
        }
      } else {
        window.presenter.handleInput(action, active, true, payload); // true = from network
      }
    };

    syncModule.onPeerDisconnected = () => {
      if (window.presenter.isRunning) {
        alert("The enemy has disconnected.");
        window.presenter.handleInput('surrender', true, true);
      }
    };

    syncModule.onStateReceived = (stateData) => {
      if (window.presenter.localTeam === 'team2') {
        // We are the client, update our state to match the host
        
        // Sync map seed if we haven't generated terrain with it yet
        if (window.presenter.state.mapSeed !== stateData.mapSeed || (stateData.mapData && window.presenter.state.mapData !== stateData.mapData)) {
          window.presenter.state.mapSeed = stateData.mapSeed;
          window.presenter.state.mapData = stateData.mapData;
          Random.setSeed(stateData.mapSeed);
          
          if (stateData.mapData) {
            // Ensure URL is absolute
            const fullUrl = stateData.mapData.startsWith('http') ? stateData.mapData : APIClient.BASE_URL.replace('/api', '') + stateData.mapData;
            
            // Pause the game until map is loaded to prevent worms from falling
            window.presenter.isPaused = true;
            
            window.presenter.state.landscape.generateFromImage(fullUrl).then(() => {
              window.presenter.state.width = window.presenter.state.landscape.width;
              window.presenter.state.height = window.presenter.state.landscape.height;
              rebuildWorms();
              window.presenter.isPaused = false;
            }).catch(e => {
              console.error('Failed to load map on client:', e);
              window.presenter.isPaused = false;
            });
          } else {
            console.error('Client received no mapData. Cannot generate procedural map.');
            alert('Host sent an invalid map. Refresh to reconnect.');
          }
          
          function rebuildWorms() {
            // Force regenerate worms with new seed
            window.presenter.state.players = [];
            
            // Use the exact same generation logic as host
            const spawnPoints: {x: number, y: number}[] = [];
            const availableClasses = ['soldier', 'heavy', 'scout'];
            
            const t1Classes = [
              availableClasses[Random.nextInt(0, availableClasses.length - 1)],
              availableClasses[Random.nextInt(0, availableClasses.length - 1)],
              availableClasses[Random.nextInt(0, availableClasses.length - 1)]
            ];
            const t2Classes = [
              availableClasses[Random.nextInt(0, availableClasses.length - 1)],
              availableClasses[Random.nextInt(0, availableClasses.length - 1)],
              availableClasses[Random.nextInt(0, availableClasses.length - 1)]
            ];

            for (let i = 0; i < 3; i++) {
              const s = window.presenter.state.landscape.getSafeSpawn(spawnPoints, 150, stateData.mapSeed);
              spawnPoints.push(s);
              const p = new Worm(s.x, s.y, false, `Worm ${i+1}`, t1Classes[i] as any, ['bazooka', 'minigun', 'triple', 'rocket', 'blaster'], 'team1');
              window.presenter.state.addPlayer(p);
            }
            for (let i = 0; i < 3; i++) {
              const s = window.presenter.state.landscape.getSafeSpawn(spawnPoints, 150, stateData.mapSeed);
              spawnPoints.push(s);
              const p = new Worm(s.x, s.y, false, `Enemy ${i+1}`, t2Classes[i] as any, ['bazooka', 'minigun', 'triple', 'rocket', 'blaster'], 'team2');
              window.presenter.state.addPlayer(p);
            }
          }
        }

        const oldCurrentPlayerIndex = window.presenter.state.currentPlayerIndex;
        window.presenter.state.currentPlayerIndex = stateData.currentPlayerIndex;
        
        if (oldCurrentPlayerIndex !== stateData.currentPlayerIndex) {
          const cp = window.presenter.state.getCurrentPlayer();
          if (cp) window.presenter.updateMobileWeaponIcon(cp);
        }

        window.presenter.state.wind = stateData.wind;
        
        // Exact turn time sync (client doesn't compute physics anyway)
        window.presenter.turnTimeLeft = stateData.turnTimeLeft;
        window.presenter.state.turnTimeLeft = stateData.turnTimeLeft; // Update state for UI to read
        
        window.presenter.hasFiredThisTurn = stateData.hasFiredThisTurn;
        if (stateData.lastPlayedIndex) {
          window.presenter.state.lastPlayedIndex = stateData.lastPlayedIndex;
        }
        
        // Sync players
        stateData.players.forEach((pData: any, i: number) => {
          if (window.presenter.state.players[i]) {
            const p = window.presenter.state.players[i];
            
            // DUMB CLIENT: Apply exact positions from host for perfect sync
            // Interpolation can be added later for smoothness, but exact coordinates are safe.
            p.x = pData.x;
            p.y = pData.y;
            p.vx = pData.vx;
            p.vy = pData.vy;
            p.health = pData.health;
            p.aimAngle = pData.aimAngle;
            p.facingRight = pData.facingRight;
            
            if (pData.currentWeaponIndex !== undefined) {
              p.currentWeaponIndex = pData.currentWeaponIndex;
            }
            
            p.team = pData.team;
            
            if (pData.unitClass && p.unitClass !== pData.unitClass) {
              p.unitClass = pData.unitClass;
            }
          }
        });

        // Sync projectiles exactly
        window.presenter.state.projectiles = stateData.projectiles.map((projData: any) => {
          const weapon = WEAPONS[projData.weaponId] || WEAPONS['bazooka'];
          const p = new Projectile(projData.x, projData.y, projData.vx, projData.vy, weapon);
          return p;
        });
        
        // Process new craters exactly
        if (stateData.craters && stateData.craters.length > 0) {
          stateData.craters.forEach((crater: any) => {
            window.presenter.state.landscape.createCrater(crater.x, crater.y, crater.r);
          });
        }
      }
    };

    window.presenter.onLocalAction = (action: string, active: boolean, payload?: any) => {
      syncModule?.sendAction(action, active, payload);
    };

    try {
      const roomId = await syncModule.createOrJoinRoom(
        isHostResume ? joinRoomId : joinRoomId,
        userSessionId,
        isHostResume,
        mode === 'random'
      );

      const isJoining = mode === 'random' ? !syncModule.isHost : !!(joinRoomId && !isHostResume);
      if (!isJoining) {
        // We are the host, waiting for someone
        window.presenter.localTeam = 'team1';
        loaderText.innerText = 'WAITING FOR OPPONENT...';
        
        if (mode === 'friend') {
          invitePanel.style.display = 'flex';
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
          
          // Add a simple cancel button for random matchmaking
          const cancelBtn = document.createElement('button');
          cancelBtn.innerText = 'CANCEL SEARCH';
          cancelBtn.className = 'danger-btn mt-10';
          cancelBtn.id = 'btn-cancel-random';
          cancelBtn.onclick = () => {
            if (syncModule) {
              syncModule.peerConnection?.close();
              syncModule = null;
            }
            cancelBtn.remove();
            loaderScreen.classList.remove('active');
            menuScreen.classList.add('active');
          };
          loaderScreen.appendChild(cancelBtn);
        }

        document.getElementById('btn-cancel-invite')!.onclick = () => {
          if (syncModule) {
            syncModule.peerConnection?.close();
            syncModule = null;
          }
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
function getTransparentSprite(url: string, fw: number, fh: number, callback: (newUrl: string) => void) {
  if (transparentSprites[url]) {
    return callback(transparentSprites[url]);
  }
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = url;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return callback(url);
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
    
    // Crop first frame
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = fw;
    cropCanvas.height = fh;
    cropCanvas.getContext('2d')?.drawImage(canvas, 0, 0, fw, fh, 0, 0, fw, fh);
    
    const newUrl = cropCanvas.toDataURL('image/png');
    transparentSprites[url] = newUrl;
    callback(newUrl);
  };
  img.onerror = () => callback(url);
}

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
    
    // We create a temporary placeholder, and load the transparent sprite asynchronously
    const imgId = `worm-img-${item.p.id || i}`;
    btn.innerHTML = `<img id="${imgId}" src="" alt="W${i+1}" style="background: transparent;"><span class="hp">${hpStr}</span>`;
    
    getTransparentSprite(spriteUrl, item.p.health > 0 ? 60 : 24, item.p.health > 0 ? 60 : 32, (newUrl) => {
      const imgEl = document.getElementById(imgId) as HTMLImageElement;
      if (imgEl) imgEl.src = newUrl;
    });
    
    btn.addEventListener('click', () => {
      if (item.p.health > 0 && !window.presenter.hasFiredThisTurn) {
        window.presenter.handleInput('switchWorm', true, false, i);
        updateWormSelectionUI(window.presenter.state); // Force re-render immediately
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

  let lastTurnPlayerIndex = -1;

  window.presenter.onStateUpdate = (state: any) => {
    // Sync state to client if host
    if (window.presenter.isHost && syncModule && currentMode === 'friend') {
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

    const windIndicatorEl = document.getElementById('wind-indicator');

    // Update Turn Timer & Wind
    if (turnTimer) {
      let timeStr = '';
      if (state.projectiles && state.projectiles.length > 0) {
        timeStr = 'FLIGHT';
        turnTimer.style.fontSize = '12px';
      } else if (state.turnTimeLeft === Infinity) {
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
