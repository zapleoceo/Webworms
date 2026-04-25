export class Landscape {
  public width: number;
  public height: number;
  public grid: Uint8Array;
  public needsUpdate: boolean = true; // Flag for full renderer caching (init only)
  public newCraters: {x: number, y: number, r: number}[] = []; // Queue for fast erasure

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = new Uint8Array(width * height);
  }

  public getIndex(x: number, y: number): number {
    return Math.floor(y) * this.width + Math.floor(x);
  }

  public isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[this.getIndex(x, y)] === 1;
  }

  public setSolid(x: number, y: number, solid: boolean): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.grid[this.getIndex(x, y)] = solid ? 1 : 0;
  }

  public generateTerrain(): void {
    // Simple sine wave terrain
    for (let x = 0; x < this.width; x++) {
      const isBorder = x < 5 || x >= this.width - 5; // 5px unbreakable padding on sides
      const terrainHeight = this.height / 2 + Math.sin(x * 0.01) * 50 + Math.sin(x * 0.05) * 20;
      
      for (let y = 0; y < this.height; y++) {
        // y is 0 at top, height at bottom
        if (isBorder || y > terrainHeight) {
          this.setSolid(x, y, true);
        } else {
          this.setSolid(x, y, false);
        }
      }
    }
    this.needsUpdate = true;
  }

  public createCrater(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Do not destroy the unbreakable borders
        if (x < 5 || x >= this.width - 5 || y >= this.height - 5) continue;
        
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.setSolid(x, y, false);
        }
      }
    }
    // Instead of forcing a full redraw, just queue the crater for fast erasure
    this.newCraters.push({x: cx, y: cy, r: radius});
  }

  public getTopSolidY(x: number): number {
    const intX = Math.floor(x);
    for (let y = 0; y < this.height; y++) {
      if (this.isSolid(intX, y)) return y;
    }
    return this.height - 10;
  }

  public getSafeSpawn(existingPoints: {x: number, y: number}[], minDistance: number): {x: number, y: number} {
    let bestX = this.width / 2;
    let bestY = this.getTopSolidY(bestX);
    const maxAttempts = 50;

    for (let i = 0; i < maxAttempts; i++) {
      // Pick random X, keeping away from borders
      const testX = 50 + Math.random() * (this.width - 100);
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
