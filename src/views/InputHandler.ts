import { GamePresenter } from '../presenters/GamePresenter';

export class InputHandler {
  private presenter: GamePresenter;
  private keyMap: { [key: string]: string } = {
    'ArrowLeft': 'left',
    'a': 'left',
    'A': 'left',
    'ArrowRight': 'right',
    'd': 'right',
    'D': 'right',
    'ArrowUp': 'up',
    'w': 'up',
    'W': 'up',
    'ArrowDown': 'down',
    's': 'down',
    'S': 'down',
    ' ': 'jump', // Space
    'Enter': 'fire',
    'f': 'fire',
    'F': 'fire',
  };

  constructor(presenter: GamePresenter) {
    this.presenter = presenter;
  }

  public bind(): void {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  public unbind(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const action = this.keyMap[event.key];
    if (action) {
      event.preventDefault(); // Prevent scrolling
      this.presenter.handleInput(action, true);
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const action = this.keyMap[event.key];
    if (action) {
      event.preventDefault();
      this.presenter.handleInput(action, false);
    }
  }
}
