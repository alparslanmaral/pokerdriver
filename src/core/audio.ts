/**
 * WebAudio synthesis: engine, wind, tire noise and UI/gameplay effects. No audio files.
 * The AudioContext is created lazily from a user gesture (init()).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private engine: { o1: OscillatorNode; o2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private wind: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private skid: { gain: GainNode } | null = null;
  private nitroLayer: { gain: GainNode } | null = null;
  /** Every long-running source node, so that stopRaceSounds can really stop them. */
  private sources: AudioScheduledSourceNode[] = [];
  muted = false;
  private volume = 0.5;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    return this.muted;
  }

  // ---------------------------------------------------------------- continuous sounds

  startRaceSounds(): void {
    const ctx = this.ctx;
    if (!ctx || this.engine) return;

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o1.connect(filter);
    o2.connect(g2).connect(filter);
    filter.connect(gain).connect(this.master);
    o1.start();
    o2.start();
    this.sources.push(o1, o2);
    this.engine = { o1, o2, filter, gain };

    const wnoise = ctx.createBufferSource();
    wnoise.buffer = this.noiseBuffer;
    wnoise.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 700;
    wf.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0;
    wnoise.connect(wf).connect(wg).connect(this.master);
    wnoise.start();
    this.sources.push(wnoise);
    this.wind = { gain: wg, filter: wf };

    const snoise = ctx.createBufferSource();
    snoise.buffer = this.noiseBuffer;
    snoise.loop = true;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 1700;
    sf.Q.value = 3;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    snoise.connect(sf).connect(sg).connect(this.master);
    snoise.start();
    this.sources.push(snoise);
    this.skid = { gain: sg };

    const nnoise = ctx.createBufferSource();
    nnoise.buffer = this.noiseBuffer;
    nnoise.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    nnoise.connect(nf).connect(ng).connect(this.master);
    nnoise.start();
    this.sources.push(nnoise);
    this.nitroLayer = { gain: ng };
  }

  stopRaceSounds(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.engine?.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const n of [this.wind, this.skid, this.nitroLayer]) n?.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const src of this.sources) {
      try {
        src.stop(t + 0.4);
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
    this.engine = null;
    this.wind = null;
    this.skid = null;
    this.nitroLayer = null;
  }

  /** Simple gearbox model gives the engine a rising/falling pitch while accelerating. */
  updateRaceSounds(speed: number, maxSpeed: number, throttle: number, skid: number, nitro: boolean, paused: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.engine) return;
    const t = ctx.currentTime;
    const gears = [0, 15, 28, 40, 51, 70];
    let g = 0;
    while (g < gears.length - 2 && speed > gears[g + 1]) g++;
    const lo = gears[g];
    const hi = gears[g + 1];
    const rpm = Math.min(1, Math.max(0, (Math.abs(speed) - lo) / (hi - lo)));
    const freq = 48 + rpm * 85 + g * 6;
    this.engine.o1.frequency.setTargetAtTime(freq, t, 0.04);
    this.engine.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.04);
    this.engine.filter.frequency.setTargetAtTime(380 + rpm * 700 + throttle * 700, t, 0.05);
    const vol = paused ? 0 : 0.045 + throttle * 0.06 + rpm * 0.02;
    this.engine.gain.gain.setTargetAtTime(vol, t, 0.05);

    const s01 = Math.min(1, Math.abs(speed) / maxSpeed);
    if (this.wind) {
      this.wind.gain.gain.setTargetAtTime(paused ? 0 : s01 * s01 * 0.16, t, 0.1);
      this.wind.filter.frequency.setTargetAtTime(500 + s01 * 1500, t, 0.1);
    }
    this.skid?.gain.gain.setTargetAtTime(paused ? 0 : Math.min(1, skid) * 0.07, t, 0.05);
    this.nitroLayer?.gain.gain.setTargetAtTime(paused || !nitro ? 0 : 0.06, t, 0.08);
  }

  // ---------------------------------------------------------------- one-shot effects

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  uiClick(): void {
    this.blip(660, 0.06, 'triangle', 0.12);
  }
  countdown(final: boolean): void {
    this.blip(final ? 880 : 440, final ? 0.5 : 0.2, 'square', 0.14);
  }
  cardSelect(on: boolean): void {
    this.blip(on ? 900 : 600, 0.05, 'triangle', 0.1);
  }
  cardDraw(): void {
    this.noise(0.08, 0.08, 'highpass', 3000, 6000);
    this.blip(520, 0.07, 'triangle', 0.1, undefined, 0.05);
    this.blip(700, 0.07, 'triangle', 0.1, undefined, 0.13);
  }
  boxPickup(): void {
    this.blip(780, 0.1, 'sine', 0.14, 1400);
  }
  boxDenied(): void {
    this.blip(200, 0.15, 'sawtooth', 0.08, 140);
  }
  /** strength: 0..1 (weak hand .. straight flush) */
  cardPlay(strength: number): void {
    const base = 440;
    const steps = [0, 4, 7, 12, 16, 19].slice(0, 2 + Math.round(strength * 4));
    steps.forEach((s, i) => this.blip(base * Math.pow(2, s / 12), 0.22, 'triangle', 0.14, undefined, i * 0.07));
  }
  money(): void {
    this.blip(1250, 0.08, 'square', 0.07, undefined, 0.02);
    this.blip(1680, 0.2, 'square', 0.07, undefined, 0.09);
  }
  nitro(): void {
    this.noise(0.7, 0.18, 'bandpass', 300, 4500);
    this.blip(180, 0.6, 'sawtooth', 0.08, 520);
  }
  shield(): void {
    this.blip(300, 0.5, 'sine', 0.16, 900);
    this.blip(450, 0.5, 'sine', 0.1, 1350, 0.06);
  }
  oil(): void {
    this.noise(0.3, 0.12, 'lowpass', 900, 200);
  }
  slowRivals(): void {
    this.blip(700, 0.6, 'sawtooth', 0.09, 120);
  }
  discard(): void {
    this.noise(0.35, 0.14, 'highpass', 800, 5000);
  }
  knockOff(): void {
    this.noise(0.15, 0.2, 'bandpass', 2400, 600);
    this.blip(260, 0.2, 'square', 0.1, 90);
  }
  crash(intensity: number): void {
    const v = Math.min(1, 0.4 + intensity);
    this.noise(0.45, 0.35 * v, 'lowpass', 2200, 120);
    this.blip(110, 0.35, 'sine', 0.3 * v, 38);
  }
  scrape(): void {
    this.noise(0.12, 0.08, 'bandpass', 3000, 1500);
  }
  lap(): void {
    this.blip(660, 0.12, 'triangle', 0.14);
    this.blip(990, 0.2, 'triangle', 0.14, undefined, 0.1);
  }
  finish(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.3, 'triangle', 0.16, undefined, i * 0.12));
  }
}
