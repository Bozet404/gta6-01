// SOLMARA — audio: every sound is synthesized with WebAudio, no audio files.
// Engine hum, police siren, gunshot, pickup chime, mission jingle, skid.
SOL.audio = {
  ctx: null, master: null, engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
  sirenTimer: 0, sirenHigh: false,
  init() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = SOL.G.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // Engine: sawtooth through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
      // Siren: square wave alternating two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square'; this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain(); this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setMuted(m) { if (this.master) this.master.gain.value = m ? 0 : 0.5; },
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const target = on ? 0.05 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 115, this.ctx.currentTime, 0.08);
  },
  updateSiren(dt, wanted, copNear) {
    if (!this.ctx) return;
    if (wanted > 0 && copNear) {
      this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.1);
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.42) {
        this.sirenTimer = 0; this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 700, this.ctx.currentTime, 0.02);
      }
    } else {
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  },
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.35;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  },
  gunshot() { this.noise(0.14, 0.5, 1400); this.blip(160, 0.1, 'square', 0.16, 55); },
  enemyShot() { this.noise(0.11, 0.2, 1100); },
  pickup() { this.blip(880, 0.09, 'sine', 0.2); setTimeout(() => this.blip(1318, 0.14, 'sine', 0.2), 90); },
  cash() { this.blip(988, 0.08, 'triangle', 0.2); setTimeout(() => this.blip(1318, 0.16, 'triangle', 0.22), 80); },
  jingle() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.22), i * 110)); },
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.14), i * 160)); },
  skid() { this.noise(0.25, 0.12, 900); },
};
