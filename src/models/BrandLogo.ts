import { Landscape } from './Landscape';
import { integrateAirdrop } from '../physics/AirdropPhysics';

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
  public spriteCrop?: { x: number; y: number; w: number; h: number };
  public spriteSourceW?: number;
  public spriteSourceH?: number;
  public stationaryTime: number = 0;
  public lastX: number = 0;
  public lastY: number = 0;
  public lastAngle: number = 0;
  public bounceFactor: number = 1;

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
    this.lastX = x;
    this.lastY = y;
    this.lastAngle = angle;
  }

  public takeDamage(amount: number): void {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
  }

  public update(dt: number, gravity: number, landscape: Landscape, _otherLogos: BrandLogo[]): void {
    // Shake and bounce decay
    if (this.hitShake > 0) this.hitShake -= dt * 2;
    if (this.bounceTime > 0) this.bounceTime -= dt * 3;

    if (!this.isDynamic) return;

    this.age += dt;

    const TAU = Math.PI * 2;
    const norm = (a: number) => {
      a = (a + Math.PI) % TAU;
      if (a < 0) a += TAU;
      return a - Math.PI;
    };
    const wasGrounded = this.touchedGround;
    const oldHy = this.collisionHeight / 2;
    const oldBottom = this.y + oldHy;

    if (this.spriteCrop && this.spriteSourceW && this.spriteSourceH) {
      const baseW = Math.max(10, (this.spriteCrop.w / this.spriteSourceW) * this.width);
      const baseH = Math.max(10, (this.spriteCrop.h / this.spriteSourceH) * this.height);

      this.collisionWidth = baseW;
      this.collisionHeight = baseH;
    } else {
      this.collisionWidth = this.width;
      this.collisionHeight = this.height;
    }

    const newHy = this.collisionHeight / 2;
    if (wasGrounded) {
      this.y = oldBottom - newHy;
    }

    integrateAirdrop(this, dt, gravity, landscape);

    if (this.touchedGround) {
      this.angularVelocity *= Math.pow(0.5, dt);
    } else {
      this.angularVelocity *= Math.pow(0.98, dt);
    }

    this.angle += this.angularVelocity * dt;
    this.angle = norm(this.angle);

    const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
    const spun = Math.abs(norm(this.angle - this.lastAngle));
    const still = moved < 0.35 && spun < 0.01 && Math.abs(this.vx) < 6 && Math.abs(this.vy) < 6 && Math.abs(this.angularVelocity) < 0.08;
    if (still) this.stationaryTime += dt;
    else this.stationaryTime = 0;
    this.lastX = this.x;
    this.lastY = this.y;
    this.lastAngle = this.angle;

    if (this.touchedGround && this.stationaryTime >= 2.0) {
      this.isDynamic = false;
      this.vx = 0;
      this.vy = 0;
      this.angularVelocity = 0;
      this.bounceTime = 1.0;
    }
  }

  public takeHit(expX: number, _expY: number, _expRadius: number): void {
    if (this.isDynamic) {
      // Slightly toss it
      this.vy -= 100;
      this.vx += (this.x > expX ? 30 : -30);
      this.angularVelocity += (Math.random() - 0.5) * 2;
      this.bounceFactor = 1;
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
        const sw = this.spriteSourceW || img.naturalWidth;
        const sh = this.spriteSourceH || img.naturalHeight;
        const dw = (crop.w / sw) * this.width;
        const dh = (crop.h / sh) * this.height;
        ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, -dw / 2, -dh / 2, dw, dh);
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
