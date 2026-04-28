import { Random } from '../utils/Random';

export class Landscape {
  public width: number;
  public height: number;
  public grid: Uint8Array;
  public pixelData?: Uint8ClampedArray; // Original image colors
  public needsUpdate: boolean = true; // Flag for full renderer caching (init only)
  public newCraters: {x: number, y: number, r: number}[] = []; // Queue for fast erasure
  public syncCraters: {x: number, y: number, r: number}[] = []; // Used to sync craters exactly once per network tick
  public newStamps: { imgKey: string; x: number; y: number; w: number; h: number; angle: number }[] = []; // Queue for stamping images

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = new Uint8Array(width * height);
  }

  public getIndex(x: number, y: number): number {
    return Math.floor(y) * this.width + Math.floor(x);
  }

  public getMaterial(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 255;
    return this.grid[y * this.width + x];
  }

  public setMaterial(x: number, y: number, material: number): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[y * this.width + x] = material;
      this.needsUpdate = true;
    }
  }

  public isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
    return this.grid[y * this.width + x] > 0;
  }

  // Backwards compatibility for tests
  public setSolid(x: number, y: number, solid: boolean): void {
    this.setMaterial(x, y, solid ? 1 : 0);
  }

  public async generateFromImage(imageUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        // Adjust landscape size to image size
        this.width = img.width;
        this.height = img.height;
        this.grid = new Uint8Array(this.width * this.height);

        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        if (!ctx) {
          reject(new Error("Cannot get 2d context"));
          return;
        }
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, this.width, this.height).data;
        
        // Store a copy of original colors for rendering
        this.pixelData = new Uint8ClampedArray(imageData);

        // Build physics grid
        // Format: [R, G, B, A, R, G, B, A, ...]
        for (let i = 0; i < imageData.length; i += 4) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const alpha = imageData[i + 3];
          const pixelIndex = i / 4;
          
          // Treat transparent pixels OR black background pixels as AIR
          if (alpha < 10 || (r < 10 && g < 10 && b < 10)) {
            this.grid[pixelIndex] = 0; // Air
            // Also force it to be visually transparent so the game background shows through
            if (this.pixelData) {
              this.pixelData[i + 3] = 0;
            }
          } else {
            // Everything else is fully destructible earth
            this.grid[pixelIndex] = 1;
          }
        }
        
        // Ensure boundaries are solid (optional, but good for gameplay)
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            if (x < 10 || x >= this.width - 10 || y >= this.height - 10) {
               this.grid[y * this.width + x] = 255;
            }
          }
        }

        this.needsUpdate = true;
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load map image: ${imageUrl}`));
      img.src = imageUrl;
    });
  }

  public createCrater(cx: number, cy: number, radius: number): void {
    // Use slightly larger radius (+1.5) to clear out single-pixel artifacts (debris)
    const effectiveRadius = radius + 1.5;
    const r2 = effectiveRadius * effectiveRadius;
    const minX = Math.max(0, Math.floor(cx - effectiveRadius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + effectiveRadius));
    const minY = Math.max(0, Math.floor(cy - effectiveRadius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + effectiveRadius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Do not destroy the unbreakable borders (now 30px thick)
        if (x < 30 || x >= this.width - 30 || y >= this.height - 30) continue;
        // Do not destroy indestructible alloy (255) anywhere
        if (this.getMaterial(x, y) === 255) continue;
        
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.grid[y * this.width + x] = 0; // Fast erase without full map update
        }
      }
    }
    // Inform renderer with original radius for visual effects, 
    // physics clears a slightly larger area to guarantee no invisible solid pixels
    this.newCraters.push({x: cx, y: cy, r: radius});
    this.syncCraters.push({x: cx, y: cy, r: radius});
  }

  public stampImage(imgKey: string, cx: number, cy: number, w: number, h: number, angle: number = 0): void {
    // Add to stamp queue for the renderer to process into the grid and offscreen canvas
    this.newStamps.push({ imgKey, x: Math.floor(cx), y: Math.floor(cy), w: Math.floor(w), h: Math.floor(h), angle });
  }

  public getTopSolidY(x: number): number {
    const intX = Math.floor(x);
    for (let y = 0; y < this.height; y++) {
      if (this.isSolid(intX, y)) return y;
    }
    return this.height - 10;
  }

  public getSafeSpawn(existingPoints: {x: number, y: number}[], minDistance: number, seed?: number): {x: number, y: number} {
    let bestX = this.width / 2;
    let bestY = this.getTopSolidY(bestX);
    const maxAttempts = 50;

    const random = seed !== undefined ? (() => Random.next()) : Math.random;

    for (let i = 0; i < maxAttempts; i++) {
      // Pick random X, keeping away from borders
      const testX = 50 + random() * (this.width - 100);
      const testY = this.getTopSolidY(testX);

      let tooClose = false;
      for (const p of existingPoints) {
        const dx = p.x - testX;
        const dy = p.y - testY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        return { x: testX, y: testY };
      }
    }
    // Fallback
    return { x: bestX, y: bestY };
  }
}
