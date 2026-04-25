export class SoundManager {
  private ctx: AudioContext | null = null;
  private explosionBuffer: AudioBuffer | null = null;
  private impactBuffer: AudioBuffer | null = null;
  private fallingOsc: OscillatorNode | null = null;
  private fallingGain: GainNode | null = null;

  // External audio buffers
  private externalBuffers: Record<string, AudioBuffer | null> = {};

  public async init(): Promise<void> {
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
      this.explosionBuffer = this.generateNoiseBuffer(0.3, true);
      this.impactBuffer = this.generateNoiseBuffer(0.15, false);
      
      // Try to load external sounds (will silently fail and fallback to synth if not found)
      await this.loadExternalSound('jump', '/sounds/jump.wav');
      await this.loadExternalSound('hurt', '/sounds/hurt.wav');
      await this.loadExternalSound('explosion', '/sounds/explosion.wav');
    }
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

  private generateNoiseBuffer(duration: number, crush: boolean): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
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

  public startFalling(): void {
    if (!this.ctx || this.fallingOsc) return;
    try {
      this.fallingOsc = this.ctx.createOscillator();
      this.fallingGain = this.ctx.createGain();
      
      this.fallingOsc.type = 'triangle';
      this.fallingOsc.frequency.setValueAtTime(400, this.ctx.currentTime);
      this.fallingOsc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 2.0); // Doppler effect
      
      this.fallingGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.fallingGain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 1.0); // Wind buildup
      
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

  public playHeavyImpact(): void {
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
