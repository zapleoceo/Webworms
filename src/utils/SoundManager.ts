export class SoundManager {
  private ctx: AudioContext | null = null;
  private explosionBuffer: AudioBuffer | null = null;

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

    // Pre-calculate explosion noise buffer once
    if (this.ctx && !this.explosionBuffer) {
      const bufferSize = this.ctx.sampleRate * 0.3; // 0.3 seconds
      this.explosionBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.explosionBuffer.getChannelData(0);
      
      // 8-bit noise: quantize the random values
      for (let i = 0; i < bufferSize; i++) {
        const noise = Math.random() * 2 - 1;
        // crush to 3 bits basically (-1, -0.5, 0, 0.5, 1)
        data[i] = Math.round(noise * 4) / 4; 
      }
    }
  }

  public playExplosion(): void {
    if (!this.ctx || !this.explosionBuffer) return;

    try {
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = this.explosionBuffer;
      
      // Bandpass filter for retro crunch (like a muffled explosion)
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1000;
      
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
