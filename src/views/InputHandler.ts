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

  private isDraggingCamera: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  
  private initialPinchDistance: number | null = null;
  private initialZoom: number = 1;
  
  private canvas: HTMLCanvasElement;

  constructor(presenter: GamePresenter, canvas: HTMLCanvasElement) {
    this.presenter = presenter;
    this.canvas = canvas;
  }

  public bind(): void {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));

    // Camera panning and zooming events
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    this.canvas.addEventListener('mousedown', this.handlePointerDown.bind(this));
    window.addEventListener('mousemove', this.handlePointerMove.bind(this));
    window.addEventListener('mouseup', this.handlePointerUp.bind(this));
    
    this.canvas.addEventListener('touchstart', this.handlePointerDown.bind(this), { passive: false });
    window.addEventListener('touchmove', this.handlePointerMove.bind(this), { passive: false });
    window.addEventListener('touchend', this.handlePointerUp.bind(this));

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

  private handlePointerDown(event: MouseEvent | TouchEvent): void {
    if ('touches' in event && event.touches.length === 2) {
      // Pinch to zoom start
      this.isDraggingCamera = false;
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      this.initialZoom = this.presenter.state.zoom;
      return;
    }

    this.isDraggingCamera = true;
    if ('touches' in event) {
      this.lastMouseX = event.touches[0].clientX;
      this.lastMouseY = event.touches[0].clientY;
    } else {
      this.lastMouseX = (event as MouseEvent).clientX;
      this.lastMouseY = (event as MouseEvent).clientY;
    }
  }

  private handlePointerMove(event: MouseEvent | TouchEvent): void {
    if ('touches' in event && event.touches.length === 2) {
      if (this.initialPinchDistance) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = dist / this.initialPinchDistance;
        
        const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        
        // Use getBoundingClientRect to get proper local canvas coordinates
        const rect = this.canvas.getBoundingClientRect();
        const localX = centerX - rect.left;
        const localY = centerY - rect.top;

        this.presenter.setZoom(this.initialZoom * ratio, localX, localY, this.canvas.width, this.canvas.height);
      }
      return;
    }

    if (!this.isDraggingCamera) return;

    let currentX, currentY;
    if ('touches' in event) {
      currentX = event.touches[0].clientX;
      currentY = event.touches[0].clientY;
    } else {
      currentX = (event as MouseEvent).clientX;
      currentY = (event as MouseEvent).clientY;
    }

    const dx = currentX - this.lastMouseX;
    const dy = currentY - this.lastMouseY;

    // Move camera based on physical pixels (you might want to scale this if canvas is scaled)
    this.presenter.moveCamera(dx, dy, this.canvas.width, this.canvas.height);

    this.lastMouseX = currentX;
    this.lastMouseY = currentY;
  }

  private handlePointerUp(event: MouseEvent | TouchEvent): void {
    if ('touches' in event && event.touches.length < 2) {
      this.initialPinchDistance = null;
    }
    this.isDraggingCamera = false;
  }

  private handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
    
    const rect = this.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    this.presenter.changeZoom(zoomDelta, localX, localY, this.canvas.width, this.canvas.height);
  }
}

