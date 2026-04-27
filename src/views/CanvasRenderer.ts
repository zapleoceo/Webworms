import { GameState } from '../models/GameState';
import { AnimationController } from './AnimationController';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private animCtrl: AnimationController;
  
  private wormImages: { [key: string]: HTMLImageElement } = {};

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

    // Init Animations
    this.animCtrl = new AnimationController({
      'walk': { src: '/sprites/Worms/wwalk.png', frameWidth: 60, frameHeight: 60, frameCount: 15 },
      'jump': { src: '/sprites/Worms/wjump.png', frameWidth: 60, frameHeight: 60, frameCount: 10 },
      'backflip': { src: '/sprites/Worms/wkamjmp.png', frameWidth: 60, frameHeight: 60, frameCount: 10 }, // approximation
      'idle': { src: '/sprites/Worms/wbrth1.png', frameWidth: 60, frameHeight: 60, frameCount: 15 }, // breathing
      'grave': { src: '/sprites/Misc/grave1.png', frameWidth: 24, frameHeight: 32, frameCount: 1 }, // Grave
      // Weapons
      'bazooka': { src: '/sprites/Worms/wbaz.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
      'minigun': { src: '/sprites/Worms/wmini.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
      'shotgun': { src: '/sprites/Worms/wshotg.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
      'rocket': { src: '/sprites/Worms/wbaz.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
      // Projectiles
      'proj_bazooka': { src: '/sprites/Weapons/missile.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
      'proj_minigun': { src: '/sprites/Weapons/bullet.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
      'proj_shotgun': { src: '/sprites/Weapons/bullet.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
      'proj_rocket': { src: '/sprites/Weapons/missile.png', frameWidth: 60, frameHeight: 60, frameCount: 32 },
    });

    // Load brand assets for airdrops
    this.wormImages['brand_apple'] = this.loadImg('/brand_apple.svg?v=3');
    this.wormImages['brand_windows'] = this.loadImg('/brand_windows.svg?v=3');
    this.wormImages['brand_android'] = this.loadImg('/brand_android.svg?v=3');
  }

  public render(state: GameState): void {
    this.clear();

    // Apply camera translation and zoom
    this.ctx.save();
    this.ctx.scale(state.zoom, state.zoom);
    this.ctx.translate(-state.cameraX, -state.cameraY);

    this.drawSky(state);
    this.drawLandscape(state);
    this.drawProps(state);
    this.drawProjectiles(state);
    // this.drawSnowflakes(state);
    this.drawPlayers(state);
    this.drawFloatingTexts(state);
    this.drawExplosions(state);

    this.ctx.restore(); // Restore camera so UI is drawn fixed to screen

    this.drawOffscreenPointers(state);
    this.drawUI(state);
  }

  private drawProps(state: GameState): void {
    for (const prop of state.props) {
      if (prop.health <= 0) continue;

      this.ctx.save();
      this.ctx.translate(prop.x, prop.y);
      this.ctx.rotate(prop.rotation);

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
    const gradient = this.ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, '#87CEEB'); // Sky blue
    gradient.addColorStop(1, '#E0F6FF'); // Lighter blue
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, state.width, state.height);
  }

  private drawLandscape(state: GameState): void {
    // 1. Only do a full redraw on initialization (or when needsUpdate is explicitly true)
    if (state.landscape.needsUpdate || this.terrainCanvas.width !== state.landscape.width || this.terrainCanvas.height !== state.landscape.height) {
      const width = state.landscape.width;
      const height = state.landscape.height;
      
      this.terrainCanvas.width = width;
      this.terrainCanvas.height = height;
      this.terrainCtx.clearRect(0, 0, width, height);
      
      const imgData = this.terrainCtx.createImageData(width, height);
      const data = imgData.data;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const mat = state.landscape.getMaterial(x, y);
          if (mat === 0) continue; // transparent
          
          const idx = (y * width + x) * 4;
          data[idx + 3] = 255; // Alpha
          
          if (mat === 1) { // Lunar Dirt
            data[idx] = 150; data[idx+1] = 150; data[idx+2] = 150;
            // Add some deterministic noise texture to dirt to avoid flickering on redraws
            if ((x * 31 + y * 17) % 100 > 80) { data[idx]-=10; data[idx+1]-=10; data[idx+2]-=10; }
          } else if (mat === 2) { // Meteorite
            data[idx] = 70; data[idx+1] = 70; data[idx+2] = 75;
            // Add deterministic noise to rock
            if ((x * 13 + y * 37) % 100 > 75) { data[idx]-=8; data[idx+1]-=8; data[idx+2]-=8; }
          } else if (mat === 3) { // Ice
            data[idx] = 170; data[idx+1] = 221; data[idx+2] = 255;
          } else if (mat === 4) { // Metal Platform (Destructible)
            data[idx] = 100; data[idx+1] = 100; data[idx+2] = 110;
            // Metal pattern
            if ((x+y)%10 === 0) { data[idx] = 130; data[idx+1] = 130; data[idx+2] = 140; }
          } else if (mat === 5) { // Snow
            data[idx] = 255; data[idx+1] = 255; data[idx+2] = 255;
          } else if (mat === 255) { // Alloy (Border)
            data[idx] = 30; data[idx+1] = 30; data[idx+2] = 40;
            // Metal pattern
            if ((x+y)%10 === 0) { data[idx] = 50; data[idx+1] = 50; data[idx+2] = 60; }
          }
        }
      }
      
      this.terrainCtx.putImageData(imgData, 0, 0);
      
      // Draw Grass on top of Lunar Dirt
      this.terrainCtx.fillStyle = '#228B22'; // Forest green
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          if (state.landscape.getMaterial(x, y) === 1) {
            this.terrainCtx.fillRect(x, y, 1, 3); // 3 pixel grass
            break;
          } else if (state.landscape.isSolid(x, y)) {
            break; // Found something else, no grass
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
      
      // Fix for unbreakable alloy: Redraw any indestructible pixels (255) that were visually erased
      for (const crater of state.landscape.newCraters) {
        // Expand the visual restoration area just in case physical radius was larger
        const minX = Math.max(0, Math.floor(crater.x - crater.r - 4));
        const maxX = Math.min(state.landscape.width - 1, Math.ceil(crater.x + crater.r + 4));
        const minY = Math.max(0, Math.floor(crater.y - crater.r - 4));
        const maxY = Math.min(state.landscape.height - 1, Math.ceil(crater.y + crater.r + 4));
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        
        if (w > 0 && h > 0) {
          const imgData = this.terrainCtx.getImageData(minX, minY, w, h);
          const data = imgData.data;
          
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const mapX = minX + x;
              const mapY = minY + y;
              if (state.landscape.getMaterial(mapX, mapY) === 255) {
                const idx = (y * w + x) * 4;
                data[idx] = 30; data[idx+1] = 30; data[idx+2] = 40; data[idx+3] = 255;
                if ((mapX+mapY)%10 === 0) { data[idx] = 50; data[idx+1] = 50; data[idx+2] = 60; }
              }
            }
          }
          this.terrainCtx.putImageData(imgData, minX, minY);
        }
      }
    }

    // Apply new stamps dynamically to both grid and offscreen canvas
    if (state.landscape.newStamps && state.landscape.newStamps.length > 0) {
      for (const stamp of state.landscape.newStamps) {
        let img = this.wormImages[stamp.imgKey];
        if (!img) {
          // It might be a brand image
          img = this.wormImages[`brand_${stamp.imgKey}`] || this.wormImages[stamp.imgKey];
        }
        
        if (img && img.complete) {
          // Draw to a temporary canvas to get pixel data
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = stamp.w;
          tempCanvas.height = stamp.h;
          const tCtx = tempCanvas.getContext('2d');
          if (tCtx) {
            tCtx.drawImage(img, 0, 0, stamp.w, stamp.h);
            const imgData = tCtx.getImageData(0, 0, stamp.w, stamp.h);
            
            // Map alpha > 0 pixels to terrain grid
            const startX = Math.floor(stamp.x - stamp.w / 2);
            const startY = Math.floor(stamp.y - stamp.h / 2);
            
            for (let y = 0; y < stamp.h; y++) {
              for (let x = 0; x < stamp.w; x++) {
                const alpha = imgData.data[(y * stamp.w + x) * 4 + 3];
                if (alpha > 128) {
                  state.landscape.setMaterial(startX + x, startY + y, 6); // 6 = Solid Prop Material
                }
              }
            }
          }
          // Draw visually on the terrain canvas
          this.terrainCtx.drawImage(img, stamp.x - stamp.w / 2, stamp.y - stamp.h / 2, stamp.w, stamp.h);
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
    for (const player of state.players) {
      this.ctx.save();
      this.ctx.translate(player.x, player.y);

      // Advanced Canvas Animation for Worms
      const isMoving = Math.abs(player.vx) > 5 && player.health > 0 && !player.isJumping;
      const isActive = player === state.getCurrentPlayer() && player.health > 0;
      const weapon = player.getCurrentWeapon();

      // Determine animation state
      let animKey = 'idle';
      let frameIndex = 0;
      let offsetY = 24; // Default offset for worms
      let flipX = player.facingRight; // Default flipX logic for worms
      
      if (player.health <= 0) {
        animKey = 'grave';
        frameIndex = 0;
        offsetY = 16; // Adjust for smaller grave sprite
        flipX = false;
      } else if (player.isJumping) {
        animKey = 'jump';
        frameIndex = Math.floor((Date.now() / 100) % this.animCtrl.getAnimLength(animKey));
      } else if (isMoving) {
        animKey = 'walk';
        frameIndex = Math.floor((Date.now() / 50) % this.animCtrl.getAnimLength(animKey));
      } else if (isActive && weapon) {
        // Aiming state
        const weaponMap: any = {
          'bazooka': 'bazooka',
          'minigun': 'minigun',
          'triple': 'shotgun',
          'rocket': 'rocket'
        };
        animKey = weaponMap[weapon.id] || 'bazooka';

        // Calculate aim frame (0 to 31)
        // aimAngle is -PI/2 (up) to PI/2 (down)
        // Let's assume frame 0 is Straight UP (-PI/2), and frame 31 is Straight DOWN (+PI/2).
        // Total range is PI radians (180 degrees).
        const normalizedAngle = player.aimAngle + Math.PI / 2; // 0 to PI
        frameIndex = Math.floor((normalizedAngle / Math.PI) * 31);
        frameIndex = Math.max(0, Math.min(31, frameIndex));
      } else {
        // Idle breathing
        animKey = 'idle';
        frameIndex = Math.floor((Date.now() / 100) % this.animCtrl.getAnimLength(animKey));
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
        this.ctx.fillStyle = 'yellow';
        this.ctx.beginPath();
        this.ctx.moveTo(-5, -player.height - 40);
        this.ctx.lineTo(5, -player.height - 40);
        this.ctx.lineTo(0, -player.height - 35);
        this.ctx.fill();
      }

      // Aiming Reticle (only for current player and alive)
      if (player === state.getCurrentPlayer() && !player.isJumping && player.health > 0) {
        let globalAimAngle = player.aimAngle;
        if (!player.facingRight) {
          globalAimAngle = 180 - player.aimAngle;
        }

        // Draw Crosshair (Reticle)
        const reticleDist = 60; // distance from worm
        const rx = Math.cos(globalAimAngle * Math.PI / 180) * reticleDist;
        const ry = Math.sin(globalAimAngle * Math.PI / 180) * reticleDist;
        
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

  private drawProjectiles(state: GameState): void {
    for (const proj of state.projectiles) {
      this.ctx.save();
      this.ctx.translate(proj.x, proj.y);

      const animKey = `proj_${proj.weaponId}`;
      const hasSprite = this.animCtrl.getAnimLength(animKey) > 0;

      if (hasSprite) {
        // Map velocity angle to 32 frames
        // angle is -PI to PI
        let angle = Math.atan2(proj.vy, proj.vx);
        
        // Frame 0 is pointing UP (-PI/2).
        // Let's normalize angle so -PI/2 maps to 0.
        // angle + PI/2 maps UP to 0, RIGHT to PI/2, DOWN to PI, LEFT to 1.5PI
        let normalizedAngle = angle + Math.PI / 2;
        if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;
        
        let frameIndex = Math.floor((normalizedAngle / (Math.PI * 2)) * 32) % 32;

        // Offset Y is 30 because projectiles are 60x60 and we want to center them at (0,0)
        // rather than drawing them resting on the ground.
        this.animCtrl.drawFrame(
          this.ctx,
          animKey,
          frameIndex,
          0,
          0,
          1.0,
          false,
          30
        );
      } else {
        // Fallback to circle
        this.ctx.fillStyle = proj.color || 'yellow';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
        this.ctx.fill();
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

  private drawOffscreenPointers(state: GameState): void {
    const viewLeft = state.cameraX;
    const viewRight = state.cameraX + this.canvas.width / state.zoom;
    const viewTop = state.cameraY;
    const viewBottom = state.cameraY + this.canvas.height / state.zoom;
    const centerX = state.cameraX + (this.canvas.width / state.zoom) / 2;
    const centerY = state.cameraY + (this.canvas.height / state.zoom) / 2;

    for (const player of state.players) {
      if (player.x >= viewLeft && player.x <= viewRight && player.y >= viewTop && player.y <= viewBottom) {
        continue; // Visible
      }

      // Calculate direction from center
      const dx = player.x - centerX;
      const dy = player.y - centerY;
      const angle = Math.atan2(dy, dx);

      // Find intersection with screen edge
      let edgeX, edgeY;
      const slope = dy / dx;

      if (Math.abs(slope) < this.canvas.height / this.canvas.width) {
        // Intersects left or right edge
        edgeX = dx > 0 ? this.canvas.width - 20 : 20;
        edgeY = this.canvas.height / 2 + (edgeX - this.canvas.width / 2) * slope;
      } else {
        // Intersects top or bottom edge
        edgeY = dy > 0 ? this.canvas.height - 20 : 20;
        edgeX = this.canvas.width / 2 + (edgeY - this.canvas.height / 2) / slope;
      }

      // Draw pointer
      this.ctx.save();
      this.ctx.translate(edgeX, edgeY);
      
      // Draw text
      this.ctx.fillStyle = player.teamColor || 'white';
      this.ctx.font = '12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(player.name, 0, dy > 0 ? -15 : 25);
      
      // Draw Triangle
      this.ctx.rotate(angle);
      this.ctx.fillStyle = player.teamColor || 'white';
      this.ctx.beginPath();
      this.ctx.moveTo(10, 0);
      this.ctx.lineTo(-5, 5);
      this.ctx.lineTo(-5, -5);
      this.ctx.fill();
      
      this.ctx.restore();
    }
  }

  // Draw UI
  private drawUI(state: GameState): void {
    this.ctx.fillStyle = 'white';
    this.ctx.font = '14px Courier New';
    this.ctx.textAlign = 'left';
    
    // Draw wind indicator
    this.ctx.fillText(`WIND: ${Math.round(state.wind)}`, 20, 20);
    
    // Draw wind bar
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.fillRect(20, 30, 100, 5);
    
    this.ctx.fillStyle = state.wind > 0 ? '#4CAF50' : '#FF4500';
    const windBarLength = (state.wind / 200) * 50; // max wind ~200
    this.ctx.fillRect(70, 30, windBarLength, 5);
    
    // Center line for wind
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(70, 28, 1, 9);
    
    const player = state.getCurrentPlayer();
    if (!player) return;

    // Weapon Info
    const weapon = player.getCurrentWeapon();
    let cd = 0;
    let maxCd = 1;
    if (weapon) {
      cd = player.weaponCooldowns[weapon.id] || 0;
      maxCd = player.maxWeaponCooldowns[weapon.id] || 1;
      
      // Also update the DOM button text to always show the current weapon name
      const btnSwitchDisplay = document.getElementById('weapon-name-display');
      if (btnSwitchDisplay && btnSwitchDisplay.innerText !== weapon.name) {
        btnSwitchDisplay.innerText = weapon.name;
        const btnSwitch = document.getElementById('btn-switch');
        if (btnSwitch) btnSwitch.style.color = weapon.color;
      }

      // Draw weapon name at bottom center (near switch button)
      this.ctx.fillStyle = weapon.color;
      this.ctx.textAlign = 'center';
      this.ctx.font = 'bold 18px Courier New';
      this.ctx.fillText(`WEAPON: ${weapon.name}`, this.canvas.width / 2, this.canvas.height - 20);
      this.ctx.textAlign = 'left';
      this.ctx.font = '14px Courier New';
    }

    // Base background bar (Power/Cooldown)
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.fillRect(20, 50, 100, 10);

    if (cd > 0) {
      // Cooldown UI (Reverse charging bar)
      this.ctx.fillStyle = '#FFA500'; // Orange for reload
      const ratio = cd / maxCd;
      this.ctx.fillRect(20, 50, 100 * ratio, 10); // shrinks to the left as cd approaches 0
      
      this.ctx.fillStyle = 'red';
      this.ctx.fillText(`RELOADING: ${cd.toFixed(1)}s`, 20, 75);
    } else {
      // Power bar (Forward charging bar)
      this.ctx.fillStyle = 'red';
      this.ctx.fillRect(20, 50, player.aimPower, 10);
      this.ctx.fillText(`POWER: ${Math.floor(player.aimPower)}`, 20, 75);
    }
  }
}
