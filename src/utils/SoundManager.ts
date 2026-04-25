export class SoundManager {
  private ctx: AudioContext | null = null;
  private explosionBuffer: AudioBuffer | null = null;
  private impactBuffer: AudioBuffer | null = null;
  private fallingOsc: OscillatorNode | null = null;
  private fallingGain: GainNode | null = null;

  // External audio buffers
  private externalBuffers: Record<string, AudioBuffer | null> = {};

  public init(): void {
    if (!this.ctx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
    }
    
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.ctx && !this.explosionBuffer) {
      this.explosionBuffer = this.generateNoiseBuffer(0.3, true, this.ctx.sampleRate);
      this.impactBuffer = this.generateNoiseBuffer(0.15, false, this.ctx.sampleRate);
    }
  }

  public async loadSounds(): Promise<void> {
    if (!this.ctx) return;
    
    // Using Promise.allSettled so that if one sound fails, it doesn't block the rest or the app
    await Promise.allSettled([
      this.loadExternalSound('jump', '/sounds/jump.wav'),
      this.loadExternalSound('hurt', '/sounds/hurt.wav'),
      this.loadExternalSound('explosion', '/sounds/explosion.wav'),
      this.loadExternalSound('land', '/sounds/land.wav')
    ]);
  }

  private async loadExternalSound(name: string, url: string): Promise<void> {
    if (!this.ctx) return;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        this.externalBuffers[name] = await this.ctx.decodeAudioData(arrayBuffer);
      }
    } catch (e) {
      // Silently fail - we will use the synth fallback
    }
  }

  private playExternal(name: string): boolean {
    if (this.ctx && this.externalBuffers[name]) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.externalBuffers[name];
        source.connect(this.ctx.destination);
        source.start();
        return true; // Played successfully
      } catch (e) {}
    }
    return false; // Fallback needed
  }

  private generateNoiseBuffer(duration: number, crush: boolean, rate = 44100): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = rate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const noise = Math.random() * 2 - 1;
      data[i] = crush ? Math.round(noise * 4) / 4 : noise; 
    }
    return buffer;
  }

  public playJump(): void {
    if (this.playExternal('jump')) return;
    
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  }

  public playHurt(): void {
    if (this.playExternal('hurt')) return;

    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch (e) {}
  }

  public updateFalling(vy: number): void {
    if (this.fallingOsc && this.ctx) {
      // Map velocity to frequency (higher velocity = lower pitch to simulate approaching the ground)
      // e.g. vy 150 -> 400Hz, vy 500 -> 100Hz
      let freq = 500 - vy;
      if (freq < 100) freq = 100;
      if (freq > 400) freq = 400;
      
      try {
        this.fallingOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
      } catch (e) {}
    }
  }

  public startFalling(): void {
    if (!this.ctx || this.fallingOsc) return;
    try {
      this.fallingOsc = this.ctx.createOscillator();
      this.fallingGain = this.ctx.createGain();
      
      this.fallingOsc.type = 'triangle';
      this.fallingOsc.frequency.setValueAtTime(400, this.ctx.currentTime);
      
      this.fallingGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.fallingGain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.5); // Fast wind buildup
      
      this.fallingOsc.connect(this.fallingGain);
      this.fallingGain.connect(this.ctx.destination);
      this.fallingOsc.start();
    } catch (e) {}
  }

  public stopFalling(): void {
    if (this.fallingOsc && this.fallingGain && this.ctx) {
      try {
        this.fallingGain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        this.fallingOsc.stop(this.ctx.currentTime + 0.1);
      } catch (e) {}
      this.fallingOsc = null;
      this.fallingGain = null;
    }
  }

  public playLand(): void {
    if (this.playExternal('land')) return;
    if (!this.ctx) return;

    // "Boov" thud sound
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      
      // Quick pitch drop
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch (e) {}
  }

  public playHeavyImpact(): void {
    if (this.playExternal('explosion')) return;
    if (!this.ctx || !this.impactBuffer) return;
    try {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.impactBuffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 200; // Deep thud
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1.5, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      
      noiseSrc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noiseSrc.start();
    } catch (e) {}
  }

  public playExplosion(): void {
    if (this.playExternal('explosion')) return;

    if (!this.ctx || !this.explosionBuffer) return;

    try {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.explosionBuffer;
      
      // Bandpass filter for retro crunch (like a muffled explosion)
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000 + Math.random() * 500; // Slightly vary tone
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
      
      noiseSrc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      
      noiseSrc.start();
    } catch (e) {
      console.warn('Failed to play sound', e);
    }
  }
}
