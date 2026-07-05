// Browser-compatible Web Audio API synthesizer for the IDS pipeline haptic soundscape

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastClickTime: number = 0;
  
  // Persistent node references for continuous alarms
  private alarmOsc1: OscillatorNode | null = null;
  private alarmOsc2: OscillatorNode | null = null;
  private alarmGain: GainNode | null = null;
  private alarmInterval: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ids_audio_muted');
      this.isMuted = stored === 'true';
    }
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ids_audio_muted', String(this.isMuted));
    }
    if (this.isMuted) {
      this.stopAlarm();
    } else {
      this.initContext();
    }
    return this.isMuted;
  }

  public getMuteStatus(): boolean {
    return this.isMuted;
  }

  /**
   * Play a subtle, low-frequency, snappy click sound for standard packet traversal.
   * Uses an exponential decay envelope to simulate a physical relay click.
   */
  public playClick() {
    if (this.isMuted) return;
    const nowMs = Date.now();
    if (nowMs - this.lastClickTime < 35) return; // rate-limit click sounds to ~30Hz
    this.lastClickTime = nowMs;

    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      // Low frequency snappiness
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.02);

      // Snappy volume envelope
      gain.gain.setValueAtTime(0.04, now); // soft, unobtrusive
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch (e) {
      console.warn('Audio click failed', e);
    }
  }

  /**
   * Starts a soft pulsing/beeping warning hum depending on attack type.
   */
  public startAlarm(type: 'dos' | 'spoof' | 'fuzz') {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    // Avoid duplicate alarms running
    this.stopAlarm();

    try {
      const now = this.ctx.currentTime;
      this.alarmGain = this.ctx.createGain();
      this.alarmGain.connect(this.ctx.destination);
      this.alarmGain.gain.setValueAtTime(0, now);

      if (type === 'dos') {
        // High-frequency alert hum (pulsing 350Hz beeps)
        let isBeep = false;
        this.alarmGain.gain.setValueAtTime(0.04, now);
        
        // Setup two sine waves for a slightly dissonant industrial alarm
        this.alarmOsc1 = this.ctx.createOscillator();
        this.alarmOsc2 = this.ctx.createOscillator();
        
        this.alarmOsc1.type = 'sine';
        this.alarmOsc1.frequency.setValueAtTime(380, now);
        this.alarmOsc2.type = 'sine';
        this.alarmOsc2.frequency.setValueAtTime(385, now);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);

        this.alarmOsc1.connect(filter);
        this.alarmOsc2.connect(filter);
        filter.connect(this.alarmGain);

        this.alarmOsc1.start(now);
        this.alarmOsc2.start(now);

        // Pulse the gain to make it a blinking alarm sound
        this.alarmInterval = setInterval(() => {
          if (!this.ctx || !this.alarmGain) return;
          const t = this.ctx.currentTime;
          isBeep = !isBeep;
          this.alarmGain.gain.cancelScheduledValues(t);
          this.alarmGain.gain.linearRampToValueAtTime(isBeep ? 0.06 : 0.01, t + 0.05);
        }, 180);

      } else if (type === 'spoof') {
        // Warning sci-fi cyber alarm drone (intertwining low frequencies 160Hz and 163Hz)
        this.alarmOsc1 = this.ctx.createOscillator();
        this.alarmOsc2 = this.ctx.createOscillator();

        this.alarmOsc1.type = 'sawtooth';
        this.alarmOsc1.frequency.setValueAtTime(140, now);
        this.alarmOsc2.type = 'sine';
        this.alarmOsc2.frequency.setValueAtTime(143, now);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, now); // deeply muffled, warning hum

        this.alarmOsc1.connect(filter);
        this.alarmOsc2.connect(filter);
        filter.connect(this.alarmGain);

        this.alarmOsc1.start(now);
        this.alarmOsc2.start(now);

        // Fade in warning drone
        this.alarmGain.gain.linearRampToValueAtTime(0.12, now + 0.4);

        // Slow modulation of the low pass filter frequency for a warning breathing effect
        let direction = 1;
        let freq = 250;
        this.alarmInterval = setInterval(() => {
          if (!this.ctx || !filter) return;
          freq += direction * 8;
          if (freq > 320) direction = -1;
          if (freq < 180) direction = 1;
          filter.frequency.setValueAtTime(freq, this.ctx.currentTime);
        }, 80);

      } else {
        // Fuzz warning: soft, eerie sci-fi alert (sine swept 220Hz modulated by 3Hz)
        this.alarmOsc1 = this.ctx.createOscillator();
        this.alarmOsc1.type = 'sine';
        this.alarmOsc1.frequency.setValueAtTime(220, now);
        this.alarmOsc1.connect(this.alarmGain);
        this.alarmOsc1.start(now);

        this.alarmGain.gain.linearRampToValueAtTime(0.08, now + 0.3);

        let angle = 0;
        this.alarmInterval = setInterval(() => {
          if (!this.ctx || !this.alarmOsc1) return;
          angle += 0.25;
          const sweepFreq = 220 + Math.sin(angle) * 35;
          this.alarmOsc1.frequency.setValueAtTime(sweepFreq, this.ctx.currentTime);
        }, 50);
      }
    } catch (e) {
      console.warn('Alarm audio failed to play', e);
    }
  }

  public stopAlarm() {
    if (this.alarmInterval) {
      clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }

    try {
      const now = this.ctx ? this.ctx.currentTime : 0;
      
      if (this.alarmOsc1) {
        try { this.alarmOsc1.stop(now); } catch(e){}
        this.alarmOsc1 = null;
      }
      if (this.alarmOsc2) {
        try { this.alarmOsc2.stop(now); } catch(e){}
        this.alarmOsc2 = null;
      }
      if (this.alarmGain) {
        this.alarmGain.disconnect();
        this.alarmGain = null;
      }
    } catch (e) {
      console.warn('Stopping alarm failed', e);
    }
  }
}

export const idsAudio = new AudioEngine();
