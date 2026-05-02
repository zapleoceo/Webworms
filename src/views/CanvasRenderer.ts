import { GameState } from '../models/GameState';
import { AnimationController } from './AnimationController';
import { getEquipmentDefinition } from '../equipment/EquipmentRegistry';
import { buildPerimeterContactPointsFromAlpha } from '../physics/AirdropContour';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private alloyCanvas: HTMLCanvasElement;
  private alloyCtx: CanvasRenderingContext2D;
  private animCtrl: AnimationController;
  
  private wormImages: { [key: string]: HTMLImageElement } = {};
  private logoSupportCache: Map<string, Array<{ x: number; y: number }>> = new Map();

  private loadImg(src: string): HTMLImageElement {
    const img = new Image();
    img.src = src;
    img.onerror = () => console.warn(`Failed to load image: ${src}`);
    return img;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    // Create an offscreen canvas for caching the landscape
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = canvas.width;
    this.terrainCanvas.height = canvas.height;
    const terrainContext = this.terrainCanvas.getContext('2d');
    if (!terrainContext) throw new Error('Offscreen canvas not supported');
    this.terrainCtx = terrainContext;

    this.alloyCanvas = document.createElement('canvas');
    this.alloyCanvas.width = canvas.width;
    this.alloyCanvas.height = canvas.height;
    const alloyContext = this.alloyCanvas.getContext('2d');
    if (!alloyContext) throw new Error('Offscreen canvas not supported');
    this.alloyCtx = alloyContext;

    // Init Animations
    this.animCtrl = new AnimationController({
      'walk': { src: '/sprites/Worms/wwalk.png', frameWidth: 60, frameHeight: 60, frameCount: 15 },
      'jump': { src: '/sprites/Worms/wjump.png', frameWidth: 60, frameHeight: 60, frameCount: 10 },
      'backflip': { src: '/sprites/Worms/wkamjmp.png', frameWidth: 60, frameHeight: 60, frameCount: 10 }, // approximation
      'idle': { src: '/sprites/Worms/wbrth1.png', frameWidth: 60, frameHeight: 60, frameCount: 15 }, // breathing
      'grave': { src: '/sprites/Misc/grave1.png', frameWidth: 60, frameHeight: 60, frameCount: 20 }, // Grave
    });

    // Load brand assets for airdrops
    this.wormImages['brand_apple'] = this.loadImg('/brand_apple.svg?v=3');
    this.wormImages['brand_windows'] = this.loadImg('/brand_windows.svg?v=3');
    this.wormImages['brand_android'] = this.loadImg('/brand_android.svg?v=3');
    for (let i = 1; i <= 6; i++) {
      const src = `/sprites/Misc/grave${i}.png`;
      this.wormImages[src] = this.loadImg(src);
    }

    for (let row = 1; row <= 11; row++) {
      for (let col = 0; col <= 7; col++) {
        this.getCustomFrame(this.framePath(row, col));
      }
    }
  }

  private customFrameCache: { [key: string]: HTMLImageElement } = {};

  private getCustomFrame(src: string): HTMLImageElement {
    if (this.customFrameCache[src]) return this.customFrameCache[src];
    const img = new Image();
    img.src = src;
    img.onerror = () => console.warn(`Failed to load image: ${src}`);
    this.customFrameCache[src] = img;
    return img;
  }

  private weaponRowById(id: string): number | null {
    switch (id) {
      case 'bazooka': return 1;
      case 'shotgun': return 2;
      case 'minigun': return 3;
      case 'homing_missile': return 4;
      case 'heavy_gun': return 5;
      case 'handgun': return 6;
      case 'grenade': return 7;
      case 'plasma_gun': return 8;
      case 'flamethrower': return 9;
      case 'ninja_rope': return 10;
      default: return null;
    }
  }

  private framePath(row: number, col: number): string {
    return `/sprites/custom_weapons/frames/row${row}_col${col}.png`;
  }

  private isImgReady(img: HTMLImageElement): boolean {
    return img.complete && img.naturalWidth !== 0;
  }

  private projectileSpriteForWeaponId(weaponId: string): string | null {
    if (weaponId === 'bazooka') return this.framePath(1, 2);
    if (weaponId === 'homing_missile') return this.framePath(4, 3);
    if (weaponId === 'grenade') return this.framePath(7, 3);
    return null;
  }

  private trailSpritesForWeaponId(weaponId: string): string[] {
    if (weaponId === 'bazooka') return [this.framePath(1, 3), this.framePath(1, 4), this.framePath(1, 5)];
    if (weaponId === 'homing_missile') return [this.framePath(4, 4), this.framePath(4, 5)];
    if (weaponId === 'grenade') return [this.framePath(7, 5)];
    return [];
  }

  private explosionSpriteForWeaponId(weaponId: string, maxRadius: number): string | null {
    if (weaponId === 'bazooka') return this.framePath(1, 6);
    if (weaponId === 'homing_missile') return this.framePath(4, 6);
    if (weaponId === 'grenade') return maxRadius >= 46 ? this.framePath(7, 7) : this.framePath(7, 6);
    if (weaponId === 'shotgun') return this.framePath(2, 5);
    if (weaponId === 'minigun') return this.framePath(3, 6);
    if (weaponId === 'heavy_gun') return this.framePath(5, 6);
    if (weaponId === 'handgun') return this.framePath(6, 4);
    if (weaponId === 'plasma_gun') return this.framePath(8, 7);
    if (weaponId === 'flamethrower') return maxRadius >= 18 ? this.framePath(9, 5) : this.framePath(9, 4);
    return null;
  }

  public render(state: GameState): void {
    this.clear();

    // Apply camera translation and zoom
    this.ctx.save();
    this.ctx.scale(state.zoom, state.zoom);
    this.ctx.translate(-state.cameraX, -state.cameraY);

    this.drawSky(state);
    this.drawLandscape(state);
    this.drawBrandLogos(state);
    this.drawProps(state);
    this.drawProjectiles(state);
    // this.drawSnowflakes(state);
    this.drawPlayers(state);
    this.drawFloatingTexts(state);
    this.drawExplosions(state);
    this.drawParticles(state);

    this.ctx.restore(); // Restore camera so UI is drawn fixed to screen

    this.drawOffscreenPointers(state);
    this.drawUI(state);
  }

  public getWormThumbnail(player: any, size: number = 60): string {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.clearRect(0, 0, size, size);

    const scale = 2.0;
    const offsetUp = size * 0.2;

    let animKey = 'idle';
    let frameIndex = 0;
    let flipX = !!player?.facingRight;
    let offsetY = 24;

    if (!player || player.health <= 0) {
      animKey = 'grave';
      frameIndex = 0;
      flipX = false;
      offsetY = 0;
    } else {
      const equipmentId = player.getCurrentEquipmentId?.() || 'bazooka';
      if (equipmentId === 'ninja_rope') {
        animKey = 'idle';
        frameIndex = 0;
        offsetY = 24;
      } else {
        const equip = getEquipmentDefinition(equipmentId);
        animKey = equip?.aimAnimKey || 'bazooka';
        frameIndex = 15;
        offsetY = 24;
      }
    }

    this.animCtrl.drawFrame(ctx, animKey, frameIndex, size / 2, size - offsetY - offsetUp, scale, flipX, offsetY);
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;
    const bgR = data[0], bgG = data[1], bgB = data[2];
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - bgR) < 10 && Math.abs(data[i + 1] - bgG) < 10 && Math.abs(data[i + 2] - bgB) < 10) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  private drawBrandLogos(state: GameState): void {
    if (!state.brandLogos) return;
    for (const logo of state.brandLogos) {
      let img = this.wormImages[logo.sprite];
      if (!img) {
        img = new Image();
        img.src = logo.sprite;
        this.wormImages[logo.sprite] = img;
      }
      let crop: { x: number; y: number; w: number; h: number } | undefined;
      if (img.complete && img.naturalWidth !== 0) {
        const isGrave = logo.sprite.indexOf('/grave') !== -1;
        let bounds: { x: number; y: number; w: number; h: number } | null = null;
        if (isGrave && img.naturalHeight > img.naturalWidth * 2) {
          const frames = Math.max(1, Math.min(32, Math.round(img.naturalHeight / Math.max(1, img.naturalWidth))));
          const frameH = Math.max(1, Math.floor(img.naturalHeight / frames));
          const raw = Number((logo as any).graveFrame) || 0;
          const idx = ((raw % frames) + frames) % frames;
          const frameCrop = { x: 0, y: idx * frameH, w: img.naturalWidth, h: frameH };
          bounds = this.getOpaqueBoundsInCrop(logo.sprite, img, frameCrop);
        } else {
          bounds = this.getOpaqueBounds(logo.sprite, img);
        }
        if (bounds) {
          crop = bounds;
          logo.spriteCrop = bounds;
          logo.spriteSourceW = img.naturalWidth;
          logo.spriteSourceH = img.naturalHeight;
        }
      }
      if (img.complete && img.naturalWidth !== 0) {
        const cw = Math.max(1, Math.round((logo as any).collisionWidth || logo.width || 1));
        const ch = Math.max(1, Math.round((logo as any).collisionHeight || logo.height || 1));
        const c = crop ? `${crop.x},${crop.y},${crop.w},${crop.h}` : 'full';
        const wantKey = `${logo.sprite}|${c}|${cw}x${ch}|perim36a64i1`;
        const cached = this.logoSupportCache.get(wantKey);
        if (cached) {
          (logo as any).customContactPointsLocal = cached;
          (logo as any).customContactKey = wantKey;
          (logo as any).customContactWantKey = wantKey;
        } else {
          const pts = this.computeLogoSupportPoints(img, crop, cw, ch);
          if (pts && pts.length >= 6) {
            this.logoSupportCache.set(wantKey, pts);
            (logo as any).customContactPointsLocal = pts;
            (logo as any).customContactKey = wantKey;
            (logo as any).customContactWantKey = wantKey;
          }
        }
      }
      logo.draw(this.ctx, img, crop);
    }
  }

  private computeLogoSupportPoints(
    img: HTMLImageElement,
    crop: { x: number; y: number; w: number; h: number } | undefined,
    collisionW: number,
    collisionH: number
  ): Array<{ x: number; y: number }> | null {
    const sw = crop ? crop.w : img.naturalWidth;
    const sh = crop ? crop.h : img.naturalHeight;
    if (!sw || !sh) return null;

    const c = document.createElement('canvas');
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, sw, sh);
    if (crop) ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, sw, sh);
    else ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, sw, sh).data;
    const alpha = new Uint8ClampedArray(sw * sh);
    for (let i = 0; i < sw * sh; i++) alpha[i] = data[i * 4 + 3];
    return buildPerimeterContactPointsFromAlpha(alpha, sw, sh, collisionW, collisionH, 36, 64, 1) as any;
  }

  private static opaqueBoundsCache: Record<string, { x: number; y: number; w: number; h: number }> = {};

  private getOpaqueBoundsInCrop(
    key: string,
    img: HTMLImageElement,
    crop: { x: number; y: number; w: number; h: number }
  ): { x: number; y: number; w: number; h: number } | null {
    const cacheKey = `${key}#a64#${crop.x},${crop.y},${crop.w},${crop.h}`;
    const cached = CanvasRenderer.opaqueBoundsCache[cacheKey];
    if (cached) return cached;

    const w = Math.max(1, Math.floor(crop.w));
    const h = Math.max(1, Math.floor(crop.h));
    if (!w || !h) return null;

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 64) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) return null;
    const bounds = { x: crop.x + minX, y: crop.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    CanvasRenderer.opaqueBoundsCache[cacheKey] = bounds;
    return bounds;
  }

  private getOpaqueBounds(key: string, img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
    const cacheKey = `${key}#a64`;
    const cached = CanvasRenderer.opaqueBoundsCache[cacheKey];
    if (cached) return cached;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 64) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) return null;
    const bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    CanvasRenderer.opaqueBoundsCache[cacheKey] = bounds;
    return bounds;
  }

  private drawProps(state: GameState): void {
    for (const prop of state.props) {
      if (prop.health <= 0) continue;

      this.ctx.save();
      this.ctx.translate(prop.x, prop.y);
      this.ctx.rotate(prop.rotation);

      // Draw a subtle shadow under the prop so it grounds it
      this.ctx.shadowColor = 'rgba(0,0,0,0.5)';
      this.ctx.shadowBlur = 5;
      this.ctx.shadowOffsetY = 2;

      if ((prop as any).imageData) {
        // It's a custom logo from DB
        const imgKey = `custom_logo_${(prop as any).imageData.substring(0, 20)}`; // short hash for caching
        let img = this.wormImages[imgKey];
        if (!img) {
          // Lazy load image from base64
          img = new Image();
          img.src = (prop as any).imageData;
          this.wormImages[imgKey] = img;
        }
        if (img.complete && img.naturalWidth !== 0) {
          this.ctx.drawImage(img, -prop.radius, -prop.radius, prop.radius * 2, prop.radius * 2);
        } else {
          // Fallback while loading
          this.ctx.fillStyle = 'purple';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, prop.radius, 0, Math.PI * 2);
          this.ctx.fill();
        }
      } else {
        const imgKey = prop.brandImage?.split('/').pop()?.split('.')[0] || 'brand_apple';
        let img = this.wormImages[imgKey];
        if (!img) img = this.wormImages[`brand_${imgKey}`]; // fallback for brands

        if (img && img.complete && img.naturalWidth !== 0) {
          this.ctx.drawImage(img, -prop.radius, -prop.radius, prop.radius * 2, prop.radius * 2);
        } else {
          // Fallback
          this.ctx.fillStyle = '#ff8800';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, prop.radius, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.shadowColor = 'transparent'; // reset for stroke
          this.ctx.fillStyle = '#000';
          this.ctx.stroke();
        }
      }

      this.ctx.restore();
    }
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawSky(state: GameState): void {
    // Parallax background effect
    const bgWidth = state.width;
    const bgHeight = state.height;

    // 1. Sky Gradient
    const gradient = this.ctx.createLinearGradient(0, 0, 0, bgHeight);
    gradient.addColorStop(0, '#1A1A2E'); // Dark deep blue/purple top
    gradient.addColorStop(0.5, '#16213E'); 
    gradient.addColorStop(1, '#0F3460'); // Darker bottom
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, bgWidth, bgHeight);

    // 2. Stars (static but pan slowly)
    this.ctx.save();
    // Move stars at 10% of camera speed
    this.ctx.translate(state.cameraX * 0.9, state.cameraY * 0.9);
    this.ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 200; i++) {
      const x = (i * 137) % bgWidth;
      const y = (i * 251) % bgHeight;
      const size = (i % 3) + 1;
      // Twinkle effect based on time
      const opacity = 0.5 + Math.sin(Date.now() / 500 + i) * 0.5;
      this.ctx.globalAlpha = opacity;
      this.ctx.fillRect(x, y, size, size);
    }
    this.ctx.restore();

    // 3. Distant Mountains (parallax)
    this.ctx.save();
    // Move mountains at 30% of camera speed
    this.ctx.translate(state.cameraX * 0.7, state.cameraY * 0.7);
    this.ctx.fillStyle = '#0a192f'; // Very dark, almost silhouette
    this.ctx.beginPath();
    this.ctx.moveTo(0, bgHeight);
    for (let x = 0; x <= bgWidth; x += 50) {
      const y = bgHeight - 200 - Math.sin(x * 0.005) * 100 - Math.cos(x * 0.02) * 30;
      this.ctx.lineTo(x, y);
    }
    this.ctx.lineTo(bgWidth, bgHeight);
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawLandscape(state: GameState): void {
    // 1. Only do a full redraw on initialization (or when needsUpdate is explicitly true)
    if (state.landscape.needsUpdate || this.terrainCanvas.width !== state.landscape.width || this.terrainCanvas.height !== state.landscape.height) {
      const width = state.landscape.width;
      const height = state.landscape.height;
      
      this.terrainCanvas.width = width;
      this.terrainCanvas.height = height;
      this.alloyCanvas.width = width;
      this.alloyCanvas.height = height;
      this.terrainCtx.clearRect(0, 0, width, height);
      this.alloyCtx.clearRect(0, 0, width, height);
      
      const imgData = this.terrainCtx.createImageData(width, height);
      const data = imgData.data;
      const alloyImgData = this.alloyCtx.createImageData(width, height);
      const alloyData = alloyImgData.data;

      // Generate base terrain mask and texture
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const material = state.landscape.getMaterial(x, y);
          const idx = (y * width + x) * 4;
          
          if (material === 1 || material === 255) {
            // If we have original pixel data from a custom map, use it directly!
            if (state.landscape.pixelData) {
              data[idx] = state.landscape.pixelData[idx];
              data[idx + 1] = state.landscape.pixelData[idx + 1];
              data[idx + 2] = state.landscape.pixelData[idx + 2];
              data[idx + 3] = 255;
            } else {
              // Otherwise, generate procedural textures (for random maps)
              if (material === 1) { // Destructible terrain
                let color = [100 + (Math.random()*10), 60 + (Math.random()*10), 20];
                if (Math.random() > 0.9) color = [80, 50, 15]; // dark spots
                if (Math.random() > 0.95) color = [130, 90, 40]; // light spots
                data[idx] = color[0];
                data[idx + 1] = color[1];
                data[idx + 2] = color[2];
                data[idx + 3] = 255;
              } else if (material === 255) { // Indestructible terrain
                const isLine = (x + y) % 10 === 0 || (x - y) % 10 === 0;
                const color = isLine ? [40, 40, 50] : [20, 20, 25];
                data[idx] = color[0];
                data[idx + 1] = color[1];
                data[idx + 2] = color[2];
                data[idx + 3] = 255;
              }
            }
            
            // If it's material 255 (indestructible alloy) and we are using custom maps,
            // we should visually override it with the dark alloy texture so players know they can't shoot it.
            // If we just kept the black pixels from the image, they might blend in too much or just look like a shadow.
            // By overriding it, we make it an explicit game element.
            if (material === 255 && state.landscape.pixelData) {
              const isLine = (x + y) % 10 === 0 || (x - y) % 10 === 0;
              const color = isLine ? [40, 40, 50] : [20, 20, 25];
              data[idx] = color[0];
              data[idx + 1] = color[1];
              data[idx + 2] = color[2];
              data[idx + 3] = 255;
            }
          }

          if (material === 255) {
            const isLine = (x + y) % 10 === 0 || (x - y) % 10 === 0;
            const color = isLine ? [40, 40, 50] : [20, 20, 25];
            alloyData[idx] = color[0];
            alloyData[idx + 1] = color[1];
            alloyData[idx + 2] = color[2];
            alloyData[idx + 3] = 255;
          } else {
            alloyData[idx + 3] = 0;
          }
        }
      }
      
      this.terrainCtx.putImageData(imgData, 0, 0);
      this.alloyCtx.putImageData(alloyImgData, 0, 0);
      
      // Draw Grass on top of Dirt (Only for procedural maps!)
      if (!state.landscape.pixelData) {
        this.terrainCtx.fillStyle = '#4CAF50'; // Bright Green
        for (let x = 0; x < width; x++) {
          for (let y = 0; y < height; y++) {
            if (state.landscape.getMaterial(x, y) === 1) {
              this.terrainCtx.fillRect(x, y, 1, 4 + (x % 3)); // varying grass length
              break;
            } else if (state.landscape.isSolid(x, y)) {
              break; // Found something else, no grass
            }
          }
        }
      }

      // Add Thick Dark Outline
      // We do this by creating a copy of the current terrain, then stroking/shadowing it
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tCtx = tempCanvas.getContext('2d')!;
      tCtx.drawImage(this.terrainCanvas, 0, 0);

      this.terrainCtx.clearRect(0, 0, width, height);

      // Draw shadow/outline by drawing the terrain multiple times offset in black
      this.terrainCtx.fillStyle = 'black';
      this.terrainCtx.shadowColor = '#111';
      this.terrainCtx.shadowBlur = 0;
      this.terrainCtx.shadowOffsetX = 0;
      this.terrainCtx.shadowOffsetY = 2; // Bottom shadow
      
      // Draw outline offsets
      const offsets = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]];
      this.terrainCtx.globalCompositeOperation = 'source-over';
      // Use a trick to colorize the silhouette: 
      // tCtx has the colored image. We can use it as a mask to draw black blocks.
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = width;
      maskCanvas.height = height;
      const mCtx = maskCanvas.getContext('2d')!;
      mCtx.drawImage(tempCanvas, 0, 0);
      mCtx.globalCompositeOperation = 'source-in';
      mCtx.fillStyle = '#111'; // Dark outline color
      mCtx.fillRect(0, 0, width, height);

      for (const [ox, oy] of offsets) {
        this.terrainCtx.drawImage(maskCanvas, ox, oy);
      }

      // Draw the actual terrain on top
      this.terrainCtx.drawImage(tempCanvas, 0, 0);
      
      state.landscape.needsUpdate = false;
    }

    // 2. Process new craters using ultra-fast composite operations to punch holes and add outlines
    if (state.landscape.newCraters && state.landscape.newCraters.length > 0) {
      for (const crater of state.landscape.newCraters) {
        // Step 1: Draw slightly larger black circle using source-atop.
        // This paints a dark outline only where terrain currently exists.
        this.terrainCtx.globalCompositeOperation = 'source-atop';
        this.terrainCtx.fillStyle = '#111'; // Dark outline color
        this.terrainCtx.beginPath();
        this.terrainCtx.arc(crater.x, crater.y, crater.r + 3, 0, Math.PI * 2);
        this.terrainCtx.fill();

        // Step 2: Punch the actual hole
        this.terrainCtx.globalCompositeOperation = 'destination-out';
        this.terrainCtx.fillStyle = 'black'; // Color doesn't matter for destination-out
        this.terrainCtx.beginPath();
        this.terrainCtx.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
        this.terrainCtx.fill();
      }

      this.terrainCtx.globalCompositeOperation = 'source-over'; // Restore
      
      // Fix for unbreakable alloy: Redraw any indestructible pixels (255) that were visually erased
      // OPTIMIZATION: Instead of using getImageData which is slow, we draw the crater using source-atop
      // and use a pre-calculated pattern or just skip getImageData.
      // Wait, we need to restore ONLY pixels that are 255 in the physics grid.
      // To do this FAST without CPU loops, we can use a clipping path or a temporary canvas.
      for (const crater of state.landscape.newCraters) {
        const minX = Math.max(0, Math.floor(crater.x - crater.r - 4));
        const maxX = Math.min(state.landscape.width - 1, Math.ceil(crater.x + crater.r + 4));
        const minY = Math.max(0, Math.floor(crater.y - crater.r - 4));
        const maxY = Math.min(state.landscape.height - 1, Math.ceil(crater.y + crater.r + 4));
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        if (w > 0 && h > 0) {
          this.terrainCtx.drawImage(this.alloyCanvas, minX, minY, w, h, minX, minY, w, h);
        }
      }
    }

    // Apply new stamps dynamically to both grid and offscreen canvas
    if (state.landscape.newStamps && state.landscape.newStamps.length > 0) {
      const wormBoxes = (state.players || [])
        .filter((w: any) => w && w.health > 0)
        .map((w: any) => {
          const halfW = (Number(w.width) || 0) * 0.5;
          const left = Math.floor((Number(w.x) || 0) - halfW) - 2;
          const right = Math.floor((Number(w.x) || 0) + halfW) + 2;
          const top = Math.floor(Number(w.y) || 0) - 2;
          const bottom = Math.floor((Number(w.y) || 0) + (Number(w.height) || 0)) + 2;
          return { left, right, top, bottom };
        });
      for (const stamp of state.landscape.newStamps) {
        let img = this.wormImages[stamp.imgKey];
        if (!img) {
          // It might be a brand image
          img = this.wormImages[`brand_${stamp.imgKey}`] || this.wormImages[stamp.imgKey];
        }
        
        if (img && img.complete) {
          const angle = typeof (stamp as any).angle === 'number' ? (stamp as any).angle : 0;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const rotW = Math.ceil(Math.abs(stamp.w * cos) + Math.abs(stamp.h * sin));
          const rotH = Math.ceil(Math.abs(stamp.w * sin) + Math.abs(stamp.h * cos));
          const crop = (stamp as any).crop as { x: number; y: number; w: number; h: number } | undefined;

          // Draw to a temporary canvas to get pixel data
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = rotW;
          tempCanvas.height = rotH;
          const tCtx = tempCanvas.getContext('2d');
          if (tCtx) {
            tCtx.clearRect(0, 0, rotW, rotH);
            tCtx.translate(rotW / 2, rotH / 2);
            tCtx.rotate(angle);
            if (crop) {
              tCtx.drawImage(img, crop.x, crop.y, crop.w, crop.h, -stamp.w / 2, -stamp.h / 2, stamp.w, stamp.h);
            } else {
              tCtx.drawImage(img, -stamp.w / 2, -stamp.h / 2, stamp.w, stamp.h);
            }
            tCtx.setTransform(1, 0, 0, 1, 0, 0);
            const imgData = tCtx.getImageData(0, 0, rotW, rotH);
            
            // Map alpha > 0 pixels to terrain grid
            const startX = Math.floor(stamp.x - rotW / 2);
            const startY = Math.floor(stamp.y - rotH / 2);
            
            for (let y = 0; y < rotH; y++) {
              for (let x = 0; x < rotW; x++) {
                const alpha = imgData.data[(y * rotW + x) * 4 + 3];
                if (alpha > 128) {
                  const mapX = startX + x;
                  const mapY = startY + y;
                  if (mapX < 0 || mapX >= state.landscape.width || mapY < 0 || mapY >= state.landscape.height) continue;
                  if (mapX < 30 || mapX >= state.landscape.width - 30 || mapY >= state.landscape.height - 30) continue;
                  if (state.landscape.getMaterial(mapX, mapY) === 255) continue;
                  let inWorm = false;
                  for (const b of wormBoxes) {
                    if (mapX >= b.left && mapX <= b.right && mapY >= b.top && mapY <= b.bottom) { inWorm = true; break; }
                  }
                  if (inWorm) continue;
                  state.landscape.grid[mapY * state.landscape.width + mapX] = 6; // Solid stamped material
                }
              }
            }
          }
          // Draw visually on the terrain canvas
          this.terrainCtx.save();
          this.terrainCtx.translate(stamp.x, stamp.y);
          this.terrainCtx.rotate(angle);
          if (crop) {
            this.terrainCtx.drawImage(img, crop.x, crop.y, crop.w, crop.h, -stamp.w / 2, -stamp.h / 2, stamp.w, stamp.h);
          } else {
            this.terrainCtx.drawImage(img, -stamp.w / 2, -stamp.h / 2, stamp.w, stamp.h);
          }
          this.terrainCtx.restore();
        }
      }
      state.landscape.newStamps = [];
    }

    // Draw the cached landscape onto the main canvas (SUPER FAST)
    this.ctx.drawImage(this.terrainCanvas, 0, 0);
  }

  /*
  private drawSnowflakes(state: GameState): void {
    if (!state.snowflakes) return;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (const flake of state.snowflakes) {
      this.ctx.fillRect(Math.floor(flake.x), Math.floor(flake.y), 1, 1);
    }
  }
  */

  private drawPlayers(state: GameState): void {
    for (let playerIndex = 0; playerIndex < state.players.length; playerIndex++) {
      const player = state.players[playerIndex];
      this.ctx.save();
      this.ctx.translate(player.x, player.y);

      // Advanced Canvas Animation for Worms
      const isMoving = Math.abs(player.vx) > 5 && player.health > 0 && !player.isJumping;
      const isActive = player === state.getCurrentPlayer() && player.health > 0;
      const equipmentId = player.getCurrentEquipmentId ? player.getCurrentEquipmentId() : 'bazooka';

      // Determine animation state
      let animKey = 'idle';
      let frameIndex = 0;
      let offsetY = 24; // Default offset for worms
      let flipX = player.facingRight; // Default flipX logic for worms
      
      if (player.health <= 0) {
        if ((player as any).graveSpawned) {
          this.ctx.restore();
          continue;
        }
        animKey = 'grave';
        frameIndex = playerIndex % this.animCtrl.getAnimLength('grave');
        offsetY = 0;
        flipX = false;
      } else if (player.isJumping) {
        animKey = 'jump';
        frameIndex = Math.floor((Date.now() / 100) % this.animCtrl.getAnimLength(animKey));
      } else if (isMoving) {
        animKey = 'walk';
        const numFrames = this.animCtrl.getAnimLength(animKey);
        // Ping-pong animation (0 1 2 3 4 3 2 1 0)
        // Total steps in a full cycle is (numFrames * 2) - 2
        if (numFrames > 0) {
          const totalSteps = (numFrames * 2) - 2;
          const step = Math.floor(Date.now() / 50) % totalSteps;
          frameIndex = step < numFrames ? step : totalSteps - step;
        } else {
          frameIndex = 0;
        }
      } else {
        // Idle breathing
        animKey = 'idle';
        const numFrames = this.animCtrl.getAnimLength(animKey);
        if (numFrames > 0) {
          const totalSteps = (numFrames * 2) - 2;
          const step = Math.floor(Date.now() / 120) % totalSteps;
          frameIndex = step < numFrames ? step : totalSteps - step;
        } else {
          frameIndex = 0;
        }
      }

      this.animCtrl.drawFrame(
        this.ctx,
        animKey,
        frameIndex,
        0,
        player.height / 2, // Ground point
        1.0, // Scale
        flipX,
        offsetY
      );

      if (player.ropeActive || ((player as any).ropeCastTime && (player as any).ropeCastTime > 0)) {
        this.drawRopeSprites(player);
      }

      if (isActive && player.health > 0) {
        this.drawHeldEquipment(player, equipmentId);
      }

      // Draw name and health
      if (player.health > 0) {
        this.ctx.fillStyle = player.teamColor || '#00ffff';
        this.ctx.font = '14px "Bangers", cursive';
        this.ctx.textAlign = 'center';
        
        // Draw outline for readability
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeText(player.name, 0, -player.height - 15);
        this.ctx.fillText(player.name, 0, -player.height - 15);

        // Draw Health Value
        this.ctx.fillStyle = player.teamColor || '#00ff00';
        this.ctx.strokeText(Math.ceil(player.health).toString(), 0, -player.height - 30);
        this.ctx.fillText(Math.ceil(player.health).toString(), 0, -player.height - 30);
      }

      // Draw active player indicator
      if (isActive) {
        this.ctx.fillStyle = player.teamColor || '#fff';
        this.ctx.beginPath();
        this.ctx.moveTo(-5, -player.height - 40);
        this.ctx.lineTo(5, -player.height - 40);
        this.ctx.lineTo(0, -player.height - 35);
        this.ctx.fill();

        const weapon = player.getCurrentWeapon?.();
        const cd = weapon ? (player.weaponCooldowns?.[weapon.id] || 0) : 0;
        const maxCd = weapon ? (player.maxWeaponCooldowns?.[weapon.id] || 1) : 1;
        const showReload = cd > 0;
        const showPower = !showReload && player.aimPower > 0;
        if (showReload || showPower) {
          const barW = 60;
          const barH = 7;
          const bx = -barW / 2;
          const by = -player.height - 62;
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          this.ctx.fillRect(bx, by, barW, barH);
          if (showReload) {
            const ratio = Math.max(0, Math.min(1, cd / maxCd));
            this.ctx.fillStyle = '#FFA500';
            this.ctx.fillRect(bx, by, barW * ratio, barH);
          } else {
            const ratio = Math.max(0, Math.min(1, player.aimPower / 100));
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(bx, by, barW * ratio, barH);
          }
          this.ctx.font = '12px "Bangers", cursive';
          this.ctx.textAlign = 'center';
          this.ctx.strokeStyle = '#000';
          this.ctx.lineWidth = 2;
          const text = showReload ? `${cd.toFixed(1)}s` : `${Math.round(player.aimPower)}`;
          this.ctx.strokeText(text, 0, by - 4);
          this.ctx.fillStyle = '#fff';
          this.ctx.fillText(text, 0, by - 4);
        }
      }

      // Aiming Reticle (only for current player and alive)
      if (player === state.getCurrentPlayer() && !player.isJumping && player.health > 0) {
        let globalAimAngle = player.aimAngle;
        if (!player.facingRight) {
          globalAimAngle = Math.PI - player.aimAngle;
        }

        // Draw Crosshair (Reticle)
        const reticleDist = 60; // distance from worm
        const rx = Math.cos(globalAimAngle) * reticleDist;
        const ry = Math.sin(globalAimAngle) * reticleDist - player.height / 2;
        
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        this.ctx.lineWidth = 2;
        
        // Draw crosshair circle
        this.ctx.beginPath();
        this.ctx.arc(rx, ry, 5, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Draw crosshair lines
        this.ctx.beginPath();
        this.ctx.moveTo(rx - 8, ry);
        this.ctx.lineTo(rx + 8, ry);
        this.ctx.moveTo(rx, ry - 8);
        this.ctx.lineTo(rx, ry + 8);
        this.ctx.stroke();
      }

      this.ctx.restore();
    }
  }

  private drawHeldEquipment(player: any, equipmentId: string): void {
    const row = this.weaponRowById(equipmentId);
    if (!row) return;
    const src = this.framePath(row, 1);
    const img = this.getCustomFrame(src);
    const base = (equipmentId === 'ninja_rope' ? 46 : 44) * 0.7

    this.ctx.save();
    this.ctx.translate(0, -player.height / 2 + 8);
    this.ctx.scale(player.facingRight ? 1 : -1, 1);
    this.ctx.rotate(player.aimAngle || 0);
    if (this.isImgReady(img)) {
      const maxDim = Math.max(1, Math.max(img.width || 0, img.height || 0));
      const k = base / maxDim;
      this.ctx.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
    } else {
      const w = base * 0.95;
      const h = base * 0.28;
      this.ctx.fillStyle = '#2b2b2b';
      this.ctx.fillRect(-w * 0.45, -h * 0.5, w, h);
    }
    this.ctx.restore();
  }

  private drawRopeSprites(player: any): void {
    const segImg = this.getCustomFrame(this.framePath(10, 4));
    const cuffImg = this.getCustomFrame(this.framePath(10, 5));
    const hookImg = this.getCustomFrame(this.framePath(10, 2));
    const fxImg = this.getCustomFrame(this.framePath(10, 6));

    const pts: Array<{ x: number; y: number }> = [];
    pts.push({ x: 0, y: -player.height / 2 });
    const nodes = (player as any).ropeNodes as Array<{ x: number; y: number }> | undefined;
    if (Array.isArray(nodes)) {
      for (const n of nodes) pts.push({ x: n.x - player.x, y: n.y - player.y });
    }

    if (player.ropeActive) {
      pts.push({ x: player.ropeAnchorX - player.x, y: player.ropeAnchorY - player.y });
    } else {
      const dur = (player as any).ropeCastDuration || 0.18;
      const t = Math.max(0, Math.min(1, 1 - (((player as any).ropeCastTime || 0) / dur)));
      const tx = (player as any).ropeCastX;
      const ty = (player as any).ropeCastY;
      pts.push({ x: (tx - player.x) * t, y: (ty - player.y) * t });
    }

    const maxDim = Math.max(1, Math.max(segImg.width || 0, segImg.height || 0));
    const segBase = 18;
    const segK = segBase / maxDim;
    const step = 10;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ang = Math.atan2(dy, dx);
      const ux = dx / len;
      const uy = dy / len;
      for (let d = 0; d < len; d += step) {
        if (i > 0 && d === 0) continue;
        this.ctx.save();
        this.ctx.translate(a.x + ux * d, a.y + uy * d);
        this.ctx.rotate(ang);
        this.ctx.drawImage(segImg, -segImg.width * segK / 2, -segImg.height * segK / 2, segImg.width * segK, segImg.height * segK);
        this.ctx.restore();
      }
    }

    const end = pts[pts.length - 1];
    const pre = pts.length >= 2 ? pts[pts.length - 2] : pts[0];
    const angEnd = Math.atan2(end.y - pre.y, end.x - pre.x);
    const startNext = pts.length >= 2 ? pts[1] : pts[0];
    const angStart = Math.atan2(startNext.y - pts[0].y, startNext.x - pts[0].x);

    const kCuff = 16 / Math.max(1, Math.max(cuffImg.width || 0, cuffImg.height || 0));
    this.ctx.save();
    this.ctx.translate(pts[0].x, pts[0].y);
    this.ctx.rotate(angStart);
    this.ctx.drawImage(cuffImg, -cuffImg.width * kCuff / 2, -cuffImg.height * kCuff / 2, cuffImg.width * kCuff, cuffImg.height * kCuff);
    this.ctx.restore();

    const kHook = 18 / Math.max(1, Math.max(hookImg.width || 0, hookImg.height || 0));
    this.ctx.save();
    this.ctx.translate(end.x, end.y);
    this.ctx.rotate(angEnd);
    this.ctx.drawImage(hookImg, -hookImg.width * kHook / 2, -hookImg.height * kHook / 2, hookImg.width * kHook, hookImg.height * kHook);
    this.ctx.restore();

    if (player.ropeActive) {
      const kFx = 26 / Math.max(1, Math.max(fxImg.width || 0, fxImg.height || 0));
      this.ctx.save();
      this.ctx.translate(end.x, end.y);
      this.ctx.rotate(angEnd);
      this.ctx.globalAlpha = 0.65;
      this.ctx.drawImage(fxImg, -fxImg.width * kFx / 2, -fxImg.height * kFx / 2, fxImg.width * kFx, fxImg.height * kFx);
      this.ctx.restore();
      this.ctx.globalAlpha = 1.0;
    }
  }

  private drawProjectiles(state: GameState): void {
    for (const proj of state.projectiles) {
      this.ctx.save();
      this.ctx.translate(proj.x, proj.y);

      let angle = Math.atan2(proj.vy, proj.vx);
      if (proj.weaponId === 'grenade') {
        const rot = (proj as any).rotation;
        if (typeof rot === 'number' && Number.isFinite(rot)) angle = rot;
      }

      const trail = this.trailSpritesForWeaponId(proj.weaponId);
      if (trail.length > 0) {
        const idx = Math.floor(((proj as any).age || 0) * 18) % trail.length;
        const img = this.getCustomFrame(trail[idx]);
        if (this.isImgReady(img) && Number.isFinite(proj.radius)) {
          const s = Math.max(6, proj.radius * 2.2);
          const off = Math.max(10, proj.radius * 3);
          this.ctx.save();
          this.ctx.rotate(angle + Math.PI);
          this.ctx.globalAlpha = 0.85;
          this.ctx.drawImage(img, -s * 0.5 - off, -s * 0.5, s, s);
          this.ctx.restore();
          this.ctx.globalAlpha = 1.0;
        }
      }

      const sprite = this.projectileSpriteForWeaponId(proj.weaponId);
      if (sprite) {
        const img = this.getCustomFrame(sprite);
        if (this.isImgReady(img) && Number.isFinite(proj.radius)) {
          const s = Math.max(10, proj.radius * 4.2);
          this.ctx.save();
          this.ctx.rotate(angle);
          this.ctx.drawImage(img, -s / 2, -s / 2, s, s);
          this.ctx.restore();
        } else {
          this.ctx.fillStyle = proj.color || 'yellow';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, Number.isFinite(proj.radius) ? proj.radius : 3, 0, Math.PI * 2);
          this.ctx.fill();
        }
      } else {
        this.ctx.fillStyle = proj.color || 'yellow';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      const fuse = (proj as any).fuseRemaining;
      if (typeof fuse === 'number' && fuse > 0) {
        const secs = Math.max(0, Math.ceil(fuse));
        this.ctx.fillStyle = '#fff';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        this.ctx.font = 'bold 16px "Bangers", cursive';
        this.ctx.textAlign = 'center';
        this.ctx.strokeText(secs.toString(), 0, -18);
        this.ctx.fillText(secs.toString(), 0, -18);
      }

      this.ctx.restore();
    }
  }

  private drawFloatingTexts(state: GameState): void {
    if (!state.floatingTexts) return;
    this.ctx.save();
    for (const text of state.floatingTexts) {
      this.ctx.globalAlpha = text.life / text.maxLife;
      this.ctx.fillStyle = text.color;
      this.ctx.font = 'bold 20px "Bangers", cursive';
      this.ctx.textAlign = 'center';
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(text.text, Math.floor(text.x), Math.floor(text.y));
      this.ctx.fillText(text.text, Math.floor(text.x), Math.floor(text.y));
    }
    this.ctx.restore();
  }

  private drawExplosions(state: GameState): void {
    for (const exp of state.explosions) {
      this.ctx.save();
      this.ctx.translate(exp.x, exp.y);
      
      const progress = 1 - (exp.life / exp.maxLife);
      const alpha = exp.life / exp.maxLife;
      
      this.ctx.globalAlpha = alpha;

      const wid = (exp as any).weaponId || null;
      const sprite = wid ? this.explosionSpriteForWeaponId(String(wid), exp.maxRadius) : null;
      if (sprite) {
        const img = this.getCustomFrame(sprite);
        if (this.isImgReady(img)) {
          const s = Math.max(18, exp.maxRadius * 1.75);
          const pulse = 0.85 + 0.25 * Math.sin(progress * Math.PI);
          this.ctx.drawImage(img, -s * pulse / 2, -s * pulse / 2, s * pulse, s * pulse);
        } else {
          this.ctx.fillStyle = '#FF4500';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, exp.radius, 0, Math.PI * 2);
          this.ctx.fill();
        }
      } else {
        this.ctx.fillStyle = '#FF4500';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, exp.radius, 0, Math.PI * 2);
        this.ctx.fill();
        if (exp.radius > 5) {
          this.ctx.fillStyle = '#FFD700';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, exp.radius * 0.7, 0, Math.PI * 2);
          this.ctx.fill();
        }
        if (exp.radius > 10 && progress < 0.5) {
          this.ctx.fillStyle = '#FFFFFF';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, exp.radius * 0.4, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }

      this.ctx.restore();
    }
  }

  private drawParticles(state: GameState): void {
    if (!state.particles) return;
    for (const p of state.particles) {
      if (!Number.isFinite(p.life) || !Number.isFinite(p.maxLife) || p.maxLife <= 0) continue;
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      this.ctx.globalAlpha = a;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha = 1.0;
  }

  private drawOffscreenPointers(state: GameState): void {
    const viewLeft = state.cameraX;
    const viewRight = state.cameraX + this.canvas.width / state.zoom;
    const viewTop = state.cameraY;
    const viewBottom = state.cameraY + this.canvas.height / state.zoom;
    const centerX = state.cameraX + (this.canvas.width / state.zoom) / 2;
    const centerY = state.cameraY + (this.canvas.height / state.zoom) / 2;

    for (const player of state.players) {
      if (player.health <= 0) continue;
      
      if (player.x >= viewLeft && player.x <= viewRight && player.y >= viewTop && player.y <= viewBottom) {
        continue; // Visible
      }

      // Calculate direction from center
      const dx = player.x - centerX;
      const dy = player.y - centerY;
      const angle = Math.atan2(dy, dx);

      // Find intersection with screen edge (with some padding)
      let edgeX, edgeY;
      const slope = dy / dx;
      const padding = 40;

      if (Math.abs(slope) < (this.canvas.height - padding * 2) / (this.canvas.width - padding * 2)) {
        // Intersects left or right edge
        edgeX = dx > 0 ? this.canvas.width - padding : padding;
        edgeY = this.canvas.height / 2 + (edgeX - this.canvas.width / 2) * slope;
      } else {
        // Intersects top or bottom edge
        edgeY = dy > 0 ? this.canvas.height - padding : padding;
        edgeX = this.canvas.width / 2 + (edgeY - this.canvas.height / 2) / slope;
      }

      // Draw pointer
      this.ctx.save();
      this.ctx.translate(edgeX, edgeY);

      const isCurrentPlayer = player === state.getCurrentPlayer();
      const color = player.teamColor || (player.team === 'team1' ? '#00ff00' : '#ff0000');

      // Draw text (Name)
      this.ctx.font = 'bold 14px "Bangers", Courier New';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      // Text Shadow
      this.ctx.fillStyle = 'black';
      this.ctx.fillText(player.name, 2, dy > 0 ? -28 : 28);
      
      // Text Fill
      this.ctx.fillStyle = color;
      this.ctx.fillText(player.name, 0, dy > 0 ? -30 : 30);
      
      // Rotate for the arrow
      this.ctx.rotate(angle);
      
      // Pulsing effect for current player
      let scale = 1;
      if (isCurrentPlayer) {
        scale = 1 + 0.2 * Math.sin(Date.now() / 150);
        this.ctx.scale(scale, scale);
      }

      // Draw stylized comic arrow
      this.ctx.beginPath();
      this.ctx.moveTo(20, 0);
      this.ctx.lineTo(-10, 15);
      this.ctx.lineTo(-2, 0);
      this.ctx.lineTo(-10, -15);
      this.ctx.closePath();
      
      // Arrow shadow/stroke
      this.ctx.shadowColor = 'black';
      this.ctx.shadowBlur = 0;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;
      
      this.ctx.fillStyle = color;
      this.ctx.fill();
      
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = 'black';
      this.ctx.shadowColor = 'transparent'; // turn off shadow for stroke
      this.ctx.stroke();
      
      this.ctx.restore();
    }

    if (state.brandLogos) {
      for (const logo of state.brandLogos) {
        if (!logo.isDynamic) continue;
        if (logo.x >= viewLeft && logo.x <= viewRight && logo.y >= viewTop && logo.y <= viewBottom) {
          continue;
        }

        const dx = logo.x - centerX;
        const dy = logo.y - centerY;
        const angle = Math.atan2(dy, dx);

        let edgeX, edgeY;
        const slope = dy / dx;
        const padding = 40;

        if (Math.abs(slope) < (this.canvas.height - padding * 2) / (this.canvas.width - padding * 2)) {
          edgeX = dx > 0 ? this.canvas.width - padding : padding;
          edgeY = this.canvas.height / 2 + (edgeX - this.canvas.width / 2) * slope;
        } else {
          edgeY = dy > 0 ? this.canvas.height - padding : padding;
          edgeX = this.canvas.width / 2 + (edgeY - this.canvas.height / 2) / slope;
        }

        this.ctx.save();
        this.ctx.translate(edgeX, edgeY);

        const color = '#ffcc00';
        this.ctx.font = 'bold 14px "Bangers", Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = 'black';
        this.ctx.fillText('DROP', 2, dy > 0 ? -28 : 28);
        this.ctx.fillStyle = color;
        this.ctx.fillText('DROP', 0, dy > 0 ? -30 : 30);

        this.ctx.rotate(angle);
        this.ctx.beginPath();
        this.ctx.moveTo(20, 0);
        this.ctx.lineTo(-10, 15);
        this.ctx.lineTo(-2, 0);
        this.ctx.lineTo(-10, -15);
        this.ctx.closePath();
        this.ctx.shadowColor = 'black';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 2;
        this.ctx.shadowOffsetY = 2;
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'black';
        this.ctx.shadowColor = 'transparent';
        this.ctx.stroke();

        this.ctx.restore();
      }
    }
  }

  // Draw UI
  private drawUI(_state: GameState): void {
    this.ctx.fillStyle = 'white';
    this.ctx.font = '14px Courier New';
    this.ctx.textAlign = 'left';
  }
}
