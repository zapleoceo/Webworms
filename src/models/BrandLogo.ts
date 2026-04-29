import { Landscape } from './Landscape';

export class BrandLogo {
  public sprite: string;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public angle: number;
  public angularVelocity: number;
  public width: number;
  public height: number;
  public isDynamic: boolean = true;
  public isSolid: boolean = true;
  public hardness: number = 10;
  public health: number = 200;
  public maxHealth: number = 200;
  
  public hitShake: number = 0; // Visual shake
  public bounceTime: number = 0; // Bounce animation
  public collisionWidth: number;
  public collisionHeight: number;
  public age: number = 0;
  public touchedGround: boolean = false;

  constructor(sprite: string, x: number, y: number, vx: number, vy: number, angle: number, angularVelocity: number) {
    this.sprite = sprite;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = angle;
    this.angularVelocity = angularVelocity;
    // Sizes based on ~2-3 worms width (worm is 30px)
    this.width = 100;
    this.height = 50;
    this.collisionWidth = this.width;
    this.collisionHeight = this.height;
  }

  public takeDamage(amount: number): void {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
  }

  public update(dt: number, gravity: number, landscape: Landscape, otherLogos: BrandLogo[]): void {
    // Shake and bounce decay
    if (this.hitShake > 0) this.hitShake -= dt * 2;
    if (this.bounceTime > 0) this.bounceTime -= dt * 3;

    if (!this.isDynamic) return;

    this.age += dt;

    this.vy += gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.angularVelocity * dt;
    const TAU = Math.PI * 2;
    const norm = (a: number) => {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    };
    this.angle = norm(this.angle);

    // Check collision with landscape (simple rect check)
    let collision = false;
    let collisionY = this.y;

    const halfW = this.collisionWidth / 2;
    const halfH = this.collisionHeight / 2;

    // Check bottom edge
    for (let dx = -halfW; dx <= halfW; dx += 10) {
      const testX = Math.floor(this.x + dx);
      const testY = Math.floor(this.y + halfH);

      if (testY < 0) continue;
      if (landscape.isSolid(testX, testY)) {
        collision = true;
        // Find exact surface
        let searchY = testY;
        while (landscape.isSolid(testX, searchY) && searchY > 0) {
          searchY--;
        }
        if (searchY < collisionY) {
          collisionY = searchY;
        }
      }
    }

    // Check collision with other settled logos
    for (const other of otherLogos) {
      if (other !== this && !other.isDynamic) {
        // AABB collision
        if (this.x - halfW < other.x + other.width/2 &&
            this.x + halfW > other.x - other.width/2 &&
            this.y + halfH > other.y - other.height/2 &&
            this.y - halfH < other.y + other.height/2) {
          collision = true;
          collisionY = other.y - other.height/2 - halfH;
        }
      }
    }

    if (collision) {
      this.touchedGround = true;
      const sampleY = (sx: number): number => {
        const ix = Math.floor(sx);
        let y = Math.floor(this.y + halfH);
        let steps = 0;
        while (landscape.isSolid(ix, y) && y > 0 && steps < 60) {
          y--;
          steps++;
        }
        return y;
      };
      const yL = sampleY(this.x - halfW);
      const yR = sampleY(this.x + halfW);
      const baseAngle = Math.max(-0.6, Math.min(0.6, Math.atan2(yR - yL, Math.max(1, halfW * 2))));
      const a0 = norm(baseAngle);
      const a1 = norm(baseAngle + Math.PI);
      const cur = this.angle;
      const d0 = Math.abs(norm(cur - a0));
      const d1 = Math.abs(norm(cur - a1));
      const targetAngle = d0 <= d1 ? a0 : a1;

      if (Math.abs(this.vy) > 50) {
        this.vy = -this.vy * 0.12;
      } else {
        this.vy = 0;
      }
      this.vx *= 0.7;
      this.y = collisionY;
      
      this.angularVelocity += norm(targetAngle - this.angle) * 6 * dt;
      this.angularVelocity *= 0.96;

      const shouldForceSettle = this.touchedGround && this.age >= 8;
      const isSlow = Math.abs(this.vx) < 3 && Math.abs(this.vy) < 3 && Math.abs(this.angularVelocity) < 0.05 && Math.abs(norm(this.angle - targetAngle)) < 0.15;

      if (shouldForceSettle || isSlow) {
        this.isDynamic = false;
        this.vx = 0;
        this.vy = 0;
        this.angularVelocity = 0;
        this.angle = targetAngle;
        this.bounceTime = 1.0; // Trigger small bounce effect when settling
        
        // Trigger dust and camera shake (handled in GamePresenter or PhysicsEngine via callbacks)
      }
    }
  }

  public takeHit(expX: number, _expY: number, _expRadius: number): void {
    if (this.isDynamic) {
      // Slightly toss it
      this.vy -= 100;
      this.vx += (this.x > expX ? 30 : -30);
      this.angularVelocity += (Math.random() - 0.5) * 2;
    } else {
      // Temporarily tilt and shake the settled logo
      this.hitShake = 1.0;
      this.angle = (Math.random() - 0.5) * 0.2;
    }
  }

  public draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, crop?: { x: number; y: number; w: number; h: number }): void {
    ctx.save();
    
    let drawX = this.x;
    let drawY = this.y;
    let drawAngle = this.angle;

    // Apply shake and bounce effects visually
    if (this.hitShake > 0) {
      drawX += (Math.random() - 0.5) * 4 * this.hitShake;
      drawY += (Math.random() - 0.5) * 4 * this.hitShake;
      if (!this.isDynamic) {
        drawAngle += Math.sin(Date.now() * 0.05) * 0.1 * this.hitShake;
      }
    }
    if (this.bounceTime > 0) {
      // Small sine bounce when hitting ground
      drawY -= Math.sin(this.bounceTime * Math.PI) * 5;
    }

    ctx.translate(drawX, drawY);
    ctx.rotate(drawAngle);

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    if (img && img.complete && img.naturalWidth !== 0) {
      if (crop) {
        ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, -this.width / 2, -this.height / 2, this.width, this.height);
      } else {
        ctx.drawImage(img, -this.width / 2, -this.height / 2, this.width, this.height);
      }
    } else {
      // Fallback colored rectangle if image is missing
      ctx.fillStyle = '#FFA500';
      ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);
      
      // Text fallback
      ctx.fillStyle = '#000';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'transparent';
      
      let name = 'LOGO';
      if (this.sprite.includes('prompt=')) {
        try {
          const url = new URL(this.sprite);
          const prompt = url.searchParams.get('prompt');
          if (prompt) {
            // Extract the name like "MEGA MART" from "saying MEGA MART"
            const match = prompt.match(/saying\s+([A-Z\s]+)\s+transparent/);
            if (match && match[1]) name = match[1];
          }
        } catch(e) {}
      } else {
        name = this.sprite.split('/').pop()?.split('.')[0] || 'LOGO';
      }
      
      ctx.fillText(name.toUpperCase(), 0, 0);
    }

    ctx.restore();
  }
}
