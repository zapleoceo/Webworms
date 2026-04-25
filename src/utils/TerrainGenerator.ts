export class TerrainGenerator {
  public static generate(width: number, height: number): Uint8Array {
    const grid = new Uint8Array(width * height);
    
    // Materials:
    // 0 = Empty
    // 1 = Lunar Dirt
    // 2 = Meteorite Rock
    // 255 = Indestructible Alloy
    
    const setPixel = (x: number, y: number, mat: number) => {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        grid[y * width + x] = mat;
      }
    };

    const baseHeight = height * 0.7; // Lower 30% is solid ground
    const seed1 = Math.random() * 1000;
    const seed2 = Math.random() * 1000;
    const surface = new Float32Array(width);

    // Generate 1D surface profile
    for (let x = 0; x < width; x++) {
      let h = baseHeight;
      h -= Math.sin(x * 0.003 + seed1) * 200; // Big hills
      h -= Math.sin(x * 0.015 + seed2) * 50;  // Small bumps
      surface[x] = h;
    }

    // Fill grid
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 1. Unbreakable Borders (Sides and Bottom)
        if (x < 10 || x >= width - 10 || y >= height - 10) {
          setPixel(x, y, 255);
          continue;
        }

        const surfY = surface[x];

        // 2. Main Ground
        if (y >= surfY) {
          // Top layer is Lunar Dirt (1), deeper is Meteorite (2)
          const depth = y - surfY;
          const rockTransition = 30 + Math.sin(x * 0.05) * 15;
          if (depth > rockTransition) {
            setPixel(x, y, 2);
          } else {
            setPixel(x, y, 1);
          }
        } else {
          // 3. Floating Islands in the sky (fake 2D noise using trig)
          // Only generate islands in the top 50% of the map
          if (y < height * 0.5 && y > 50) {
            const nx = x * 0.02;
            const ny = y * 0.03;
            // Interference pattern
            const noise = Math.sin(nx) * Math.cos(ny) + Math.sin(nx * 0.5 + ny * 0.8);
            if (noise > 1.3) {
              setPixel(x, y, 1); // Lunar Dirt islands
            } else if (noise > 1.1) {
              // Occasional small meteorite chunks floating
              if (Math.random() < 0.05) {
                setPixel(x, y, 2);
              }
            }
          }
        }
      }
    }

    // 4. Structural Platform (Alien Base)
    // Scale it down based on actual width to not fill the whole sky on tiny test maps
    const platW = Math.min(300, width * 0.4);
    const platX = Math.floor(width / 2 - platW / 2);
    const platY = Math.floor(height * 0.4); // Floating in the middle
    
    for (let x = platX; x < platX + platW; x++) {
      for (let y = platY; y < platY + 15; y++) {
        setPixel(x, y, 255); // Unbreakable bridge
      }
    }
    // Support beams for the platform
    for (let y = platY + 15; y < height; y++) {
      if (y % 10 < 5) continue; // Truss pattern
      for (let x = platX + 20; x < platX + 40; x++) setPixel(x, y, 255);
      for (let x = platX + platW - 40; x < platX + platW - 20; x++) setPixel(x, y, 255);
    }

    return grid;
  }
}