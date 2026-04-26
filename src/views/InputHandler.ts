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
    'Shift': 'switch',
  };

  private mobileBtns: { id: string, action: string }[];

  private isDraggingCamera: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  
  private initialPinchDistance: number | null = null;

  
  private canvas: HTMLCanvasElement;

  constructor(presenter: GamePresenter, canvas: HTMLCanvasElement, mobileBtns: { id: string, action: string }[]) {
    this.presenter = presenter;
    this.canvas = canvas;
    this.mobileBtns = mobileBtns;
    this.bind();
  }

  public bind(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Camera panning and zooming events
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    
    // Prevent double firing if both touch and mouse happen
    this.canvas.addEventListener('touchstart', this.handlePointerDown.bind(this), { passive: false });
    window.addEventListener('touchmove', this.handlePointerMove.bind(this), { passive: false });
    window.addEventListener('touchend', this.handlePointerUp.bind(this));

    // Mobile controls (using pointer events to support multi-touch and prevent defaults)
    this.mobileBtns.forEach(btn => {
      const el = document.getElementById(btn.id);
      if (el) {
        el.addEventListener('pointerdown', (e) => this.onPointerDown(e, btn.action));
        el.addEventListener('pointerup', (e) => this.onPointerUp(e, btn.action));
        el.addEventListener('pointerleave', (e) => this.onPointerUp(e, btn.action)); // handle finger sliding off
      }
    });
  }

  public unbind(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    this.mobileBtns.forEach(btn => {
      const el = document.getElementById(btn.id);
      if (el) {
        el.removeEventListener('pointerdown', (e) => this.onPointerDown(e as PointerEvent, btn.action));
        el.removeEventListener('pointerup', (e) => this.onPointerUp(e as PointerEvent, btn.action));
        el.removeEventListener('pointerleave', (e) => this.onPointerUp(e as PointerEvent, btn.action));
      }
    });
  }

  private onPointerDown = (e: Event, action: string) => {
    e.preventDefault(); // Prevent zoom/scroll
    this.presenter.handleInput(action, true);
  };

  private onPointerUp = (e: Event, action: string) => {
    e.preventDefault();
    this.presenter.handleInput(action, false);
  };

  private activeKeys = new Set<string>();

  private handleKeyDown = (event: KeyboardEvent): void => {
    const action = this.keyMap[event.key];
    if (action) {
      if (action !== 'fire') event.preventDefault(); // allow default space/enter if needed elsewhere? No, prevent scrolling.
      if (this.activeKeys.has(event.code)) return;
      this.activeKeys.add(event.code);
      this.presenter.handleInput(action, true);
    }
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    const action = this.keyMap[event.key];
    if (action) {
      event.preventDefault();
      this.activeKeys.delete(event.code);
      this.presenter.handleInput(action, false);
    }
  }

  private getLocalCoordinates(clientX: number, clientY: number): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  private handlePointerDown(event: MouseEvent | TouchEvent): void {
    if ('touches' in event && event.touches.length === 2) {
      // Pinch to zoom start
      this.isDraggingCamera = false;
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      return;
    }

    this.isDraggingCamera = true;
    let clientX, clientY;
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = (event as MouseEvent).clientX;
      clientY = (event as MouseEvent).clientY;
    }
    const local = this.getLocalCoordinates(clientX, clientY);
    this.lastMouseX = local.x;
    this.lastMouseY = local.y;
  }

  private handlePointerMove(event: MouseEvent | TouchEvent): void {
    if ('touches' in event && event.touches.length === 2) {
      if (this.initialPinchDistance !== null) {
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pinchDelta = dist - this.initialPinchDistance;

        const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

        const local = this.getLocalCoordinates(centerX, centerY);

        // Pass negative delta because pinch out = positive delta = zoom in
        this.presenter.changeZoom(-pinchDelta * 0.05, this.canvas.width, this.canvas.height, local.x, local.y);
        this.initialPinchDistance = dist;
      }
      return;
    }

    if (!this.isDraggingCamera) return;

    let clientX, clientY;
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = (event as MouseEvent).clientX;
      clientY = (event as MouseEvent).clientY;
    }

    const local = this.getLocalCoordinates(clientX, clientY);
    const dx = local.x - this.lastMouseX;
    const dy = local.y - this.lastMouseY;

    // Move camera based on scaled pixels
    this.presenter.moveCamera(dx, dy, this.canvas.width, this.canvas.height);

    this.lastMouseX = local.x;
    this.lastMouseY = local.y;
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

    const local = this.getLocalCoordinates(event.clientX, event.clientY);

    this.presenter.changeZoom(zoomDelta, local.x, local.y, this.canvas.width, this.canvas.height);
  }
}

