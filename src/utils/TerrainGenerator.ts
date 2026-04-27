export class TerrainGenerator {
  public static generate(width: number, height: number): Uint8Array {
    const grid = new Uint8Array(width * height);
    
    // Materials:
    // 0 = Empty
    // 1 = Lunar Dirt
    // 2 = Meteorite Rock
    // 4 = Metal Platform (Destructible but strong)
    // 255 = Indestructible Alloy
    
    const setPixel = (x: number, y: number, mat: number) => {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        grid[y * width + x] = mat;
      }
    };

    const baseHeight = height * 0.6; // Lower 40% is solid ground base
    const seed1 = Math.random() * 1000;
    const seed2 = Math.random() * 1000;
    const seed3 = Math.random() * 1000;
    const surface = new Float32Array(width);

    // Generate 1D surface profile with smoother Worms-like hills
    for (let x = 0; x < width; x++) {
      let h = baseHeight;
      // Combine multiple low-frequency sine waves for organic rolling hills
      h -= Math.sin(x * 0.002 + seed1) * 250; // Main large hills
      h -= Math.sin(x * 0.007 + seed2) * 100; // Medium bumps
      h -= Math.sin(x * 0.025 + seed3) * 20;  // Small details
      surface[x] = h;
    }

    // Generate noise map for caves and overhangs
    const caveMap = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        // 2D Perlin-like noise using sine interference
        const nx = x * 0.015;
        const ny = y * 0.015;
        const noise = Math.sin(nx + seed1) * Math.cos(ny + seed2) + Math.sin(nx * 0.7 - ny * 0.8 + seed3);
        
        // Scale noise block to 4x4 pixels to save generation time
        const isCave = noise > 0.8;
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 4; dx++) {
            if (y + dy < height && x + dx < width) {
              caveMap[(y + dy) * width + (x + dx)] = isCave ? 1 : 0;
            }
          }
        }
      }
    }

    // Fill grid
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 1. Unbreakable Borders (Sides and Bottom)
        // Make the border thinner so it doesn't look ugly
        if (x < 10 || x >= width - 10 || y >= height - 15) {
          setPixel(x, y, 255);
          continue;
        }

        const surfY = surface[x];

        // 2. Main Ground
        if (y >= surfY) {
          // Check for caves (hollow out the ground)
          if (caveMap[y * width + x] === 1 && y < height - 100) {
            continue; // Leave empty
          }

          // Top layer is Dirt (1), deeper is Rock (2)
          const depth = y - surfY;
          const rockTransition = 40 + Math.sin(x * 0.05) * 20;
          if (depth > rockTransition) {
            setPixel(x, y, 2);
          } else {
            setPixel(x, y, 1);
          }
        } else {
          // 3. Floating Islands in the sky (fake 2D noise using trig)
          // Only generate islands in the top 40% of the map
          if (y < height * 0.4 && y > 50) {
            const nx = x * 0.015;
            const ny = y * 0.02;
            // Interference pattern
            const noise = Math.sin(nx + seed2) * Math.cos(ny + seed1) + Math.sin(nx * 0.5 + ny * 0.8 + seed3);
            if (noise > 1.4) {
              setPixel(x, y, 1); // Dirt islands
            } else if (noise > 1.2) {
              // Occasional small meteorite chunks floating
              if (Math.random() < 0.02) {
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
        setPixel(x, y, 4); // Metal Platform (Destructible)
      }
    }
    // Support beams for the platform
    for (let y = platY + 15; y < height; y++) {
      if (y % 10 < 5) continue; // Truss pattern
      for (let x = platX + 20; x < platX + 40; x++) setPixel(x, y, 4);
      for (let x = platX + platW - 40; x < platX + platW - 20; x++) setPixel(x, y, 4);
    }

    return grid;
  }
}