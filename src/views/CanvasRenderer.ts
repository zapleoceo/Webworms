import { GameState } from '../models/GameState';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not supported');
    this.ctx = context;

    // Create an offscreen canvas for caching the landscape
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = canvas.width;
    this.terrainCanvas.height = canvas.height;
    const terrainContext = this.terrainCanvas.getContext('2d');
    if (!terrainContext) throw new Error('Offscreen canvas not supported');
    this.terrainCtx = terrainContext;
  }

  public render(state: GameState): void {
    this.clear();
    this.drawSky();
    this.drawLandscape(state);
    this.drawProjectiles(state);
    this.drawPlayers(state);
    this.drawExplosions(state);
    this.drawUI(state);
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawSky(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue
    gradient.addColorStop(1, '#E0F6FF'); // Lighter blue
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawLandscape(state: GameState): void {
    // 1. Only do a full redraw on initialization (or when needsUpdate is explicitly true)
    if (state.landscape.needsUpdate) {
      this.terrainCtx.clearRect(0, 0, this.terrainCanvas.width, this.terrainCanvas.height);
      this.terrainCtx.fillStyle = '#8B4513'; // Dirt brown
      
      // Draw columns
      for (let x = 0; x < state.landscape.width; x++) {
        let startY = -1;
        for (let y = 0; y < state.landscape.height; y++) {
          if (state.landscape.isSolid(x, y)) {
            if (startY === -1) startY = y;
          } else {
            if (startY !== -1) {
              this.terrainCtx.fillRect(x, startY, 1, y - startY);
              startY = -1;
            }
          }
        }
        if (startY !== -1) {
          this.terrainCtx.fillRect(x, startY, 1, state.landscape.height - startY);
        }
      }

      // Grass top layer
      this.terrainCtx.fillStyle = '#228B22'; // Forest green
      for (let x = 0; x < state.landscape.width; x++) {
        for (let y = 0; y < state.landscape.height; y++) {
          if (state.landscape.isSolid(x, y)) {
            this.terrainCtx.fillRect(x, y, 1, 3); // 3 pixel grass
            break;
          }
        }
      }
      
      state.landscape.needsUpdate = false;
    }

    // 2. Process new craters using ultra-fast 'destination-out' to punch holes
    if (state.landscape.newCraters.length > 0) {
      this.terrainCtx.globalCompositeOperation = 'destination-out';
      this.terrainCtx.fillStyle = 'black'; // Color doesn't matter for destination-out
      
      for (const crater of state.landscape.newCraters) {
        this.terrainCtx.beginPath();
        this.terrainCtx.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
        this.terrainCtx.fill();
      }
      
      this.terrainCtx.globalCompositeOperation = 'source-over'; // Restore
    }

    // Draw the cached landscape onto the main canvas (SUPER FAST)
    this.ctx.drawImage(this.terrainCanvas, 0, 0);
  }

  private drawPlayers(state: GameState): void {
    for (const player of state.players) {
      // Draw Worm Body
      this.ctx.fillStyle = '#FF69B4'; // Hot pink
      this.ctx.beginPath();
      this.ctx.arc(player.x, player.y, player.width / 2, 0, Math.PI * 2);
      this.ctx.fill();

      // Eyes
      this.ctx.fillStyle = 'white';
      const eyeOffset = player.facingRight ? 2 : -2;
      this.ctx.beginPath();
      this.ctx.arc(player.x + eyeOffset, player.y - 2, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.fillStyle = 'black';
      this.ctx.beginPath();
      this.ctx.arc(player.x + eyeOffset + 0.5, player.y - 2, 0.5, 0, Math.PI * 2);
      this.ctx.fill();

      // Health bar
      this.ctx.fillStyle = 'red';
      this.ctx.fillRect(player.x - 10, player.y - 15, 20, 3);
      this.ctx.fillStyle = '#32CD32'; // Lime green
      this.ctx.fillRect(player.x - 10, player.y - 15, 20 * (player.health / 100), 3);

      // Aiming Reticle (only for current player)
      if (player === state.getCurrentPlayer() && !player.isJumping) {
        const rad = player.aimAngle * (Math.PI / 180);
        const direction = player.facingRight ? 1 : -1;
        const targetX = player.x + Math.cos(rad) * 30 * direction;
        const targetY = player.y - Math.sin(rad) * 30;

        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(player.x, player.y);
        this.ctx.lineTo(targetX, targetY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Crosshair
        this.ctx.fillStyle = 'red';
        this.ctx.beginPath();
        this.ctx.arc(targetX, targetY, 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  private drawProjectiles(state: GameState): void {
    for (const proj of state.projectiles) {
      if (proj.active) {
        this.ctx.save();
        this.ctx.translate(proj.x, proj.y);
        
        // Calculate angle based on velocity vector
        const angle = Math.atan2(proj.vy, proj.vx);
        this.ctx.rotate(angle);
        
        // Draw retro rocket (facing right by default)
        this.ctx.fillStyle = '#808080'; // grey body
        this.ctx.fillRect(-6, -3, 12, 6);
        
        this.ctx.fillStyle = '#FF0000'; // red nose
        this.ctx.beginPath();
        this.ctx.moveTo(6, -3);
        this.ctx.lineTo(12, 0);
        this.ctx.lineTo(6, 3);
        this.ctx.fill();

        this.ctx.fillStyle = '#FF4500'; // red fins
        this.ctx.beginPath();
        this.ctx.moveTo(-6, -3);
        this.ctx.lineTo(-9, -6);
        this.ctx.lineTo(-2, -3);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.moveTo(-6, 3);
        this.ctx.lineTo(-9, 6);
        this.ctx.lineTo(-2, 3);
        this.ctx.fill();
        
        // Flicker exhaust flame
        if (Math.random() > 0.5) {
          this.ctx.fillStyle = '#FFA500';
          this.ctx.beginPath();
          this.ctx.moveTo(-6, -2);
          this.ctx.lineTo(-12 + Math.random() * -4, 0);
          this.ctx.lineTo(-6, 2);
          this.ctx.fill();
        }

        this.ctx.restore();
      }
    }
  }

  private drawExplosions(state: GameState): void {
    for (const exp of state.explosions) {
      this.ctx.save();
      this.ctx.translate(exp.x, exp.y);
      
      const progress = 1 - (exp.life / exp.maxLife);
      const alpha = exp.life / exp.maxLife;
      
      this.ctx.globalAlpha = alpha;
      
      // Outer red/orange
      this.ctx.fillStyle = '#FF4500';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, exp.radius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Inner yellow
      if (exp.radius > 5) {
        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, exp.radius * 0.7, 0, Math.PI * 2);
        this.ctx.fill();
      }
      
      // White core
      if (exp.radius > 10 && progress < 0.5) {
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, exp.radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    }
  }

  private drawUI(state: GameState): void {
    const player = state.getCurrentPlayer();
    if (!player) return;

    this.ctx.fillStyle = 'black';
    this.ctx.font = '16px "Comic Sans MS", Arial, sans-serif';
    this.ctx.textAlign = 'left';

    this.ctx.fillText(`Health: ${Math.round(player.health)}`, 10, 20);
    this.ctx.fillText(`Angle: ${Math.round(player.aimAngle)}°`, 10, 40);
    this.ctx.fillText(`Wind: ${Math.round(state.wind)}`, 10, 60);

    // Power Bar
    this.ctx.fillText('Power:', 10, 85);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(70, 70, 100, 15);
    
    // Gradient for power
    const grad = this.ctx.createLinearGradient(70, 70, 170, 70);
    grad.addColorStop(0, 'yellow');
    grad.addColorStop(0.5, 'orange');
    grad.addColorStop(1, 'red');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(70, 70, player.aimPower, 15);
  }
}
