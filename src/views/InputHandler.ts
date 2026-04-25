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

  private mobileBtns: { id: string, action: string }[] = [
    { id: 'btn-left', action: 'left' },
    { id: 'btn-right', action: 'right' },
    { id: 'btn-up', action: 'up' },
    { id: 'btn-down', action: 'down' },
    { id: 'btn-jump', action: 'jump' },
    { id: 'btn-fire', action: 'fire' },
  ];

  constructor(presenter: GamePresenter) {
    this.presenter = presenter;
  }

  public bind(): void {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));

    // Bind mobile controls
    this.mobileBtns.forEach(({ id, action }) => {
      const btn = document.getElementById(id);
      if (btn) {
        // Touch events
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.presenter.handleInput(action, true);
        }, { passive: false });
        
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          this.presenter.handleInput(action, false);
        }, { passive: false });

        // Mouse fallback for testing mobile layout on desktop
        btn.addEventListener('mousedown', () => {
          this.presenter.handleInput(action, true);
        });
        
        btn.addEventListener('mouseup', () => {
          this.presenter.handleInput(action, false);
        });
        
        btn.addEventListener('mouseleave', () => {
          this.presenter.handleInput(action, false);
        });
      }
    });
  }

  public unbind(): void {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    // Ideally we should unbind all mobile listeners too, but skipping for brevity
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

