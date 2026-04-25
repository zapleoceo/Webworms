import './style.css';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';
import { APIClient } from './network/APIClient';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="game-wrapper">
    <h1 class="game-title">WebWorms</h1>
    
    <div id="auth-screen" class="screen active">
      <h2 class="retro-text blink" style="margin-bottom: 30px;">LOGIN</h2>
      <input type="email" id="auth-email" class="retro-input" placeholder="Email (Magic Link)">
      <input type="text" id="auth-username" class="retro-input" placeholder="Username">
      <button class="retro-btn" id="btn-login" style="margin-top: 20px;">ENTER THE ARENA</button>
    </div>

    <div id="main-menu" class="screen">
      <div id="time-balance" class="retro-text" style="color: #32CD32; margin-bottom: 20px; font-size: 1.2rem;">Time Left: 1h 0m</div>
      <div class="weapon-selection">
        <h3 class="retro-text" style="font-size: 1rem; margin-bottom: 5px;">Select Class:</h3>
        <select id="class-select" style="margin-bottom: 15px; padding: 5px; font-size: 1rem; font-family: Courier New;">
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
      <button class="retro-btn" id="btn-start-game">START GAME</button>
    </div>

    <div id="loader-screen" class="screen">
      <h2 class="retro-text blink">GENERATING WORLD...</h2>
    </div>

    <div id="game-container" class="screen">
      <canvas id="gameCanvas" width="800" height="600"></canvas>
    </div>
    
    <div id="game-over-screen" class="screen">
      <h2 class="game-title">GAME OVER</h2>
      <p id="winner-text" class="retro-text"></p>
      <button class="retro-btn" id="btn-return-menu">RETURN TO MENU</button>
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
`;


const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const presenter = new GamePresenter(canvas.width, canvas.height);

const renderer = new CanvasRenderer(canvas);
const inputHandler = new InputHandler(presenter, canvas);

// Screen Management
const authScreen = document.getElementById('auth-screen')!;
const menuScreen = document.getElementById('main-menu')!;
const loaderScreen = document.getElementById('loader-screen')!;
const gameScreen = document.getElementById('game-container')!;
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

document.getElementById('btn-start-game')!.addEventListener('click', async () => {
  // Gather selected weapons
  const checked = document.querySelectorAll('.weapon-cb:checked') as NodeListOf<HTMLInputElement>;
  const selectedWeapons = Array.from(checked).map(cb => cb.value);
  if (selectedWeapons.length === 0) selectedWeapons.push('bazooka'); // Fallback

  // Gather selected class
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

  // Start 1 minute time deduction interval
  if (deductInterval) clearInterval(deductInterval);
  deductInterval = window.setInterval(() => {
    userBalanceSeconds -= 60;
    if (userBalanceSeconds <= 0) {
      console.warn('Time limit reached! Grace period active.');
    }
  }, 60000);
});

// Assuming presenter has a way to notify on game over, but for now we'll just clear interval if we return to menu
// e.g. on return to menu:
// if (deductInterval) clearInterval(deductInterval);

document.getElementById('btn-return-menu')!.addEventListener('click', () => {
  if (deductInterval) clearInterval(deductInterval);
  
  gameOverScreen.classList.remove('active');
  menuScreen.classList.add('active');
  
  // Update time UI
  const hrs = Math.floor(Math.max(0, userBalanceSeconds) / 3600);
  const mins = Math.floor((Math.max(0, userBalanceSeconds) % 3600) / 60);
  timeBalanceEl.innerText = `Time Left: ${hrs}h ${mins}m`;
  if (userBalanceSeconds <= 0) {
    timeBalanceEl.innerText += ' (Grace Period)';
    timeBalanceEl.style.color = '#FF4500';
  }
});

presenter.onGameOver = (winner) => {
  gameScreen.classList.remove('active');
  mobileControls.style.display = 'none';
  gameOverScreen.classList.add('active');
  
  if (winner) {
    winnerText.textContent = `WINNER: ${winner.name} (+1 Point)`;
    winnerText.style.color = winner.teamColor;
  } else {
    winnerText.textContent = "DRAW - EVERYBODY DIED";
    winnerText.style.color = "white";
  }
};

// Function to handle canvas scaling for mobile
function resizeCanvas() {
  const wrapper = document.getElementById('game-wrapper');
  if (!wrapper) return;
  
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const gameRatio = 800 / 600;
  
  let newWidth, newHeight;
  
  // Leave some room for mobile controls if on portrait
  const isMobile = windowWidth < 768;
  const availableHeight = isMobile ? windowHeight - 150 : windowHeight;
  
  if (windowWidth / availableHeight < gameRatio) {
    newWidth = windowWidth;
    newHeight = windowWidth / gameRatio;
  } else {
    newHeight = availableHeight;
    newWidth = availableHeight * gameRatio;
  }
  
  const container = document.getElementById('game-container');
  if (container) {
    container.style.width = `${newWidth}px`;
    container.style.height = `${newHeight}px`;
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // initial call

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
    window.removeEventListener('resize', resizeCanvas);
  });
}

