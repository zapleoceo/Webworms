export class Landscape {
  public width: number;
  public height: number;
  public grid: Uint8Array;
  public needsUpdate: boolean = true; // Flag for renderer caching

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
      const terrainHeight = this.height / 2 + Math.sin(x * 0.01) * 50 + Math.sin(x * 0.05) * 20;
      for (let y = 0; y < this.height; y++) {
        // y is 0 at top, height at bottom
        if (y > terrainHeight) {
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
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.setSolid(x, y, false);
        }
      }
    }
    this.needsUpdate = true;
  }
}
