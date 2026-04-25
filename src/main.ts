import './style.css';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';
import { APIClient } from './network/APIClient';
import { MultiplayerSync } from './network/MultiplayerSync';

declare global {
  interface Window {
    presenter: GamePresenter;
    renderer: CanvasRenderer;
    inputHandler: InputHandler;
  }
}

// We initialize everything globally
// 4. Admin Endpoints
  if (window.location.pathname === '/admin') {
    document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
      <div style="color: white; font-family: Courier New; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div id="admin-auth">
          <h1>Admin Authentication</h1>
          <input type="email" id="admin-email" class="retro-input" placeholder="Admin Email" style="margin-bottom: 10px;">
          <input type="password" id="admin-password" class="retro-input" placeholder="Admin Password" style="margin-bottom: 10px;">
          <button id="admin-login-btn" class="retro-btn">Login to Admin Panel</button>
        </div>

        <div id="admin-dashboard" style="display: none;">
          <h1>Admin Panel</h1>
          <button id="load-users" class="retro-btn" style="padding: 10px; margin-bottom: 20px;">Load Users</button>
          <button id="admin-logout-btn" class="retro-btn" style="padding: 10px; margin-bottom: 20px; background-color: #8B0000;">Logout</button>
          <div id="users-list"></div>
        </div>
      </div>
    `;

    let adminHeaders = new Headers();

    document.getElementById('admin-login-btn')!.addEventListener('click', () => {
      const email = (document.getElementById('admin-email') as HTMLInputElement).value;
      const pass = (document.getElementById('admin-password') as HTMLInputElement).value;
      if (!email || !pass) {
        alert("Please enter credentials");
        return;
      }
      adminHeaders.set('X-Admin-Email', email);
      adminHeaders.set('X-Admin-Password', pass);
      document.getElementById('admin-auth')!.style.display = 'none';
      document.getElementById('admin-dashboard')!.style.display = 'block';
    });

    document.getElementById('admin-logout-btn')!.addEventListener('click', () => {
      adminHeaders = new Headers();
      document.getElementById('admin-dashboard')!.style.display = 'none';
      document.getElementById('admin-auth')!.style.display = 'block';
      document.getElementById('users-list')!.innerHTML = '';
    });

    document.getElementById('load-users')!.addEventListener('click', async () => {
      try {
        const res = await fetch(APIClient.BASE_URL + '/admin/users', { headers: adminHeaders });
        if (!res.ok) {
          if (res.status === 401) {
            alert("Unauthorized! Incorrect admin credentials or user is not an admin.");
            document.getElementById('admin-logout-btn')!.click();
          } else {
            alert(`Error loading users: ${res.statusText}`);
          }
          return;
        }
        
        const users = await res.json();
        const list = document.getElementById('users-list')!;
        list.innerHTML = users.map((u: any) => `
          <div style="border: 1px solid #555; padding: 10px; margin-bottom: 10px;">
            <p><b>ID:</b> ${u.id}</p>
            <p><b>Email:</b> ${u.email}</p>
            <p><b>Username:</b> ${u.username}</p>
            <p><b>Active (Verified):</b> ${u.is_active ? 'Yes' : 'No'}</p>
            <p><b>Balance:</b> ${u.play_time_balance}s</p>
            <p><b>Created:</b> ${u.created_at}</p>
            <label style="display: block;">
              <input type="checkbox" class="access-cb" data-id="${u.id}" ${u.access_allowed ? 'checked' : ''}> 
              Access Allowed
            </label>
            <label style="display: block;">
              <input type="checkbox" class="admin-cb" data-id="${u.id}" ${u.is_admin ? 'checked' : ''}> 
              Admin
            </label>
            <button class="save-user-btn" data-id="${u.id}" style="margin-top: 10px;">Save</button>
          </div>
        `).join('');

        document.querySelectorAll('.save-user-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const id = (e.target as HTMLButtonElement).dataset.id;
            const cb = document.querySelector(`.access-cb[data-id="${id}"]`) as HTMLInputElement;
            const adminCb = document.querySelector(`.admin-cb[data-id="${id}"]`) as HTMLInputElement;
            
            const saveRes = await fetch(APIClient.BASE_URL + '/admin/users', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Admin-Email': adminHeaders.get('X-Admin-Email') || '',
                'X-Admin-Password': adminHeaders.get('X-Admin-Password') || ''
              },
              body: JSON.stringify({ id, access_allowed: cb.checked, is_admin: adminCb.checked })
            });
            
            if (!saveRes.ok) {
              alert('Failed to save! Unauthorized.');
            } else {
              alert('Saved!');
            }
          });
        });
      } catch (e) {
        alert('Error loading users. Are you running the backend?');
      }
    });
  } else {

  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="game-wrapper">
    <div id="auth-screen" class="screen">
      <div class="logo-container">
        <img src="/logo.png" alt="Worms Logo" class="game-logo-img" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<h1 style=\\'color:white\\'>Worms Logo</h1>')">
      </div>
      <h2 class="retro-text blink" id="auth-title" style="margin-bottom: 30px;">LOGIN</h2>
      <input type="email" id="auth-email" class="retro-input" placeholder="Email">
      <input type="text" id="auth-username" class="retro-input" placeholder="Username" style="display: none;">
      <input type="password" id="auth-password" class="retro-input" placeholder="Password">
      <button class="retro-btn" id="btn-submit-auth" style="margin-top: 20px;">ENTER THE ARENA</button>
      <p id="auth-toggle-text" style="color: #fff; font-family: Courier New; margin-top: 15px; cursor: pointer; text-decoration: underline;">
        Need an account? Register here.
      </p>
      <button class="retro-btn" id="btn-close-auth" style="margin-top: 20px; font-size: 0.8rem; background-color: #555;">BACK TO MENU</button>
    </div>

    <div id="main-menu" class="screen active">
      <div style="position: absolute; top: 20px; right: 20px;">
        <button class="retro-btn" id="btn-open-auth" style="font-size: 0.8rem; padding: 5px 10px;">LOGIN / REGISTER</button>
        <span id="user-display-name" class="retro-text" style="display: none; font-size: 0.8rem; color: #32CD32;"></span>
      </div>
      <div class="logo-container">
        <img src="/logo.png" alt="Worms Logo" class="game-logo-img" onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<h1 style=\\'color:white\\'>Worms Logo</h1>')">
      </div>
      <div id="time-balance" class="retro-text" style="color: #32CD32; margin-bottom: 20px; font-size: 1.2rem;">Time Left: 1h 0m</div>
      <div class="weapon-selection">
        <h3 class="retro-text" style="font-size: 1rem; margin-bottom: 5px;">Select Class:</h3>
        <select id="class-select" style="margin-bottom: 15px; padding: 5px; font-size: 1rem; font-family: Courier New; width: 100%; box-sizing: border-box;">
          <option value="soldier">Soldier (Balanced)</option>
          <option value="heavy">Heavy (Tank)</option>
          <option value="scout">Scout (Fast)</option>
        </select>

        <h3 class="retro-text" style="font-size: 1rem; margin-bottom: 5px;">Map Size:</h3>
        <select id="map-size-select" style="margin-bottom: 15px; padding: 5px; font-size: 1rem; font-family: Courier New; width: 100%; box-sizing: border-box;">
          <option value="small">Small</option>
          <option value="medium" selected>Medium</option>
          <option value="large">Large</option>
        </select>

        <h3 class="retro-text" style="font-size: 1rem; margin-bottom: 10px;">Select Weapons:</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
          <label><input type="checkbox" class="weapon-cb" value="bazooka" checked> Bazooka</label>
          <label><input type="checkbox" class="weapon-cb" value="blaster" checked> Plasma</label>
          <label><input type="checkbox" class="weapon-cb" value="shotgun"> Shotgun</label>
          <label><input type="checkbox" class="weapon-cb" value="sniper"> Railgun</label>
          <label><input type="checkbox" class="weapon-cb" value="minigun"> Minigun</label>
          <label><input type="checkbox" class="weapon-cb" value="laser"> Laser</label>
        </div>
      </div>

      <div class="game-modes-panel">
        <button class="mode-btn" id="btn-mode-training">Training (Free)</button>
        <button class="mode-btn" id="btn-mode-friend">Play with Friend</button>
        <button class="mode-btn" id="btn-mode-random" disabled>Random Match (Soon)</button>
      </div>
    </div>

    <div id="loader-screen" class="screen">
      <h2 class="retro-text blink" id="loader-text">GENERATING WORLD...</h2>
      <div id="invite-panel" style="display: none; flex-direction: column; align-items: center;">
        <p style="color: #fff; font-family: Courier New; margin-bottom: 10px;">Send this link to your friend:</p>
        <input type="text" id="invite-link" class="retro-input" readonly style="font-size: 0.9rem; width: 350px;">
        <button class="retro-btn" id="btn-copy-invite" style="padding: 10px 20px; font-size: 1rem;">COPY LINK</button>
      </div>
    </div>

    <!-- The actual game area, fully responsive -->
    <div id="game-screen" class="screen">
      <div class="game-layout">
        <div id="game-container">
          <canvas id="gameCanvas" width="800" height="600"></canvas>
        </div>
        
        <div id="desktop-hints">
          <p><b>Arrows:</b> Move / Aim</p>
          <p><b>Space:</b> Jump</p>
          <p><b>Enter:</b> Fire</p>
          <p><b>Shift:</b> Switch Weapon</p>
        </div>

        <div id="mobile-controls">
          <div class="d-pad">
            <button class="control-btn" id="btn-up">⟲</button>
            <div class="horizontal">
              <button class="control-btn" id="btn-left">←</button>
              <button class="control-btn" id="btn-down">⟳</button>
              <button class="control-btn" id="btn-right">→</button>
            </div>
          </div>
          <div class="action-pad">
            <button class="control-btn action-btn" id="btn-jump">Jump</button>
            <button class="control-btn action-btn switch-btn" id="btn-switch"><span id="weapon-name-display" style="pointer-events: none;">Switch</span></button>
            <button class="control-btn action-btn fire-btn" id="btn-fire">Fire</button>
          </div>
        </div>
      </div>
    </div>
    
    <div id="game-over-screen" class="screen">
      <div class="logo-container">
        <h1 class="game-title" style="font-size: 2.5rem; margin-top: 10px;">WebWorms</h1>
      </div>
      <h2 class="retro-text" id="winner-text" style="margin-bottom: 20px; font-size: clamp(2rem, 5vw, 3rem);">PLAYER WINS!</h2>
      <div id="stats-panel" class="stats-panel">
        <h3 style="color: #00ffff; text-align: center; margin-bottom: 15px;">MATCH STATS</h3>
        <p id="stat-p1-dmg">P1 Damage: 0</p>
        <p id="stat-p2-dmg">P2 Damage: 0</p>
        <div id="stat-reward" class="reward-text">+10 MINUTES REWARD!</div>
      </div>
      <button class="retro-btn" id="btn-return-menu">RETURN TO MENU</button>
    </div>
  </div>
`;

// Screen Management
const authScreen = document.getElementById('auth-screen')!;
const menuScreen = document.getElementById('main-menu')!;
const loaderScreen = document.getElementById('loader-screen')!;
const gameScreen = document.getElementById('game-screen')!;
const gameOverScreen = document.getElementById('game-over-screen')!;
const winnerText = document.getElementById('winner-text')!;
const mobileControls = document.getElementById('mobile-controls')!;
const timeBalanceEl = document.getElementById('time-balance')!;

let userBalanceSeconds = 3600;
let userSessionId: string | null = null;
let userSessionName: string | null = null;
let deductInterval: number | null = null;
let syncModule: MultiplayerSync | null = null;

document.getElementById('btn-open-auth')!.addEventListener('click', () => {
  menuScreen.classList.remove('active');
  authScreen.classList.add('active');
});

document.getElementById('btn-close-auth')!.addEventListener('click', () => {
  authScreen.classList.remove('active');
  menuScreen.classList.add('active');
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
        // Registration success, requires email validation
        alert(res.message + '\n\n' + (res.dev_token_link ? `[DEV SIMULATION] Your activation link: ${res.dev_token_link}` : ''));
        if (res.dev_token_link) {
          console.log('Activation Link:', res.dev_token_link);
        }
        // Switch back to login mode
        document.getElementById('auth-toggle-text')!.click();
      } else {
        // Login success
        userSessionId = res.user.id;
        userSessionName = res.user.username;
        console.log('Session ID:', userSessionId);
        userBalanceSeconds = res.user.play_time_balance || 3600; 
        
        authScreen.classList.remove('active');
        menuScreen.classList.add('active');
        
        // Update UI
        document.getElementById('btn-open-auth')!.style.display = 'none';
        const displayEl = document.getElementById('user-display-name')!;
        displayEl.style.display = 'inline';
        displayEl.innerText = `[${userSessionName}]`;

        const hrs = Math.floor(Math.max(0, userBalanceSeconds) / 3600);
        const mins = Math.floor((Math.max(0, userBalanceSeconds) % 3600) / 60);
        timeBalanceEl.innerText = `Time Left: ${hrs}h ${mins}m`;
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
window.presenter = new GamePresenter(800, 600);
window.renderer = new CanvasRenderer(canvas);
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

// Touch drag for camera
let lastTouchX = 0;
let lastTouchY = 0;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
  }
});
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - lastTouchX;
    const dy = e.touches[0].clientY - lastTouchY;
    window.presenter.moveCamera(dx, dy, canvas.width, canvas.height);
    lastTouchX = e.touches[0].clientX;
    lastTouchY = e.touches[0].clientY;
  }
});




  // Start Game Helpers
  async function startGame(mode: 'training' | 'friend' | 'random') {
  currentMode = mode;
  
  const checked = document.querySelectorAll('.weapon-cb:checked') as NodeListOf<HTMLInputElement>;
  const selectedWeapons = Array.from(checked).map(cb => cb.value);
  if (selectedWeapons.length === 0) selectedWeapons.push('bazooka'); // Fallback


  const classSelect = document.getElementById('class-select') as HTMLSelectElement;
  const unitClass = classSelect.value as 'soldier' | 'heavy' | 'scout';

  const mapSizeSelect = document.getElementById('map-size-select') as HTMLSelectElement;
  const mapSize = mapSizeSelect.value as 'small' | 'medium' | 'large';

  menuScreen.classList.remove('active');
  loaderScreen.classList.add('active');
  
  // Allow UI to paint the loader
  await new Promise(resolve => setTimeout(resolve, 50));
  
  window.presenter.reset(selectedWeapons, unitClass, mapSize);
  
  loaderScreen.classList.remove('active');
  gameScreen.classList.add('active');
  
  // Show controls on mobile
  if (window.innerWidth <= 768) {
    mobileControls.style.display = 'flex';
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
      window.presenter.start();
    };

    syncModule.onPlayerAction = (action, active) => {
      window.presenter.handleInput(action, active, true); // true = from network
    };

    window.presenter.onLocalAction = (action: string, active: boolean) => {
      syncModule?.sendAction(action, active);
    };

    try {
      const roomId = await syncModule.createOrJoinRoom(joinRoomId);
      
      if (!joinRoomId) {
        // We are the host, waiting for someone
        loaderText.innerText = 'WAITING FOR OPPONENT...';
        invitePanel.style.display = 'flex';
        
        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
        inviteInput.value = inviteUrl;
        
        document.getElementById('btn-copy-invite')!.onclick = () => {
          navigator.clipboard.writeText(inviteUrl);
          document.getElementById('btn-copy-invite')!.innerText = 'COPIED!';
        };
      } else {
        loaderText.innerText = 'JOINING ROOM...';
      }
    } catch (e) {
      alert('Failed to connect: ' + e);
      loaderScreen.classList.remove('active');
      menuScreen.classList.add('active');
      return;
    }
  } else {
    // Training mode starts immediately
    loaderScreen.classList.remove('active');
    gameScreen.classList.add('active');
    window.presenter.start();
  }

  // Start time deduction interval ONLY if not training
  if (deductInterval) clearInterval(deductInterval);
  if (currentMode !== 'training') {
    deductInterval = window.setInterval(() => {
      userBalanceSeconds -= 60;
      if (userBalanceSeconds <= 0) {
        console.warn('Time limit reached! Grace period active.');
      }
    }, 60000);
  }
}

  // End Game Helpers

document.getElementById('btn-mode-training')!.addEventListener('click', () => startGame('training'));
document.getElementById('btn-mode-friend')!.addEventListener('click', () => startGame('friend'));
document.getElementById('btn-mode-random')!.addEventListener('click', () => startGame('random'));

document.getElementById('btn-return-menu')!.addEventListener('click', () => {
    if (deductInterval) clearInterval(deductInterval);
  
  gameOverScreen.classList.remove('active');
  menuScreen.classList.add('active');
  mobileControls.style.display = 'none'; // Ensure mobile controls are hidden on the menu
  
  // Update time UI
  const hrs = Math.floor(Math.max(0, userBalanceSeconds) / 3600);
  const mins = Math.floor((Math.max(0, userBalanceSeconds) % 3600) / 60);
  timeBalanceEl.innerText = `Time Left: ${hrs}h ${mins}m`;
  if (userBalanceSeconds <= 0) {
    timeBalanceEl.innerText += ' (Grace Period)';
    timeBalanceEl.style.color = '#FF4500';
  }
});

window.presenter.onGameOver = (winner: any, stats: any) => {
  gameScreen.classList.remove('active');
  mobileControls.style.display = 'none';
  gameOverScreen.classList.add('active');

  if (deductInterval) clearInterval(deductInterval);

  if (winner) {
    winnerText.innerText = `${winner.name} WINS!`;
    winnerText.style.color = winner.teamColor;
    
    // Add reward for winning
    userBalanceSeconds += 600; // +10 minutes
    document.getElementById('stat-reward')!.style.display = 'block';
  } else {
    winnerText.innerText = `DRAW!`;
    winnerText.style.color = '#fff';
    document.getElementById('stat-reward')!.style.display = 'none';
  }

  // Update Stats UI
  document.getElementById('stat-p1-dmg')!.innerText = `P1 Damage Dealt: ${stats.p1Dmg}`;
  document.getElementById('stat-p2-dmg')!.innerText = `P2 Damage Dealt: ${stats.p2Dmg}`;
};

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

// Override render method to connect View layer
window.presenter.render = () => {
  window.renderer.render(window.presenter.state);
  window.presenter.postRender();
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

