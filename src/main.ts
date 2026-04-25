import './style.css';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="game-wrapper">
    <div id="game-container">
      <canvas id="gameCanvas" width="800" height="600"></canvas>
    </div>
    
    <div id="mobile-controls">
      <div class="d-pad">
        <button class="control-btn" id="btn-up">↑</button>
        <div class="horizontal">
          <button class="control-btn" id="btn-left">←</button>
          <button class="control-btn" id="btn-down">↓</button>
          <button class="control-btn" id="btn-right">→</button>
        </div>
      </div>
      <div class="action-pad">
        <button class="control-btn action-btn" id="btn-jump">Jump</button>
        <button class="control-btn action-btn fire-btn" id="btn-fire">Fire</button>
      </div>
    </div>
  </div>
`;

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const presenter = new GamePresenter(canvas.width, canvas.height);

const renderer = new CanvasRenderer(canvas);
const inputHandler = new InputHandler(presenter);

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
};

// Initialize and start game loop
presenter.init();
inputHandler.bind();
presenter.start();

// Make sure cleanup is done (useful if hot-reloading)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    presenter.stop();
    inputHandler.unbind();
    window.removeEventListener('resize', resizeCanvas);
  });
}

