// Disco track (Shift + D): a fixed disco groove, synthesized with WebAudio (no files). 122 bpm, kick
// on every beat, claps on 2 and 4, open hi-hat on the offbeat, octave bass and short chords on the progression
// Am7 – Dm7 – G7 – Cmaj7, with a synth phrase on top. Plays while the disco lasts and fades out.

const BPM = 122;
const STEP = 60 / BPM / 4; // sixteenth note
const BAR = STEP * 16;
const LOOKAHEAD = 0.6;

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Progression (one per bar): bass root and the chord notes. */
const CHORDS: readonly { root: number; chord: number[] }[] = [
  { root: 45, chord: [57, 60, 64, 67] }, // Am7
  { root: 50, chord: [57, 60, 62, 65] }, // Dm7
  { root: 43, chord: [55, 59, 62, 65] }, // G7
  { root: 48, chord: [55, 59, 60, 64] }, // Cmaj7
];
/** Synth phrase (sixteenth -> MIDI note), the same in every bar: the "hook". */
const RIFF: ReadonlyMap<number, number> = new Map([
  [0, 76],
  [3, 79],
  [6, 81],
  [8, 79],
  [10, 76],
  [12, 74],
  [14, 76],
]);

export class DiscoMusic {
  private readonly out: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private next = 0;
  private step = 0;
  private endAt = 0;

  constructor(
    private readonly ac: AudioContext,
    dest: AudioNode,
    private readonly noise: AudioBuffer | null,
  ) {
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  /** Plays for `seconds` at volume `gain` (0–1); calling again restarts. */
  start(seconds: number, gain: number): void {
    const t = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.linearRampToValueAtTime(gain, t + 0.25);
    this.endAt = t + seconds;
    // the ending: the last 1.5 s fade down to silence
    this.out.gain.setValueAtTime(gain, Math.max(t + 0.3, this.endAt - 1.5));
    this.out.gain.linearRampToValueAtTime(0.0001, this.endAt);
    if (this.timer) return;
    this.next = t + 0.05;
    this.step = 0;
    this.timer = setInterval(() => this.tick(), 100);
    this.tick();
  }

  /** Stops now, with a short fade. */
  stop(): void {
    const t = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(Math.max(0.0001, this.out.gain.value), t);
    this.out.gain.linearRampToValueAtTime(0.0001, t + 0.6);
    this.endAt = t + 0.6;
  }

  private tick(): void {
    const now = this.ac.currentTime;
    if (now >= this.endAt) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    if (this.next < now - 0.2) this.next = now + 0.05;
    while (this.next < now + LOOKAHEAD && this.next < this.endAt) {
      this.playStep(this.step, this.next);
      this.step++;
      this.next += STEP;
    }
  }

  private playStep(i: number, t: number): void {
    const s = i % 16;
    const { root, chord } = CHORDS[Math.floor(i / 16) % CHORDS.length];
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.clap(t);
    if (s % 4 === 2) this.hat(t, 0.16, 0.05); // open, on the offbeat
    else if (s % 2 === 1) this.hat(t, 0.03, 0.018);
    // octave bass in eighth notes
    if (s % 2 === 0) this.bass(hz(root + (s % 4 === 2 ? 12 : 0)), t);
    // short chords on the "and" of 2 and 4
    if (s === 6 || s === 14) for (const n of chord) this.stab(hz(n), t);
    const riff = RIFF.get(s);
    if (riff !== undefined && Math.floor(i / 16) % 2 === 1) this.lead(hz(riff), t);
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.out);
    return g;
  }

  private kick(t: number): void {
    const o = this.ac.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    o.connect(this.env(t, 0.55, 0.004, 0.26));
    o.start(t);
    o.stop(t + 0.32);
  }

  private noiseHit(t: number, peak: number, decay: number, type: BiquadFilterType, freq: number): void {
    if (!this.noise) return;
    const src = this.ac.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(this.env(t, peak, 0.002, decay));
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  private clap(t: number): void {
    // three snaps very close together, like real hands
    for (const d of [0, 0.012, 0.024]) this.noiseHit(t + d, 0.22, 0.09, 'bandpass', 1500);
  }

  private hat(t: number, decay: number, peak: number): void {
    this.noiseHit(t, peak, decay, 'highpass', 7500);
  }

  private bass(f: number, t: number): void {
    const o = this.ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.14);
    o.connect(lp).connect(this.env(t, 0.16, 0.005, 0.16));
    o.start(t);
    o.stop(t + 0.2);
  }

  private stab(f: number, t: number): void {
    const o = this.ac.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const lp = this.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    o.connect(lp).connect(this.env(t, 0.035, 0.005, 0.14));
    o.start(t);
    o.stop(t + 0.18);
  }

  private lead(f: number, t: number): void {
    const o = this.ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    // light vibrato
    const lfo = this.ac.createOscillator();
    const depth = this.ac.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = 4;
    lfo.connect(depth).connect(o.detune);
    o.connect(this.env(t, 0.09, 0.01, 0.22));
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.26);
    lfo.stop(t + 0.26);
  }
}
