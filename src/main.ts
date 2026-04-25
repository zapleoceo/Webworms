import './style.css';
import { GamePresenter } from './presenters/GamePresenter';
import { CanvasRenderer } from './views/CanvasRenderer';
import { InputHandler } from './views/InputHandler';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="game-container">
    <canvas id="gameCanvas" width="800" height="600"></canvas>
  </div>
`;

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const presenter = new GamePresenter(canvas.width, canvas.height);

const renderer = new CanvasRenderer(canvas);
const inputHandler = new InputHandler(presenter);

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
  });
}
