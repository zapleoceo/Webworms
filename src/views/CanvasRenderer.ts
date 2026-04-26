import { GameState } from '../models/GameState';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  
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

    // Load sprite images from local assets (cache busted)
    this.wormImages['soldier'] = this.loadImg('/worm_soldier.png?v=4');
    this.wormImages['heavy'] = this.loadImg('/worm_heavy.png?v=4');
    this.wormImages['scout'] = this.loadImg('/worm_scout.png?v=4');
    
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
    this.drawExplosions(state);
    
    this.ctx.restore(); // Restore camera so UI is drawn fixed to screen

    this.drawOffscreenPointers(state);
    this.drawUI(state);
  }

  private drawProps(state: GameState): void {
    for (const prop of state.props) {
      this.ctx.save();
      this.ctx.translate(prop.x, prop.y);
      this.ctx.rotate(prop.rotation);

      if (prop.type === 'crate') {
        this.ctx.fillStyle = '#8B4513'; // wood
        this.ctx.fillRect(-prop.radius, -prop.radius, prop.radius * 2, prop.radius * 2);
        this.ctx.strokeStyle = '#5c2e0e';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(-prop.radius, -prop.radius, prop.radius * 2, prop.radius * 2);
        
        // Crate cross pattern
        this.ctx.beginPath();
        this.ctx.moveTo(-prop.radius, -prop.radius);
        this.ctx.lineTo(prop.radius, prop.radius);
        this.ctx.moveTo(prop.radius, -prop.radius);
        this.ctx.lineTo(-prop.radius, prop.radius);
        this.ctx.stroke();
      } else if (prop.type === 'brand' && prop.brandImage) {
        // Draw Brand Logo PNG
        // Extract 'brand_apple' from '/assets/brand_apple.png'
        const imgKey = prop.brandImage.split('/').pop()?.split('.')[0] || '';
        const img = this.wormImages[imgKey];
        
        if (img && img.complete && img.naturalWidth !== 0) {
          this.ctx.save();
          this.ctx.translate(prop.x, prop.y);
          this.ctx.rotate(prop.angle);
          
          // Draw white background circle for visibility
          this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
          this.ctx.beginPath();
          this.ctx.arc(0, 0, prop.radius, 0, Math.PI * 2);
          this.ctx.fill();

          // Draw the brand
          this.ctx.drawImage(img, -prop.radius, -prop.radius, prop.radius * 2, prop.radius * 2);
          this.ctx.restore();
        } else {
          // Fallback box
          this.ctx.fillStyle = 'white';
          this.ctx.fillRect(prop.x - prop.radius, prop.y - prop.radius, prop.radius * 2, prop.radius * 2);
        }
      } else {
        // Asteroid / Rock
        this.ctx.fillStyle = '#555';
        this.ctx.beginPath();
        // Draw jagged rock
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const r = prop.radius * (0.8 + (i % 2) * 0.4); // irregular shape
          this.ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        }
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }

      // Draw Prop Health Bar
      this.ctx.restore(); // restore to draw health bar without rotation
      this.ctx.save();
      this.ctx.translate(prop.x, prop.y);
      
      this.ctx.fillStyle = 'red';
      this.ctx.fillRect(-prop.radius, -prop.radius - 8, prop.radius * 2, 3);
      this.ctx.fillStyle = '#32CD32'; // Lime green
      this.ctx.fillRect(-prop.radius, -prop.radius - 8, (prop.radius * 2) * (prop.health / prop.maxHealth), 3);
      
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
      if (player.health <= 0) continue; // Don't draw dead worms
      
      this.ctx.save();
      this.ctx.translate(player.x, player.y);

      // Advanced Canvas Animation for Worms
      const isMoving = Math.abs(player.vx) > 5 && player.health > 0 && !player.isJumping;
      const isAiming = player.aimAngle !== 0;

      // 1. Walk cycle squish (breathing/walking)
      let squishY = 0;
      let squishX = 0;
      let rotation = 0;

      if (isMoving) {
        // Walking wobble
        squishY = Math.sin(player.walkCycle) * 3; // Vertical bounce
        rotation = Math.sin(player.walkCycle) * 0.2; // Slight rocking
      } else {
        // Idle breathing
        squishY = Math.sin(Date.now() / 300) * 1.5;
      }
      
      squishX = -squishY * 0.5; // Conservation of volume

      // Jump stretch
      if (player.isJumping) {
        squishY = 5;
        squishX = -3;
      }

      const yOffset = -squishY / 2; // keep bottom grounded

      const img = this.wormImages[player.unitClass];
      const hasImage = img && img.complete && img.naturalWidth !== 0;

      if (hasImage) {
        // Draw the original PNG Image with advanced transformations
        this.ctx.save();

        // Base flip for direction
        if (!player.facingRight) {
          this.ctx.scale(-1, 1);
        }

        // Apply walking rotation wobble
        this.ctx.rotate(rotation);

        // Apply aim rotation if aiming (lean into the aim)
        if (isAiming) {
          const aimLean = player.aimAngle * 0.5; // Lean halfway into the aim angle
          this.ctx.rotate(-aimLean);
        }

        // Scale down the large PNGs to fit the worm hit-box (typically 20x20 or so)
        // Original PNGs might be 500x500. We scale them down to roughly 30-40px.
        const imgScale = (player.width * 2.5) / img.width;
        
        // Apply squish scale
        this.ctx.scale(1 + (squishX / player.width), 1 + (squishY / player.height));

        const w = img.width * imgScale;
        const h = img.height * imgScale;
        
        // Draw centered and grounded
        this.ctx.drawImage(img, -w/2, -h + player.height/2, w, h);
        
        this.ctx.restore();
      } else {
        const renderWidth = player.width + squishX;
        const renderHeight = player.height + squishY;
        // Fallback: Draw Worm Body (Ellipse for squishing)
        this.ctx.fillStyle = player.teamColor || '#FF69B4'; // Use team color
        this.ctx.beginPath();
        this.ctx.ellipse(0, yOffset, renderWidth / 2, renderHeight / 2, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Equipment Layer (e.g. Helmet based on class)
        if (player.unitClass === 'heavy') {
          this.ctx.fillStyle = '#444'; // Heavy Iron Helmet
          this.ctx.fillRect(-renderWidth/2 - 1, yOffset - renderHeight/2, renderWidth + 2, 4);
        } else if (player.unitClass === 'scout') {
          this.ctx.fillStyle = '#8B0000'; // Red Headband
          this.ctx.fillRect(-renderWidth/2, yOffset - renderHeight/2 + 2, renderWidth, 2);
          // Headband tails
          if (player.facingRight) {
            this.ctx.fillRect(-renderWidth/2 - 4, yOffset - renderHeight/2 + 2, 4, 2);
          } else {
            this.ctx.fillRect(renderWidth/2, yOffset - renderHeight/2 + 2, 4, 2);
          }
        } else {
          this.ctx.fillStyle = '#A0522D'; // Brown helmet (Soldier)
          this.ctx.beginPath();
          this.ctx.arc(0, yOffset - 2, renderWidth / 2 + 1, Math.PI, Math.PI * 2);
          this.ctx.fill();
        }

        // Eyes
        this.ctx.fillStyle = 'white';
        const eyeOffset = player.facingRight ? 2 : -2;
        this.ctx.beginPath();
        this.ctx.arc(eyeOffset, yOffset - 2, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = 'black';
        this.ctx.beginPath();
        this.ctx.arc(eyeOffset + (player.facingRight ? 0.5 : -0.5), yOffset - 2, 0.5, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Name and Health bar
      this.ctx.fillStyle = 'white';
      this.ctx.font = '10px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(player.name, 0, -20);

      this.ctx.fillStyle = 'red';
      this.ctx.fillRect(-10, -15, 20, 3);
      this.ctx.fillStyle = '#32CD32'; // Lime green
      this.ctx.fillRect(-10, -15, 20 * (player.health / player.maxHealth), 3);

      // Aiming Reticle (only for current player)
      if (player === state.getCurrentPlayer() && !player.isJumping) {
        const rad = player.aimAngle * (Math.PI / 180);
        const targetX = Math.cos(rad) * 30;
        const targetY = -Math.sin(rad) * 30;

        // Draw weapon barrel rotating around player
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, yOffset);
        this.ctx.lineTo(Math.cos(rad) * 12, yOffset - Math.sin(rad) * 12);
        this.ctx.stroke();

        // Draw aim line
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, yOffset);
        this.ctx.lineTo(targetX, targetY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Crosshair
        this.ctx.fillStyle = 'red';
        this.ctx.beginPath();
        this.ctx.arc(targetX, targetY, 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    }
  }

  private drawProjectiles(state: GameState): void {
    for (const proj of state.projectiles) {
      this.ctx.fillStyle = proj.color || 'yellow';
      this.ctx.beginPath();
      this.ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      this.ctx.fill();
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

    // Render Airdrop Indicator if one is coming
    if (state.nextAirdrop && state.nextAirdrop.timeRemaining > 0) {
      const dropStr = `AIRDROP IN: ${Math.ceil(state.nextAirdrop.timeRemaining)}s`;
      
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.fillRect(this.canvas.width / 2 - 100, 10, 200, 40);
      
      this.ctx.fillStyle = '#fff';
      this.ctx.textAlign = 'center';
      this.ctx.font = 'bold 16px Courier New';
      this.ctx.fillText(dropStr, this.canvas.width / 2, 30);
      
      // Draw miniature brand logo
      const imgKey = state.nextAirdrop.brandImage.split('/').pop()?.split('.')[0] || '';
      const img = this.wormImages[imgKey];
      if (img && img.complete) {
        this.ctx.drawImage(img, this.canvas.width / 2 - 12, 35, 24, 24);
      }
      
      this.ctx.textAlign = 'left'; // reset
    }
  }
}
