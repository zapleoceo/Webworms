import { TerrainGenerator } from '../utils/TerrainGenerator';

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

  public getMaterial(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.grid[this.getIndex(x, y)];
  }

  public isSolid(x: number, y: number): boolean {
    return this.getMaterial(x, y) > 0;
  }

  public setMaterial(x: number, y: number, mat: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.grid[this.getIndex(x, y)] = mat;
  }

  // Backwards compatibility for tests
  public setSolid(x: number, y: number, solid: boolean): void {
    this.setMaterial(x, y, solid ? 1 : 0);
  }

  public generateTerrain(): void {
    this.grid = TerrainGenerator.generate(this.width, this.height);
    this.needsUpdate = true;
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
          this.setMaterial(x, y, 0); // Completely remove material
        }
      }
    }
    // Inform renderer with original radius for visual effects, 
    // physics clears a slightly larger area to guarantee no invisible solid pixels
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
