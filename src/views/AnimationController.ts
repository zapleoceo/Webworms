export interface SpriteConfig {
  src: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameRate?: number; // fps
  loop?: boolean;
}

export class AnimationController {
  private sprites: Map<string, HTMLCanvasElement> = new Map();
  private configs: Map<string, SpriteConfig> = new Map();

  constructor(configs: Record<string, SpriteConfig>) {
    for (const [key, conf] of Object.entries(configs)) {
      this.configs.set(key, conf);
      this.loadAndProcessSprite(key, conf.src);
    }
  }

  public setSpriteConfig(key: string, conf: SpriteConfig): void {
    this.configs.set(key, conf);
    this.loadAndProcessSprite(key, conf.src);
  }

  private loadAndProcessSprite(key: string, src: string) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = src;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (Math.abs(r - bgR) < 10 && Math.abs(g - bgG) < 10 && Math.abs(b - bgB) < 10) {
            data[i + 3] = 0;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        this.sprites.set(key, canvas);
      } catch {
        try {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          this.sprites.set(key, canvas);
        } catch {}
      }
    };
    img.onerror = () => {
      const conf = this.configs.get(key);
      const w = Math.max(1, conf?.frameWidth || 60);
      const h = Math.max(1, (conf?.frameHeight || 60) * Math.max(1, conf?.frameCount || 1));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, w, h);
      }
      this.sprites.set(key, canvas);
    };
  }

  public drawFrame(
    ctx: CanvasRenderingContext2D,
    animKey: string,
    frameIndex: number,
    x: number,
    y: number,
    scale: number = 1.0,
    flipX: boolean = false,
    offsetY: number = 0
  ) {
    const canvas = this.sprites.get(animKey);
    const conf = this.configs.get(animKey);

    if (!canvas || !conf) {
      // If sprite is not fully loaded yet or invalid, try to fall back to 'idle'
      if (animKey !== 'idle') {
        this.drawFrame(ctx, 'idle', 0, x, y, scale, flipX, offsetY);
      }
      return;
    }

    // Clamp frame
    const safeFrame = Math.max(0, Math.min(frameIndex, conf.frameCount - 1));

    const sx = 0;
    const sy = safeFrame * conf.frameHeight;
    const sw = conf.frameWidth;
    const sh = conf.frameHeight;

    const dw = sw * scale;
    const dh = sh * scale;

    ctx.save();
    ctx.translate(x, y);
    if (flipX) {
      ctx.scale(-1, 1);
    }
    
    // Draw centered on the bottom point (so feet touch the ground). Add custom offsetY.
    ctx.drawImage(canvas, sx, sy, sw, sh, -dw / 2, -dh + offsetY, dw, dh);
    ctx.restore();
  }

  public getAnimLength(animKey: string): number {
    return this.configs.get(animKey)?.frameCount || 1;
  }
}
