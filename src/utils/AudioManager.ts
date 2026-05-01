export class AudioManager {
  private static ctx: AudioContext | null = null;
  private static isMuted = false;

  public static isGameStarted = false;

  private static getContext(): AudioContext | null {
    if (this.isMuted || !this.isGameStarted) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn("Web Audio API not supported");
      }
    }
    // Resume context if suspended (browser policy)
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public static playJump() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Random pitch variation for different intonations
    const baseFreq = 300 + Math.random() * 200; // 300 to 500 Hz
    const endFreq = baseFreq + 300;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  public static playLand() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.2); // Lower and longer drop

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    // Smooth release to fix the clipping sound
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  public static playShoot(weaponId?: string) {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const wid = weaponId || '';
    const cfg = (() => {
      switch (wid) {
        case 'bazooka': return { type: 'sawtooth', f0: 320, f1: 65, dur: 0.18, g0: 0.45 };
        case 'homing_missile': return { type: 'sawtooth', f0: 360, f1: 80, dur: 0.2, g0: 0.48 };
        case 'shotgun': return { type: 'square', f0: 780, f1: 140, dur: 0.11, g0: 0.55 };
        case 'minigun': return { type: 'square', f0: 1050, f1: 260, dur: 0.05, g0: 0.28 };
        case 'heavy_gun': return { type: 'square', f0: 920, f1: 220, dur: 0.07, g0: 0.34 };
        case 'handgun': return { type: 'square', f0: 980, f1: 300, dur: 0.055, g0: 0.24 };
        case 'grenade': return { type: 'triangle', f0: 520, f1: 120, dur: 0.1, g0: 0.3 };
        case 'plasma_gun': return { type: 'sine', f0: 1150, f1: 420, dur: 0.08, g0: 0.32 };
        case 'flamethrower': return { type: 'triangle', f0: 260, f1: 190, dur: 0.12, g0: 0.22 };
        default: return { type: 'square', f0: 800, f1: 100, dur: 0.2, g0: 0.4 };
      }
    })();

    osc.type = cfg.type as OscillatorType;
    osc.frequency.setValueAtTime(cfg.f0, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(cfg.f1, ctx.currentTime + cfg.dur);

    gain.gain.setValueAtTime(cfg.g0, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + cfg.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + cfg.dur);
  }

  public static playExplosion(weaponId?: string) {
    const ctx = this.getContext();
    if (!ctx) return;

    // Use a buffer source with noise for a realistic retro explosion
    const wid = weaponId || '';
    const cfg = (() => {
      switch (wid) {
        case 'bazooka': return { dur: 0.55, freq: 900, g0: 0.55 };
        case 'homing_missile': return { dur: 0.6, freq: 850, g0: 0.6 };
        case 'grenade': return { dur: 0.55, freq: 950, g0: 0.56 };
        case 'shotgun': return { dur: 0.28, freq: 1400, g0: 0.32 };
        case 'minigun': return { dur: 0.18, freq: 1800, g0: 0.22 };
        case 'heavy_gun': return { dur: 0.22, freq: 1700, g0: 0.25 };
        case 'handgun': return { dur: 0.16, freq: 2100, g0: 0.18 };
        case 'plasma_gun': return { dur: 0.3, freq: 2400, g0: 0.26 };
        case 'flamethrower': return { dur: 0.24, freq: 1600, g0: 0.24 };
        default: return { dur: 0.5, freq: 1000, g0: 0.5 };
      }
    })();

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * cfg.dur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // White noise
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cfg.freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(cfg.g0, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + cfg.dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
  }

  public static playCharge(power: number) {
    // power is 0 to 100
    const ctx = this.getContext();
    if (!ctx) return;

    // We only play a tiny blip per frame/tick that goes higher in pitch
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const freq = 400 + (power * 4); // 400Hz to 800Hz
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  public static playDamage() {
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // A sharper "ouch" sound with random pitch drop
    osc.type = 'sawtooth';
    const baseFreq = 400 + Math.random() * 200;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq / 2, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }
}
