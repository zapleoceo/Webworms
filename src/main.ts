import './style.css';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';
import { APIClient } from './network/APIClient';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="game-wrapper">
    <div id="auth-screen" class="screen active">
      <div class="logo-container">
        <img src="https://pngimg.com/uploads/worms_game/worms_game_PNG52123.png" alt="Worms Logo" class="game-logo-img">
        <h1 class="game-title">WebWorms</h1>
      </div>
      <h2 class="retro-text blink" style="margin-bottom: 30px;">LOGIN</h2>
      <input type="email" id="auth-email" class="retro-input" placeholder="Email (Magic Link)">
      <input type="text" id="auth-username" class="retro-input" placeholder="Username">
      <button class="retro-btn" id="btn-login" style="margin-top: 20px;">ENTER THE ARENA</button>
    </div>

    <div id="main-menu" class="screen">
      <div class="logo-container">
        <h1 class="game-title" style="font-size: 2.5rem; margin-top: 10px;">WebWorms</h1>
      </div>
      <div id="time-balance" class="retro-text" style="color: #32CD32; margin-bottom: 20px; font-size: 1.2rem;">Time Left: 1h 0m</div>
      <div class="weapon-selection">
        <h3 class="retro-text" style="font-size: 1rem; margin-bottom: 5px;">Select Class:</h3>
        <select id="class-select" style="margin-bottom: 15px; padding: 5px; font-size: 1rem; font-family: Courier New; width: 100%; box-sizing: border-box;">
          <option value="soldier">Soldier (Balanced)</option>
          <option value="heavy">Heavy (Tank)</option>
          <option value="scout">Scout (Fast)</option>
        </select>

        <h3 class="retro-text" style="font-size: 1rem; margin-bottom: 10px;">Select 2 Weapons:</h3>
        <label><input type="checkbox" class="weapon-cb" value="bazooka" checked> Bazooka (2.0s)</label>
        <label><input type="checkbox" class="weapon-cb" value="blaster" checked> Plasma (1.5s)</label>
        <label><input type="checkbox" class="weapon-cb" value="shotgun"> Shotgun (2.5s)</label>
        <label><input type="checkbox" class="weapon-cb" value="sniper"> Railgun (4.0s)</label>
      </div>

      <div class="game-modes-panel">
        <button class="mode-btn" id="btn-mode-training">Training (Free)</button>
        <button class="mode-btn" id="btn-mode-friend">Play with Friend</button>
        <button class="mode-btn" id="btn-mode-random" disabled>Random Match (Soon)</button>
      </div>
    </div>

    <div id="loader-screen" class="screen">
      <h2 class="retro-text blink">GENERATING WORLD...</h2>
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
            <button class="control-btn action-btn switch-btn" id="btn-switch">Switch</button>
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


const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const presenter = new GamePresenter(canvas.width, canvas.height);

const renderer = new CanvasRenderer(canvas);
const inputHandler = new InputHandler(presenter, canvas);

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
let deductInterval: number | null = null;

// Auth Flow
document.getElementById('btn-login')!.addEventListener('click', async () => {
  const email = (document.getElementById('auth-email') as HTMLInputElement).value;
  const username = (document.getElementById('auth-username') as HTMLInputElement).value;
  
  if (!email || !username) {
    alert('Please enter both email and username!');
    return;
  }
  
  const btn = document.getElementById('btn-login') as HTMLButtonElement;
  btn.innerText = 'CONNECTING...';
  btn.disabled = true;

  // Check URL for referral
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref') || undefined;

  try {
    const res = await APIClient.register(email, username, ref);
    if (res.success) {
      userSessionId = res.user.id;
      console.log('Session ID:', userSessionId); // Use variable
      // In a real app, balance would come from the API
      userBalanceSeconds = 3600; 
      
      authScreen.classList.remove('active');
      menuScreen.classList.add('active');
    } else {
      alert('Login failed: ' + (res.error || 'Unknown error'));
      btn.innerText = 'ENTER THE ARENA';
      btn.disabled = false;
    }
  } catch (e) {
    alert('Network error during login');
    btn.innerText = 'ENTER THE ARENA';
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

// Start Game Helpers
async function startGame(mode: 'training' | 'friend' | 'random') {
  currentMode = mode;
  
  const checked = document.querySelectorAll('.weapon-cb:checked') as NodeListOf<HTMLInputElement>;
  const selectedWeapons = Array.from(checked).map(cb => cb.value);
  if (selectedWeapons.length === 0) selectedWeapons.push('bazooka'); // Fallback

  const classSelect = document.getElementById('class-select') as HTMLSelectElement;
  const unitClass = classSelect.value as 'soldier' | 'heavy' | 'scout';

  menuScreen.classList.remove('active');
  loaderScreen.classList.add('active');
  
  // Allow UI to paint the loader
  await new Promise(resolve => setTimeout(resolve, 50));
  
  presenter.reset(selectedWeapons, unitClass);
  
  loaderScreen.classList.remove('active');
  gameScreen.classList.add('active');
  
  // Show controls on mobile
  if (window.innerWidth <= 768) {
    mobileControls.style.display = 'flex';
  }
  
  presenter.start();

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

document.getElementById('btn-mode-training')!.addEventListener('click', () => startGame('training'));
document.getElementById('btn-mode-friend')!.addEventListener('click', () => startGame('friend'));
document.getElementById('btn-mode-random')!.addEventListener('click', () => startGame('random'));

// Assuming presenter has a way to notify on game over, but for now we'll just clear interval if we return to menu
// e.g. on return to menu:
// if (deductInterval) clearInterval(deductInterval);

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

presenter.onGameOver = (winner, stats) => {
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

// Remove old resizeCanvas as CSS handles aspect ratio now.
// Add orientation check if needed.

// Override render method to connect View layer
presenter.render = () => {
  renderer.render(presenter.state);
  presenter.postRender();
};

// Initialize and bind
inputHandler.bind();

// Initial draw for background before start
renderer.render(presenter.state);

// Make sure cleanup is done (useful if hot-reloading)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    presenter.stop();
    inputHandler.unbind();
  });
}

